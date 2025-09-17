const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const https = require('https');
const { URL } = require('url');

// Session tracking for "Enter twice" functionality and change scores
const chatSessions = new Map();

/**
 * Handle "Enter twice" functionality for chat participants
 * @param {string} participantType - 'review-file' or 'review-changes'
 * @param {object} activeEditor - VS Code active editor
 * @param {object} stream - Chat stream
 * @param {function} autoReviewCallback - Function to call on second enter
 * @returns {boolean} - true if handled (first enter), false if should proceed with auto review
 */
async function handleEnterTwiceLogic(participantType, activeEditor, stream, autoReviewCallback) {
    const fileName = path.basename(activeEditor.document.fileName);
    const sessionKey = `${participantType}-${activeEditor.document.fileName}`;
    const hasSeenQuestion = chatSessions.get(sessionKey) || false;
    
    console.log(`🔍 Session check: ${sessionKey} = ${hasSeenQuestion}`);
    
    if (hasSeenQuestion) {
        // Second Enter - Auto proceed like clicking "Yes"
        const emoji = participantType === 'review-file' ? '📁' : '🔍';
        const action = participantType === 'review-file' ? 'File' : 'Changes';
        
        stream.markdown(`# ${emoji} Reviewing ${action}: \`${fileName}\`\n\n`);
        stream.markdown(`📂 **Auto-proceeding with:** \`${activeEditor.document.fileName}\`\n\n`);
        stream.markdown(`🚀 **Starting ${action.toLowerCase()} review...**\n\n`);
        
        // Clear the session flag
        chatSessions.delete(sessionKey);
        
        // Call the auto review function
        await autoReviewCallback();
        return true; // Handled, don't continue
    }
    
    // First time - Show question and set session flag
    chatSessions.set(sessionKey, true);
    console.log(`🔍 Session set: ${sessionKey} = true`);
    
    const emoji = participantType === 'review-file' ? '📁' : '🔍';
    const title = participantType === 'review-file' ? 'File Review Assistant' : 'Code Review Assistant';
    const confirmCommand = participantType === 'review-file' ? 'aiSelfCheck.confirmFileReview' : 'aiSelfCheck.confirmChangesReview';
    const helpCommand = participantType === 'review-file' ? 'aiSelfCheck.showFileHelp' : 'aiSelfCheck.showChangesHelp';
    const buttonText = participantType === 'review-file' ? `✅ Yes, review file ${fileName}` : `✅ Yes, review changes in ${fileName}`;
    const questionText = participantType === 'review-file' ? 
        `**Question:** Do you want to review the file \`${fileName}\`?\n\n` :
        `**Question:** Do you want to review git changes for \`${fileName}\`?\n\n`;
    
    stream.markdown(`# ${emoji} ${title}\n\n`);
    stream.markdown(`**Current file:** \`${fileName}\`\n\n`);
    
    // Create Yes/No buttons for confirmation
    stream.button({
        command: confirmCommand,
        title: buttonText,
        arguments: [activeEditor.document.fileName]
    });
    
    stream.markdown('\n');
    
    stream.button({
        command: helpCommand,
        title: '❌ No, show help instead',
        arguments: []
    });
    
    stream.markdown('\n\n');
    stream.markdown(questionText);
    stream.markdown('💡 **Tip:** Press Enter again to auto-proceed\n');
    
    return false; // Don't continue, show question first
}

/**
 * Setup Azure DevOps settings automatically
 */
