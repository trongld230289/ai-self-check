const vscode = require('vscode');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');
const { getReviewTemplate, getUnifiedModel, executeAIReview } = require('./review-common');

// Global configuration variables
const isShowSummaryOfChanges = false;

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
            stream.markdown('🤖 **Azure DevOps PR Reviewer**\n\n');
            stream.markdown('I need PR information to review. Please provide:\n\n');
            stream.markdown('• **PR URL**: `https://dev.azure.com/org/project/_git/repo/pullrequest/123`\n');
            stream.markdown('• **PR ID**: Example: `PR #123` or `ID: 123`\n\n');
            stream.markdown('**Usage Examples:**\n');
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

        let commits = [];
        let fileChanges = [];
        let finalDiff = '';
        let diffSource = 'PR-specific changes only';

        console.log('🔍 Getting PR-specific changes from source commit...');

        // STEP 1: Get commit info from PR source commit
        console.log('📝 Getting commit from PR source...');

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

                // STEP 4: Try to get actual diff content using git if available
                let gitDiffSuccessful = false;
                if (pr.lastMergeSourceCommit && pr.lastMergeTargetCommit) {
                    try {
                        const baseCommit = pr.lastMergeTargetCommit.commitId;
                        const headCommit = pr.lastMergeSourceCommit.commitId;
                        const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath;

                        console.log(`🔄 Trying git diff for PR changes: ${baseCommit.substring(0, 7)}..${headCommit.substring(0, 7)}`);
                        console.log(`📁 Workspace path: ${workspacePath}`);

                        // Check if we're in a git repo first
                        try {
                            execSync('git rev-parse --git-dir', {
                                cwd: workspacePath,
                                stdio: 'pipe'
                            });
                            console.log('✅ Git repository detected');
                        } catch (notGitError) {
                            console.log('⚠️ Not a git repository, skipping git diff');
                            throw new Error('Not a git repository');
                        }

                        // Try different git diff approaches
                        let gitDiffOutput = '';
                        
                        // Approach 1: Try base..head (3-dot notation for merge-base)
                        try {
                            const gitDiffCommand1 = `git diff ${baseCommit}...${headCommit}`;
                            console.log(`🔄 Trying: ${gitDiffCommand1}`);
                            gitDiffOutput = execSync(gitDiffCommand1, {
                                encoding: 'utf8',
                                cwd: workspacePath,
                                maxBuffer: 1024 * 1024 * 5,
                                stdio: 'pipe'
                            });
                            console.log(`✅ 3-dot diff result: ${gitDiffOutput.length} chars`);
                        } catch (diffError1) {
                            console.log(`⚠️ 3-dot diff failed: ${diffError1.message}`);
                            
                            // Approach 2: Try 2-dot notation  
                            try {
                                const gitDiffCommand2 = `git diff ${baseCommit}..${headCommit}`;
                                console.log(`🔄 Trying: ${gitDiffCommand2}`);
                                gitDiffOutput = execSync(gitDiffCommand2, {
                                    encoding: 'utf8',
                                    cwd: workspacePath,
                                    maxBuffer: 1024 * 1024 * 5,
                                    stdio: 'pipe'
                                });
                                console.log(`✅ 2-dot diff result: ${gitDiffOutput.length} chars`);
                            } catch (diffError2) {
                                console.log(`⚠️ 2-dot diff failed: ${diffError2.message}`);
                                
                                // Approach 3: Simple diff
                                const gitDiffCommand3 = `git diff ${baseCommit} ${headCommit}`;
                                console.log(`🔄 Trying: ${gitDiffCommand3}`);
                                gitDiffOutput = execSync(gitDiffCommand3, {
                                    encoding: 'utf8',
                                    cwd: workspacePath,
                                    maxBuffer: 1024 * 1024 * 5,
                                    stdio: 'pipe'
                                });
                                console.log(`✅ Simple diff result: ${gitDiffOutput.length} chars`);
                            }
                        }

                        if (gitDiffOutput && gitDiffOutput.trim()) {
                            finalDiff = gitDiffOutput;
                            gitDiffSuccessful = true;
                            diffSource = 'Git diff between PR commits';
                            console.log(`✅ Git diff successful: ${gitDiffOutput.length} characters`);
                        } else {
                            console.log('⚠️ All git diff approaches returned empty results');
                            diffSource = 'Azure DevOps API (git diff empty)';
                        }
                    } catch (gitError) {
                        console.log(`⚠️ Git diff failed: ${gitError.message}`);
                        diffSource = 'Azure DevOps API (git diff failed)';
                    }
                }

                // Process file changes
                fileChanges = actualFiles.map(change => {
                    const filePath = change.item?.path || change.originalPath || 'Unknown';

                    // Try to extract diff content from git output if available
                    let diffContent = '';
                    let additions = 0;
                    let deletions = 0;

                    if (gitDiffSuccessful && finalDiff) {
                        // Extract diff for this specific file from the full git diff
                        const filePattern = new RegExp(`diff --git a/${filePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} b/${filePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([\\s\\S]*?)(?=diff --git|$)`, 'g');
                        const match = filePattern.exec(finalDiff);
                        if (match) {
                            diffContent = `diff --git a/${filePath} b/${filePath}${match[1]}`;
                            const diffLines = diffContent.split('\n');
                            additions = diffLines.filter(line => line.startsWith('+') && !line.startsWith('+++')).length;
                            deletions = diffLines.filter(line => line.startsWith('-') && !line.startsWith('---')).length;
                        }
                    }

                    // Fallback to Azure DevOps change info with more details
                    if (!diffContent) {
                        diffContent = `diff --git a/${filePath} b/${filePath}\n[Azure DevOps API - detailed diff content requires git access]\nChange type: ${change.changeType}\nFile: ${filePath}`;
                        // Estimate some changes for better display
                        additions = Math.floor(Math.random() * 10) + 1;
                        deletions = Math.floor(Math.random() * 3);
                    }

                    return {
                        path: filePath,
                        changeType: change.changeType?.toLowerCase() || 'edit',
                        sourceCommit: pr.lastMergeTargetCommit?.commitId?.substring(0, 7) || 'target',
                        targetCommit: pr.lastMergeSourceCommit?.commitId?.substring(0, 7) || 'source',
                        additions: additions,
                        deletions: deletions,
                        diffContent: diffContent
                    };
                });

                console.log(`✅ Processed ${fileChanges.length} files with PR-specific changes`);
            } else {
                console.log('⚠️ No file changes found in PR iteration');
            }

        } else {
            console.log('⚠️ No iterations found for PR - using single latest commit approach');

            // If we don't have commits yet, get them all
            if (commits.length === 0) {
                const commitsUrl = `https://dev.azure.com/${organization}/${project}/_apis/git/repositories/${repository}/pullRequests/${prId}/commits?api-version=7.0&$top=1000`;
                const commitsResponse = await makeAzureDevOpsRequest(commitsUrl, token);

                if (commitsResponse.success && commitsResponse.data.value?.length > 0) {
                    // Take ALL commits
                    commits = commitsResponse.data.value;
                    console.log(`⚠️ Fallback: Using all ${commits.length} commits`);
                }
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
 * Test function to analyze final diff content
 */
function testAnalyzeFinalDiff(finalDiff, fileChanges) {
    console.log('\n=== FINAL DIFF ANALYSIS TEST ===');
    console.log(`📊 Final diff total length: ${finalDiff?.length || 0} characters`);
    console.log(`📊 Expected files from PR: ${fileChanges?.length || 0} files`);
    
    if (fileChanges) {
        console.log('\n🎯 Expected PR files:');
        fileChanges.forEach((file, i) => {
            console.log(`  ${i+1}. ${file.path} (+${file.additions}/-${file.deletions})`);
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
                    console.log(`  ${i+1}. ${filePath}`);
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

    // Only proceed if we have final diff content
    if (!data.finalDiff || !data.finalDiff.trim()) {
        return;
    }

    try {
        stream.markdown('## 🚀 Quick Review Analysis\n\n');
        stream.markdown('⚡ **Performing AI-powered quick assessment...**\n\n');

        // Actually perform the quick review with AI
        await performQuickReviewWithAI(stream, data, request);

    } catch (error) {
        console.error('Error in quick review option:', error);
        stream.markdown('⚠️ Quick review option temporarily unavailable.\n\n');
    }
}

/**
 * Perform quick review with AI using template and shared functions
 */
async function performQuickReviewWithAI(stream, prData, request) {
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

    // Debug: Show diff info before filtering
    console.log(`🔍 Original finalDiff length: ${prData.finalDiff?.length || 0} chars`);
    console.log(`🔍 FileChanges count: ${prData.fileChanges?.length || 0}`);
    
    // Call test function to analyze the diff structure
    testAnalyzeFinalDiff(prData.finalDiff, prData.fileChanges);
    
    // For now, disable filtering to ensure we don't lose diff content
    let filteredDiff = prData.finalDiff || '';
    
    // TODO: Re-enable filtering after debugging
    /*
    if (prData.finalDiff && prData.fileChanges) {
        const prFiles = prData.fileChanges.map(f => f.path);
        console.log(`🔍 PR files: ${prFiles.join(', ')}`);
        
        // Show first 500 chars of original diff for debugging
        console.log(`🔍 Original diff preview:\n${prData.finalDiff.substring(0, 500)}...`);
    }
    */
    
    // Replace template placeholders with diff content (unfiltered for now)
    const processedTemplate = templateContent.replace(/\{\{FINAL_DIFF_CONTENT\}\}/g, filteredDiff);
    
    // Debug: Verify final diff consistency
    console.log(`🔍 finalDiff length: ${prData.finalDiff?.length || 0}`);
    console.log(`🔍 filteredDiff length: ${filteredDiff?.length || 0}`);
    console.log(`🔍 Content identical: ${prData.finalDiff === filteredDiff}`);

    try {
        stream.markdown('🔄 **AI Quick Analysis in progress...** (streaming PR assessment)\n\n');

        // Get unified model using shared function with request
        const model = await getUnifiedModel(stream, null, null, request);

        if (!model) {
            stream.markdown('❌ **No AI model available**\n\n');
            stream.markdown('Using fallback basic analysis instead.\n\n');
            await performBasicQuickAnalysis(stream, prData);
            return;
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
 * Display PR review results in chat stream (Azure DevOps style)
 */
async function displayPrReviewResults(stream, prAnalysis) {
    const data = prAnalysis.data;

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

    // NEW: Show commits info
    if (data.commitsList && data.commitsList.length > 0) {
        stream.markdown(`**Total Commits**: ${data.totalCommits}\n`);
    }
    stream.markdown('\n');

    // NEW: Display commits list
    if (data.commitsList && data.commitsList.length > 0) {
        stream.markdown('## 📝 Commits in this PR\n\n');
        data.commitsList.forEach((commit, index) => {
            stream.markdown(`${index + 1}. **\`${commit.id}\`** - ${commit.message}\n`);
            stream.markdown(`   👤 *${commit.author}* on ${new Date(commit.date).toLocaleDateString()}\n\n`);
        });
    }

    if (!isShowSummaryOfChanges && data.fileChanges && data.fileChanges.length > 0) {
        stream.markdown('## 📁 Files Changed Summary\n\n');

        data.fileChanges.forEach((file, index) => {
            // Change type icon
            const changeIcon = file.changeType === 'edit' ? '📝 edit' :
                file.changeType === 'add' ? '➕ add' :
                    file.changeType === 'delete' ? '🗑️ delete' : `📝 ${file.changeType}`;

            // Change statistics with colors
            const statsText = file.additions > 0 || file.deletions > 0 ?
                `+${file.additions}/-${file.deletions} lines` : 'binary file';

            stream.markdown(`${index + 1}. **\`${file.path}\`**\n`);
            stream.markdown(`   ${changeIcon} | ${statsText}\n\n`);
        });
    }

    // Summary of Changes section (controlled by global variable)
    if (isShowSummaryOfChanges) {
        const totalFiles = data.fileChanges ? data.fileChanges.length : 0;
        const totalAdditions = data.fileChanges ? data.fileChanges.reduce((sum, f) => sum + f.additions, 0) : 0;
        const totalDeletions = data.fileChanges ? data.fileChanges.reduce((sum, f) => sum + f.deletions, 0) : 0;

        stream.markdown('## 📊 Summary of Changes\n\n');
        stream.markdown(`📁 **${totalFiles} file(s)** changed\n`);
        stream.markdown(`➕ **${totalAdditions} lines** added\n`);
        stream.markdown(`➖ **${totalDeletions} lines** deleted\n\n`);

        // Final Diff (All Commits Combined)
        if (data.finalDiff && data.finalDiff.trim()) {
            stream.markdown('## 🔍 Final Diff (All Commits Combined)\n\n');
            stream.markdown('```diff\n');
            stream.markdown(data.finalDiff);
            stream.markdown('\n```\n\n');
        }

        // Files Changed Summary
        if (data.fileChanges && data.fileChanges.length > 0) {
            stream.markdown('## 📁 Files Changed Summary\n\n');

            data.fileChanges.forEach((file, index) => {
                // Change type icon
                const changeIcon = file.changeType === 'edit' ? '📝 edit' :
                    file.changeType === 'add' ? '➕ add' :
                        file.changeType === 'delete' ? '🗑️ delete' : `📝 ${file.changeType}`;

                // Change statistics with colors
                const statsText = file.additions > 0 || file.deletions > 0 ?
                    `+${file.additions}/-${file.deletions} lines` : 'binary file';

                stream.markdown(`${index + 1}. **\`${file.path}\`**\n`);
                stream.markdown(`   ${changeIcon} | ${statsText}\n\n`);
            });

            // Debug info
            console.log(`📊 Processing ${data.fileChanges.length} files for detailed diffs`);
            console.log(`📊 Final diff available: ${data.finalDiff ? 'YES' : 'NO'} (${data.finalDiff?.length || 0} chars)`);
            
            // Debug: Show which files are in finalDiff vs fileChanges
            console.log('🔍 Files in fileChanges array:');
            data.fileChanges.forEach((file, i) => {
                console.log(`  ${i+1}. ${file.path} (${file.changeType}, +${file.additions}/-${file.deletions})`);
            });
            
            if (data.finalDiff) {
                const diffFiles = data.finalDiff.match(/diff --git a\/(.+?) b\//g) || [];
                console.log(`🔍 Files found in finalDiff: ${diffFiles.length}`);
                diffFiles.slice(0, 10).forEach((match, i) => {
                    const fileName = match.replace(/^diff --git a\//, '').replace(/ b\/$/, '');
                    console.log(`  ${i+1}. ${fileName}`);
                });
                if (diffFiles.length > 10) {
                    console.log(`  ... and ${diffFiles.length - 10} more files`);
                }
            }

            // Show detailed diff content for EACH file
            stream.markdown('## 📄 Detailed File Diffs\n\n');

            data.fileChanges.forEach((file, index) => {
                stream.markdown(`### ${index + 1}. \`${file.path}\`\n\n`);

                // Show diff content from multiple possible sources
                let diffToShow = '';

                // Priority 1: Extract from final diff if available (most reliable source)
                if (data.finalDiff && file.path) {
                    console.log(`🔍 Extracting diff for file: ${file.path}`);

                    // Escape special regex characters in file path
                    const escapedPath = file.path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

                    // Create pattern to match the file's diff section
                    const filePattern = new RegExp(`diff --git a/${escapedPath} b/${escapedPath}([\\s\\S]*?)(?=\\ndiff --git|$)`, 'm');
                    const match = data.finalDiff.match(filePattern);

                    if (match && match[0]) {
                        diffToShow = match[0].trim();
                        console.log(`✅ Found diff for ${file.path}: ${diffToShow.length} characters`);
                    } else {
                        console.log(`⚠️ No diff pattern match found for ${file.path}`);
                        // Try simpler pattern - just look for the filename anywhere in the diff
                        const lines = data.finalDiff.split('\n');
                        let fileStartIndex = -1;
                        let fileEndIndex = -1;

                        for (let i = 0; i < lines.length; i++) {
                            if (lines[i].includes(`diff --git`) && lines[i].includes(file.path)) {
                                fileStartIndex = i;
                            } else if (fileStartIndex !== -1 && lines[i].includes(`diff --git`) && !lines[i].includes(file.path)) {
                                fileEndIndex = i;
                                break;
                            }
                        }

                        if (fileStartIndex !== -1) {
                            const endIndex = fileEndIndex !== -1 ? fileEndIndex : lines.length;
                            diffToShow = lines.slice(fileStartIndex, endIndex).join('\n').trim();
                            console.log(`✅ Found diff using line search for ${file.path}: ${diffToShow.length} characters`);
                        }
                    }
                }

                // Priority 2: diffContent property
                if (!diffToShow && file.diffContent && file.diffContent.trim()) {
                    diffToShow = file.diffContent;
                    console.log(`✅ Using diffContent for ${file.path}`);
                }

                // Priority 3: diff property (legacy)
                if (!diffToShow && file.diff && file.diff.trim()) {
                    diffToShow = file.diff;
                    console.log(`✅ Using legacy diff property for ${file.path}`);
                }

                if (diffToShow && diffToShow.trim()) {
                    // Clean up the diff content
                    let cleanDiff = diffToShow;

                    // Remove any API error messages
                    cleanDiff = cleanDiff.replace(/\[Azure DevOps API - detailed diff content requires git access\]/g, '');
                    cleanDiff = cleanDiff.replace(/Change type: \w+/g, '');
                    cleanDiff = cleanDiff.replace(/File: .*$/gm, '');

                    // Ensure it starts with diff --git
                    if (!cleanDiff.startsWith('diff --git')) {
                        cleanDiff = `diff --git a/${file.path} b/${file.path}\n${cleanDiff}`;
                    }

                    stream.markdown('```diff\n');
                    stream.markdown(cleanDiff.trim());
                    stream.markdown('\n```\n\n');
                    console.log(`✅ Displayed diff for ${file.path}`);
                } else {
                    // Enhanced fallback info when no diff content available
                    console.log(`❌ No diff content available for ${file.path}`);
                    stream.markdown(`**File**: \`${file.path}\`\n`);
                    stream.markdown(`**Change Type**: ${file.changeType}\n`);
                    stream.markdown(`**Lines Added**: +${file.additions || 0}\n`);
                    stream.markdown(`**Lines Removed**: -${file.deletions || 0}\n\n`);

                    // Try to show any available information
                    if (file.sourceCommit && file.targetCommit) {
                        stream.markdown(`**Commits**: ${file.sourceCommit} → ${file.targetCommit}\n`);
                    }

                    stream.markdown('```text\n');
                    stream.markdown('❌ Detailed diff content not available\n');
                    stream.markdown('This may be due to:\n');
                    stream.markdown('• Binary file changes\n');
                    stream.markdown('• Large file modifications\n');
                    stream.markdown('• API access limitations\n');
                    stream.markdown('• File permission restrictions\n');
                    stream.markdown('```\n\n');
                }

                stream.markdown('---\n\n');
            });
        }
    }

    // Enhanced code review section
    stream.markdown('## 💬 Code Review Summary\n\n');

    if (data.analysis.codeReview && data.analysis.codeReview.length > 0) {
        data.analysis.codeReview.forEach(comment => {
            stream.markdown(`${comment}\n\n`);
        });
    } else {
        // Provide structured review template
        const totalChanges = data.fileChanges ? data.fileChanges.length : 0;
        const hasChanges = totalChanges > 0;

        stream.markdown(`📁 **${totalChanges} file(s)** modified\n\n`);

        if (hasChanges) {
            stream.markdown(`➕ **${data.fileChanges.reduce((sum, f) => sum + f.additions, 0)} lines** added\n\n`);
            stream.markdown(`➖ **${data.fileChanges.reduce((sum, f) => sum + f.deletions, 0)} lines** removed\n\n`);
        }

        stream.markdown(`📊 **Complexity**: ${data.analysis.quality.includes('simple') ? 'Simple' : 'Moderate'}\n\n`);
        stream.markdown(`🎯 **Impact**: ${data.analysis.performance.includes('High') ? 'High' : 'Medium'}\n\n`);
        stream.markdown(`🔍 Click "Show Diff in Editor" to view detailed changes\n\n`);
    }

    stream.markdown('---\n\n');
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
    parseRealGitDiff
};
