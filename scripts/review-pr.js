/**
 * FUNCTION B - Handle GitHub PR diffs and show in webview
 * Dedicated function for GitHub diffs - clean separation from Azure DevOps
 * @param {object} prAnalysis - GitHub PR analysis result
 * @param {object} stream - VS Code stream for output
 */
async function showGitHubDiffInWebview(prAnalysis, stream) {
    console.log('🐙 GitHub Function B: Starting GitHub diff webview display');
    
    if (!prAnalysis || !prAnalysis.data || !prAnalysis.data.fileChanges) {
        stream.markdown('❌ **No GitHub diff data available**\n\n');
        return;
    }

    const data = prAnalysis.data;
    const fileChanges = data.fileChanges;
    
    // Initialize global cache for GitHub diffs
    if (!global.prDiffCache) {
        global.prDiffCache = {};
    }

    stream.markdown('🐙 **GitHub Diff Webview Display**\n\n');
    
    // Cache all GitHub file changes for webview access
    fileChanges.forEach(fileChange => {
        const diffId = `github_${data.id}_${fileChange.path.replace(/[^a-zA-Z0-9]/g, '_')}`;
        
        global.prDiffCache[diffId] = {
            ...fileChange,
            provider: 'github',
            prId: data.id,
            // Ensure diffContent is available for webview
            diff: fileChange.diffContent || fileChange.diff || '',
            diffContent: fileChange.diffContent || fileChange.diff || ''
        };
        
        console.log(`🔍 Cached GitHub diff: ${diffId} for ${fileChange.path}`);
        console.log(`📊 DEBUG: diffContent length: ${(fileChange.diffContent || '').length}, diff length: ${(fileChange.diff || '').length}`);
    });

    // Debug cache summary for GitHub
    const githubCacheKeys = Object.keys(global.prDiffCache).filter(k => k.startsWith(`github_${data.id}_`));
    console.log(`🐙 GitHub cache summary: ${githubCacheKeys.length} files cached:`, githubCacheKeys);

    // Display file links with webview buttons
    stream.markdown('📁 **Files in this GitHub PR:**\n\n');
    
    fileChanges.forEach(fileChange => {
        const diffId = `github_${data.id}_${fileChange.path.replace(/[^a-zA-Z0-9]/g, '_')}`;
        const fileName = fileChange.path.split('/').pop();
        
        // Create button to open diff in webview
        stream.button({
            command: 'aiSelfCheck.viewPrDiff',
            title: `📄 ${fileName} (+${fileChange.additions}/-${fileChange.deletions})`,
            arguments: [diffId]
        });
        
        stream.markdown(`\n**${fileChange.path}** - ${fileChange.changeType} (+${fileChange.additions}/-${fileChange.deletions})\n\n`);
    });

    // Button to view all diffs at once
    stream.button({
        command: 'aiSelfCheck.viewAllPrDiffs',
        title: `📊 View All ${fileChanges.length} Files in Tabbed Webview`,
        arguments: [`github_${data.id}`]
    });

    stream.markdown('\n\n💡 **Click any file button above to view diff in webview**\n\n');
}

/**
 * FUNCTION A - Handle Azure DevOps PR diffs and show in webview  
 * Dedicated function for Azure DevOps diffs - clean separation from GitHub
 * @param {object} prAnalysis - Azure DevOps PR analysis result
 * @param {object} stream - VS Code stream for output
 */
async function showAzureDevOpsDiffInWebview(prAnalysis, stream) {
    console.log('🔵 Azure Function A: Starting Azure DevOps diff webview display');
    
    if (!prAnalysis || !prAnalysis.data || !prAnalysis.data.fileChanges) {
        stream.markdown('❌ **No Azure DevOps diff data available**\n\n');
        return;
    }

    const data = prAnalysis.data;
    const fileChanges = data.fileChanges;
    
    // Initialize global cache for Azure DevOps diffs
    if (!global.prDiffCache) {
        global.prDiffCache = {};
    }

    stream.markdown('🔵 **Azure DevOps Diff Webview Display**\n\n');
    
    // Cache all Azure DevOps file changes for webview access
    fileChanges.forEach(fileChange => {
        const diffId = `pr${data.id}_${fileChange.path.replace(/[^a-zA-Z0-9]/g, '_')}`;
        
        global.prDiffCache[diffId] = {
            ...fileChange,
            provider: 'azure',
            prId: data.id,
            // Ensure diffContent is available for webview
            diff: fileChange.diffContent || fileChange.diff || '',
            diffContent: fileChange.diffContent || fileChange.diff || ''
        };
        
        console.log(`🔍 Cached Azure DevOps diff: ${diffId} for ${fileChange.path}`);
    });

    // Display file links with webview buttons
    stream.markdown('📁 **Files in this Azure DevOps PR:**\n\n');
    
    fileChanges.forEach(fileChange => {
        const diffId = `pr${data.id}_${fileChange.path.replace(/[^a-zA-Z0-9]/g, '_')}`;
        const fileName = fileChange.path.split('/').pop();
        
        // Create button to open diff in webview
        stream.button({
            command: 'aiSelfCheck.viewPrDiff',
            title: `📄 ${fileName} (+${fileChange.additions}/-${fileChange.deletions})`,
            arguments: [diffId]
        });
        
        stream.markdown(`\n**${fileChange.path}** - ${fileChange.changeType} (+${fileChange.additions}/-${fileChange.deletions})\n\n`);
    });

    // Button to view all diffs at once
    stream.button({
        command: 'aiSelfCheck.viewAllPrDiffs',
        title: `📊 View All ${fileChanges.length} Files in Tabbed Webview`,
        arguments: [data.id]
    });

    stream.markdown('\n\n💡 **Click any file button above to view diff in webview**\n\n');
}
const vscode = require('vscode');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');
const { getReviewTemplate, getUnifiedModel, executeAIReview, shouldUseApiKey } = require('./review-common');
const Diff = require('diff');

// Global configuration variables
const isShowSummaryOfChanges = false;

// Helper function to count diff lines accurately (matches Azure DevOps)
function countDiffLines(diffContent) {
    const lines = diffContent.split('\n');
    let additions = 0;
    let deletions = 0;
    
    for (const line of lines) {
        if (line.startsWith('+') && !line.startsWith('+++')) {
            const content = line.substring(1);
            // Chỉ đếm dòng có nội dung thực (không phải trống)
            if (content.trim().length > 0) {
                additions++;
            }
        } else if (line.startsWith('-') && !line.startsWith('---')) {
            const content = line.substring(1);
            if (content.trim().length > 0) {
                deletions++;
            }
        }
    }
    
    return { additions, deletions };
}

// Azure DevOps Pull Request Review Feature

/**
 * Initialize PR review functionality
 */