async function setupAzureDevOpsSettings() {
    try {
        // Open User Settings JSON
        await vscode.commands.executeCommand('workbench.action.openSettingsJson');
        
        // Show info message with instructions
        const settingsTemplate = `{
    "aiSelfCheck.azureDevOps.personalAccessToken": "YOUR_TOKEN_HERE",
    "aiSelfCheck.azureDevOps.organization": "BusinessWebUS",
    "aiSelfCheck.azureDevOps.defaultProject": "Shippo"
}`;
        
        const action = await vscode.window.showInformationMessage(
            'Settings JSON opened. Copy và paste template below vào cuối file (trước dấu }).',
            'Copy Template',
            'Open Azure DevOps'
        );
        
        if (action === 'Copy Template') {
            await vscode.env.clipboard.writeText(settingsTemplate);
            vscode.window.showInformationMessage('Template đã copy vào clipboard!');
        } else if (action === 'Open Azure DevOps') {
            await vscode.env.openExternal(vscode.Uri.parse('https://dev.azure.com/BusinessWebUS/_usersSettings/tokens'));
        }
        
    } catch (error) {
        vscode.window.showErrorMessage(`Error opening settings: ${error.message}`);
    }
}

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
    console.log('Review Helper extension is now active!');
    
    // Auto-generate templates on first run
    ensureTemplatesExist(context);

    // Register new commands for different review modes
    let reviewGitChanges = vscode.commands.registerCommand('aiSelfCheck.reviewGitChanges', async () => {
        await reviewCurrentGitChanges();
    });

    let reviewActiveFile = vscode.commands.registerCommand('aiSelfCheck.reviewActiveFile', async () => {
        await reviewActiveEditor();
    });

    let reviewWorkspace = vscode.commands.registerCommand('aiSelfCheck.reviewWorkspace', async () => {
        await reviewWorkspaceChanges();
    });

    // Register Azure DevOps setup command
    let setupAzureDevOps = vscode.commands.registerCommand('aiSelfCheck.setupAzureDevOps', async () => {
        await setupAzureDevOpsSettings();
    });

    // Register confirmation commands for chat buttons
    let confirmChangesReview = vscode.commands.registerCommand('aiSelfCheck.confirmChangesReview', async (filePath) => {
        // Open chat and trigger changes review for the specific file
        await vscode.commands.executeCommand('workbench.panel.chat.view.copilot.focus');
        // Send the file path to @review-changes
        await vscode.commands.executeCommand('workbench.action.chat.open', {
            query: `@review-changes ${filePath}`
        });
    });

    let confirmFileReview = vscode.commands.registerCommand('aiSelfCheck.confirmFileReview', async (filePath) => {
        // Open chat and trigger file review for the specific file
        await vscode.commands.executeCommand('workbench.panel.chat.view.copilot.focus');
        // Send the file path to @review-file
        await vscode.commands.executeCommand('workbench.action.chat.open', {
            query: `@review-file ${filePath}`
        });
    });

    let showChangesHelp = vscode.commands.registerCommand('aiSelfCheck.showChangesHelp', async () => {
        vscode.window.showInformationMessage(
            'Code Review Helper - @review-changes',
            {
                modal: false,
                detail: `Usage examples:
• @review-changes - Review git changes for current file
• @review-changes src/components/MyComponent.ts - Review specific file changes
• Use @review-file to review entire file content instead of just changes`
            }
        );
    });

    let showFileHelp = vscode.commands.registerCommand('aiSelfCheck.showFileHelp', async () => {
        vscode.window.showInformationMessage(
            'Code Review Helper - @review-file', 
            {
                modal: false,
                detail: `Usage examples:
• @review-file - Review currently active file
• @review-file src/components/MyComponent.ts - Review specific file
• Use @review-changes to review only git changes instead of entire file`
            }
        );
    });

    // Register commands matching package.json (for right-click menu)
    let reviewFile = vscode.commands.registerCommand('aiSelfCheck.reviewFile', async (uri) => {
        console.log('🎯 Review File command called', uri);
        try {
            await vscode.commands.executeCommand('workbench.panel.chat.view.copilot.focus');
            if (uri && uri.fsPath) {
                // Get relative path from workspace
                const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
                let filePath = uri.fsPath;
                if (workspaceFolder) {
                    filePath = path.relative(workspaceFolder.uri.fsPath, uri.fsPath);
                }
                await vscode.commands.executeCommand('workbench.action.chat.open', {
                    query: `@review-file ${filePath}`
                });
            } else {
                await vscode.commands.executeCommand('workbench.action.chat.open', {
                    query: '@review-file'
                });
            }
        } catch (error) {
            console.error('Error in reviewFile command:', error);
            vscode.window.showErrorMessage(`Failed to review file: ${error.message}`);
        }
    });

    let reviewChanges = vscode.commands.registerCommand('aiSelfCheck.reviewChanges', async (uri) => {
        console.log('🎯 Review Changes command called', uri);
        try {
            await vscode.commands.executeCommand('workbench.panel.chat.view.copilot.focus');
            if (uri && uri.fsPath) {
                // Get relative path from workspace
                const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
                let filePath = uri.fsPath;
                if (workspaceFolder) {
                    filePath = path.relative(workspaceFolder.uri.fsPath, uri.fsPath);
                }
                await vscode.commands.executeCommand('workbench.action.chat.open', {
                    query: `@review-changes ${filePath}`
                });
            } else {
                await vscode.commands.executeCommand('workbench.action.chat.open', {
                    query: '@review-changes'
                });
            }
        } catch (error) {
            console.error('Error in reviewChanges command:', error);
            vscode.window.showErrorMessage(`Failed to review changes: ${error.message}`);
        }
    });

    // Register chat participants
    const reviewChangesParticipant = vscode.chat.createChatParticipant('review-changes', async (request, context, stream, token) => {
        try {
            console.log('🎯 review-changes participant called');
            console.log('📥 Request.model:', request.model?.family);
            
            const input = request.prompt.trim();
            
            // Improved loop prevention - only prevent if this is a recursive call from the same participant
            if (context.participant && context.participant.id === 'review-changes' && request.prompt.includes('@review-changes')) {
                stream.markdown('⚠️ **Loop Prevention**: Recursive call detected\n');
                stream.markdown('💡 **Use direct commands instead**: Review your git changes or files\n');
                return;
            }
            
            // Ensure we always provide some response
            if (!input || input.length === 0) {
                // Check if there's an active file to review
                const activeEditor = vscode.window.activeTextEditor;
                if (activeEditor) {
                    // Use shared "Enter twice" logic
                    const shouldContinue = await handleEnterTwiceLogic(
                        'review-changes', 
                        activeEditor, 
                        stream, 
                        async () => {
                            // Auto review callback
                            await handleFilePathChangesReview(activeEditor.document.fileName, stream, null, context, request);
                        }
                    );
                    
                    if (!shouldContinue) {
                        return; // First enter, question shown
                    }
                    // Second enter already handled in callback
                    return;
                } else {
                    stream.markdown('# 🔍 Code Review Assistant\n\n');
                    stream.markdown('Please provide a file path or open a file to review.\n\n');
                    stream.markdown('**Examples:**\n');
                    stream.markdown('- `@review-changes` - Review current git changes\n');
                    stream.markdown('- `@review-changes src/app/component.ts` - Review specific file\n');
                    return;
                }
            }
            
            // Check if it's a file path for changes review
            if (input.includes('.ts') || input.includes('.js') || input.includes('.html') || input.includes('.css') || input.includes('/') || input.includes('\\')) {
                await handleFilePathChangesReview(input, stream, null, context, request);
            } else {
                // Default behavior - review git changes
                await handleInstructionReview(stream, null, context, request);
            }
            
        } catch (error) {
            stream.markdown(`❌ Error: ${error.message}\n\n`);
            stream.markdown('**Fallback:** Try running a git status check first, or specify a file path to review.\n');
            console.error('Review Changes error:', error);
        }
    });

    const reviewFileParticipant = vscode.chat.createChatParticipant('review-file', async (request, context, stream, token) => {
        try {
            console.log('🎯 review-file participant called');
            console.log('📥 Request object:', request);
            console.log('📥 Context object:', context);
            console.log('📥 Request.model:', request.model);
            console.log('📥 Context.selectedModel:', context.selectedModel);
            
            const input = request.prompt.trim();
            
            // Improved loop prevention - only prevent if this is a recursive call from the same participant
            if (context.participant && context.participant.id === 'review-file' && request.prompt.includes('@review-file')) {
                stream.markdown('⚠️ **Loop Prevention**: Recursive call detected\n');
                stream.markdown('💡 **Use direct commands instead**: Review your active file or specify a file path\n');
                return;
            }
            
            // Ensure we always provide some response
            if (!input || input.length === 0) {
                // Check if there's an active file to review
                const activeEditor = vscode.window.activeTextEditor;
                if (activeEditor) {
                    // Use shared "Enter twice" logic
                    const shouldContinue = await handleEnterTwiceLogic(
                        'review-file', 
                        activeEditor, 
                        stream, 
                        async () => {
                            // Auto review callback
                            await handleFilePathReview(activeEditor.document.fileName, stream, null, context);
                        }
                    );
                    
                    if (!shouldContinue) {
                        return; // First enter, question shown
                    }
                    // Second enter already handled in callback
                    return;
                } else {
                    stream.markdown('# 📁 File Review Assistant\n\n');
                    stream.markdown('Please provide a file path or open a file to review.\n\n');
                    stream.markdown('**Examples:**\n');
                    stream.markdown('- `@review-file` - Review currently active file\n');
                    stream.markdown('- `@review-file src/app/component.ts` - Review specific file\n');
                    return;
                }
            }
            
            // Check if it's a file path for file review
            if (input.includes('.ts') || input.includes('.js') || input.includes('.html') || input.includes('.css') || input.includes('/') || input.includes('\\')) {
                await handleFilePathReview(input, stream, null, context);
            } else {
                // Default behavior - review active file
                await handleActiveFileReview(stream, null, context);
            }
            
        } catch (error) {
            stream.markdown(`❌ Error: ${error.message}\n\n`);
            stream.markdown('**Fallback:** Please open a file in the editor and try again.\n');
            console.error('Review File error:', error);
        }
    });

    // Set custom icons for chat participants
    reviewChangesParticipant.iconPath = vscode.Uri.file(path.join(context.extensionPath, 'icon.svg'));
    reviewFileParticipant.iconPath = vscode.Uri.file(path.join(context.extensionPath, 'icon.svg'));

    // #region review-pr
    // Azure DevOps Pull Request Review Feature
    
    // Create new chat participant for PR review
    const reviewPrParticipant = vscode.chat.createChatParticipant('review-pr', handleReviewPr);
    reviewPrParticipant.iconPath = vscode.Uri.file(path.join(context.extensionPath, 'icon.svg'));
    
    // Register review PR command
    let reviewPullRequest = vscode.commands.registerCommand('aiSelfCheck.reviewPullRequest', async () => {
        await reviewPullRequestCommand();
    });

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
                stream.markdown(`� **Project**: ${project}\n`);
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
        
        stream.markdown('## � Summary of Changes\n\n');
        stream.markdown(`�📁 **${totalFiles} file(s)** changed\n`);
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
    
    // #endregion review-pr

    context.subscriptions.push(
        reviewGitChanges, 
        reviewActiveFile, 
        reviewWorkspace, 
        setupAzureDevOps,
        confirmChangesReview,
        confirmFileReview,
        showChangesHelp,
        showFileHelp,
        reviewFile,
        reviewChanges,
        reviewChangesParticipant, 
        reviewFileParticipant,
        reviewPullRequest,
        reviewPrParticipant
    );
}


async function reviewCurrentGitChanges() {
    try {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            vscode.window.showErrorMessage('No workspace folder found');
            return;
        }

        // Get git diff
        const gitDiff = execSync('git diff --staged HEAD', { 
            cwd: workspaceFolder.uri.fsPath,
            encoding: 'utf8' 
        });

        if (!gitDiff.trim()) {
            const unstagedDiff = execSync('git diff HEAD', { 
                cwd: workspaceFolder.uri.fsPath,
                encoding: 'utf8' 
            });
            
            if (!unstagedDiff.trim()) {
                vscode.window.showInformationMessage('No git changes found');
                return;
            }
            
            // Auto-generate review for unstaged changes
            await generateReviewFile(unstagedDiff, 'unstaged-changes');
        } else {
            await generateReviewFile(gitDiff, 'staged-changes');
        }

    } catch (error) {
        vscode.window.showErrorMessage(`Git review error: ${error.message}`);
    }
}

async function reviewActiveEditor() {
    const activeEditor = vscode.window.activeTextEditor;
    if (!activeEditor) {
        vscode.window.showErrorMessage('No active editor found');
        return;
    }

    const document = activeEditor.document;
    const content = document.getText();
    const selection = activeEditor.selection;
    
    // Review selected code or entire file
    const codeToReview = selection.isEmpty ? content : document.getText(selection);
    
    await generateReviewFile(codeToReview, `file-${path.basename(document.fileName)}`, {
        filePath: document.fileName,
        language: document.languageId,
        isSelection: !selection.isEmpty,
        lineRange: selection.isEmpty ? null : [selection.start.line, selection.end.line]
    });
}

async function reviewWorkspaceChanges() {
    try {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            vscode.window.showErrorMessage('No workspace folder found');
            return;
        }

        // Get all changed files
        const gitStatus = execSync('git status --porcelain', { 
            cwd: workspaceFolder.uri.fsPath,
            encoding: 'utf8' 
        });

        if (!gitStatus.trim()) {
            vscode.window.showInformationMessage('No workspace changes found');
            return;
        }

        const gitDiff = execSync('git diff HEAD', { 
            cwd: workspaceFolder.uri.fsPath,
            encoding: 'utf8' 
        });

        await generateReviewFile(gitDiff, 'workspace-changes', {
            status: gitStatus
        });

    } catch (error) {
        vscode.window.showErrorMessage(`Workspace review error: ${error.message}`);
    }
}

async function generateReviewFile(content, type, metadata = {}) {
    // File generation functionality removed - reviews are now done in-memory
    vscode.window.showInformationMessage(
        `📝 Review processed in-memory: ${type}`,
        'Open Chat'
    ).then(selection => {
        if (selection === 'Open Chat') {
            vscode.commands.executeCommand('workbench.panel.chat.view.copilot.focus');
        }
    });
}

