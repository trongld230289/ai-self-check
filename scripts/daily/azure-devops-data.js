// Azure DevOps Data Fetcher for Daily Reports
// Fetches work items, iterations, and project statistics from Azure DevOps

const https = require('https');
const vscode = require('vscode');

/**
 * Make HTTP request to Azure DevOps API
 * @param {string} url - API endpoint URL
 * @param {string} accessToken - Personal Access Token
 * @returns {Promise<Object>} - API response data
 */
function makeAzureDevOpsRequest(url, accessToken) {
    return new Promise((resolve, reject) => {
        const auth = Buffer.from(`:${accessToken}`).toString('base64');
        
        const options = {
            headers: {
                'Authorization': `Basic ${auth}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        };

        https.get(url, options, (response) => {
            let data = '';
            
            response.on('data', (chunk) => {
                data += chunk;
            });
            
            response.on('end', () => {
                try {
                    if (response.statusCode >= 200 && response.statusCode < 300) {
                        const jsonData = JSON.parse(data);
                        resolve(jsonData);
                    } else {
                        reject(new Error(`Azure DevOps API error: ${response.statusCode} - ${data}`));
                    }
                } catch (error) {
                    reject(new Error(`Failed to parse Azure DevOps response: ${error.message}`));
                }
            });
        }).on('error', (error) => {
            reject(new Error(`Azure DevOps request failed: ${error.message}`));
        });
    });
}

/**
 * Get Azure DevOps configuration from VS Code settings
 * @returns {Object} - Configuration object
 */
function getAzureDevOpsConfig() {
    const config = vscode.workspace.getConfiguration('aiSelfCheck');
    
    return {
        accessToken: config.get('azureDevOps.personalAccessToken') || '',
        organization: config.get('azureDevOps.organization') || '',
        project: config.get('azureDevOps.defaultProject') || ''
    };
}

/**
 * Fetch current iteration/sprint data
 * @param {Object} config - Azure DevOps configuration
 * @returns {Promise<Object>} - Current iteration data
 */
async function getCurrentIteration(config) {
    try {
        // Get team context first
        const teamsUrl = `https://dev.azure.com/${config.organization}/${config.project}/_apis/teams?api-version=7.0`;
        const teamsResponse = await makeAzureDevOpsRequest(teamsUrl, config.accessToken);
        
        if (!teamsResponse.value || teamsResponse.value.length === 0) {
            throw new Error('No teams found in the project');
        }
        
        const defaultTeam = teamsResponse.value[0];
        
        // Get current iteration
        const iterationsUrl = `https://dev.azure.com/${config.organization}/${config.project}/${defaultTeam.id}/_apis/work/teamsettings/iterations?$timeframe=current&api-version=7.0`;
        const iterationsResponse = await makeAzureDevOpsRequest(iterationsUrl, config.accessToken);
        
        if (!iterationsResponse.value || iterationsResponse.value.length === 0) {
            throw new Error('No current iteration found');
        }
        
        return {
            team: defaultTeam,
            iteration: iterationsResponse.value[0]
        };
    } catch (error) {
        console.error('❌ Error fetching current iteration:', error);
        return null;
    }
}

/**
 * Fetch work items for current iteration
 * @param {Object} config - Azure DevOps configuration
 * @param {Object} iterationData - Current iteration data
 * @returns {Promise<Array>} - Work items array
 */
async function getWorkItemsForIteration(config, iterationData) {
    try {
        if (!iterationData) {
            throw new Error('No iteration data provided');
        }
        
        // Query work items in current iteration
        const wiqlQuery = {
            query: `
                SELECT [System.Id], [System.Title], [System.State], [System.WorkItemType], 
                       [System.AssignedTo], [System.Tags], [Microsoft.VSTS.Scheduling.StoryPoints],
                       [System.CreatedDate], [System.ChangedDate]
                FROM WorkItems 
                WHERE [System.TeamProject] = '${config.project}' 
                AND [System.IterationPath] UNDER '${iterationData.iteration.path}'
                ORDER BY [System.State] ASC, [System.WorkItemType] ASC
            `
        };
        
        const wiqlUrl = `https://dev.azure.com/${config.organization}/${config.project}/_apis/wit/wiql?api-version=7.0`;
        
        // Make WIQL query request
        const wiqlOptions = {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${Buffer.from(`:${config.accessToken}`).toString('base64')}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        };
        
        const wiqlResponse = await new Promise((resolve, reject) => {
            const req = https.request(wiqlUrl, wiqlOptions, (response) => {
                let data = '';
                response.on('data', (chunk) => data += chunk);
                response.on('end', () => {
                    try {
                        resolve(JSON.parse(data));
                    } catch (error) {
                        reject(error);
                    }
                });
            });
            
            req.on('error', reject);
            req.write(JSON.stringify(wiqlQuery));
            req.end();
        });
        
        if (!wiqlResponse.workItems || wiqlResponse.workItems.length === 0) {
            return [];
        }
        
        // Get detailed work item information
        const workItemIds = wiqlResponse.workItems.map(wi => wi.id).join(',');
        const workItemsUrl = `https://dev.azure.com/${config.organization}/${config.project}/_apis/wit/workitems?ids=${workItemIds}&$expand=all&api-version=7.0`;
        
        const workItemsResponse = await makeAzureDevOpsRequest(workItemsUrl, config.accessToken);
        
        return workItemsResponse.value || [];
    } catch (error) {
        console.error('❌ Error fetching work items:', error);
        return [];
    }
}

/**
 * Get project statistics and metrics
 * @param {Array} workItems - Work items array
 * @returns {Object} - Project statistics
 */
function calculateProjectStatistics(workItems) {
    const stats = {
        total: workItems.length,
        completed: 0,
        inProgress: 0,
        pending: 0,
        totalStoryPoints: 0,
        completedStoryPoints: 0,
        byType: {},
        byAssignee: {},
        recentlyUpdated: []
    };
    
    const completedStates = ['Done', 'Closed', 'Resolved', 'Completed'];
    const inProgressStates = ['Active', 'In Progress', 'In Development', 'In Review'];
    
    workItems.forEach(workItem => {
        const fields = workItem.fields;
        const state = fields['System.State'];
        const workItemType = fields['System.WorkItemType'];
        const assignedTo = fields['System.AssignedTo']?.displayName || 'Unassigned';
        const storyPoints = fields['Microsoft.VSTS.Scheduling.StoryPoints'] || 0;
        const changedDate = new Date(fields['System.ChangedDate']);
        const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
        
        // Count by state
        if (completedStates.includes(state)) {
            stats.completed++;
            stats.completedStoryPoints += storyPoints;
        } else if (inProgressStates.includes(state)) {
            stats.inProgress++;
        } else {
            stats.pending++;
        }
        
        // Count by type
        stats.byType[workItemType] = (stats.byType[workItemType] || 0) + 1;
        
        // Count by assignee
        stats.byAssignee[assignedTo] = (stats.byAssignee[assignedTo] || 0) + 1;
        
        // Total story points
        stats.totalStoryPoints += storyPoints;
        
        // Recently updated items
        if (changedDate > twoDaysAgo) {
            stats.recentlyUpdated.push({
                id: workItem.id,
                title: fields['System.Title'],
                state: state,
                assignedTo: assignedTo,
                changedDate: changedDate.toISOString()
            });
        }
    });
    
    // Calculate completion percentage
    stats.completionPercentage = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;
    stats.storyPointsPercentage = stats.totalStoryPoints > 0 ? Math.round((stats.completedStoryPoints / stats.totalStoryPoints) * 100) : 0;
    
    return stats;
}

/**
 * Format work items for display in daily report
 * @param {Array} workItems - Work items array
 * @returns {Object} - Formatted work items by category
 */
function formatWorkItemsForReport(workItems) {
    const completedStates = ['Done', 'Closed', 'Resolved', 'Completed'];
    const inProgressStates = ['Active', 'In Progress', 'In Development', 'In Review'];
    
    const formatted = {
        completed: [],
        inProgress: [],
        pending: []
    };
    
    workItems.forEach(workItem => {
        const fields = workItem.fields;
        const item = {
            id: workItem.id,
            title: fields['System.Title'],
            state: fields['System.State'],
            type: fields['System.WorkItemType'],
            assignedTo: fields['System.AssignedTo']?.displayName || 'Unassigned',
            storyPoints: fields['Microsoft.VSTS.Scheduling.StoryPoints'] || 0,
            tags: fields['System.Tags'] || '',
            url: workItem._links?.html?.href || ''
        };
        
        if (completedStates.includes(item.state)) {
            formatted.completed.push(item);
        } else if (inProgressStates.includes(item.state)) {
            formatted.inProgress.push(item);
        } else {
            formatted.pending.push(item);
        }
    });
    
    return formatted;
}

/**
 * Fetch all Azure DevOps data for daily report
 * @returns {Promise<Object>} - Complete project data
 */
async function fetchAzureDevOpsData() {
    try {
        console.log('🔄 Fetching Azure DevOps data...');
        
        const config = getAzureDevOpsConfig();
        
        // Validate configuration
        if (!config.accessToken || !config.organization || !config.project) {
            throw new Error('Azure DevOps configuration is incomplete. Please check your settings.');
        }
        
        // Get current iteration
        const iterationData = await getCurrentIteration(config);
        if (!iterationData) {
            throw new Error('Could not fetch current iteration data');
        }
        
        // Get work items for current iteration
        const workItems = await getWorkItemsForIteration(config, iterationData);
        
        // Calculate statistics
        const statistics = calculateProjectStatistics(workItems);
        
        // Format work items for report
        const formattedWorkItems = formatWorkItemsForReport(workItems);
        
        console.log('✅ Azure DevOps data fetched successfully');
        console.log(`📊 Found ${workItems.length} work items in iteration: ${iterationData.iteration.name}`);
        
        return {
            success: true,
            iteration: iterationData.iteration,
            team: iterationData.team,
            statistics,
            workItems: formattedWorkItems,
            rawWorkItems: workItems,
            organization: config.organization,
            project: config.project
        };
        
    } catch (error) {
        console.error('❌ Error fetching Azure DevOps data:', error);
        return {
            success: false,
            error: error.message,
            fallbackData: {
                statistics: {
                    total: 12,
                    completed: 8,
                    inProgress: 3,
                    pending: 1,
                    completionPercentage: 67
                },
                workItems: {
                    completed: [
                        { title: 'Setup project structure and VS Code extension framework', state: 'Done' },
                        { title: 'Implement daily screenshot generation with PowerShell', state: 'Done' },
                        { title: 'Create HTML report template with responsive design', state: 'Done' }
                    ],
                    inProgress: [
                        { title: 'Convert PowerShell script to Node.js for cross-platform support', state: 'Active' },
                        { title: 'Add webview integration for VS Code extension', state: 'Active' }
                    ],
                    pending: [
                        { title: 'Add real-time data integration from project management tools', state: 'New' }
                    ]
                }
            }
        };
    }
}

module.exports = {
    fetchAzureDevOpsData,
    getAzureDevOpsConfig,
    getCurrentIteration,
    getWorkItemsForIteration,
    calculateProjectStatistics,
    formatWorkItemsForReport
};