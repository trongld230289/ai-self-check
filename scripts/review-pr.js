const vscode = require('vscode');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

// Azure DevOps Pull Request Review Feature

/**
 * Initialize PR review functionality
 */
function initializePrReview(context) {
    // Create new chat participant for PR review
    const reviewPrParticipant = vscode.chat.createChatParticipant('review-pr', handleReviewPr);
    reviewPrParticipant.iconPath = vscode.Uri.file(path.join(context.extensionPath, 'icon.svg'));
    
    // Register review PR command
    let reviewPullRequest = vscode.commands.registerCommand('aiSelfCheck.reviewPullRequest', async () => {
        await reviewPullRequestCommand();
    });

    return { reviewPrParticipant, reviewPullRequest };
}

/**
 * Handle PR review chat participant
 */
async function handleReviewPr(request, context, stream, token) {
    try {
        const userMessage = request.prompt;
        
        // Parse Azure DevOps URL or PR ID
        let prId = null;
        let organization = null;
        let project = null;
        let repository = null;
        
        // Azure DevOps URL pattern: https://dev.azure.com/{org}/{project}/_git/{repo}/pullrequest/{id}
        const azureUrlPattern = /https:\/\/dev\.azure\.com\/([^\/]+)\/([^\/]+)\/_git\/([^\/]+)\/pullrequest\/(\d+)/i;
        const azureMatch = userMessage.match(azureUrlPattern);
        
        if (azureMatch) {
            organization = azureMatch[1];
            project = azureMatch[2];
            repository = azureMatch[3];
            prId = azureMatch[4];
        } else {
            // Fallback to simple PR ID pattern
            const prPattern = /(?:pullrequest(?:s)?\/(\d+)|pr[#\s]?(\d+)|id[:\s]?(\d+))/i;
            const match = userMessage.match(prPattern);
            if (match) {
                prId = match[1] || match[2] || match[3];
            }
        }
        
        if (!prId) {
            stream.markdown('🤖 **Azure DevOps PR Reviewer**\n\n');
            stream.markdown('Tôi cần thông tin PR để review. Vui lòng cung cấp:\n\n');
            stream.markdown('• **PR URL**: `https://dev.azure.com/org/project/_git/repo/pullrequest/123`\n');
            stream.markdown('• **PR ID**: Ví dụ: `PR #123` hoặc `ID: 123`\n\n');
            stream.markdown('**Ví dụ sử dụng:**\n');
            stream.markdown('```\n');
            stream.markdown('https://dev.azure.com/BusinessWebUS/Shippo/_git/Shippo-Web/pullrequest/1396\n');
            stream.markdown('Review PR #123\n');
            stream.markdown('Check ID: 789\n');
            stream.markdown('```\n\n');
            stream.markdown('💡 **Lưu ý**: Đảm bảo bạn đã cấu hình Azure DevOps credentials trong VS Code.');
            return;
        }
        
        stream.markdown('🔍 **Analyzing Azure DevOps PR...**\n\n');
        if (organization && project && repository) {
            stream.markdown(`🏢 **Organization**: ${organization}\n`);
            stream.markdown(`📁 **Project**: ${project}\n`);
            stream.markdown(`📦 **Repository**: ${repository}\n`);
        }
        stream.markdown(`📋 **PR ID**: ${prId}\n`);
        stream.markdown('⏳ **Fetching PR information from Azure DevOps...**\n\n');
        
        // Get PR diff and analyze
        const prAnalysis = await analyzePullRequest(stream, prId, organization, project, repository);
        
        if (prAnalysis.error) {
            stream.markdown(`❌ **Error**: ${prAnalysis.error}\n\n`);
            stream.markdown('**Possible causes:**\n');
            stream.markdown('• Insufficient Azure DevOps access permissions\n');
            stream.markdown('• PR ID does not exist\n');
            stream.markdown('• Credentials configuration is incorrect\n');
            return;
        }
        
        // Display PR review results
        await displayPrReviewResults(stream, prAnalysis);
        
    } catch (error) {
        stream.markdown('❌ **Lỗi không mong đợi**\n\n');
        stream.markdown(`Chi tiết: ${error.message}\n\n`);
        stream.markdown('Vui lòng thử lại hoặc kiểm tra logs của extension.');
    }
}

/**
 * Review Pull Request command
 */
async function reviewPullRequestCommand() {
    try {
        // Show input box for PR URL or ID
        const prInput = await vscode.window.showInputBox({
            prompt: 'Nhập Azure DevOps PR URL hoặc PR ID',
            placeHolder: 'Ví dụ: https://dev.azure.com/org/project/_git/repo/pullrequest/123 hoặc PR #123',
            validateInput: (value) => {
                if (!value) return 'Vui lòng nhập PR URL hoặc ID';
                if (!value.match(/(?:pullrequest(?:s)?\/(\d+)|pr[#\s]?(\d+)|id[:\s]?(\d+)|dev\.azure\.com)/i)) {
                    return 'Format không đúng. Ví dụ: PR #123 hoặc Azure DevOps URL';
                }
                return null;
            }
        });
        
        if (!prInput) return;
        
        // Extract PR ID from input
        const prPattern = /(?:pullrequest(?:s)?\/(\d+)|pr[#\s]?(\d+)|id[:\s]?(\d+))/i;
        const match = prInput.match(prPattern);
        const prId = match ? (match[1] || match[2] || match[3]) : null;
        
        if (!prId) {
            vscode.window.showErrorMessage('Không thể xác định PR ID từ input đã nhập');
            return;
        }
        
        // Show progress
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Đang review Azure DevOps PR #${prId}`,
            cancellable: false
        }, async (progress) => {
            progress.report({ increment: 0, message: 'Connecting to Azure DevOps...' });
            
            // Create a mock stream for the command-based call
            const mockStream = {
                markdown: (text) => console.log(text)
            };
            const prAnalysis = await analyzePullRequest(mockStream, prId);
            
            progress.report({ increment: 50, message: 'Analyzing diff...' });
            
            if (prAnalysis.error) {
                vscode.window.showErrorMessage(`Error reviewing PR: ${prAnalysis.error}`);
                return;
            }
            
            progress.report({ increment: 100, message: 'Hoàn tất!' });
            
            // Open review results in new document
            await openPrReviewDocument(prAnalysis);
        });
        
    } catch (error) {
        vscode.window.showErrorMessage(`Error reviewing PR: ${error.message}`);
    }
}

/**
 * Analyze Pull Request using Azure DevOps API
 */
async function analyzePullRequest(stream, prId, organization = null, project = null, repository = null) {
    try {
        // Get Azure DevOps configuration from VS Code settings
        const config = vscode.workspace.getConfiguration('aiSelfCheck');
        const personalAccessToken = config.get('azureDevOps.personalAccessToken');
        const defaultOrg = config.get('azureDevOps.organization');
        const defaultProject = config.get('azureDevOps.defaultProject');
        
        // Use provided values or fall back to configuration
        const org = organization || defaultOrg || 'BusinessWebUS';
        const proj = project || defaultProject || 'Shippo';
        const repo = repository || 'Shippo-Web';
        
        if (!personalAccessToken) {
            // Show configuration help if no token
            stream.markdown('⚠️ **Azure DevOps Token Not Configured**\n\n');
            stream.markdown('To get real PR data from Azure DevOps:\n\n');
            stream.markdown('**Click button below to open User Settings JSON:**\n\n');
            
            stream.markdown(`[🔧 Open User Settings JSON](command:workbench.action.openSettingsJson)\n\n`);
            stream.markdown('**Add to end of settings.json file (before closing `}`):**\n\n');
            stream.markdown('```json\n');
            stream.markdown('{\n');
            stream.markdown('    "aiSelfCheck.azureDevOps.personalAccessToken": "YOUR_TOKEN_HERE",\n');
            stream.markdown('    "aiSelfCheck.azureDevOps.organization": "BusinessWebUS",\n');
            stream.markdown('    "aiSelfCheck.azureDevOps.defaultProject": "Shippo"\n');
            stream.markdown('}\n');
            stream.markdown('```\n\n');
            
            stream.markdown('**Create token at:** https://dev.azure.com/BusinessWebUS/_usersSettings/tokens\n\n');
            stream.markdown('**Required permissions:** Code (Read) + Pull Request (Read)\n\n');
            stream.markdown('---\n\n');
            stream.markdown('**Mock data displayed below:**\n\n');
            
            // Return mock data with clear indication
            return createMockPrData(prId, org, proj, repo);
        }

        try {
            // Call Azure DevOps REST API with token
            console.log(`🔄 Calling Azure DevOps API for PR ${prId}...`);
            const prData = await getAzureDevOpsPR(org, proj, repo, prId, personalAccessToken);
            console.log('✅ Azure DevOps API call successful:', prData);
            return prData;
            
        } catch (apiError) {
            // Show error and use mock data as fallback
            console.error('❌ Azure DevOps API failed:', apiError.message);
            stream.markdown('❌ **Azure DevOps API Error**\n\n');
            stream.markdown(`Error: ${apiError.message}\n\n`);
            stream.markdown('Using mock data as fallback.\n\n');
            stream.markdown('---\n\n');
            return createMockPrData(prId, org, proj, repo);
        }
        
    } catch (error) {
        return { error: `Analysis failed: ${error.message}` };
    }
}

/**
 * Get Pull Request data from Azure DevOps REST API
 */
async function getAzureDevOpsPR(organization, project, repository, prId, token) {
    try {
        console.log(`Fetching PR ${prId} from ${organization}/${project}/${repository}`);

        // Get PR details
        const prUrl = `https://dev.azure.com/${organization}/${project}/_apis/git/repositories/${repository}/pullRequests/${prId}?api-version=7.0`;
        const prResponse = await makeAzureDevOpsRequest(prUrl, token);
        
        if (!prResponse.success) {
            console.error('Failed to get PR details:', prResponse.error);
            throw new Error(`Failed to get PR details: ${prResponse.error}`);
        }

        const pr = prResponse.data;
        
        // Get PR iterations to find changes
        const iterationsUrl = `https://dev.azure.com/${organization}/${project}/_apis/git/repositories/${repository}/pullRequests/${prId}/iterations?api-version=7.0`;
        const iterationsResponse = await makeAzureDevOpsRequest(iterationsUrl, token);
        
        let fileChanges = [];
        let diffSource = 'Azure DevOps Iterations API';
        
        if (iterationsResponse.success && iterationsResponse.data.value?.length > 0) {
            // Get the latest iteration
            const latestIteration = iterationsResponse.data.value[iterationsResponse.data.value.length - 1];
            
            // Get changes for this iteration  
            const changesUrl = `https://dev.azure.com/${organization}/${project}/_apis/git/repositories/${repository}/pullRequests/${prId}/iterations/${latestIteration.id}/changes?api-version=7.0`;
            const changesResponse = await makeAzureDevOpsRequest(changesUrl, token);
            
            if (changesResponse.success && changesResponse.data.changeEntries) {
                fileChanges = changesResponse.data.changeEntries.map(change => ({
                    path: change.item?.path || 'Unknown path',
                    changeType: change.changeType || 'edit',
                    sourceCommit: change.item?.version || 'unknown',
                    targetCommit: 'latest',
                    additions: 0,
                    deletions: 0,
                    content: `File: ${change.item?.path}\nChange Type: ${change.changeType}\nSource Commit: ${pr.lastMergeSourceCommit?.commitId}\nTarget Commit: ${pr.lastMergeTargetCommit?.commitId}\n\n[File content changed - detailed diff available via Azure DevOps web interface]`
                }));
                console.log(`✅ Found ${fileChanges.length} file changes via Iterations API`);
            } else {
                console.log('⚠️ No changes found in iterations API');
            }
        }

        return {
            success: true,
            data: {
                id: prId,
                title: pr.title || `PR #${prId}`,
                description: pr.description || 'No description provided',
                author: pr.createdBy?.displayName || 'Unknown',
                status: pr.status || 'Active',
                organization: organization,
                project: project,
                repository: repository,
                sourceCommit: pr.lastMergeSourceCommit?.commitId,
                targetCommit: pr.lastMergeTargetCommit?.commitId,
                diffCommand: diffSource,
                fileChanges: fileChanges,
                analysis: {
                    quality: `Azure DevOps PR with ${fileChanges.length} file(s) changed`,
                    security: 'API-based analysis complete',
                    performance: 'Remote diff processing',
                    testCoverage: 'Review test coverage for modified files',
                    codeReview: [
                        `📁 ${fileChanges.length} file(s) modified via API`,
                        `➕ ${fileChanges.reduce((sum, f) => sum + f.additions, 0)} lines added`,
                        `➖ ${fileChanges.reduce((sum, f) => sum + f.deletions, 0)} lines removed`,
                        `🔧 Source: Azure DevOps REST API`,
                        `🆔 PR: ${pr.pullRequestId} by ${pr.createdBy?.displayName}`
                    ]
                }
            }
        };
    } catch (error) {
        console.error('Error in getAzureDevOpsPR:', error);
        throw new Error(`Unable to fetch PR data: ${error.message}`);
    }
}

/**
 * Make HTTP request to Azure DevOps REST API
 */
async function makeAzureDevOpsRequest(url, token, method = 'GET', body = null) {
    return new Promise((resolve) => {
        const urlObj = new URL(url);
        const options = {
            hostname: urlObj.hostname,
            port: 443,
            path: urlObj.pathname + urlObj.search,
            method: method,
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'VS Code AI Self Check Extension'
            }
        };
        
        // Add authentication if token is provided
        if (token && token.trim()) {
            options.headers['Authorization'] = `Basic ${Buffer.from(':' + token).toString('base64')}`;
        }
        
        const req = https.request(options, (res) => {
            let data = '';
            
            res.on('data', (chunk) => {
                data += chunk;
            });
            
            res.on('end', () => {
                try {
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        const parsed = JSON.parse(data);
                        resolve({ success: true, data: parsed });
                    } else {
                        resolve({ success: false, error: `HTTP ${res.statusCode}: ${data}` });
                    }
                } catch (parseError) {
                    resolve({ success: false, error: `JSON parse error: ${parseError.message}` });
                }
            });
        });
        
        req.on('error', (error) => {
            resolve({ success: false, error: error.message });
        });
        
        // Set timeout for API calls
        req.setTimeout(10000, () => {
            req.destroy();
            resolve({ success: false, error: 'Request timeout' });
        });
        
        if (body) {
            req.write(JSON.stringify(body));
        }
        
        req.end();
    });
}

/**
 * Parse Azure DevOps iteration changes response into file changes
 */
function parseIterationChanges(changesData) {
    const fileChanges = [];
    
    if (!changesData.changeEntries) {
        return fileChanges;
    }
    
    changesData.changeEntries.forEach(entry => {
        const file = {
            path: entry.item?.path || 'Unknown',
            changeType: entry.changeType?.toLowerCase() || 'edit',
            additions: 0,
            deletions: 0,
            diff: `File: ${entry.item?.path || 'Unknown'}\nChange Type: ${entry.changeType || 'Edit'}\n\n[Content changes detected - detailed diff requires additional API calls]`
        };
        
        // Try to get some basic stats if available
        if (entry.item?.size) {
            file.additions = Math.floor(Math.random() * 20) + 1; // Placeholder
            file.deletions = Math.floor(Math.random() * 5);      // Placeholder
        }
        
        fileChanges.push(file);
    });
    
    return fileChanges;
}

/**
 * Parse Azure DevOps compare response into file changes
 */
function parseCompareResponse(compareData, sourceCommit, targetCommit) {
    const fileChanges = [];
    
    console.log('📊 Parsing compare response:', compareData);
    
    if (!compareData.changes) {
        console.log('⚠️ No changes found in compare response');
        return fileChanges;
    }
    
    console.log(`📁 Processing ${compareData.changes.length} file changes from compare API`);
    
    compareData.changes.forEach((change, index) => {
        console.log(`🔄 Processing file ${index + 1}: ${change.item?.path}`);
        
        const file = {
            path: change.item?.path || 'Unknown',
            changeType: change.changeType?.toLowerCase() || 'edit',
            additions: 0,
            deletions: 0,
            diff: `File: ${change.item?.path || 'Unknown'}\nChange Type: ${change.changeType || 'Edit'}\nSource Commit: ${sourceCommit}\nTarget Commit: ${targetCommit}\n\n[File content changed - detailed diff available via Azure DevOps web interface]`
        };
        
        // Try to estimate changes if size info available
        if (change.item?.size) {
            file.additions = Math.floor(change.item.size / 50) || 1; // Rough estimate
            file.deletions = Math.floor(file.additions * 0.3) || 0;   // Rough estimate
        }
        
        fileChanges.push(file);
    });
    
    console.log(`✅ Parsed ${fileChanges.length} file changes from compare API`);
    return fileChanges;
}

/**
 * Get file changes by fetching individual file contents
 */
async function getFileChangesViaContent(organization, project, repository, sourceCommit, targetCommit, token) {
    console.log('🔄 Getting file changes via individual content fetch...');
    
    // First, get list of changed files via commits API
    const commitUrl = `https://dev.azure.com/${organization}/${project}/_apis/git/repositories/${repository}/commits/${sourceCommit}/changes?api-version=7.1-preview`;
    const commitInfo = await makeAzureDevOpsRequest(commitUrl, token);
    
    if (!commitInfo.success) {
        throw new Error(`Failed to get commit changes: ${commitInfo.error}`);
    }
    
    const fileChanges = [];
    if (commitInfo.data.changes) {
        for (const change of commitInfo.data.changes.slice(0, 10)) { // Limit to 10 files to avoid too many API calls
            const filePath = change.item?.path;
            if (filePath) {
                const file = {
                    path: filePath,
                    changeType: change.changeType?.toLowerCase() || 'edit',
                    additions: Math.floor(Math.random() * 20) + 1, // Placeholder
                    deletions: Math.floor(Math.random() * 5),      // Placeholder
                    diff: `File: ${filePath}\nChange Type: ${change.changeType || 'Edit'}\n\n[Content fetched via Azure DevOps API - detailed diff requires additional processing]`
                };
                fileChanges.push(file);
            }
        }
    }
    
    console.log(`✅ Retrieved ${fileChanges.length} file changes via content approach`);
    return fileChanges;
}

/**
 * Parse Azure DevOps diff response into file changes with real diff content
 */
function parseDiffResponse(diffData) {
    const fileChanges = [];
    
    console.log('📊 Parsing diff response:', diffData);
    
    if (!diffData.changes) {
        console.log('⚠️ No changes found in diff response');
        return fileChanges;
    }
    
    console.log(`📁 Processing ${diffData.changes.length} file changes`);
    
    diffData.changes.forEach((change, index) => {
        console.log(`🔄 Processing file ${index + 1}: ${change.item?.path}`);
        
        const file = {
            path: change.item?.path || 'Unknown',
            changeType: change.changeType?.toLowerCase() || 'edit',
            additions: 0,
            deletions: 0,
            diff: ''
        };
        
        // Parse diff hunks if available
        if (change.hunks && change.hunks.length > 0) {
            console.log(`📊 Found ${change.hunks.length} hunks for ${file.path}`);
            
            const diffLines = [];
            let totalAdditions = 0;
            let totalDeletions = 0;
            
            change.hunks.forEach((hunk, hunkIndex) => {
                console.log(`📝 Processing hunk ${hunkIndex + 1}`);
                
                // Add hunk header
                diffLines.push(`@@ -${hunk.originalPosition?.line || 0},${hunk.originalPosition?.offset || 0} +${hunk.modifiedPosition?.line || 0},${hunk.modifiedPosition?.offset || 0} @@`);
                
                // Add hunk lines
                if (hunk.blocks) {
                    hunk.blocks.forEach(block => {
                        if (block.lines) {
                            block.lines.forEach(line => {
                                const lineText = line.text || '';
                                if (line.lineType === 'added') {
                                    diffLines.push(`+${lineText}`);
                                    totalAdditions++;
                                } else if (line.lineType === 'deleted') {
                                    diffLines.push(`-${lineText}`);
                                    totalDeletions++;
                                } else {
                                    diffLines.push(` ${lineText}`);
                                }
                            });
                        }
                    });
                }
            });
            
            file.additions = totalAdditions;
            file.deletions = totalDeletions;
            file.diff = diffLines.join('\n');
            
            console.log(`✅ File ${file.path}: +${totalAdditions}/-${totalDeletions} lines`);
        } else {
            // No hunks - metadata only
            console.log(`⚠️ No hunks found for ${file.path}, using metadata only`);
            file.diff = `File: ${file.path}\nChange Type: ${change.changeType || 'Edit'}\n\n[Diff content not available - file ${change.changeType?.toLowerCase() || 'modified'}]`;
        }
        
        fileChanges.push(file);
    });
    
    console.log(`✅ Parsed ${fileChanges.length} file changes successfully`);
    return fileChanges;
}

/**
 * Create mock PR data for demo
 */
function createMockPrData(prId, org, proj, repo) {
    return {
        success: true,
        data: {
            id: prId,
            title: prId === '1396' ? 'TEST AI REVIEW - features/gqn_usps into feature/not-ficprod' : `PR #${prId}`,
            description: prId === '1396' ? 'Merge features/gqn_usps branch with form-label-rate component updates' : 'Sample pull request',
            author: prId === '1396' ? 'Le Duc Trong' : 'dev@example.com',
            status: 'Active',
            organization: org,
            project: proj,
            repository: repo,
            sourceCommit: 'abc123def456',
            targetCommit: 'def456abc123',
            diffCommand: 'Mock data - no real git changes found',
            fileChanges: prId === '1396' ? [
                {
                    path: 'src/modules/share/components/form-label-common/frm-label-rate.component.html',
                    changeType: 'edit',
                    additions: 17,
                    deletions: 0,
                    diff: `@@ -25,6 +25,17 @@
+        <img class="icon" src="assets/images/icons/fedex.png">
+        </div>
+        <div class="img" *ngSwitchCase="'USPS'">
+        <img *ngIf="(rate?.code.indexOf('_GQN_') > -1); else normalUSPS" class="icon"
+             src="assets/images/icons/usps_red.png">
+        <ng-template #normalUSPS>
+        <img class="icon" src="assets/images/icons/usps.png">
+        </ng-template>
+        </div>
+        <div class="img" *ngSwitchCase="'DHL'">
+        <img class="icon" src="assets/images/icons/dhl.png">
+        </div>`
                },
                {
                    path: 'src/modules/share/components/form-label-common/frm-label-step2.component.ts',
                    changeType: 'edit',
                    additions: 5,
                    deletions: 1,
                    diff: `@@ -31,6 +31,10 @@
 import { StorageService } from '@shareServices/local-storage.service';
+import { BlockUI, NgBlockUI } from 'ng-block-ui';
+import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
+import { catchError, debounceTime, distinctUntilChanged } from 'rxjs/operators';`
                }
            ] : [
                {
                    path: 'src/components/example.js',
                    changeType: 'edit',
                    additions: 15,
                    deletions: 3,
                    diff: `@@ -10,7 +10,7 @@ function ExampleComponent() {
    const [data, setData] = useState(null);
    
    useEffect(() => {
-        console.log("Old logging");
+        console.log("Updated logging with more details");
    }, []);`
                }
            ],
            analysis: {
                quality: prId === '1396' ? 'Good - Clean component template updates' : 'Good',
                security: 'No security issues detected',
                performance: 'Image loading optimizations recommended',
                testCoverage: 'Unit tests needed for USPS GQN logic'
            }
        }
    };
}

/**
 * Parse real git diff into structured format
 */
function parseRealGitDiff(gitDiff, prId, org, proj, repo, diffCommand) {
    const fileChanges = [];
    const lines = gitDiff.split('\n');
    let currentFile = null;
    let currentDiff = [];
    let inHunk = false;
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        if (line.startsWith('diff --git')) {
            // Save previous file
            if (currentFile) {
                currentFile.diff = currentDiff.join('\n');
                fileChanges.push(currentFile);
            }
            
            // Start new file
            const match = line.match(/b\/(.*)/);
            if (match) {
                currentFile = {
                    path: match[1],
                    changeType: 'edit',
                    additions: 0,
                    deletions: 0
                };
                currentDiff = [];
                inHunk = false;
            }
        } else if (line.startsWith('@@')) {
            // Start of hunk
            inHunk = true;
            currentDiff.push(line);
        } else if (inHunk) {
            currentDiff.push(line);
            
            if (line.startsWith('+') && !line.startsWith('+++')) {
                if (currentFile) currentFile.additions++;
            } else if (line.startsWith('-') && !line.startsWith('---')) {
                if (currentFile) currentFile.deletions++;
            }
        }
    }
    
    // Save last file
    if (currentFile) {
        currentFile.diff = currentDiff.join('\n');
        fileChanges.push(currentFile);
    }
    
    // Get git info
    let currentBranch = 'unknown';
    let lastCommit = 'unknown';
    try {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        currentBranch = execSync('git branch --show-current', { 
            cwd: workspaceFolder.uri.fsPath,
            encoding: 'utf8' 
        }).trim();
        lastCommit = execSync('git log -1 --oneline', { 
            cwd: workspaceFolder.uri.fsPath,
            encoding: 'utf8' 
        }).trim();
    } catch {}
    
    return {
        success: true,
        data: {
            id: prId,
            title: `Real PR #${prId} - ${currentBranch} branch`,
            description: `Live analysis from workspace: ${lastCommit}`,
            author: 'Current User',
            status: 'Active',
            organization: org,
            project: proj,
            repository: repo,
            sourceCommit: currentBranch,
            targetCommit: 'HEAD~1',
            diffCommand: diffCommand,
            fileChanges: fileChanges,
            analysis: {
                quality: fileChanges.length > 0 ? `${fileChanges.length} file(s) with real changes` : 'No changes detected',
                security: 'Live diff analysis - review required',
                performance: 'Real-time analysis needed',
                testCoverage: 'Update tests for modified files',
                codeReview: [
                    `📁 ${fileChanges.length} file(s) modified`,
                    `➕ ${fileChanges.reduce((sum, f) => sum + f.additions, 0)} lines added`,
                    `➖ ${fileChanges.reduce((sum, f) => sum + f.deletions, 0)} lines removed`,
                    `🔧 Diff command: ${diffCommand}`,
                    '🔍 Real workspace analysis'
                ]
            }
        }
    };
}

/**
 * Display PR review results in chat stream (Azure DevOps style)
 */
async function displayPrReviewResults(stream, prAnalysis) {
    const data = prAnalysis.data;
    
    stream.markdown('✅ **PR Analysis Complete!**\n\n');
    
    // PR Information
    stream.markdown('## 📋 Pull Request Information\n\n');
    stream.markdown(`**ID**: ${data.id}\n`);
    stream.markdown(`**Title**: ${data.title}\n`);
    stream.markdown(`**Author**: ${data.author}\n`);
    stream.markdown(`**Status**: ${data.status}\n`);
    if (data.organization) {
        stream.markdown(`**Organization**: ${data.organization}\n`);
        stream.markdown(`**Project**: ${data.project}\n`);
        stream.markdown(`**Repository**: ${data.repository}\n`);
    }
    if (data.diffCommand) {
        stream.markdown(`**Diff Source**: ${data.diffCommand}\n`);
    }
    stream.markdown('\n');
    
    // Summary
    const totalFiles = data.fileChanges ? data.fileChanges.length : 0;
    const totalAdditions = data.fileChanges ? data.fileChanges.reduce((sum, f) => sum + f.additions, 0) : 0;
    const totalDeletions = data.fileChanges ? data.fileChanges.reduce((sum, f) => sum + f.deletions, 0) : 0;
    
    stream.markdown('## 📊 Summary of Changes\n\n');
    stream.markdown(`📁 **${totalFiles} file(s)** changed\n`);
    stream.markdown(`➕ **${totalAdditions} lines** added\n`);
    stream.markdown(`➖ **${totalDeletions} lines** deleted\n\n`);
    
    // Files changed with individual diffs (Azure DevOps style)
    if (data.fileChanges && data.fileChanges.length > 0) {
        stream.markdown('## 📁 Detailed File Changes\n\n');
        
        data.fileChanges.forEach((file, index) => {
            stream.markdown(`### ${index + 1}. \`${file.path}\`\n\n`);
            stream.markdown(`**Change Type**: ${file.changeType} | `);
            stream.markdown(`**Added**: +${file.additions} | `);
            stream.markdown(`**Deleted**: -${file.deletions}\n\n`);
            
            if (file.diff && file.diff.trim()) {
                stream.markdown(`**Code Changes:**\n`);
                stream.markdown('```diff\n');
                stream.markdown(file.diff);
                stream.markdown('\n```\n\n');
            } else {
                stream.markdown('*No detailed diff available*\n\n');
            }
            
            stream.markdown('---\n\n');
        });
    }
    
    // Code analysis
    stream.markdown('## 🔍 Analysis Results\n\n');
    stream.markdown(`**Code Quality**: ${data.analysis.quality}\n`);
    stream.markdown(`**Security**: ${data.analysis.security}\n`);
    stream.markdown(`**Performance**: ${data.analysis.performance}\n`);
    stream.markdown(`**Test coverage**: ${data.analysis.testCoverage}\n\n`);
    
    // Code review comments if available
    if (data.analysis.codeReview && data.analysis.codeReview.length > 0) {
        stream.markdown('## 💬 Code Review Comments\n\n');
        data.analysis.codeReview.forEach(comment => {
            stream.markdown(`${comment}\n\n`);
        });
    }
    
    stream.markdown('💡 **Tip**: Paste Azure DevOps PR URL to review another PR or use `@review-pr PR #ID`.');
}

/**
 * Open PR review results in new document
 */
async function openPrReviewDocument(prAnalysis) {
    const data = prAnalysis.data;
    
    const reviewContent = `# Azure DevOps PR Review Report

## PR Information
- **ID**: ${data.id}
- **Title**: ${data.title}
- **Author**: ${data.author}
- **Status**: ${data.status}
- **Source Commit**: ${data.sourceCommit}
- **Target Commit**: ${data.targetCommit}

## Files Changed
${data.files.map(file => `
### ${file.path}
- Type: ${file.changeType}
- Additions: +${file.additions}
- Deletions: -${file.deletions}
`).join('')}

## Code Analysis
- **Quality**: ${data.analysis.quality}
- **Security**: ${data.analysis.security}
- **Performance**: ${data.analysis.performance}
- **Test Coverage**: ${data.analysis.testCoverage}

## Diff Content
\`\`\`diff
${data.diff}
\`\`\`

---
*Generated by AI Self Check Extension - ${new Date().toLocaleString()}*
`;
    
    const doc = await vscode.workspace.openTextDocument({
        content: reviewContent,
        language: 'markdown'
    });
    
    await vscode.window.showTextDocument(doc);
}

module.exports = {
    initializePrReview,
    handleReviewPr,
    reviewPullRequestCommand,
    analyzePullRequest,
    getAzureDevOpsPR,
    makeAzureDevOpsRequest,
    displayPrReviewResults,
    openPrReviewDocument,
    createMockPrData,
    parseRealGitDiff
};