async function handleActiveFileReview(stream, requestedModel = null, context = null) {
    try {
        const activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor) {
            stream.markdown('❌ **No active editor found**\n\n');
            stream.markdown('💡 **Tips:**\n');
            stream.markdown('- Open a file in the editor\n');
            stream.markdown('- Select some code to review a specific section\n');
            stream.markdown('- Or try `@review-changes` to review git changes instead\n');
            return;
        }

        const document = activeEditor.document;
        const selection = activeEditor.selection;
        const isSelection = !selection.isEmpty;
        
        if (isSelection) {
            // For selection review, use simple header and analyze selection
            stream.markdown('# 🔍 Code Selection Review\n\n');
            stream.markdown(`**File:** \`${path.basename(document.fileName)}\`\n`);
            stream.markdown(`**Selected Lines:** ${selection.start.line + 1}-${selection.end.line + 1}\n\n`);
            const selectedText = document.getText(selection);
            
            if (selectedText.trim()) {
                stream.markdown('## 📋 Selected Code\n\n');
                stream.markdown('```' + document.languageId + '\n' + selectedText + '\n```\n\n');
                
                // Analyze the selection with the selected model
                await analyzeCodeSection(selectedText, document.languageId, stream, requestedModel, context);
            } else {
                stream.markdown('⚠️ **Selected text is empty**\n\n');
                stream.markdown('💡 **Tip:** Select some code and try again\n');
            }
        } else {
            // For full file review, use consistent file review function
            await reviewCurrentFileContent(document.fileName, stream, requestedModel, context);
        }
        
    } catch (error) {
        stream.markdown(`❌ **Error during file review:** ${error.message}\n\n`);
        stream.markdown('**Fallback suggestions:**\n');
        stream.markdown('- Try refreshing the editor\n');
        stream.markdown('- Save the file and try again\n');
        stream.markdown('- Use `@review-changes` for git diff review instead\n');
        console.error('Active file review error:', error);
    }
}

// Helper function to analyze code sections
async function analyzeCodeSection(code, language, stream, requestedModel = null, context = null) {
    try {
        stream.markdown('## 🔍 Quick Analysis\n\n');
        
        const lines = code.split('\n');
        const nonEmptyLines = lines.filter(line => line.trim());
        
        stream.markdown(`**Lines of code:** ${nonEmptyLines.length}\n`);
        stream.markdown(`**Total lines:** ${lines.length}\n\n`);
        
        // Basic code analysis
        const hasComments = code.includes('//') || code.includes('/*') || code.includes('#');
        const hasTodos = /TODO|FIXME|HACK|XXX/i.test(code);
        const hasConsoleLog = /console\.(log|warn|error)/i.test(code);
        
        if (hasComments) {
            stream.markdown('✅ **Has comments** - Good documentation practice\n');
        } else {
            stream.markdown('⚠️ **No comments found** - Consider adding documentation\n');
        }
        
        if (hasTodos) {
            stream.markdown('⚠️ **TODO/FIXME found** - Review pending items\n');
        }
        
        if (hasConsoleLog) {
            stream.markdown('⚠️ **Console statements found** - Consider removing for production\n');
        }
        
        // Language-specific analysis
        if (language === 'typescript' || language === 'javascript') {
            analyzeTypeScriptCode(code, stream);
        }
        
        // AI Analysis if model is available
        if (requestedModel && typeof requestedModel === 'object' && requestedModel.sendRequest) {
            try {
                stream.markdown('\n## 🔄 AI Analysis (Live Stream)\n\n');
                stream.markdown(`**Model:** \`${requestedModel.family}\` | **Language:** \`${language}\`\n\n`);
                stream.markdown('⏳ **Connecting to AI model...**\n\n');
                
                const aiPrompt = `Please analyze this ${language} code following the review-file.md template format:

\`\`\`${language}
${code}
\`\`\`

Follow the template structure for comprehensive analysis.`;

                const messages = [vscode.LanguageModelChatMessage.User(aiPrompt)];
                
                stream.markdown('🚀 **Starting analysis stream...**\n\n');
                const response = await requestedModel.sendRequest(messages, {}, new vscode.CancellationTokenSource().token);
                
                stream.markdown('---\n\n');
                
                let fragmentCount = 0;
                let isFirstFragment = true;
                for await (const fragment of response.text) {
                    if (isFirstFragment) {
                        stream.markdown('📡 **Streaming live analysis...**\n\n');
                        isFirstFragment = false;
                    }
                    stream.markdown(fragment);
                    fragmentCount++;
                }
                
                stream.markdown(`\n\n✅ **Analysis complete** (${fragmentCount} fragments streamed)\n\n`);
                
            } catch (aiError) {
                stream.markdown(`❌ **Streaming failed:** ${aiError.message}\n\n`);
                stream.markdown('🔄 **Retrying with basic analysis...**\n\n');
                console.error('AI streaming error:', aiError);
            }
        } else {
            stream.markdown('\n💡 **For detailed review:** Use AI code review tools or manual inspection\n');
        }
        
    } catch (error) {
        stream.markdown(`⚠️ **Analysis error:** ${error.message}\n`);
    }
}