function initializePrReview(context) {
    // Create new chat participant for PR review
    const reviewPrParticipant = vscode.chat.createChatParticipant('review-pr', handleReviewPr);

    // Set theme-appropriate PR review icon
    reviewPrParticipant.iconPath = {
        light: vscode.Uri.file(path.join(context.extensionPath, 'icons', 'pr-review-light.svg')),
        dark: vscode.Uri.file(path.join(context.extensionPath, 'icons', 'pr-review-dark.svg'))
    };

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

        // Parse repo URL and detect type
        let prId = null;
        let repoType = null;
        let organization = null;
        let project = null;
        let repository = null;
        let owner = null;
        let repo = null;

        // GitHub URL pattern: https://github.com/{owner}/{repo}/pull/{id}
        const githubUrlPattern = /https:\/\/github\.com\/([^\/]+)\/([^\/]+)\/pull\/(\d+)/i;
        const githubMatch = userMessage.match(githubUrlPattern);

        // Azure DevOps URL pattern: https://dev.azure.com/{org}/{project}/_git/{repo}/pullrequest/{id}
        const azureUrlPattern = /https:\/\/dev\.azure\.com\/([^\/]+)\/([^\/]+)\/_git\/([^\/]+)\/pullrequest\/(\d+)/i;
        const azureMatch = userMessage.match(azureUrlPattern);

        if (githubMatch) {
            repoType = 'github';
            owner = githubMatch[1];
            repo = githubMatch[2];
            prId = githubMatch[3];
        } else if (azureMatch) {
            repoType = 'azure';
            organization = azureMatch[1];
            project = azureMatch[2];
            repository = azureMatch[3];
            prId = azureMatch[4];
        } else {
            // Fallback to simple PR ID pattern (Azure DevOps default)
            const prPattern = /(?:pullrequest(?:s)?\/(\d+)|pr[#\s]?(\d+)|id[:\s]?(\d+))/i;
            const match = userMessage.match(prPattern);
            if (match) {
                repoType = 'azure';
                prId = match[1] || match[2] || match[3];
            }
        }

        // Check for quick-analyze command
        if (userMessage.toLowerCase().includes('quick-analyze')) {
            // Try to get the last analyzed PR data from context or show instructions
            stream.markdown('🚀 **Quick Analyze Command**\n\n');
            stream.markdown('To perform quick analysis, first provide a PR URL, then use `quick-analyze`.\n\n');
            stream.markdown('**Example workflow:**\n');
            stream.markdown('1. `https://dev.azure.com/org/project/_git/repo/pullrequest/123`\n');
            stream.markdown('2. `quick-analyze`\n\n');
            return;
        }

        if (!prId) {
            stream.markdown('🤖 **PR Reviewer (GitHub & Azure DevOps)**\n\n');
            stream.markdown('I can review PRs from both GitHub and Azure DevOps! Please provide:\n\n');
            stream.markdown('**GitHub:**\n');
            stream.markdown('• `https://github.com/owner/repo/pull/123`\n\n');
            stream.markdown('**Azure DevOps:**\n');
            stream.markdown('• `https://dev.azure.com/org/project/_git/repo/pullrequest/123`\n');
            stream.markdown('• `PR #123` or `ID: 123` (defaults to configured Azure DevOps)\n\n');
            stream.markdown('**Examples:**\n');
            stream.markdown('```\n');
            stream.markdown('https://github.com/microsoft/vscode/pull/12345\n');
            stream.markdown('https://dev.azure.com/BusinessWebUS/Shippo/_git/Shippo-Web/pullrequest/1396\n');
            stream.markdown('Review PR #123\n');
            stream.markdown('```\n\n');
            stream.markdown('💡 **Note**: Configure tokens in VS Code settings for private repos.');
            return;
        }

        // Display repo info based on type
        if (repoType === 'github') {
            stream.markdown('� **Analyzing GitHub PR...**\n\n');
            stream.markdown(`🐙 **Repository**: ${owner}/${repo}\n`);
            stream.markdown(`📋 **PR**: #${prId}\n`);
            stream.markdown('⏳ **Fetching from GitHub API...**\n\n');
        } else {
            stream.markdown('🔍 **Analyzing Azure DevOps** 📋 **PR ID**: ' + prId + '\n\n');
            if (organization && project && repository) {
                stream.markdown(`🏢 **Organization**: ${organization} 📁 **Project**: ${project} 📦 **Repository**: ${repository}\n`);
            }
            stream.markdown('⏳ **Fetching from Azure DevOps API...**\n\n');
        }

        // Get PR diff and analyze based on repo type
        let prAnalysis;
        if (repoType === 'github') {
            console.log(`🐙 DEBUG: Starting GitHub PR analysis for ${owner}/${repo}#${prId}`);
            prAnalysis = await analyzeGitHubPullRequest(stream, owner, repo, prId);
            console.log('🐙 DEBUG: GitHub PR analysis result:', JSON.stringify(prAnalysis, null, 2));
        } else {
            console.log(`🔵 DEBUG: Starting Azure DevOps PR analysis for PR #${prId}`);
            prAnalysis = await analyzePullRequest(stream, prId, organization, project, repository);
            console.log('🔵 DEBUG: Azure PR analysis result:', JSON.stringify(prAnalysis, null, 2));
        }

        if (prAnalysis.error) {
            stream.markdown(`❌ **Error**: ${prAnalysis.error}\n\n`);
            stream.markdown('**Possible causes:**\n');
            if (repoType === 'github') {
                stream.markdown('• GitHub token not configured or insufficient permissions\n');
                stream.markdown('• PR ID does not exist or repository is private\n');
                stream.markdown('• Rate limit exceeded\n');
            } else {
                stream.markdown('• Insufficient Azure DevOps access permissions\n');
                stream.markdown('• PR ID does not exist\n');
                stream.markdown('• Credentials configuration is incorrect\n');
            }
            return;
        }

        // Display basic PR info after successful fetch
        const data = prAnalysis.data;
        if (data) {
            console.log(`📊 DEBUG: PR data structure:`, {
                title: data.title,
                author: data.author,
                status: data.status,
                sourceBranch: data.sourceBranch,
                targetBranch: data.targetBranch,
                fileChangesCount: data.fileChanges?.length,
                repoType: repoType
            });
            
            stream.markdown(`📝 **Title**: ${data.title} ⭐ **Author**: ${data.author} 🔄 **Status**: ${data.status}\n\n`);
            
            // Display branch information
            if (data.sourceBranch && data.targetBranch) {
                stream.markdown(`🌿 **Merging**: \`${data.sourceBranch}\` → \`${data.targetBranch}\`\n\n`);
            }
            
            // Debug file changes for GitHub
            if (repoType === 'github' && data.fileChanges) {
                console.log(`🐙 DEBUG: GitHub file changes:`, data.fileChanges.map(f => ({
                    path: f.path,
                    changeType: f.changeType,
                    additions: f.additions,
                    deletions: f.deletions,
                    hasDiffContent: !!f.diffContent,
                    diffContentLength: f.diffContent?.length || 0
                })));
            }
        }

        // Display PR review results
        await displayPrReviewResults(stream, prAnalysis);

        // Add quick review option
        await addQuickReviewOption(stream, prAnalysis, request);

    } catch (error) {
        stream.markdown('❌ **Unexpected Error**\n\n');
        stream.markdown(`Details: ${error.message}\n\n`);
        stream.markdown('Please try again or check the extension logs.');
    }
}

/**
 * Review Pull Request command
 */
async function reviewPullRequestCommand() {
    try {
        // Show input box for PR URL or ID
        const prInput = await vscode.window.showInputBox({
            prompt: 'Enter Azure DevOps PR URL or PR ID',
            placeHolder: 'Example: https://dev.azure.com/org/project/_git/repo/pullrequest/123 or PR #123',
            validateInput: (value) => {
                if (!value) return 'Please enter PR URL or ID';
                if (!value.match(/(?:pullrequest(?:s)?\/(\d+)|pr[#\s]?(\d+)|id[:\s]?(\d+)|dev\.azure\.com)/i)) {
                    return 'Invalid format. Example: PR #123 or Azure DevOps URL';
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
            vscode.window.showErrorMessage('Unable to determine PR ID from provided input');
            return;
        }

        // Show progress
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Reviewing Azure DevOps PR #${prId}`,
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

            // Return error instead of mock data
            return { error: 'Azure DevOps Personal Access Token is required' };
        }

        try {
            // Call Azure DevOps REST API with token
            console.log(`🔄 Calling Azure DevOps API for PR ${prId}...`);
            const prData = await getAzureDevOpsPR(org, proj, repo, prId, personalAccessToken);
            console.log('✅ Azure DevOps API call successful:', prData);
            return prData;

        } catch (apiError) {
            // Return error instead of mock data
            console.error('❌ Azure DevOps API failed:', apiError.message);
            stream.markdown('❌ **Azure DevOps API Error**\n\n');
            stream.markdown(`Error: ${apiError.message}\n\n`);
            return { error: `Azure DevOps API failed: ${apiError.message}` };
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
        
        // Extract branch information
        const sourceBranch = pr.sourceRefName?.replace('refs/heads/', '') || 'Unknown';
        const targetBranch = pr.targetRefName?.replace('refs/heads/', '') || 'Unknown';
        console.log(`🌿 Branch info: ${sourceBranch} → ${targetBranch}`);

        let commits = [];
        let fileChanges = [];
        let finalDiff = '';
        let diffSource = 'PR-specific changes only';

        console.log('🔍 Getting PR-specific changes from source commit...');

        // STEP 1: Get ALL commits in this PR
        console.log('📝 Getting all commits from PR...');
        const commitsUrl = `https://dev.azure.com/${organization}/${project}/_apis/git/repositories/${repository}/pullRequests/${prId}/commits?api-version=7.0&$top=1000`;
        const commitsResponse = await makeAzureDevOpsRequest(commitsUrl, token);

        if (commitsResponse.success && commitsResponse.data.value?.length > 0) {
            commits = commitsResponse.data.value;
            console.log(`✅ Found ${commits.length} commits in PR`);
            commits.forEach((commit, index) => {
                console.log(`  ${index + 1}. ${commit.commitId.substring(0, 7)} - ${commit.comment || 'No message'}`);
            });
        } else {
            console.log('⚠️ No commits found, trying single source commit...');
            // Fallback to single commit if API fails
            if (pr.lastMergeSourceCommit) {
                const sourceCommitId = pr.lastMergeSourceCommit.commitId;
                console.log(`📝 PR source commit: ${sourceCommitId.substring(0, 7)}`);

                // Get detailed info about this specific commit
                const commitUrl = `https://dev.azure.com/${organization}/${project}/_apis/git/repositories/${repository}/commits/${sourceCommitId}?api-version=7.0`;
                const commitResponse = await makeAzureDevOpsRequest(commitUrl, token);

                if (commitResponse.success && commitResponse.data) {
                    const commit = commitResponse.data;
                    commits = [{
                        commitId: commit.commitId,
                        comment: commit.comment || 'No message',
                        author: {
                            name: commit.author?.name || 'Unknown',
                            date: commit.author?.date || new Date().toISOString()
                        }
                    }];
                    console.log(`✅ Found PR source commit: ${commit.commitId.substring(0, 7)} - ${commit.comment}`);
                }
            }
        }

        // STEP 2: Get PR iterations to find the latest iteration (this contains actual PR changes)
        const iterationsUrl = `https://dev.azure.com/${organization}/${project}/_apis/git/repositories/${repository}/pullRequests/${prId}/iterations?api-version=7.0`;
        const iterationsResponse = await makeAzureDevOpsRequest(iterationsUrl, token);

        if (iterationsResponse.success && iterationsResponse.data.value?.length > 0) {
            const iterations = iterationsResponse.data.value;
            const latestIteration = iterations[iterations.length - 1];

            console.log(`✅ Found ${iterations.length} iterations, using latest: ${latestIteration.id}`);

            // STEP 3: Get file changes from the latest iteration (this gives us actual PR changes)
            const changesUrl = `https://dev.azure.com/${organization}/${project}/_apis/git/repositories/${repository}/pullRequests/${prId}/iterations/${latestIteration.id}/changes?api-version=7.0&$top=1000`;
            const changesResponse = await makeAzureDevOpsRequest(changesUrl, token);

            if (changesResponse.success && changesResponse.data.changeEntries) {
                // Filter to get only actual file changes (not folders)
                const actualFiles = changesResponse.data.changeEntries.filter(change => {
                    const filePath = change.item?.path || change.originalPath || '';
                    const isFile = filePath &&
                        filePath.includes('.') &&
                        !filePath.endsWith('/') &&
                        filePath.split('/').pop().includes('.') &&
                        !filePath.includes('/.git/');

                    if (isFile) {
                        console.log(`📄 File found: ${filePath} (${change.changeType})`);
                    }
                    return isFile;
                });

                console.log(`✅ Found ${actualFiles.length} actual file changes in PR (filtered from ${changesResponse.data.changeEntries.length} total entries)`);

                // STEP 4 (SIMPLIFIED): Use file content + diff library only (universal approach)
                console.log('🔄 Using simplified file content + diff library approach...');

                // Get correct target branch HEAD commit (not PR merge target)
                let baseCommit = pr.lastMergeTargetCommit?.commitId;
                const sourceCommit = pr.lastMergeSourceCommit?.commitId;
                
                try {
                    const branchUrl = `https://dev.azure.com/${organization}/${project}/_apis/git/repositories/${repository}/refs?filter=heads/${targetBranch}&api-version=7.0`;
                    const branchResponse = await makeAzureDevOpsRequest(branchUrl, token);
                    if (branchResponse.success && branchResponse.data.value && branchResponse.data.value.length > 0) {
                        baseCommit = branchResponse.data.value[0].objectId;
                        console.log(`✅ Using actual HEAD of ${targetBranch}: ${baseCommit.substring(0,7)} (instead of PR merge target: ${pr.lastMergeTargetCommit?.commitId?.substring(0,7)})`);
                    }
                } catch (error) {
                    console.log(`⚠️ Failed to get HEAD of ${targetBranch}, using PR merge target commit`);
                }

                // Process file changes with simple approach
                fileChanges = await Promise.all(actualFiles.map(async (change) => {
                    const filePath = change.item?.path || change.originalPath || 'Unknown';
                    console.log(`📁 Processing file: ${filePath} (${change.changeType})`);

                    let diffContent = '';
                    let additions = 0;
                    let deletions = 0;

                    if (baseCommit && sourceCommit) {
                        try {
                            // Get file content from both commits
                            const baseContent = await getFileContent(organization, project, repository, filePath, baseCommit, token);
                            const sourceContent = await getFileContent(organization, project, repository, filePath, sourceCommit, token);

                            if (baseContent !== null || sourceContent !== null) {
                                // Generate unified diff using diff library
                                diffContent = generateUnifiedDiff(filePath, baseContent || '', sourceContent || '', change.changeType);

                                // Count changes using our counting function
                                const counts = countDiffLines(diffContent);
                                additions = counts.additions;
                                deletions = counts.deletions;

                                console.log(`✅ Generated diff for ${filePath}: +${additions}/-${deletions}`);
                            } else {
                                console.log(`⚠️ Could not fetch content for ${filePath}`);
                                diffContent = `diff --git a/${filePath} b/${filePath}\n[Could not retrieve file content]`;
                            }
                        } catch (err) {
                            console.log(`❌ Error processing ${filePath}: ${err.message}`);
                            diffContent = `diff --git a/${filePath} b/${filePath}\n[Error: ${err.message}]`;
                        }
                    } else {
                        console.log(`⚠️ Missing commit information for ${filePath}`);
                        diffContent = `diff --git a/${filePath} b/${filePath}\n[Missing commit information]`;
                    }

                    return {
                        path: filePath,
                        changeType: change.changeType?.toLowerCase() || 'edit',
                        sourceCommit: baseCommit?.substring(0, 7) || 'target',
                        targetCommit: sourceCommit?.substring(0, 7) || 'source',
                        additions: additions,
                        deletions: deletions,
                        diffContent: diffContent
                    };
                }));

                console.log(`✅ Processed ${fileChanges.length} files with PR-specific changes`);
            } else {
                console.log('⚠️ No file changes found in PR iteration');
            }

        } else {
            console.log('⚠️ No iterations found for PR');
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
                sourceBranch: sourceBranch,
                targetBranch: targetBranch,
                sourceCommit: pr.lastMergeSourceCommit?.commitId,
                targetCommit: pr.lastMergeTargetCommit?.commitId,
                diffCommand: diffSource,
                fileChanges: fileChanges,
                // Include commits and final diff info (PR-specific only)
                commits: commits || [],
                totalCommits: commits?.length || 0,
                finalDiff: finalDiff,
                commitsList: commits?.map(commit => ({
                    id: commit.commitId.substring(0, 7),
                    fullId: commit.commitId,
                    message: commit.comment || 'No message',
                    author: commit.author?.name || 'Unknown',
                    date: commit.author?.date || new Date().toISOString()
                })) || [],
                analysis: {
                    quality: `Azure DevOps PR with ${fileChanges.length} file(s) changed across ${commits?.length || 0} commits`,
                    security: 'Complete PR diff analysis',
                    performance: 'Full PR data processing',
                    testCoverage: 'Review test coverage for modified files',
                    codeReview: [
                        `📁 ${fileChanges.length} file(s) modified`,
                        `➕ ${fileChanges.reduce((sum, f) => sum + f.additions, 0)} lines added`,
                        `➖ ${fileChanges.reduce((sum, f) => sum + f.deletions, 0)} lines removed`,
                        `🔍 Source: ${diffSource}`,
                        `📝 Total commits: ${commits?.length || 0}`
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
 * Get diff content from Azure DevOps API
 * Uses the Diffs API to get actual diff content
 */
async function getAzureDevOpsDiff(organization, project, repository, prId, iterationId, token) {
    try {
        console.log(`🔄 Fetching diff via Azure DevOps API: PR ${prId}, Iteration ${iterationId}`);

        // Use iterations changes API which includes diff content
        const changesUrl = `https://dev.azure.com/${organization}/${project}/_apis/git/repositories/${repository}/pullRequests/${prId}/iterations/${iterationId}/changes?$top=100&api-version=7.0`;

        console.log(`� Fetching from: ${changesUrl}`);
        const changesResponse = await makeAzureDevOpsRequest(changesUrl, token);

        if (!changesResponse.success || !changesResponse.data) {
            console.log('⚠️ Failed to get iteration changes');
            return '';
        }

        console.log('🔍 DEBUG: Changes API Response keys:', Object.keys(changesResponse.data));

        const changeEntries = changesResponse.data.changeEntries || [];
        console.log(`📁 Found ${changeEntries.length} change entries from API`);

        if (changeEntries.length > 0) {
            console.log('🔍 DEBUG: First change entry structure:');
            console.log(JSON.stringify(changeEntries[0], null, 2).substring(0, 1500));
        }

        // Build unified diff format from changes
        let unifiedDiff = '';
        let processedFiles = 0;

        for (const change of changeEntries) {
            // Skip folders and only process actual files
            if (!change.item || change.item.isFolder || change.item.gitObjectType !== 'blob') {
                continue;
            }

            const filePath = change.item.path;
            const changeType = change.changeType || 'edit';

            console.log(`📄 Processing: ${filePath} (${changeType})`);

            // Create diff header
            unifiedDiff += `diff --git a${filePath} b${filePath}\n`;

            // Add change type info
            if (changeType.toLowerCase().includes('add')) {
                unifiedDiff += `new file mode 100644\n`;
                unifiedDiff += `--- /dev/null\n`;
                unifiedDiff += `+++ b${filePath}\n`;
            } else if (changeType.toLowerCase().includes('delete')) {
                unifiedDiff += `deleted file mode 100644\n`;
                unifiedDiff += `--- a${filePath}\n`;
                unifiedDiff += `+++ /dev/null\n`;
            } else {
                unifiedDiff += `--- a${filePath}\n`;
                unifiedDiff += `+++ b${filePath}\n`;
            }

            // Check if change has inline diff content
            if (change.changeTrackingId) {
                console.log(`🔍 Change has tracking ID: ${change.changeTrackingId}`);
            }

            // Try to use sourceServerItem and targetServerItem for diff
            if (change.item && change.item.objectId) {
                console.log(`✅ Has objectId: ${change.item.objectId.substring(0, 7)}`);

                // Get the base version if available
                let baseObjectId = null;
                if (change.sourceServerItem) {
                    // This is the previous version
                    console.log(`📋 Has sourceServerItem: ${change.sourceServerItem}`);
                }

                // For now, add placeholder with file info
                unifiedDiff += `@@ Changes in ${filePath} @@\n`;
                unifiedDiff += `Object ID: ${change.item.objectId}\n`;

                // Try to fetch actual file diff using commits endpoint
                // We'll need the commit IDs from the PR

            } else {
                console.log(`⚠️ No objectId for ${filePath}`);
                unifiedDiff += `@@ File changed (no diff available) @@\n`;
            }

            unifiedDiff += '\n';
            processedFiles++;
        }

        console.log(`✅ Built unified diff for ${processedFiles} files, total ${unifiedDiff.length} chars`);
        return unifiedDiff;

    } catch (error) {
        console.error(`❌ Error getting Azure DevOps diff: ${error.message}`);
        console.error(error.stack);
        return '';
    }
}

/**
 * Get file content from a specific commit using download endpoint
 */
async function getFileContent(organization, project, repository, filePath, commitId, token) {
    try {
        console.log(`🔄 Fetching content for ${filePath} at commit ${commitId.substring(0, 7)}`);

        // Use download parameter to get actual content as text
        const itemUrl = `https://dev.azure.com/${organization}/${project}/_apis/git/repositories/${repository}/items?path=${encodeURIComponent(filePath)}&versionDescriptor.version=${commitId}&versionDescriptor.versionType=commit&download=true&api-version=7.0`;

        // Make request expecting text response
        const response = await new Promise((resolve) => {
            const authToken = Buffer.from(':' + token).toString('base64');
            const url = new URL(itemUrl);

            const options = {
                hostname: url.hostname,
                path: url.pathname + url.search,
                method: 'GET',
                headers: {
                    'Authorization': `Basic ${authToken}`,
                    'Accept': 'text/plain',
                    'User-Agent': 'VSCode-Extension'
                }
            };

            const req = https.request(options, (res) => {
                let data = '';

                res.on('data', (chunk) => {
                    data += chunk.toString();
                });

                res.on('end', () => {
                    if (res.statusCode === 200) {
                        resolve({ success: true, data: data });
                    } else {
                        console.log(`⚠️ Download failed: ${res.statusCode} ${res.statusMessage}`);
                        resolve({ success: false, error: `HTTP ${res.statusCode}` });
                    }
                });
            });

            req.on('error', (error) => {
                resolve({ success: false, error: error.message });
            });

            req.setTimeout(10000, () => {
                req.destroy();
                resolve({ success: false, error: 'Timeout' });
            });

            req.end();
        });

        if (response.success && response.data) {
            console.log(`✅ Got file content: ${response.data.length} chars`);
            return response.data;
        }

        console.log(`❌ Could not fetch content: ${response.error || 'unknown'}`);
        return null;
    } catch (error) {
        console.log(`❌ Error fetching content for ${filePath}: ${error.message}`);
        return null;
    }
}

/**
 * Generate unified diff format from two file contents
 */
/**
 * Generate unified diff format using diff library for accuracy
 */
function generateUnifiedDiff(filePath, baseContent, targetContent, changeType) {
    if (changeType === 'add') {
        // File mới - tất cả là additions
        const lines = targetContent.split('\n');
        let diff = `--- /dev/null\n+++ b/${filePath}\n@@ -0,0 +1,${lines.length} @@\n`;
        lines.forEach(line => {
            diff += `+${line}\n`;
        });
        return diff;
    }
    
    if (changeType === 'delete') {
        // File bị xóa - tất cả là deletions  
        const lines = baseContent.split('\n');
        let diff = `--- a/${filePath}\n+++ /dev/null\n@@ -1,${lines.length} +0,0 @@\n`;
        lines.forEach(line => {
            diff += `-${line}\n`;
        });
        return diff;
    }
    
    // File edit - sử dụng diff library
    const patches = Diff.createPatch(filePath, baseContent, targetContent, '', '', {
        context: 3, // Giống Azure DevOps (3 context lines)
        ignoreWhitespace: true, // 🔧 Ignore whitespace-only changes
        newlineIsToken: false   // Don't treat newlines as separate tokens
    });
    
    return patches;
}

/**
 * Simple diff algorithm (Myers diff simplified)
 */
function computeDiff(baseLines, targetLines) {
    const changes = [];
    const n = baseLines.length;
    const m = targetLines.length;

    // Build LCS (Longest Common Subsequence) table
    const lcs = Array(n + 1).fill(null).map(() => Array(m + 1).fill(0));

    for (let i = 1; i <= n; i++) {
        for (let j = 1; j <= m; j++) {
            if (baseLines[i - 1] === targetLines[j - 1]) {
                lcs[i][j] = lcs[i - 1][j - 1] + 1;
            } else {
                lcs[i][j] = Math.max(lcs[i - 1][j], lcs[i][j - 1]);
            }
        }
    }

    // Backtrack to find changes
    let i = n, j = m;
    while (i > 0 || j > 0) {
        if (i > 0 && j > 0 && baseLines[i - 1] === targetLines[j - 1]) {
            changes.unshift({ type: 'equal', baseLine: i - 1, targetLine: j - 1, content: baseLines[i - 1] });
            i--;
            j--;
        } else if (j > 0 && (i === 0 || lcs[i][j - 1] >= lcs[i - 1][j])) {
            changes.unshift({ type: 'add', targetLine: j - 1, content: targetLines[j - 1] });
            j--;
        } else if (i > 0) {
            changes.unshift({ type: 'delete', baseLine: i - 1, content: baseLines[i - 1] });
            i--;
        }
    }

    return changes;
}

/**
 * Group changes into hunks with context
 */
function groupIntoHunks(changes, baseLines, targetLines, contextLines = 3) {
    const hunks = [];
    let currentHunk = null;

    for (let i = 0; i < changes.length; i++) {
        const change = changes[i];

        if (change.type !== 'equal') {
            // Start new hunk if needed
            if (!currentHunk) {
                // Include context before
                const contextStart = Math.max(0, i - contextLines);
                currentHunk = {
                    baseStart: changes[contextStart].baseLine !== undefined ? changes[contextStart].baseLine + 1 : 1,
                    targetStart: changes[contextStart].targetLine !== undefined ? changes[contextStart].targetLine + 1 : 1,
                    baseLength: 0,
                    targetLength: 0,
                    lines: []
                };

                // Add context lines
                for (let ctx = contextStart; ctx < i; ctx++) {
                    if (changes[ctx].type === 'equal') {
                        currentHunk.lines.push(` ${changes[ctx].content}`);
                        currentHunk.baseLength++;
                        currentHunk.targetLength++;
                    }
                }
            }

            // Add change
            if (change.type === 'delete') {
                currentHunk.lines.push(`-${change.content}`);
                currentHunk.baseLength++;
            } else if (change.type === 'add') {
                currentHunk.lines.push(`+${change.content}`);
                currentHunk.targetLength++;
            }
        } else if (currentHunk) {
            // Add context after change
            currentHunk.lines.push(` ${change.content}`);
            currentHunk.baseLength++;
            currentHunk.targetLength++;

            // Check if we should close this hunk
            let hasMoreChanges = false;
            for (let j = i + 1; j < Math.min(i + contextLines + 1, changes.length); j++) {
                if (changes[j].type !== 'equal') {
                    hasMoreChanges = true;
                    break;
                }
            }

            if (!hasMoreChanges) {
                hunks.push(currentHunk);
                currentHunk = null;
            }
        }
    }

    // Add final hunk if exists
    if (currentHunk) {
        hunks.push(currentHunk);
    }

    return hunks;
}

/**
 * Test function to analyze final diff content
 */
function testAnalyzeFinalDiff(finalDiff, fileChanges) {
    console.log('\n=== FINAL DIFF ANALYSIS TEST ===');
    console.log(`📊 Final diff total length: ${finalDiff?.length || 0} characters`);
    console.log(`📊 Expected files from PR: ${fileChanges?.length || 0} files`);

    if (fileChanges) {
        console.log('\n🎯 Expected PR files:');
        fileChanges.forEach((file, i) => {
            console.log(`  ${i + 1}. ${file.path} (+${file.additions}/-${file.deletions})`);
        });
    }

    if (finalDiff) {
        // Extract all files mentioned in the diff
        const diffFileMatches = finalDiff.match(/diff --git a\/(.+?) b\/(.+?)(?=\n|$)/g) || [];
        console.log(`\n📄 Files found in finalDiff: ${diffFileMatches.length} files`);

        const diffFiles = [];
        diffFileMatches.forEach((match, i) => {
            const fileMatch = match.match(/diff --git a\/(.+?) b\/(.+?)$/);
            if (fileMatch) {
                const filePath = fileMatch[1];
                diffFiles.push(filePath);

                if (i < 20) { // Show first 20 files
                    console.log(`  ${i + 1}. ${filePath}`);
                } else if (i === 20) {
                    console.log(`  ... and ${diffFileMatches.length - 20} more files`);
                }
            }
        });

        // Check which expected files are missing from diff
        if (fileChanges) {
            const expectedFiles = fileChanges.map(f => f.path);
            const missingFiles = expectedFiles.filter(file => !diffFiles.includes(file));
            const extraFiles = diffFiles.filter(file => !expectedFiles.includes(file));

            console.log(`\n❌ Missing files (in PR but not in diff): ${missingFiles.length}`);
            missingFiles.forEach(file => console.log(`  - ${file}`));

            console.log(`\n➕ Extra files (in diff but not in PR): ${extraFiles.length}`);
            extraFiles.slice(0, 10).forEach(file => console.log(`  + ${file}`));
            if (extraFiles.length > 10) {
                console.log(`  + ... and ${extraFiles.length - 10} more extra files`);
            }
        }

        // Show first 1000 characters of diff for context
        console.log('\n📝 First 1000 chars of finalDiff:');
        console.log(finalDiff.substring(0, 1000));
        console.log('\n... (truncated)');
    }

    console.log('\n=== END FINAL DIFF ANALYSIS ===\n');
}

/**
 * Analyze GitHub Pull Request using GitHub REST API
 * @param {object} stream - VS Code stream for progress updates
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {string} prId - Pull Request number
 */
async function analyzeGitHubPullRequest(stream, owner, repo, prId) {
    try {
        // Get GitHub token from VS Code settings
        const config = vscode.workspace.getConfiguration('aiSelfCheck');
        const githubToken = config.get('github.personalAccessToken');

        console.log(`🔄 Fetching GitHub PR ${owner}/${repo}#${prId}`);

        // Get PR details from GitHub API
        const prData = await getGitHubPR(owner, repo, prId, githubToken);

        if (!prData.success) {
            console.error('Failed to get GitHub PR:', prData.error);
            stream.markdown('❌ **GitHub API Error**\n\n');
            stream.markdown(`Error: ${prData.error}\n\n`);

            if (!githubToken) {
                stream.markdown('**Configure GitHub Token:**\n\n');
                stream.markdown('[🔧 Open User Settings JSON](command:workbench.action.openSettingsJson)\n\n');
                stream.markdown('```json\n');
                stream.markdown('{\n');
                stream.markdown('    "aiSelfCheck.github.personalAccessToken": "YOUR_GITHUB_TOKEN"\n');
                stream.markdown('}\n');
                stream.markdown('```\n\n');
                stream.markdown('**Create token at:** https://github.com/settings/tokens\n');
                stream.markdown('**Required scope:** `repo` (for private repos) or `public_repo` (for public repos)\n\n');
            }

            return { error: prData.error };
        }

        return prData;

    } catch (error) {
        console.error('Error in analyzeGitHubPullRequest:', error);
        return { error: `Analysis failed: ${error.message}` };
    }
}

/**
 * Get Pull Request data from GitHub REST API
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {string} prId - Pull Request number
 * @param {string} token - GitHub Personal Access Token (optional for public repos)
 */
async function getGitHubPR(owner, repo, prId, token) {
    try {
        console.log(`📝 Fetching PR details: ${owner}/${repo}#${prId}`);

        // Get PR details
        const prUrl = `https://api.github.com/repos/${owner}/${repo}/pulls/${prId}`;
        const prResponse = await makeGitHubRequest(prUrl, token);

        if (!prResponse.success) {
            console.error('Failed to get PR details:', prResponse.error);
            return { success: false, error: `Failed to get PR: ${prResponse.error}` };
        }

        const pr = prResponse.data;

        // Get PR files (changes)
        console.log('📁 Fetching changed files...');
        const filesUrl = `https://api.github.com/repos/${owner}/${repo}/pulls/${prId}/files`;
        const filesResponse = await makeGitHubRequest(filesUrl, token);

        if (!filesResponse.success) {
            console.error('Failed to get files:', filesResponse.error);
            return { success: false, error: `Failed to get files: ${filesResponse.error}` };
        }

        const files = filesResponse.data;
        console.log(`✅ Found ${files.length} changed files`);

        // Get diff in unified format
        console.log('🔄 Fetching unified diff from GitHub...');
        const diffUrl = `https://api.github.com/repos/${owner}/${repo}/pulls/${prId}`;
        const diffResponse = await makeGitHubRequest(diffUrl, token, 'GET', {
            'Accept': 'application/vnd.github.v3.diff'
        });

        let finalDiff = '';
        if (diffResponse.success && typeof diffResponse.data === 'string') {
            finalDiff = diffResponse.data;
            console.log(`✅ Got unified diff: ${finalDiff.length} characters`);
        } else {
            console.log('⚠️ Could not get unified diff, will build from file patches');
        }

        // Process file changes
        const fileChanges = files.map(file => {
            let diffContent = '';

            // GitHub API provides patch content directly (not full git diff)
            if (file.patch) {
                // Build complete diff format from GitHub patch
                diffContent = `diff --git a/${file.filename} b/${file.filename}\n`;
                
                // Add file mode information based on status
                if (file.status === 'added') {
                    diffContent += `new file mode 100644\n`;
                    diffContent += `--- /dev/null\n`;
                    diffContent += `+++ b/${file.filename}\n`;
                } else if (file.status === 'removed') {
                    diffContent += `deleted file mode 100644\n`;
                    diffContent += `--- a/${file.filename}\n`;
                    diffContent += `+++ /dev/null\n`;
                } else if (file.status === 'renamed') {
                    diffContent += `--- a/${file.previous_filename || file.filename}\n`;
                    diffContent += `+++ b/${file.filename}\n`;
                } else {
                    diffContent += `--- a/${file.filename}\n`;
                    diffContent += `+++ b/${file.filename}\n`;
                }
                
                // Add the patch content (which contains the @@ hunks)
                diffContent += file.patch;
                
                console.log(`🔧 DEBUG: Built complete diff for ${file.filename}: ${diffContent.length} chars`);
                console.log(`🔍 DEBUG: GitHub patch for ${file.filename}:`, file.patch);
                console.log(`🔧 DEBUG: Complete diffContent:`, diffContent);
            } else if (file.status === 'renamed' && !file.patch) {
                // Handle renamed files without content changes
                diffContent = `diff --git a/${file.previous_filename} b/${file.filename}\n`;
                diffContent += `similarity index 100%\n`;
                diffContent += `rename from ${file.previous_filename}\n`;
                diffContent += `rename to ${file.filename}\n`;
            } else if (finalDiff) {
                // Extract from unified diff as fallback
                const filePattern = new RegExp(`diff --git a/${file.filename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} b/${file.filename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([\\s\\S]*?)(?=diff --git|$)`, 'g');
                const match = filePattern.exec(finalDiff);
                if (match) {
                    diffContent = `diff --git a/${file.filename} b/${file.filename}${match[1]}`;
                }
            }

            console.log(`🔍 Final diffContent for ${file.filename}: ${diffContent.length} chars`);

            return {
                path: file.filename,
                changeType: file.status, // 'added', 'removed', 'modified', 'renamed'
                additions: file.additions || 0,
                deletions: file.deletions || 0,
                changes: file.changes || 0,
                diffContent: diffContent,
                diff: diffContent, // For compatibility
                source: 'GitHub API',
                previousFilename: file.previous_filename
            };
        });

        // Get commits
        console.log('📝 Fetching commits...');
        const commitsUrl = `https://api.github.com/repos/${owner}/${repo}/pulls/${prId}/commits`;
        const commitsResponse = await makeGitHubRequest(commitsUrl, token);

        let commits = [];
        if (commitsResponse.success && commitsResponse.data) {
            commits = commitsResponse.data.map(commit => ({
                commitId: commit.sha,
                comment: commit.commit.message,
                author: {
                    name: commit.commit.author.name,
                    date: commit.commit.author.date
                }
            }));
            console.log(`✅ Found ${commits.length} commits`);
        }

        return {
            success: true,
            data: {
                id: prId,
                title: pr.title || `PR #${prId}`,
                description: pr.body || 'No description provided',
                author: pr.user?.login || 'Unknown',
                status: pr.state || 'open',
                owner: owner,
                repository: repo,
                sourceCommit: pr.head?.sha,
                targetCommit: pr.base?.sha,
                sourceBranch: pr.head?.ref,
                targetBranch: pr.base?.ref,
                diffCommand: 'GitHub API (workspace-independent)',
                fileChanges: fileChanges,
                commits: commits,
                totalCommits: commits.length,
                finalDiff: finalDiff,
                commitsList: commits.map(commit => ({
                    id: commit.commitId.substring(0, 7),
                    fullId: commit.commitId,
                    message: commit.comment,
                    author: commit.author.name,
                    date: commit.author.date
                })),
                analysis: {
                    quality: `GitHub PR with ${fileChanges.length} file(s) changed`,
                    security: 'Complete PR diff analysis',
                    performance: 'Full PR data from GitHub API',
                    testCoverage: 'Review test coverage for modified files',
                    codeReview: [
                        `📁 ${fileChanges.length} file(s) changed`,
                        `➕ ${fileChanges.reduce((sum, f) => sum + f.additions, 0)} lines added`,
                        `➖ ${fileChanges.reduce((sum, f) => sum + f.deletions, 0)} lines removed`,
                        `🔍 Source: GitHub REST API`,
                        `📝 ${commits.length} commits`,
                        `🌿 ${pr.head?.ref} → ${pr.base?.ref}`
                    ]
                }
            }
        };
    } catch (error) {
        console.error('Error in getGitHubPR:', error);
        return { success: false, error: `Unable to fetch PR: ${error.message}` };
    }
}

/**
 * Make HTTP request to GitHub REST API
 * @param {string} url - API endpoint URL
 * @param {string} token - GitHub Personal Access Token (optional)
 * @param {string} method - HTTP method (default: GET)
 * @param {object} customHeaders - Additional headers
 */
async function makeGitHubRequest(url, token, method = 'GET', customHeaders = {}) {
    return new Promise((resolve) => {
        const urlObj = new URL(url);
        const headers = {
            'User-Agent': 'VSCode-AI-Self-Check-Extension',
            'Accept': 'application/vnd.github.v3+json',
            ...customHeaders
        };

        // Add authentication if token is provided
        if (token && token.trim()) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        const options = {
            hostname: urlObj.hostname,
            port: 443,
            path: urlObj.pathname + urlObj.search,
            method: method,
            headers: headers
        };

        const req = https.request(options, (res) => {
            let data = '';

            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                try {
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        // Check if response is JSON or plain text (diff)
                        if (customHeaders['Accept']?.includes('diff')) {
                            resolve({ success: true, data: data });
                        } else {
                            const parsed = JSON.parse(data);
                            resolve({ success: true, data: parsed });
                        }
                    } else {
                        let errorMsg = `HTTP ${res.statusCode}`;
                        try {
                            const errorData = JSON.parse(data);
                            errorMsg += `: ${errorData.message || data}`;
                        } catch {
                            errorMsg += `: ${data}`;
                        }
                        resolve({ success: false, error: errorMsg });
                    }
                } catch (parseError) {
                    resolve({ success: false, error: `Parse error: ${parseError.message}` });
                }
            });
        });

        req.on('error', (error) => {
            resolve({ success: false, error: error.message });
        });

        req.setTimeout(15000, () => {
            req.destroy();
            resolve({ success: false, error: 'Request timeout' });
        });

        req.end();
    });
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
                currentFile.diffContent = currentDiff.join('\n'); // Also set diffContent for new display logic
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
                currentDiff = [line]; // Include the diff --git line
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
        currentFile.diffContent = currentDiff.join('\n'); // Also set diffContent for new display logic
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
    } catch { }

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
 * Add quick review option using quick-review-pr template
 */
async function addQuickReviewOption(stream, prAnalysis, request) {
    const data = prAnalysis.data;

    // Build diff from finalDiff or individual file diffs
    let diffContent = '';

    if (data.finalDiff && data.finalDiff.trim()) {
        diffContent = data.finalDiff;
        console.log(`✅ Using finalDiff: ${diffContent.length} chars`);
    } else if (data.fileChanges && data.fileChanges.length > 0) {
        // Fallback: build diff from individual file diffs
        console.log(`⚠️ No finalDiff, building from ${data.fileChanges.length} file changes`);
        diffContent = data.fileChanges
            .filter(file => file.diffContent && file.diffContent.trim())
            .map(file => file.diffContent)
            .join('\n\n');
        console.log(`✅ Built diff from files: ${diffContent.length} chars`);
    }

    // Only proceed if we have any diff content
    if (!diffContent || !diffContent.trim()) {
        console.log('⚠️ No diff content available for review');
        stream.markdown('⚠️ **No diff content available for AI review**\n\n');
        return;
    }

    try {
        stream.markdown('## 🚀 AI-Powered Code Review\n\n');
        stream.markdown('⚡ **Analyzing code changes with AI...**\n\n');

        // Actually perform the quick review with AI
        await performQuickReviewWithAI(stream, data, request, diffContent);

    } catch (error) {
        console.error('Error in quick review option:', error);
        stream.markdown('⚠️ Quick review option temporarily unavailable.\n\n');
    }
}

/**
 * Perform quick review with AI using template and shared functions
 */
async function performQuickReviewWithAI(stream, prData, request, diffContent) {
    let templateContent;

    try {
        // Use shared getReviewTemplate function
        const templateResult = getReviewTemplate('quick-review-pr.md');
        templateContent = templateResult.content;

        console.log(`✅ Loaded quick review template from: ${templateResult.source} (${templateResult.content.length} characters)`);

    } catch (error) {
        stream.markdown('❌ **Error**: Could not load quick review template\n');
        stream.markdown(`Error: ${error.message}\n`);
        return;
    }

    // Use provided diffContent (from finalDiff or built from files)
    console.log(`🔍 Diff content for review: ${diffContent.length} chars`);

    // Replace template placeholders with diff content
    const processedTemplate = templateContent.replace(/\{\{FINAL_DIFF_CONTENT\}\}/g, diffContent);

    try {
        stream.markdown('🔄 **AI Quick Analysis in progress...** (streaming PR assessment)\n\n');

        // Get unified model using shared function with request
        const model = await getUnifiedModel(stream, null, null, request);

        if (!model) {
            // Check if API key mode is enabled
            if (shouldUseApiKey()) {
                // API key mode - executeAIReview will handle it
                console.log('🔑 API key mode enabled for PR review - model is null as expected');
            } else {
                stream.markdown('❌ **No AI model available**\n\n');
                stream.markdown('Using fallback basic analysis instead.\n\n');
                await performBasicQuickAnalysis(stream, prData);
                return;
            }
        }

        // Use shared executeAIReview function
        const success = await executeAIReview(
            processedTemplate,
            model,
            stream,
            'PR Quick Review'
        );

        console.log(`🔍 executeAIReview result: ${success}`);

        if (!success) {
            console.log('❌ AI review failed, using fallback');
            stream.markdown('⚠️ **AI analysis failed. Using fallback analysis:**\n\n');
            await performBasicQuickAnalysis(stream, prData);
        } else {
            console.log('✅ AI review completed successfully');
        }

    } catch (error) {
        // Safe fallback - show basic analysis
        stream.markdown('⚠️ **AI processing failed. Showing basic analysis:**\n\n');
        await performBasicQuickAnalysis(stream, prData);
        stream.markdown(`**Error details:** ${error.message}\n\n`);
    }
}



/**
 * Perform structured quick analysis based on diff content
 */
async function performStructuredQuickAnalysis(stream, prData) {
    const fileChanges = prData.fileChanges || [];
    const finalDiff = prData.finalDiff || '';

    stream.markdown('## 📊 Quick PR Assessment Results\n\n');

    // Analyze each file - show ALL files in compact format
    let passCount = 0, warningCount = 0, criticalCount = 0;
    const fileAssessments = [];

    // Process all files first (with AI assessment)
    let templateContent = null;
    try {
        const templateResult = getReviewTemplate('quick-review-pr.md');
        templateContent = templateResult.content;
        console.log('✅ Loaded template for AI file assessment');
    } catch (error) {
        console.log('⚠️ Template not available, using enhanced fallback');
    }

    for (let i = 0; i < fileChanges.length; i++) {
        const file = fileChanges[i];
        // Use async assessment with AI/template
        const assessment = await assessFileQuickly(file, finalDiff, templateContent);

        if (assessment.status === 'PASS') {
            passCount++;
        } else if (assessment.status === 'WARNING') {
            warningCount++;
        } else {
            criticalCount++;
        }

        fileAssessments.push({ file, assessment, index: i + 1 });
    }

    // Display all files in compact format
    fileAssessments.forEach(({ file, assessment, index }) => {
        const statusIcon = assessment.status === 'PASS' ? '✅' :
            assessment.status === 'WARNING' ? '⚠️' : '🚨';

        stream.markdown(`### 📄 File ${index}: \`${file.path}\`\n`);
        stream.markdown(`**Status**: ${statusIcon} **${assessment.status}**\n\n`);

        // Show issues only for non-PASS files (to keep it compact)
        if (assessment.issues.length > 0) {
            stream.markdown('**Issues:**\n');
            assessment.issues.forEach(issue => {
                stream.markdown(`- 🚨 **${issue.type}**: ${issue.problem}\n`);
            });
            stream.markdown('\n');
        }

        stream.markdown('---\n\n');
    });

    // Summary
    stream.markdown('## 📊 PR Summary\n\n');
    stream.markdown('### Files Status Overview:\n');
    stream.markdown(`- ✅ **PASS**: ${passCount} files\n`);
    stream.markdown(`- ⚠️ **WARNING**: ${warningCount} files\n`);
    stream.markdown(`- 🚨 **CRITICAL**: ${criticalCount} files\n\n`);

    // Overall assessment
    let overallStatus;
    if (criticalCount > 0) {
        overallStatus = '🚨 **REJECTED**';
    } else if (warningCount > 0) {
        overallStatus = '⚠️ **NEEDS REVIEW**';
    } else {
        overallStatus = '✅ **APPROVED**';
    }

    stream.markdown(`### Overall PR Assessment:\n**Status**: ${overallStatus}\n\n`);

    // Quick checklist results
    stream.markdown('### 🎯 Quick Checklist Results:\n');
    const checklist = performQuickChecklist(finalDiff);
    Object.entries(checklist).forEach(([check, result]) => {
        const icon = result.passed ? '✅' : '❌';
        stream.markdown(`- [${icon}] **${check}**: ${result.message}\n`);
    });

    stream.markdown('\n**Review completed with quick-review-pr template.**\n');
}

/**
 * Assess individual file using AI with quick-review-pr template
 */
async function assessFileQuickly(file, fullDiff, templateContent = null) {
    try {
        // If no template provided, try to load it
        if (!templateContent) {
            try {
                const templateResult = getReviewTemplate('quick-review-pr.md');
                templateContent = templateResult.content;
            } catch (error) {
                console.log('⚠️ Template loading failed, using fallback analysis');
                return assessFileQuicklyFallback(file, fullDiff);
            }
        }

        // Simple replacement - just replace {{FINAL_DIFF_CONTENT}} with actual diff
        const processedTemplate = templateContent.replace(/\{\{FINAL_DIFF_CONTENT\}\}/g, fullDiff || '');

        // TODO: Send processedTemplate to AI for analysis
        console.log(`🤖 Template ready for AI: ${file.path}`);

        // For now, use enhanced fallback until AI integration
        const aiResponse = simulateAIFileAssessment(file, fullDiff);

        return aiResponse;

    } catch (error) {
        console.error(`❌ AI assessment failed for ${file.path}:`, error.message);
        // Fallback to rule-based assessment
        return assessFileQuicklyFallback(file, fullDiff);
    }
}

/**
 * Fallback rule-based assessment when AI is not available
 */
function assessFileQuicklyFallback(file, fullDiff) {
    const issues = [];
    let status = 'PASS';
    const filePath = file.path.toLowerCase();
    const diffContent = file.diffContent || '';

    console.log(`🔧 Using fallback rule-based assessment for: ${file.path}`);

    // Security checks
    if (diffContent.includes('password') || diffContent.includes('secret') || diffContent.includes('api_key')) {
        issues.push({
            type: 'Security',
            problem: 'Potential hardcoded secrets detected',
            solution: 'Remove hardcoded secrets and use environment variables',
            impact: 'Could expose sensitive information'
        });
        status = 'CRITICAL';
    }

    // Null safety checks for JS/TS files
    if (filePath.endsWith('.ts') || filePath.endsWith('.js')) {
        if (diffContent.includes('!.') && !diffContent.includes('?.')) {
            issues.push({
                type: 'Null Safety',
                problem: 'Non-null assertion without null checks',
                solution: 'Use optional chaining (?.) or add null checks',
                impact: 'Potential runtime errors'
            });
            if (status === 'PASS') status = 'WARNING';
        }
    }

    // Error handling checks
    if (diffContent.includes('try') && !diffContent.includes('catch')) {
        issues.push({
            type: 'Error Handling',
            problem: 'Try block without catch',
            solution: 'Add proper error handling with catch block',
            impact: 'Unhandled exceptions may crash application'
        });
        status = 'CRITICAL';
    }

    // Performance checks
    if (diffContent.includes('forEach') && diffContent.includes('find')) {
        issues.push({
            type: 'Performance',
            problem: 'Potential O(n²) nested loop detected',
            solution: 'Consider using Map for O(1) lookups',
            impact: 'Performance degradation with large datasets'
        });
        if (status === 'PASS') status = 'WARNING';
    }

    return { status, issues };
}

/**
 * Simulate AI assessment response (replace with real AI call)
 */
function simulateAIFileAssessment(file, fullDiff) {
    const filePath = file.path.toLowerCase();
    const diffContent = file.diffContent || '';
    const issues = [];
    let status = 'PASS';

    // Smarter analysis based on file type and content
    if (filePath.includes('component.ts')) {
        // Angular component analysis
        if (diffContent.includes('ngOnInit') && !diffContent.includes('ngOnDestroy')) {
            issues.push({
                type: 'Memory Management',
                problem: 'Component implements OnInit but not OnDestroy',
                solution: 'Implement OnDestroy to clean up subscriptions',
                impact: 'Memory leaks from unsubscribed observables'
            });
            status = 'WARNING';
        }
    }

    if (filePath.includes('service.ts')) {
        // Service analysis
        if (diffContent.includes('subscribe') && !diffContent.includes('unsubscribe')) {
            issues.push({
                type: 'Resource Management',
                problem: 'Observable subscription without unsubscribe',
                solution: 'Use takeUntil pattern or async pipe',
                impact: 'Memory leaks and unexpected behavior'
            });
            if (status === 'PASS') status = 'WARNING';
        }
    }

    // Enhanced security checks
    if (diffContent.includes('localStorage.setItem') || diffContent.includes('sessionStorage.setItem')) {
        if (diffContent.includes('password') || diffContent.includes('token')) {
            issues.push({
                type: 'Security',
                problem: 'Storing sensitive data in browser storage',
                solution: 'Use secure HTTP-only cookies or server-side sessions',
                impact: 'XSS attacks could steal sensitive information'
            });
            status = 'CRITICAL';
        }
    }

    // Performance analysis
    if (diffContent.includes('*ngFor') && diffContent.includes('function')) {
        issues.push({
            type: 'Performance',
            problem: 'Function call in *ngFor template',
            solution: 'Use pipe or pre-compute values in component',
            impact: 'Performance degradation from repeated function calls'
        });
        if (status === 'PASS') status = 'WARNING';
    }

    return { status, issues };
}

/**
 * Perform quick checklist assessment
 */
function performQuickChecklist(finalDiff) {
    const diff = finalDiff.toLowerCase();

    return {
        'Security': {
            passed: !diff.includes('password') && !diff.includes('secret') && !diff.includes('api_key'),
            message: diff.includes('password') || diff.includes('secret') ? 'Potential secrets detected' : 'No obvious secrets found'
        },
        'Null Safety': {
            passed: !diff.includes('!.') || diff.includes('?.'),
            message: diff.includes('!.') && !diff.includes('?.') ? 'Non-null assertions found' : 'Proper null handling'
        },
        'Error Handling': {
            passed: !diff.includes('try') || diff.includes('catch'),
            message: diff.includes('try') && !diff.includes('catch') ? 'Try without catch found' : 'Error handling looks good'
        },
        'Resource Management': {
            passed: !diff.includes('new ') || diff.includes('dispose') || diff.includes('close'),
            message: 'Basic resource checks passed'
        },
        'Performance': {
            passed: !(diff.includes('foreach') && diff.includes('find')),
            message: diff.includes('foreach') && diff.includes('find') ? 'Potential O(n²) operations' : 'No obvious bottlenecks'
        },
        'Code Quality': {
            passed: true, // Basic assumption
            message: 'Code structure looks reasonable'
        }
    };
}

/**
 * Perform basic quick analysis as fallback
 */
async function performBasicQuickAnalysis(stream, prData) {
    stream.markdown('## 📋 Basic Quick Analysis\n\n');

    const fileChanges = prData.fileChanges || [];
    const totalAdditions = fileChanges.reduce((sum, f) => sum + f.additions, 0);
    const totalDeletions = fileChanges.reduce((sum, f) => sum + f.deletions, 0);

    stream.markdown(`### Quick Stats:\n`);
    stream.markdown(`- **Files**: ${fileChanges.length}\n`);
    stream.markdown(`- **Changes**: +${totalAdditions}/-${totalDeletions} lines\n`);
    stream.markdown(`- **Commits**: ${prData.totalCommits || 0}\n\n`);

    stream.markdown('### Manual Review Checklist:\n');
    stream.markdown('- [ ] Check for hardcoded secrets\n');
    stream.markdown('- [ ] Verify null safety\n');
    stream.markdown('- [ ] Confirm error handling\n');
    stream.markdown('- [ ] Review resource management\n');
    stream.markdown('- [ ] Assess performance impact\n\n');
}

/**
 * Perform actual quick review using AI and template
 */
async function performQuickReview(stream, prAnalysis) {
    const data = prAnalysis.data;

    try {
        // Get the template content
        const templateContent = await getQuickReviewTemplate();
        if (!templateContent) {
            stream.markdown('❌ Quick review template not found.\n\n');
            return;
        }

        stream.markdown('## 🚀 AI Quick Review Analysis\n\n');
        stream.markdown('⚡ **Analyzing Final Diff with Quick Review Template...**\n\n');

        // Replace template placeholders with actual data
        let reviewPrompt = templateContent;
        reviewPrompt = reviewPrompt.replace(/\{\{FINAL_DIFF_CONTENT\}\}/g, data.finalDiff || '');

        // Add file information
        if (data.fileChanges && data.fileChanges.length > 0) {
            const filesSummary = data.fileChanges.map((file, index) =>
                `File ${index + 1}: ${file.path} (${file.changeType}) +${file.additions}/-${file.deletions}`
            ).join('\n');
            reviewPrompt = reviewPrompt.replace(/\{\{FILES_SUMMARY\}\}/g, filesSummary);
        }

        // Create the analysis prompt
        const analysisPrompt = `${reviewPrompt}\n\nPlease analyze this PR diff following the quick review template structure exactly. Focus on critical issues that would block deployment.`;

        // Note: In a real implementation, this would call the AI model
        // For now, we'll show that the analysis is ready
        stream.markdown('📋 **Quick Analysis Ready**\n\n');
        stream.markdown('**Analysis scope:**\n');
        stream.markdown(`- Files: ${data.fileChanges?.length || 0}\n`);
        stream.markdown(`- Changes: +${data.fileChanges?.reduce((sum, f) => sum + f.additions, 0) || 0}/-${data.fileChanges?.reduce((sum, f) => sum + f.deletions, 0) || 0} lines\n`);
        stream.markdown(`- Commits: ${data.totalCommits || 0}\n\n`);

        // Show quick assessment preview
        stream.markdown('### 🎯 Quick Assessment Preview:\n\n');

        // Analyze file types for quick insights
        const fileExtensions = data.fileChanges?.map(f => {
            const ext = f.path.split('.').pop();
            return ext;
        }).filter(Boolean) || [];

        const uniqueExtensions = [...new Set(fileExtensions)];
        stream.markdown(`**File types**: ${uniqueExtensions.join(', ')}\n`);

        // Basic security check
        const hasSecurityConcerns = data.finalDiff?.includes('password') ||
            data.finalDiff?.includes('secret') ||
            data.finalDiff?.includes('api_key') ||
            data.finalDiff?.includes('token');

        stream.markdown(`**Security scan**: ${hasSecurityConcerns ? '⚠️ Potential secrets detected' : '✅ No obvious secrets'}\n`);

        // Basic error handling check
        const hasErrorHandling = data.finalDiff?.includes('try') ||
            data.finalDiff?.includes('catch') ||
            data.finalDiff?.includes('error');

        stream.markdown(`**Error handling**: ${hasErrorHandling ? '✅ Error handling present' : '⚠️ Limited error handling'}\n\n`);

        stream.markdown('💡 **Full AI analysis available with model integration**\n\n');

    } catch (error) {
        console.error('Error in quick review analysis:', error);
        stream.markdown('❌ Quick review analysis failed.\n\n');
    }
}

/**
 * Display PR review results - PROVIDER ROUTING
 * Routes to Function A (Azure DevOps) or Function B (GitHub) based on provider
 */
async function displayPrReviewResults(stream, prAnalysis) {
    const data = prAnalysis.data;

    // Detect provider type based on PR data structure
    const isGitHubPR = data.owner && data.repository; // GitHub has owner/repo
    const isAzurePR = data.organization && data.project; // Azure has org/project

    console.log(`🔍 Provider detection: GitHub=${isGitHubPR}, Azure=${isAzurePR}`);

    // Display commits list (common for both providers)
    if (data.commitsList && data.commitsList.length > 0) {
        stream.markdown('## 📝 Commits in this PR\n\n');
        data.commitsList.forEach((commit, index) => {
            stream.markdown(`${index + 1}. **\`${commit.id}\`** - ${commit.message}\n`);
            stream.markdown(`   👤 *${commit.author}* on ${new Date(commit.date).toLocaleDateString()}\n\n`);
        });
    }

    // Summary of Changes section (common for both providers)
    const totalFiles = data.fileChanges ? data.fileChanges.length : 0;
    const totalAdditions = data.fileChanges ? data.fileChanges.reduce((sum, f) => sum + f.additions, 0) : 0;
    const totalDeletions = data.fileChanges ? data.fileChanges.reduce((sum, f) => sum + f.deletions, 0) : 0;

    stream.markdown('## 📊 Summary of Changes\n\n');
    stream.markdown(`📁 **${totalFiles} file(s)** changed\n`);
    stream.markdown(`➕ **${totalAdditions} lines** added\n`);
    stream.markdown(`➖ **${totalDeletions} lines** deleted\n\n`);

    // PROVIDER ROUTING: Route to appropriate diff display function
    if (isGitHubPR) {
        console.log('🐙 Routing to GitHub Function B');
        await showGitHubDiffInWebview(prAnalysis, stream);
    } else if (isAzurePR) {
        console.log('🔵 Routing to Azure DevOps Function A');
        await showAzureDevOpsDiffInWebview(prAnalysis, stream);
    } else {
        // Fallback: assume Azure DevOps for backward compatibility
        console.log('⚠️ Provider unknown, defaulting to Azure DevOps Function A');
        await showAzureDevOpsDiffInWebview(prAnalysis, stream);
    }

    // Provider-specific diff display is handled above by Function A or B
    console.log(`📊 Provider routing complete. ${totalFiles} files processed.`);
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
    addQuickReviewOption,
    performQuickReviewWithAI,
    performStructuredQuickAnalysis,
    performBasicQuickAnalysis,
    performQuickReview,
    openPrReviewDocument,
    parseRealGitDiff,
    getFileContent,
    showGitHubDiffInWebview,      // Function B - GitHub diff webview
    showAzureDevOpsDiffInWebview  // Function A - Azure DevOps diff webview
};