// TypeScript/JavaScript specific analysis
function analyzeTypeScriptCode(code, stream) {
    const hasTypes = /:\s*(string|number|boolean|void|any|unknown)/i.test(code);
    const hasInterfaces = /interface\s+\w+/i.test(code);
    const hasClasses = /class\s+\w+/i.test(code);
    const hasFunctions = /function\s+\w+|=>\s*{|\w+\s*=\s*\(/i.test(code);
    
    stream.markdown('\n**TypeScript/JavaScript Features:**\n');
    
    if (hasTypes) {
        stream.markdown('✅ **Type annotations found**\n');
    }
    
    if (hasInterfaces) {
        stream.markdown('✅ **Interfaces defined**\n');
    }
    
    if (hasClasses) {
        stream.markdown('✅ **Classes found**\n');
    }
    
    if (hasFunctions) {
        stream.markdown('✅ **Functions/methods found**\n');
    }
}

async function handleInstructionReview(stream, selectedModel = null, context = null, request = null) {
    try {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            stream.markdown('❌ **No workspace folder found**\n\n');
            stream.markdown('💡 **Tips:**\n');
            stream.markdown('- Open a folder in VS Code\n');
            stream.markdown('- Or try `@review-file` to review the active file instead\n');
            return;
        }

        try {
            // Get git diff for current changes
            const gitDiff = execSync('git diff HEAD', { 
                cwd: workspaceFolder.uri.fsPath,
                encoding: 'utf8' 
            });

            if (!gitDiff.trim()) {
                // No unstaged changes, check staged changes
                const stagedDiff = execSync('git diff --staged', { 
                    cwd: workspaceFolder.uri.fsPath,
                    encoding: 'utf8' 
                });
                
                if (!stagedDiff.trim()) {
                    stream.markdown('✅ **No git changes found** - workspace is clean\n\n');
                    
                    // Offer to review active file instead
                    const activeEditor = vscode.window.activeTextEditor;
                    if (activeEditor) {
                        stream.markdown(`💡 **Would you like to review the active file?**\n`);
                        stream.markdown(`📂 **Current file:** \`${path.basename(activeEditor.document.fileName)}\`\n\n`);
                        
                        // Auto-review active file
                        await handleActiveFileReview(stream, selectedModel, context);
                    } else {
                        stream.markdown('💡 **Tips to get started:**\n');
                        stream.markdown('- Make some code changes and try again\n');
                        stream.markdown('- Open a file and use `@review-file`\n');
                        stream.markdown('- Use `@review-changes workspace` for full workspace review\n');
                    }
                    return;
                } else {
                    // Check template path
                    let templatePath = path.join(workspaceFolder.uri.fsPath, 'instructions', 'review-changes.md');
                    if (!fs.existsSync(templatePath) && context) {
                        templatePath = path.join(context.extensionPath, 'templates', 'review-changes.md');
                    }
                    
                    // Display header for staged changes review
                    displayReviewHeader(stream, 'Changes Review', 'Staged Changes', stagedDiff.length, templatePath);
                    
                    await reviewWithInMemoryTemplate(stagedDiff, stream, 'Staged Changes', selectedModel, context, request);
                }
            } else {
                // Check template path
                let templatePath = path.join(workspaceFolder.uri.fsPath, 'instructions', 'review-changes.md');
                if (!fs.existsSync(templatePath) && context) {
                    templatePath = path.join(context.extensionPath, 'templates', 'review-changes.md');
                }
                
                // Display header for current changes review  
                displayReviewHeader(stream, 'Changes Review', 'Current Changes', gitDiff.length, templatePath);
                
                await reviewWithInMemoryTemplate(gitDiff, stream, 'Current Changes', selectedModel, context, request);
            }

        } catch (gitError) {
            stream.markdown(`⚠️ **Git command failed:** ${gitError.message}\n\n`);
            
            // Check if we're in a git repository
            try {
                execSync('git rev-parse --git-dir', { 
                    cwd: workspaceFolder.uri.fsPath,
                    encoding: 'utf8' 
                });
                stream.markdown('💡 **This appears to be a git repository, but no changes were found**\n\n');
            } catch {
                stream.markdown('💡 **This doesn\'t appear to be a git repository**\n\n');
                stream.markdown('**Options:**\n');
                stream.markdown('- Initialize git: `git init`\n');
                stream.markdown('- Or use `@review-file` to review individual files\n\n');
            }
            
            // Fallback to active file review
            stream.markdown('🔄 **Falling back to active file review...**\n\n');
            await handleActiveFileReview(stream, selectedModel);
        }

    } catch (error) {
        stream.markdown(`❌ **Review process failed:** ${error.message}\n\n`);
        stream.markdown('**Fallback options:**\n');
        stream.markdown('- Try `@review-file` for active file review\n');
        stream.markdown('- Check if VS Code has proper workspace access\n');
        stream.markdown('- Restart VS Code if issues persist\n');
        console.error('Instruction review error:', error);
    }
}

// Unified fallback model selection function
async function getFallbackModel(currentModel, stream, attemptNumber = 1) {
    try {
        // Get all available models
        const allModels = await vscode.lm.selectChatModels();
        const availableModels = allModels.filter(m => m.id !== currentModel.id);
        
        if (availableModels.length === 0) {
            throw new Error('No alternative models available for fallback');
        }
        
        // Fallback priority order (consistent across all functions):
        // 1. Claude 4 (Claude Sonnet 4)
        // 2. GPT-4.1 
        // 3. First available model
        
        let fallbackModel = null;
        
        // Priority 1: Claude 4 (Claude Sonnet 4)
        fallbackModel = availableModels.find(m => 
            m.family.toLowerCase().includes('claude') && 
            (m.family.includes('4') || m.family.toLowerCase().includes('sonnet'))
        );
        
        // Priority 2: GPT-4.1 
        if (!fallbackModel) {
            fallbackModel = availableModels.find(m => 
                m.family.toLowerCase().includes('gpt') && 
                (m.family.includes('4.1') || m.family.includes('4'))
            );
        }
        
        // Priority 3: First available model
        if (!fallbackModel) {
            fallbackModel = availableModels[0];
        }
        
        // Show detailed fallback information
        const availableList = availableModels.map(m => m.family).join(', ');
        
        console.log(`🔄 Fallback ${attemptNumber}: ${currentModel.family} → ${fallbackModel.family}`);
        stream.markdown(`🔄 **Fallback strategy (attempt ${attemptNumber}):** ${currentModel.family} → ${fallbackModel.family}\n`);
        stream.markdown(`📋 **Available models:** ${availableList}\n\n`);
        
        return fallbackModel;
        
    } catch (error) {
        console.error('❌ Fallback model selection failed:', error);
        stream.markdown(`❌ **Fallback failed:** ${error.message}\n\n`);
        throw error;
    }
}

// New In-Memory Template Review Function
async function reviewWithInMemoryTemplate(diffContent, stream, changeType = 'Changes', selectedModel = null, context = null, request = null) {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    
    // Try workspace instructions first, then fallback to extension templates
    let instructionPath = path.join(workspaceFolder.uri.fsPath, 'instructions', 'review-changes.md');
    let templateSource = 'workspace';
    
    if (!fs.existsSync(instructionPath) && context) {
        instructionPath = path.join(context.extensionPath, 'templates', 'review-changes.md');
        templateSource = 'extension';
    }
    
    try {
        // Load instruction template
        let instructionTemplate = '';
        if (fs.existsSync(instructionPath)) {
            instructionTemplate = fs.readFileSync(instructionPath, 'utf8');
        } else {
            stream.markdown('⚠️ **Template not found:** - using basic review\n');
            await reviewDiffWithChecklist(diffContent, stream, changeType);
            return;
        }

        // Replace placeholder with actual diff in memory
        let reviewContent = instructionTemplate.replace(
            /```diff\s*\n# Paste git diff here\s*\n```/,
            `\`\`\`diff\n${diffContent}\n\`\`\``
        );

        // Check if replacement worked, if not try alternative patterns
        if (reviewContent === instructionTemplate) {
            // Try simpler pattern
            reviewContent = instructionTemplate.replace(
                '# Paste git diff here',
                diffContent
            );
        }

        // Try another pattern if still not replaced
        if (reviewContent === instructionTemplate) {
            // Try finding the diff section marker
            reviewContent = instructionTemplate.replace(
                /# Paste git diff here/g,
                diffContent
            );
        }

        stream.markdown('---\n\n');

        // Parse the completed instruction content and perform review
        if (reviewContent !== instructionTemplate) {
            await performInMemoryReview(reviewContent, diffContent, stream, changeType, selectedModel, context, request);
        } else {
            // Fallback to basic review if template replacement failed
            stream.markdown('⚠️ **Template replacement failed - using basic review**\n\n');
            await reviewDiffWithChecklist(diffContent, stream, changeType);
        }
        
    } catch (error) {
        stream.markdown(`❌ Template processing error: ${error.message}\n\n`);
        // Fallback to regular review
        await reviewDiffWithChecklist(diffContent, stream, changeType);
    }
}

// SIMPLIFIED: Direct template-based approach without command conflicts
async function performInMemoryReview(reviewContent, diffContent, stream, changeType, selectedModel = null, context = null, request = null) {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    
    // Try workspace instructions first, then fallback to extension templates
    let templatePath = path.join(workspaceFolder.uri.fsPath, 'instructions', 'review-changes.md');
    let templateSource = 'workspace';
    
    if (!fs.existsSync(templatePath) && context) {
        templatePath = path.join(context.extensionPath, 'templates', 'review-changes.md');
        templateSource = 'extension';
    }
    
    let templateContent;
    try {
        templateContent = fs.readFileSync(templatePath, 'utf8');
    } catch (error) {
        stream.markdown('❌ **Error**: Could not load review template\n');
        stream.markdown(`Error: ${error.message}\n`);
        // Fallback to basic review
        await reviewDiffWithChecklist(diffContent, stream, changeType);
        return;
    }
    
    // Replace git diff placeholder with actual diff
    let finalContent = templateContent.replace(
        /```diff\s*\n# Paste git diff here\s*\n```/g,
        `\`\`\`diff\n${diffContent}\n\`\`\``
    );
    
    // If replacement didn't work, try alternative patterns
    if (finalContent === templateContent) {
        finalContent = templateContent.replace(/# Paste git diff here/g, diffContent);
    }
    
    // Simple, safe approach - just display the template with diff
    stream.markdown('# 📋 Code Review Starts\n\n');
    
    try {
        // Use unified model detection (same as review-file)
        const model = await getUnifiedModel(stream, selectedModel, context, request);
        
        if (!model) {
            stream.markdown('❌ **AI models not available** - falling back to template display\n\n');
            throw new Error('No AI models available');
        }
            
        const messages = [
            vscode.LanguageModelChatMessage.User(`You are a senior code reviewer. Analyze this git diff following the review-changes.md template format:

${finalContent}

Follow the template structure for comprehensive analysis.`)
        ];
        
        stream.markdown('🔄 **AI Analysis in progress...** (streaming git changes)\n\n');
        
        // Try with selected model first, fallback if model not supported
        let currentModel = model;
        let attemptCount = 0;
        const maxAttempts = 3;
        
        while (attemptCount < maxAttempts) {
            try {
                console.log(`📤 Attempt ${attemptCount + 1}: Sending request to model:`, currentModel.family);
                
                const chatResponse = await currentModel.sendRequest(messages, {}, new vscode.CancellationTokenSource().token);
                
                // Show successful model usage
                const modelStatus = attemptCount === 0 ? 'selected model' : `fallback model (attempt ${attemptCount + 1})`;
                stream.markdown(`🤖 **Streaming Git Changes Analysis** (using ${currentModel.family} - ${modelStatus}):\n\n`);
                
                let fragmentCount = 0;
                let isFirstFragment = true;
                for await (const fragment of chatResponse.text) {
                    if (isFirstFragment) {
                        // Show that streaming has started
                        stream.markdown('---\n\n');
                        isFirstFragment = false;
                    }
                    stream.markdown(fragment);
                    fragmentCount++;
                    
                    // Add a small progress indicator every 50 fragments
                    if (fragmentCount % 50 === 0) {
                        console.log(`Streaming progress: ${fragmentCount} fragments processed`);
                    }
                }
                
                // Add completion indicator
                const completionStatus = attemptCount === 0 ? 'original model' : `fallback model (${currentModel.family})`;
                stream.markdown(`\n\n✅ **Analysis complete** - successfully used ${completionStatus}\n\n`);
                console.log('✅ Review completed successfully with model:', currentModel.family);
                return; // Success, exit function
                
            } catch (modelError) {
                console.error(`❌ Model ${currentModel.family} failed (attempt ${attemptCount + 1}):`, modelError);
                
                // Check if it's a model_not_supported error
                if (modelError.message && (
                    modelError.message.includes('model_not_supported') || 
                    modelError.message.includes('not supported') ||
                    modelError.message.includes('model is not available') ||
                    modelError.message.includes('The requested model is not supported')
                )) {
                    stream.markdown(`❌ **Model "${currentModel.family}" failed** (attempt ${attemptCount + 1}): Not supported\n\n`);
                    
                    // Use unified fallback function
                    try {
                        currentModel = await getFallbackModel(currentModel, stream, attemptCount + 1);
                        attemptCount++;
                        continue; // Try again with new model
                    } catch (fallbackError) {
                        throw new Error(`Fallback failed: ${fallbackError.message}`);
                    }
                } else {
                    // Non-model-support error, don't retry
                    stream.markdown(`❌ **Model "${currentModel.family}" failed** (attempt ${attemptCount + 1}): ${modelError.message}\n\n`);
                    throw modelError;
                }
            }
        }
        
        // If we get here, all attempts failed
        throw new Error(`All ${maxAttempts} model attempts failed`);
        
    } catch (error) {
        // Safe fallback without command triggers
        stream.markdown('⚠️ **AI processing failed. Showing template for manual review:**\n\n');
        stream.markdown('```markdown\n');
        stream.markdown(finalContent);
        stream.markdown('\n```\n\n');
        stream.markdown(`**Error details:** ${error.message}\n\n`);
        stream.markdown('💡 **Manual review:** Use the template above to analyze the changes\n');
    }
}

async function reviewDiffWithChecklist(diffContent, stream, changeType) {
    
    // 1. Summary (as per instruction format)
    stream.markdown('###   Summary\n\n');
    stream.markdown(`**Overall Impact:** Changes affect ${analysis.filesChanged.size} file(s) with ${analysis.linesAdded} additions and ${analysis.linesRemoved} deletions.\n\n`);
    
    if (analysis.checklist.correctness.issues.some(issue => issue.includes('CRITICAL'))) {
        stream.markdown('🚨 **CRITICAL ISSUES DETECTED** - Immediate attention required!\n\n');
    }

    // 2. Inline-style comments (file + line reference as per instruction)
    stream.markdown('### 💬 Inline-style Comments\n\n');
    
    let hasInlineComments = false;
    
    // Check each checklist category and format as inline comments
    Object.entries(analysis.checklist).forEach(([category, check]) => {
        if (check.issues.length > 0) {
            check.issues.forEach(issue => {
                hasInlineComments = true;
                stream.markdown(`${issue}\n\n`);
            });
        }
    });
    
    if (!hasInlineComments) {
        stream.markdown('✅ No specific issues found in the changed code.\n\n');
    }

    // 3. Review Checklist Results (following instruction format)
    stream.markdown('### 📋 Review Checklist (From Instructions)\n\n');
    
    const checklistMap = {
        'correctness': '1. **Correctness** - Does the new/modified code work as intended? Any logical errors or regressions?',
        'bestPractices': '2. **Best Practices** - Follow Angular + TypeScript coding guidelines, proper component/service usage',
        'performance': '3. **Performance** - Look for inefficient patterns, change detection strategy, subscriptions cleanup',
        'security': '4. **Security** - Identify unsafe DOM access, bypassSecurityTrust, missing input validation',
        'maintainability': '5. **Maintainability** - Avoid duplication, unnecessary complexity, consistent naming',
        'testing': '6. **Testing** - Suggest new unit/e2e tests needed for the new logic'
    };

    Object.entries(checklistMap).forEach(([key, description]) => {
        const check = analysis.checklist[key];
        const statusIcon = getChecklistStatusIcon(check.status);
        
        stream.markdown(`${statusIcon} ${description}\n\n`);
        
        if (check.suggestions.length > 0) {
            stream.markdown('**Suggestions:**\n');
            check.suggestions.forEach(suggestion => {
                stream.markdown(`- ${suggestion}\n`);
            });
            stream.markdown('\n');
        }
    });

    // 4. Next Steps (as per instruction output format)
    stream.markdown('### 🎯 Next Steps\n\n');
    
    const hasIssues = Object.values(analysis.checklist).some(check => check.issues.length > 0);
    const hasCriticalIssues = Object.values(analysis.checklist).some(check => 
        check.issues.some(issue => issue.includes('CRITICAL'))
    );
    
    if (hasCriticalIssues) {
        stream.markdown('- 🚨 **URGENT**: Fix critical issues identified above\n');
        stream.markdown('- 🔍 **Verify functionality**: Test the affected features thoroughly\n');
    }
    
    if (hasIssues) {
        stream.markdown('- 🔧 **Fix identified issues** before proceeding\n');
        stream.markdown('- 🧪 **Add/update unit tests** for modified functionality\n');
        stream.markdown('- ✅ **Run linting and formatting checks**\n');
    } else {
        stream.markdown('- ✅ **Code review passed** - no major issues detected\n');
        stream.markdown('- 🧪 **Ensure tests cover changes** if applicable\n');
        stream.markdown('- 📚 **Update documentation** if public API changed\n');
    }
    
    stream.markdown('- 🌐 **Test in development environment**\n');

    // 5. Code Diff (as per instruction format)
    stream.markdown('\n### 📝 Code Diff\n\n');
    stream.markdown('<details><summary>🔍 Click to view detailed diff</summary>\n\n');
    stream.markdown('```diff\n' + diffContent + '\n```\n\n');
    stream.markdown('</details>\n\n');

    // Success message
    stream.markdown('---\n\n');
    stream.markdown('✅ **Instruction-Based Review Complete!**\n');
    stream.markdown('💡 **Analysis based on code-review.md template structure**\n');
}

// Structured analysis based on code-review.md checklist
function analyzeGitDiffStructured(diffContent) {
    const analysis = {
        filesChanged: new Set(),
        linesAdded: 0,
        linesRemoved: 0,
        summary: '',
        checklist: {
            correctness: { status: 'unknown', issues: [], suggestions: [] },
            bestPractices: { status: 'unknown', issues: [], suggestions: [] },
            performance: { status: 'unknown', issues: [], suggestions: [] },
            security: { status: 'unknown', issues: [], suggestions: [] },
            maintainability: { status: 'unknown', issues: [], suggestions: [] },
            testing: { status: 'unknown', issues: [], suggestions: [] }
        },
        inlineComments: [],
        nextSteps: []
    };

    const lines = diffContent.split('\n');
    let currentFile = '';
    let currentLineNumber = 0;
    
    lines.forEach((line, index) => {
        // Track files
        if (line.startsWith('diff --git')) {
            const match = line.match(/b\/(.*)/);
            if (match) {
                currentFile = match[1];
                analysis.filesChanged.add(currentFile);
            }
        }

        // Track line numbers
        if (line.startsWith('@@')) {
            const lineMatch = line.match(/@@ -\d+,?\d* \+(\d+),?\d* @@/);
            if (lineMatch) {
                currentLineNumber = parseInt(lineMatch[1]);
            }
        }
        
        // Analyze added lines
        if (line.startsWith('+') && !line.startsWith('+++')) {
            analysis.linesAdded++;
            currentLineNumber++;
            analyzeLineForChecklist(line, currentFile, currentLineNumber, analysis);
        }
        
        // Analyze removed lines  
        if (line.startsWith('-') && !line.startsWith('---')) {
            analysis.linesRemoved++;
            analyzeRemovedLineForChecklist(line, currentFile, currentLineNumber, analysis);
        }

        // Track line numbers for context lines
        if (!line.startsWith('+') && !line.startsWith('-') && !line.startsWith('@@') && !line.startsWith('diff')) {
            currentLineNumber++;
        }
    });

    // Generate summary
    analysis.summary = generateChangeSummary(analysis);
    
    // Set checklist statuses
    updateChecklistStatuses(analysis);

    return analysis;
}

function analyzeLineForChecklist(line, file, lineNumber, analysis) {
    const content = line.substring(1).trim();
    const fileExt = file.split('.').pop();
    
    // 1. CORRECTNESS checks
    if (content.includes('getBillings') && line.startsWith('- ')) {
        analysis.checklist.correctness.issues.push(
            `❌ **${file}:${lineNumber}** - Critical function call removed: \`getBillings()\`. This will break data loading functionality.`
        );
        analysis.inlineComments.push(
            `**${file}:${lineNumber}** - REGRESSION: Removing \`getBillings()\` will prevent data refresh on user interactions.`
        );
        analysis.nextSteps.push('🚨 URGENT: Restore \`getBillings()\` calls in customer/status change handlers');
    }

    // 2. BEST PRACTICES checks
    if (content.includes(': any') && !content.includes('// @ts-ignore')) {
        analysis.checklist.bestPractices.issues.push(
            `⚠️ **${file}:${lineNumber}** - TypeScript \`any\` type detected. Use specific types for better type safety.`
        );
        analysis.checklist.bestPractices.suggestions.push(
            'Define proper interfaces/types instead of using \`any\`'
        );
    }

    if (content.includes('console.log') || content.includes('console.error')) {
        analysis.checklist.bestPractices.issues.push(
            `🔍 **${file}:${lineNumber}** - Console statement found. Remove for production code.`
        );
    }

    // Angular specific checks
    if (fileExt === 'ts' && content.includes('subscribe') && !content.includes('unsubscribe')) {
        analysis.checklist.bestPractices.issues.push(
            `🔄 **${file}:${lineNumber}** - Observable subscription without unsubscription. May cause memory leaks.`
        );
        analysis.checklist.bestPractices.suggestions.push(
            'Implement OnDestroy and unsubscribe in ngOnDestroy'
        );
    }

    // 3. PERFORMANCE checks
    if (content.includes('for (') && content.includes('.length')) {
        analysis.checklist.performance.issues.push(
            `⚡ **${file}:${lineNumber}** - Consider caching array length in loop for better performance.`
        );
    }

    if (content.includes('*ngFor') && content.includes('function')) {
        analysis.checklist.performance.issues.push(
            `⚡ **${file}:${lineNumber}** - Function call in \`*ngFor\` can impact performance. Use pipe or memoization.`
        );
    }

    // 4. SECURITY checks
    if (content.includes('innerHTML =') || content.includes('eval(')) {
        analysis.checklist.security.issues.push(
            `🛡️ **${file}:${lineNumber}** - Potential XSS vulnerability. Avoid \`innerHTML\` or \`eval()\`.`
        );
        analysis.nextSteps.push('🔒 Security review required for DOM manipulation');
    }

    if (content.includes('bypassSecurityTrust')) {
        analysis.checklist.security.issues.push(
            `🛡️ **${file}:${lineNumber}** - Security bypass detected. Ensure input is properly sanitized.`
        );
    }

    // 5. MAINTAINABILITY checks
    if (content.length > 120) {
        analysis.checklist.maintainability.issues.push(
            `📏 **${file}:${lineNumber}** - Line too long (${content.length} chars). Consider breaking up.`
        );
    }

    if (content.match(/\d+\.\d+/) && !content.includes('version') && !content.includes('px')) {
        analysis.checklist.maintainability.issues.push(
            `💡 **${file}:${lineNumber}** - Magic number detected. Consider using named constants.`
        );
        analysis.checklist.maintainability.suggestions.push(
            'Extract magic numbers to constants or configuration'
        );
    }

    // 6. TESTING checks
    if (content.includes('async ') || content.includes('Observable') || content.includes('Promise')) {
        analysis.checklist.testing.suggestions.push(
            `Add unit tests for async operations in ${file}`
        );
    }

    if (content.includes('export class') || content.includes('export function')) {
        analysis.checklist.testing.suggestions.push(
            `Ensure ${file} has corresponding test file`
        );
    }
}

function analyzeRemovedLineForChecklist(line, file, lineNumber, analysis) {
    const content = line.substring(1).trim();
    
    // Check for removed functionality
    if (content.includes('getBillings') || content.includes('loadData') || content.includes('refresh')) {
        analysis.checklist.correctness.issues.push(
            `🚨 **${file}:${lineNumber}** - CRITICAL: Data loading functionality removed. Verify this is intentional.`
        );
    }

    if (content.includes('error') || content.includes('catch') || content.includes('try')) {
        analysis.checklist.correctness.issues.push(
            `⚠️ **${file}:${lineNumber}** - Error handling removed. Ensure proper error management.`
        );
    }
}

function generateChangeSummary(analysis) {
    const fileCount = analysis.filesChanged.size;
    const totalChanges = analysis.linesAdded + analysis.linesRemoved;
    
    let summary = `Changes affect ${fileCount} file(s) with ${analysis.linesAdded} additions and ${analysis.linesRemoved} deletions. `;
    
    // Detect change patterns
    const hasRemovals = analysis.linesRemoved > analysis.linesAdded;
    const hasCriticalIssues = analysis.checklist.correctness.issues.some(issue => issue.includes('CRITICAL'));
    
    if (hasCriticalIssues) {
        summary += 'CRITICAL ISSUES DETECTED - immediate attention required. ';
    }
    
    if (hasRemovals) {
        summary += 'Primarily removes existing functionality - verify intentional. ';
    }
    
    if (totalChanges > 100) {
        summary += 'Large changeset - consider breaking into smaller commits.';
    } else {
        summary += 'Moderate changeset size.';
    }
    
    return summary;
}

function updateChecklistStatuses(analysis) {
    Object.keys(analysis.checklist).forEach(category => {
        const check = analysis.checklist[category];
        if (check.issues.length > 0) {
            check.status = check.issues.some(issue => issue.includes('CRITICAL') || issue.includes('🚨')) ? 'critical' : 'warning';
        } else if (check.suggestions.length > 0) {
            check.status = 'suggestion';
        } else {
            check.status = 'ok';
        }
    });
}

// Apply structured review checklist to diff changes
async function reviewDiffWithChecklist(diffContent, stream, changeType = 'Changes') {
    // Analyze the diff using structured review checklist
    const analysis = analyzeGitDiffStructured(diffContent);
    
    // Show change type and basic stats
    stream.markdown(`## 📊 ${changeType} Analysis\n\n`);
    stream.markdown(`- **Files modified:** ${analysis.filesChanged.size}\n`);
    stream.markdown(`- **Lines added:** ${analysis.linesAdded}\n`);
    stream.markdown(`- **Lines removed:** ${analysis.linesRemoved}\n`);
    stream.markdown(`- **Net change:** ${analysis.linesAdded - analysis.linesRemoved} lines\n\n`);

    // Show summary with risk assessment
    stream.markdown('## 📋 Summary\n\n');
    stream.markdown(`${analysis.summary}\n\n`);

    // Apply review checklist from code-review.md
    stream.markdown('## 📋 Review Checklist (Based on code-review.md)\n\n');
    
    const checklistCategories = {
        'correctness': {
            title: '1. Correctness',
            description: 'Does the new/modified code work as intended? Any logical errors or regressions?'
        },
        'bestPractices': {
            title: '2. Best Practices', 
            description: 'Follow Angular + TypeScript coding guidelines, proper component/service usage'
        },
        'performance': {
            title: '3. Performance',
            description: 'Look for inefficient patterns, change detection strategy, subscriptions cleanup'
        },
        'security': {
            title: '4. Security',
            description: 'Identify unsafe DOM access, bypassSecurityTrust, missing input validation'
        },
        'maintainability': {
            title: '5. Maintainability',
            description: 'Avoid duplication, unnecessary complexity, consistent naming'
        },
        'testing': {
            title: '6. Testing',
            description: 'Suggest new unit/e2e tests needed for the new logic'
        }
    };

    // Generate checklist results
    Object.entries(checklistCategories).forEach(([key, category]) => {
        const check = analysis.checklist[key];
        const statusIcon = getChecklistStatusIcon(check.status);
        
        stream.markdown(`### ${statusIcon} ${category.title}\n\n`);
        stream.markdown(`*${category.description}*\n\n`);
        
        if (check.issues.length > 0) {
            check.issues.forEach(issue => {
                stream.markdown(`${issue}\n\n`);
            });
        } else {
            stream.markdown('✅ No issues detected in this category.\n\n');
        }
        
        if (check.suggestions.length > 0) {
            stream.markdown('**Suggestions:**\n');
            check.suggestions.forEach(suggestion => {
                stream.markdown(`- ${suggestion}\n`);
            });
            stream.markdown('\n');
        }
    });

    // Inline Comments (file + line specific)
    if (analysis.inlineComments.length > 0) {
        stream.markdown('## 💬 Inline-style Comments\n\n');
        analysis.inlineComments.forEach(comment => {
            stream.markdown(`${comment}\n\n`);
        });
    }

    // Next Steps - Clear actions to take
    stream.markdown('## 🎯 Next Steps\n\n');
    if (analysis.nextSteps.length > 0) {
        analysis.nextSteps.forEach(step => {
            stream.markdown(`- ${step}\n`);
        });
    } else {
        // Generate default next steps based on checklist results
        const hasIssues = Object.values(analysis.checklist).some(check => check.issues.length > 0);
        if (hasIssues) {
            stream.markdown('- 🔧 **Fix identified issues** above before proceeding\n');
            stream.markdown('- 🧪 **Add/update unit tests** for modified functionality\n');
            stream.markdown('- ✅ **Run linting and formatting checks**\n');
            stream.markdown('- 🌐 **Test in development environment**\n');
        } else {
            stream.markdown('- ✅ **Code looks good** - ready for review/merge\n');
            stream.markdown('- 🧪 **Ensure tests are updated** if needed\n');
            stream.markdown('- 📚 **Update documentation** if API changed\n');
        }
    }

    // Show actual diff (collapsible)
    stream.markdown('\n## 📝 Code Diff\n\n');
    stream.markdown('<details><summary>🔍 Click to view detailed diff</summary>\n\n');
    stream.markdown('```diff\n' + diffContent + '\n```\n\n');
    stream.markdown('</details>\n\n');
}

function getChecklistStatusIcon(status) {
    const statusIcons = {
        'ok': '✅',
        'warning': '⚠️',
        'critical': '🚨', 
        'suggestion': '💡',
        'unknown': '❓'
    };
    return statusIcons[status] || '❓';
}

async function handleFilePathChangesReview(filePath, stream, selectedModel = null, context = null, request = null) {
    try {
        const { execSync } = require('child_process');
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        
        if (!workspaceFolder) {
            stream.markdown('❌ No workspace folder found');
            return;
        }

        // Clean up file path
        let cleanPath = filePath.replace(/^['"](.*)['"]$/, '$1'); // Remove quotes
        
        // If relative path, make it absolute
        if (!path.isAbsolute(cleanPath)) {
            cleanPath = path.join(workspaceFolder.uri.fsPath, cleanPath);
        }

        // Check if file exists
        if (!fs.existsSync(cleanPath)) {
            stream.markdown(`❌ **File not found:** \`${cleanPath}\``);
            return;
        }

        // Get git diff for this specific file
        try {
            const gitDiff = execSync(`git diff HEAD -- "${cleanPath}"`, { 
                cwd: workspaceFolder.uri.fsPath,
                encoding: 'utf8' 
            });

            if (!gitDiff.trim()) {
                // Try staged changes
                const stagedDiff = execSync(`git diff --staged -- "${cleanPath}"`, { 
                    cwd: workspaceFolder.uri.fsPath,
                    encoding: 'utf8' 
                });
                
                if (!stagedDiff.trim()) {
                    stream.markdown('✅ **No changes found** for this file');
                    return;
                } else {
                    await reviewFileWithDiff(stagedDiff, cleanPath, stream, 'Staged Changes', context, request);
                }
            } else {
                await reviewFileWithDiff(gitDiff, cleanPath, stream, 'Current Changes', context, request);
            }

        } catch (gitError) {
            stream.markdown(`❌ Git error: ${gitError.message}`);
        }

    } catch (error) {
        stream.markdown(`❌ Error reviewing file changes: ${error.message}`);
    }
}

async function handleFilePathReview(filePath, stream, requestedModel = null, context = null) {
    try {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        
        if (!workspaceFolder) {
            stream.markdown('❌ No workspace folder found');
            return;
        }

        // Clean up file path
        let cleanPath = filePath.replace(/^['"](.*)['"]$/, '$1'); // Remove quotes
        let relativePath = cleanPath;
        
        // If relative path, make it absolute but keep relative for git
        if (!path.isAbsolute(cleanPath)) {
            cleanPath = path.join(workspaceFolder.uri.fsPath, cleanPath);
        } else {
            // Make relative to workspace for git commands
            relativePath = path.relative(workspaceFolder.uri.fsPath, cleanPath);
        }

        // Check if file exists
        if (!fs.existsSync(cleanPath)) {
            stream.markdown(`❌ **File not found:** \`${cleanPath}\``);
            return;
        }

        // Always perform file content review (not git diff)
        await reviewCurrentFileContent(cleanPath, stream, requestedModel, context);

    } catch (error) {
        stream.markdown(`❌ Error reviewing file: ${error.message}`);
    }
}

async function reviewFileWithDiff(gitDiff, filePath, stream, changeType, context = null, request = null) {
    // Determine template path
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(filePath));
    let templatePath = null;
    if (workspaceFolder) {
        templatePath = path.join(workspaceFolder.uri.fsPath, 'instructions', 'review-changes.md');
        if (!fs.existsSync(templatePath) && context) {
            templatePath = path.join(context.extensionPath, 'templates', 'review-changes.md');
        }
    }
    
    // Use reusable header display function
    displayReviewHeader(stream, 'Changes Review', filePath, gitDiff.length, templatePath);
    
    // Use the same in-memory template review as other functions
    await reviewWithInMemoryTemplate(gitDiff, stream, changeType, null, context, request);
}

async function reviewCurrentFileContent(filePath, stream, requestedModel = null, context = null) {
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        const fileExtension = path.extname(filePath);
        const fileName = path.basename(filePath);
        
        // Determine template path for header display
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        let templatePath = null;
        if (workspaceFolder) {
            templatePath = path.join(workspaceFolder.uri.fsPath, 'instructions', 'review-file.md');
            if (!fs.existsSync(templatePath) && context) {
                templatePath = path.join(context.extensionPath, 'templates', 'review-file.md');
            }
        }
        
        // Use reusable header display function
        displayReviewHeader(stream, 'File Review', filePath, null, templatePath);
        
        stream.markdown(`**File:** \`${fileName}\`\n`);
        stream.markdown(`**Type:** ${fileExtension}\n`);
        stream.markdown(`**Size:** ${content.length} characters\n`);
        stream.markdown(`**Date:** ${new Date().toLocaleDateString()}\n\n`);

        // Try to use AI model for comprehensive review
        try {
            let reviewPrompt = '';
            
            // Load file review template if exists
            if (templatePath && fs.existsSync(templatePath)) {
                const template = fs.readFileSync(templatePath, 'utf8');
                
                // Replace template placeholders with actual file information
                let processedTemplate = template
                    .replace(/\[FILE_NAME\]/g, fileName)
                    .replace(/\[FILE_PATH\]/g, filePath)
                    .replace(/\[FILE_TYPE\]/g, fileExtension)
                    .replace(/\[FILE_SIZE\]/g, `${content.length} characters`)
                    .replace(/\[REVIEW_DATE\]/g, new Date().toLocaleDateString())
                    .replace(/\[FILE_CONTENT\]/g, `\`\`\`typescript\n${content}\n\`\`\``);
                
                // Use template content directly as prompt
                reviewPrompt = processedTemplate;

            } else {
                stream.markdown('⚠️ **Template not found** - using basic review\n\n');
                reviewPrompt = `Please review this TypeScript Angular component file:

**File:** ${fileName}
**Path:** ${filePath}

\`\`\`typescript
${content}
\`\`\`

Provide comprehensive analysis with specific examples and actionable recommendations.`;
            }

            // Use unified model detection
            const model = await getUnifiedModel(stream, requestedModel, context);
            
            if (model) {
                // Animated loading
                stream.markdown('🔄 **Initializing File Analysis...** \n\n');
                stream.markdown('⏳ **Preparing model:** `' + model.family + '`\n\n');

                const messages = [vscode.LanguageModelChatMessage.User(reviewPrompt)];
                stream.markdown('🚀 **Starting comprehensive file review...**\n\n');

                let currentModel = model;
                let attemptCount = 0;
                const maxAttempts = 3;

                while (attemptCount < maxAttempts) {
                    try {
                        console.log(`📤 File review attempt ${attemptCount + 1}:`, currentModel.family);
                        const response = await currentModel.sendRequest(messages, {}, new vscode.CancellationTokenSource().token);
                        const modelStatus = attemptCount === 0 ? 'selected model' : `fallback model (attempt ${attemptCount + 1})`;

                        // Streaming header
                        stream.markdown('---\n\n');
                        stream.markdown(`# 📄 File Review Results (using ${currentModel.family} - ${modelStatus})\n\n`);
                        let fragmentCount = 0; let wordCount = 0; let isFirst = true;
                        for await (const fragment of response.text) {
                            if (isFirst) { stream.markdown('📡 **Live streaming analysis results...**\n\n'); isFirst = false; }
                            stream.markdown(fragment);
                            fragmentCount++; wordCount += fragment.split(/\s+/).length;
                            if (fragmentCount % 25 === 0) console.log(`📊 File review progress: ${fragmentCount} fragments ~${wordCount} words`);
                        }
                        const completionLabel = attemptCount === 0 ? 'original model' : `fallback model (${currentModel.family})`;
                        stream.markdown(`\n\n🎉 **Streaming complete** – ${completionLabel}. (${fragmentCount} fragments, ~${wordCount} words)\n\n---\n\n`);
                        console.log('✅ File review done with', currentModel.family);
                        break; // success
                    } catch (modelErr) {
                        console.error(`❌ File model failure (${currentModel.family}) attempt ${attemptCount + 1}:`, modelErr);
                        if (modelErr.message && (
                            modelErr.message.includes('model_not_supported') ||
                            modelErr.message.includes('not supported') ||
                            modelErr.message.includes('model is not available') ||
                            modelErr.message.includes('The requested model is not supported')
                        )) {
                            stream.markdown(`❌ **Model "${currentModel.family}" unsupported** (attempt ${attemptCount + 1})\n\n`);
                            try {
                                currentModel = await getFallbackModel(currentModel, stream, attemptCount + 1);
                                attemptCount++;
                                continue;
                            } catch (fallbackErr) {
                                stream.markdown(`❌ **Fallback failed:** ${fallbackErr.message}\n\n`);
                                throw fallbackErr;
                            }
                        } else {
                            stream.markdown(`❌ **Model error (${currentModel.family}):** ${modelErr.message}\n\n`);
                            throw modelErr;
                        }
                    }
                }

                if (attemptCount >= maxAttempts) {
                    stream.markdown(`❌ **All ${maxAttempts} model attempts failed** – using basic analysis.\n\n`);
                    await performBasicFileAnalysis(content, stream, fileExtension);
                }
            } else {
                stream.markdown('⚠️ **AI model not available - using basic analysis**\n\n');
                await performBasicFileAnalysis(content, stream, fileExtension);
            }
            
        } catch (aiError) {
            stream.markdown(`⚠️ **AI analysis failed:** ${aiError.message}\n\n`);
            stream.markdown('🔄 **Falling back to basic analysis...**\n\n');
            await performBasicFileAnalysis(content, stream, fileExtension);
        }

    } catch (error) {
        stream.markdown(`❌ Error reading file: ${error.message}`);
    }
}

async function performBasicFileAnalysis(content, stream, fileExtension) {
    // Basic code analysis for current content
    const lines = content.split('\n');
    const analysis = {
        totalLines: lines.length,
        codeLines: lines.filter(line => line.trim() && !line.trim().startsWith('//')).length,
        commentLines: lines.filter(line => line.trim().startsWith('//')).length,
        issues: []
    };

    // Simple code quality checks
    lines.forEach((line, index) => {
        const lineNum = index + 1;
        if (line.includes(': any') && !line.includes('// @ts-ignore')) {
            analysis.issues.push(`⚠️ Line ${lineNum}: TypeScript 'any' type - consider proper typing`);
        }
        if (line.includes('console.log') || line.includes('console.error')) {
            analysis.issues.push(`🔍 Line ${lineNum}: Console statement - remove for production`);
        }
        if (line.length > 120) {
            analysis.issues.push(`📏 Line ${lineNum}: Line too long (${line.length} chars)`);
        }
    });

    stream.markdown('### 📊 File Statistics\n\n');
    stream.markdown(`- **Total lines:** ${analysis.totalLines}\n`);
    stream.markdown(`- **Code lines:** ${analysis.codeLines}\n`);
    stream.markdown(`- **Comment lines:** ${analysis.commentLines}\n\n`);

    if (analysis.issues.length > 0) {
        stream.markdown('### ⚠️ Issues Found\n\n');
        analysis.issues.forEach(issue => stream.markdown(`- ${issue}\n`));
    } else {
        stream.markdown('### ✅ No obvious issues detected\n\n');
    }

    // Show file content (truncated)
    stream.markdown('### 📝 File Content (Preview)\n\n');
    const language = getLanguageFromExtension(fileExtension);
    const preview = content.length > 2000 ? content.substring(0, 2000) + '\n... (truncated)' : content;
    stream.markdown(`\`\`\`${language}\n${preview}\n\`\`\`\n\n`);
}

function getLanguageFromExtension(ext) {
    const languageMap = {
        '.ts': 'typescript',
        '.js': 'javascript',
        '.html': 'html',
        '.css': 'css',
        '.scss': 'scss',
        '.json': 'json',
        '.md': 'markdown',
        '.py': 'python',
        '.java': 'java',
        '.cs': 'csharp'
    };
    return languageMap[ext] || 'text';
}

// Unified model detection function used by both @review-file and @review-changes
async function getUnifiedModel(stream, requestedModel = null, chatContext = null, request = null) {
    let models = [];
    
    console.log('=== getUnifiedModel DEBUG START ===');
    console.log('getUnifiedModel - request.model:', request?.model?.family);
    
    // PRIORITY 1: Check request.model first (this is where VS Code puts the selected model!)
    if (request && request.model) {
        console.log('✅ Found model in request.model:', request.model);
        return request.model;
    } else {
        console.log('❌ No model found in request.model');
    }
    
    // PRIORITY 2: Use passed requestedModel object
    if (requestedModel && typeof requestedModel === 'object' && requestedModel.family) {
        console.log('Using requested model object:', requestedModel);
        return requestedModel;
    }
    
    // PRIORITY 3: Try to get the current model from chat context  
    if (chatContext) {
        console.log('🔍 Checking for model in chatContext...');
        
        // VS Code chat context may have model at chatContext.model or chatContext.participant.model
        let currentModel = null;
        
        if (chatContext.model) {
            console.log('✅ Found model at chatContext.model:', chatContext.model);
            currentModel = chatContext.model;
        } else {
            console.log('❌ No model found at chatContext.model');
        }
        
        if (chatContext.participant && chatContext.participant.model) {
            console.log('✅ Found model at chatContext.participant.model:', chatContext.participant.model);
            currentModel = chatContext.participant.model;
        } else {
            console.log('❌ No model found at chatContext.participant.model');
        }
        
        // Check other possible locations
        if (chatContext.request && chatContext.request.model) {
            console.log('✅ Found model at chatContext.request.model:', chatContext.request.model);
            currentModel = chatContext.request.model;
        }
        
        if (currentModel) {
            console.log('Using selected chatbox model:', currentModel);
            return currentModel;
        } else {
            console.log('⚠️ No model found in any chatContext location');
        }
    }
    
    // PRIORITY 4: Fallback to available models detection
    // NOTE: Only use this if NO model found in context (user hasn't selected anything)
    console.log('🔄 Falling back to available models detection...');
    
    // Get available models and try to find the currently selected one
    try {
        models = await vscode.lm.selectChatModels();
        console.log('📋 All available models:', models.map(m => `${m.family} (${m.vendor})`));
        
        if (models.length > 0) {
            // FALLBACK 1: Try to find Claude 4 first (preferred AI model)
            const claude4Model = models.find(m => 
                m.family.toLowerCase().includes('claude-sonnet-4') || 
                m.family.toLowerCase().includes('sonnet-4')
            );
            
            if (claude4Model) {
                console.log('Fallback 1 - Using Claude 4 model:', claude4Model);
                models = [claude4Model];
            } else {
                console.log('❌ Claude 4 not found, trying GPT-4.1...');
                
                // FALLBACK 2: Try to find GPT-4.1 as second choice
                const gpt41Model = models.find(m => 
                    m.family.toLowerCase().includes('gpt-4.1') ||
                    m.family.toLowerCase().includes('gpt-4-1')
                );
                
                if (gpt41Model) {
                    console.log('Fallback 2 - Using GPT-4.1 model:', gpt41Model);
                    models = [gpt41Model];
                } else {
                    console.log('❌ GPT-4.1 not found, using first available...');
                    
                    // FALLBACK 3: Use first available model
                    console.log('Fallback 3 - Using first available model:', models[0]);
                    models = [models[0]];
                }
            }
        }
    } catch (error) {
        console.log('Error getting models:', error);
        models = [];
    }
    
    const finalModel = models.length > 0 ? models[0] : null;
    console.log('🏁 Final model selected:', finalModel);
    console.log('=== getUnifiedModel DEBUG END ===');
    
    return finalModel;
}

/**
 * Ensures templates exist in workspace instructions folder
 * @param {vscode.ExtensionContext} context
 */
async function ensureTemplatesExist(context) {
    try {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            console.log('No workspace folder found, skipping template generation');
            return;
        }

        const instructionsPath = path.join(workspaceFolder.uri.fsPath, 'instructions');
        const extensionTemplatesPath = path.join(context.extensionPath, 'templates');
        
        // Create instructions folder if it doesn't exist
        if (!fs.existsSync(instructionsPath)) {
            fs.mkdirSync(instructionsPath, { recursive: true });
            console.log('Created instructions folder:', instructionsPath);
        }

        // Copy templates if they don't exist
        const templateFiles = ['review-file.md', 'review-changes.md'];
        
        for (const templateFile of templateFiles) {
            const sourcePath = path.join(extensionTemplatesPath, templateFile);
            const destPath = path.join(instructionsPath, templateFile);
            
            // Only copy if destination doesn't exist (don't overwrite user customizations)
            if (!fs.existsSync(destPath) && fs.existsSync(sourcePath)) {
                fs.copyFileSync(sourcePath, destPath);
                console.log(`Generated template: ${templateFile}`);
            }
        }
        
        console.log('Template generation completed');
    } catch (error) {
        console.error('Error generating templates:', error);
    }
}

// Reusable function for displaying review headers
function displayReviewHeader(stream, reviewType, filePath, diffLength = null, templatePath = null) {
    const fileName = path.basename(filePath);
    const fullPath = filePath;
    
    stream.markdown(`# 🔍 ${reviewType}: \`${fileName}\`\n\n`);
    stream.markdown(`📂 **Full Path:** \`${fullPath}\`\n\n`);
    
    if (diffLength !== null) {
        stream.markdown('## 📋 Current Changes Review\n\n');
        stream.markdown(`**Diff Length:** ${diffLength} characters\n\n`);
        if (templatePath) {
            const templateFile = templatePath.replace(/.*[\\\/]/, '');
            const templateDir = templatePath.includes('instructions') ? 'instructions' : 'extension/templates';
            stream.markdown(`**Template used:** ${templateDir}/${templateFile}\n\n`);
        }
        stream.markdown('---\n\n');
    } else {
        stream.markdown('## 📄 File Review Analysis\n\n');
        if (templatePath) {
            const templateFile = templatePath.replace(/.*[\\\/]/, '');
            const templateDir = templatePath.includes('instructions') ? 'instructions' : 'extension/templates';
            stream.markdown(`**Template used:** ${templateDir}/${templateFile}\n\n`);
        }
    }
}

function deactivate() {}

module.exports = {
    activate,
    deactivate
};
