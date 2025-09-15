const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
    console.log('Review Helper extension is now active!');
    
    // Auto-generate templates on first run
    ensureTemplatesExist(context);

    // Register new commands for different review modes
    let reviewGitChanges = vscode.commands.registerCommand('reviewHelper.reviewGitChanges', async () => {
        await reviewCurrentGitChanges();
    });

    let reviewActiveFile = vscode.commands.registerCommand('reviewHelper.reviewActiveFile', async () => {
        await reviewActiveEditor();
    });

    let reviewWorkspace = vscode.commands.registerCommand('reviewHelper.reviewWorkspace', async () => {
        await reviewWorkspaceChanges();
    });

    // Register confirmation commands for chat buttons
    let confirmChangesReview = vscode.commands.registerCommand('reviewHelper.confirmChangesReview', async (filePath) => {
        // Open chat and trigger changes review for the specific file
        await vscode.commands.executeCommand('workbench.panel.chat.view.copilot.focus');
        // Send the file path to @review-changes
        await vscode.commands.executeCommand('workbench.action.chat.open', {
            query: `@review-changes ${filePath}`
        });
    });

    let confirmFileReview = vscode.commands.registerCommand('reviewHelper.confirmFileReview', async (filePath) => {
        // Open chat and trigger file review for the specific file
        await vscode.commands.executeCommand('workbench.panel.chat.view.copilot.focus');
        // Send the file path to @review-file
        await vscode.commands.executeCommand('workbench.action.chat.open', {
            query: `@review-file ${filePath}`
        });
    });

    let showChangesHelp = vscode.commands.registerCommand('reviewHelper.showChangesHelp', async () => {
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

    let showFileHelp = vscode.commands.registerCommand('reviewHelper.showFileHelp', async () => {
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
                    const fileName = path.basename(activeEditor.document.fileName);
                    stream.markdown('# 🔍 Code Review Assistant\n\n');
                    stream.markdown(`**Current file:** \`${fileName}\`\n\n`);
                    
                    // Create Yes/No buttons for confirmation
                    stream.button({
                        command: 'reviewHelper.confirmChangesReview',
                        title: `✅ Yes, review changes in ${fileName}`,
                        arguments: [activeEditor.document.fileName]
                    });
                    
                    stream.markdown('\n');
                    
                    stream.button({
                        command: 'reviewHelper.showChangesHelp',
                        title: '❌ No, show help instead',
                        arguments: []
                    });
                    
                    stream.markdown('\n\n');
                    stream.markdown(`**Question:** Do you want to review git changes for \`${fileName}\`?\n\n`);
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
                    const fileName = path.basename(activeEditor.document.fileName);
                    stream.markdown('# 📁 File Review Assistant\n\n');
                    stream.markdown(`**Current file:** \`${fileName}\`\n\n`);
                    
                    // Create Yes/No buttons for confirmation
                    stream.button({
                        command: 'reviewHelper.confirmFileReview',
                        title: `✅ Yes, review file ${fileName}`,
                        arguments: [activeEditor.document.fileName]
                    });
                    
                    stream.markdown('\n');
                    
                    stream.button({
                        command: 'reviewHelper.showFileHelp',
                        title: '❌ No, show help instead',
                        arguments: []
                    });
                    
                    stream.markdown('\n\n');
                    stream.markdown(`**Question:** Do you want to review the file \`${fileName}\`?\n\n`);
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

    // #region Azure DevOps PR Review Feature - DISABLED
    /*
    // Register Azure DevOps PR Review chat participant
    const reviewPRParticipant = vscode.chat.createChatParticipant('review-pr', async (request, context, stream, token) => {
        try {
            const prUrl = request.prompt.trim();
            
            if (!prUrl.includes('dev.azure.com')) {
                stream.markdown('❌ **Invalid URL:** Please provide an Azure DevOps PR URL\n\n');
                stream.markdown('**Example Usage:**\n');
                stream.markdown('```\n@review-pr https://dev.azure.com/myorg/myproject/_git/myrepo/pullrequest/123\n```\n\n');
                stream.markdown('**Setup Instructions:**\n');
                stream.markdown('1. Configure your Azure DevOps Personal Access Token in VS Code Settings\n');
                stream.markdown('2. Go to Settings (Ctrl/Cmd + ,) → Search "azure devops"\n');
                stream.markdown('3. Set your token and organization details\n\n');
                return;
            }
            
            await handleAzureDevOpsPRReview(prUrl, stream, context, request);
            
        } catch (error) {
            stream.markdown(`❌ **Error:** ${error.message}\n\n`);
            stream.markdown('**Common Issues:**\n');
            stream.markdown('- Invalid Personal Access Token\n');
            stream.markdown('- Insufficient permissions (need Code: Read, Pull Request: Read)\n');
            stream.markdown('- Invalid PR URL format\n');
            stream.markdown('- Network connectivity issues\n\n');
            console.error('Azure DevOps PR Review error:', error);
        }
    });
    
    reviewPRParticipant.iconPath = vscode.Uri.file(path.join(context.extensionPath, 'icon.svg'));
    */
    // #endregion Azure DevOps PR Review Feature - DISABLED

    context.subscriptions.push(
        reviewGitChanges, 
        reviewActiveFile, 
        reviewWorkspace, 
        confirmChangesReview,
        confirmFileReview,
        showChangesHelp,
        showFileHelp,
        reviewChangesParticipant, 
        reviewFileParticipant,
        // reviewPRParticipant
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
                
                const aiPrompt = `Please analyze this ${language} code and provide specific suggestions for improvement:

\`\`\`${language}
${code}
\`\`\`

Focus on:
- Code quality and best practices
- Potential bugs or issues
- Performance optimizations
- Security concerns
- Maintainability improvements

Provide actionable feedback with specific examples.`;

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
            vscode.LanguageModelChatMessage.User(`You are a code reviewer analyzing an Azure DevOps Pull Request. Review the provided diff information and give a concise assessment.

DIFF CONTENT:
${diffContent}

**Format your response EXACTLY like this:**

## 📝 REVIEW SUMMARY

**Files Modified:**
• [Only list actual changed files with extensions, NOT folders]
• [One file per line with full path]
• [Example: src/app/component.ts]

**Commit Analysis (Based on Messages):**
1. **Brief description** - What was changed
2. **Brief description** - What was changed  
3. **Brief description** - What was changed

**Quick Assessment:**
- ✅ Positive aspects (1-2 points)
- ⚠️ Concerns (1-2 points)  
- 🎯 Recommendations (1-2 points)

**Score: X/10**

Keep it simple - analyze the diff data and provide a concise summary.`)
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
    stream.markdown('### � Summary\n\n');
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
                reviewPrompt = `Please review this TypeScript Angular component file for code quality, best practices, security, and maintainability:

**File:** ${fileName}
**Path:** ${filePath}

\`\`\`typescript
${content}
\`\`\`

Focus on:
1. Code quality and organization
2. Performance optimizations  
3. Security considerations
4. Best practices adherence
5. Testing and maintainability
6. Architecture improvements

Provide specific examples and actionable recommendations.`;
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

// #region Azure DevOps PR Review Functions

/**
 * Get Azure DevOps configuration from VS Code settings
 * @returns {Object} Configuration object with token, organization, and default project
 */
function getAzureDevOpsConfig() {
    const config = vscode.workspace.getConfiguration('aiCodeReviewer.azureDevOps');
    return {
        token: config.get('personalAccessToken'),
        organization: config.get('organization'),
        defaultProject: config.get('defaultProject')
    };
}

/**
 * Parse Azure DevOps PR URL to extract organization, project, repository, and PR ID
 * @param {string} url - Azure DevOps PR URL
 * @returns {Object} Parsed PR information
 */
function parseAzureDevOpsPRUrl(url) {
    // Parse: https://dev.azure.com/{org}/{project}/_git/{repo}/pullrequest/{prId}
    const match = url.match(/https:\/\/dev\.azure\.com\/([^\/]+)\/([^\/]+)\/_git\/([^\/]+)\/pullrequest\/(\d+)/);
    
    if (!match) {
        throw new Error('Invalid Azure DevOps PR URL format. Expected: https://dev.azure.com/{org}/{project}/_git/{repo}/pullrequest/{prId}');
    }
    
    return {
        organization: match[1],
        project: match[2],
        repository: match[3],
        prId: match[4]
    };
}

/**
 * Fetch Pull Request data from Azure DevOps REST API
 * @param {Object} prInfo - Parsed PR information
 * @param {string} token - Personal Access Token
 * @returns {Object} PR data from Azure DevOps API
 */
async function fetchAzureDevOpsPR(prInfo, token) {
    const { organization, project, repository, prId } = prInfo;
    const url = `https://dev.azure.com/${organization}/${project}/_apis/git/repositories/${repository}/pullrequests/${prId}?api-version=7.0`;
    
    const response = await fetch(url, {
        headers: {
            'Authorization': `Basic ${Buffer.from(`:${token}`).toString('base64')}`,
            'Content-Type': 'application/json'
        }
    });
    
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Azure DevOps API error: ${response.status} ${response.statusText} - ${errorText}`);
    }
    
    return await response.json();
}

/**
 * Create git diff format from two file contents
 * @param {string} filePath - File path
 * @param {string} oldContent - Content from target branch (empty for new files)
 * @param {string} newContent - Content from source branch  
 * @param {string} changeType - Azure DevOps change type (add, edit, delete)
 * @returns {string} Git diff format string
 */
function createGitDiffFromContent(filePath, oldContent, newContent, changeType) {
    let diff = `diff --git a/${filePath} b/${filePath}\n`;
    
    if (changeType === 'add') {
        // New file
        diff += `new file mode 100644\n`;
        diff += `index 0000000..${Math.random().toString(36).substring(2, 9)}\n`;
        diff += `--- /dev/null\n`;
        diff += `+++ b/${filePath}\n`;
        
        const newLines = newContent.split('\n');
        diff += `@@ -0,0 +1,${newLines.length} @@\n`;
        
        newLines.forEach(line => {
            diff += `+${line}\n`;
        });
        
    } else if (changeType === 'delete') {
        // Deleted file
        diff += `deleted file mode 100644\n`;
        diff += `index ${Math.random().toString(36).substring(2, 9)}..0000000\n`;
        diff += `--- a/${filePath}\n`;
        diff += `+++ /dev/null\n`;
        
        const oldLines = oldContent.split('\n');
        diff += `@@ -1,${oldLines.length} +0,0 @@\n`;
        
        oldLines.forEach(line => {
            diff += `-${line}\n`;
        });
        
    } else {
        // Modified file - create proper unified diff
        diff += `index ${Math.random().toString(36).substring(2, 7)}..${Math.random().toString(36).substring(2, 7)} 100644\n`;
        diff += `--- a/${filePath}\n`;
        diff += `+++ b/${filePath}\n`;
        
        // Simple line-by-line comparison (can be improved with proper diff algorithm)
        const oldLines = oldContent.split('\n');
        const newLines = newContent.split('\n');
        
        const maxLines = Math.max(oldLines.length, newLines.length);
        const contextSize = 3;
        
        let i = 0;
        while (i < maxLines) {
            // Find first difference
            while (i < maxLines && oldLines[i] === newLines[i]) {
                i++;
            }
            
            if (i >= maxLines) break;
            
            // Found difference, create hunk
            const hunkStart = Math.max(0, i - contextSize);
            let hunkEnd = i;
            
            // Extend hunk to include all consecutive changes
            while (hunkEnd < maxLines && (
                hunkEnd < oldLines.length && hunkEnd < newLines.length 
                    ? oldLines[hunkEnd] !== newLines[hunkEnd]
                    : true
            )) {
                hunkEnd++;
            }
            
            hunkEnd = Math.min(maxLines, hunkEnd + contextSize);
            
            // Create hunk header
            const oldHunkSize = Math.min(hunkEnd, oldLines.length) - hunkStart;
            const newHunkSize = Math.min(hunkEnd, newLines.length) - hunkStart;
            diff += `@@ -${hunkStart + 1},${oldHunkSize} +${hunkStart + 1},${newHunkSize} @@\n`;
            
            // Add context and changes
            for (let j = hunkStart; j < hunkEnd; j++) {
                if (j < i - contextSize || j >= i + (hunkEnd - i - contextSize)) {
                    // Context line
                    const line = j < oldLines.length ? oldLines[j] : (j < newLines.length ? newLines[j] : '');
                    diff += ` ${line}\n`;
                } else {
                    // Changed lines
                    if (j < oldLines.length) {
                        diff += `-${oldLines[j]}\n`;
                    }
                    if (j < newLines.length) {
                        diff += `+${newLines[j]}\n`;
                    }
                }
            }
            
            i = hunkEnd;
        }
    }
    
    return diff;
}

/**
 * Fetch Pull Request changes from Azure DevOps REST API
 * @param {Object} prInfo - Parsed PR information  
 * @param {string} token - Personal Access Token
 * @returns {string} Git diff format string
 */
async function fetchAzureDevOpsPRDiff(prInfo, token) {
    const { organization, project, repository, prId } = prInfo;
    
    try {
        console.log('🚀 Starting PR diff fetch using NEW file content approach:', { organization, project, repository, prId });
        
        // NEW METHOD V2: Use Git commits API to get actual changes
        try {
            console.log('🎯 NEW METHOD V2: Git commits API approach...');
            
            // Step 1: Get PR data
            const prData = await fetchAzureDevOpsPR(prInfo, token);
            console.log('PR data retrieved:', {
                sourceRef: prData.sourceRefName,
                targetRef: prData.targetRefName,
                lastMergeSourceCommit: prData.lastMergeSourceCommit?.commitId,
                lastMergeTargetCommit: prData.lastMergeTargetCommit?.commitId
            });
            
            // Step 2: Get commits in PR
            const commitsUrl = `https://dev.azure.com/${organization}/${project}/_apis/git/repositories/${repository}/pullrequests/${prId}/commits?api-version=7.0`;
            console.log('📂 Fetching PR commits...');
            
            const commitsResponse = await fetch(commitsUrl, {
                headers: {
                    'Authorization': `Basic ${Buffer.from(`:${token}`).toString('base64')}`,
                    'Content-Type': 'application/json'
                }
            });
            
            if (!commitsResponse.ok) {
                throw new Error(`Failed to get PR commits: ${commitsResponse.status} ${commitsResponse.statusText}`);
            }
            
            const commitsData = await commitsResponse.json();
            console.log(`📊 Found ${commitsData.value?.length || 0} commits in PR`);
            
            if (commitsData.value && commitsData.value.length > 0) {
                let gitDiff = '';
                
                // Step 3: Get changes for each commit
                for (const [index, commit] of commitsData.value.slice(0, 5).entries()) { // Limit to 5 commits
                    console.log(`📄 [${index + 1}] Processing commit: ${commit.commitId.substring(0, 8)} - ${commit.comment}`);
                    
                    try {
                        // Get changes for this commit
                        const commitChangesUrl = `https://dev.azure.com/${organization}/${project}/_apis/git/repositories/${repository}/commits/${commit.commitId}/changes?api-version=7.0`;
                        
                        const commitChangesResponse = await fetch(commitChangesUrl, {
                            headers: {
                                'Authorization': `Basic ${Buffer.from(`:${token}`).toString('base64')}`,
                                'Content-Type': 'application/json'
                            }
                        });
                        
                        if (commitChangesResponse.ok) {
                            const commitChangesData = await commitChangesResponse.json();
                            console.log(`  ✅ Found ${commitChangesData.changes?.length || 0} file changes in commit`);
                            
                            if (commitChangesData.changes && commitChangesData.changes.length > 0) {
                                gitDiff += `\n# Commit: ${commit.commitId.substring(0, 8)} - ${commit.comment}\n`;
                                gitDiff += `# Author: ${commit.author?.name} <${commit.author?.email}>\n`;
                                gitDiff += `# Date: ${new Date(commit.author?.date).toLocaleString()}\n\n`;
                                
                                for (const change of commitChangesData.changes.slice(0, 10)) { // Limit files per commit
                                    const filePath = change.item?.path || 'unknown';
                                    
                                    gitDiff += `diff --git a/${filePath} b/${filePath}\n`;
                                    
                                    if (change.changeType === 'add') {
                                        gitDiff += `new file mode 100644\n`;
                                        gitDiff += `index 0000000..${change.item?.objectId?.substring(0, 7)}\n`;
                                        gitDiff += `--- /dev/null\n`;
                                        gitDiff += `+++ b/${filePath}\n`;
                                    } else if (change.changeType === 'delete') {
                                        gitDiff += `deleted file mode 100644\n`;
                                        gitDiff += `index ${change.item?.objectId?.substring(0, 7)}..0000000\n`;
                                        gitDiff += `--- a/${filePath}\n`;
                                        gitDiff += `+++ /dev/null\n`;
                                    } else {
                                        gitDiff += `index ${change.originalObjectId?.substring(0, 7)}..${change.item?.objectId?.substring(0, 7)} 100644\n`;
                                        gitDiff += `--- a/${filePath}\n`;
                                        gitDiff += `+++ b/${filePath}\n`;
                                    }
                                    
                                    gitDiff += `@@ -1,1 +1,1 @@\n`;
                                    gitDiff += ` // ${change.changeType}: ${filePath}\n`;
                                    gitDiff += ` // Object ID: ${change.item?.objectId?.substring(0, 8)}\n`;
                                    gitDiff += ` // Size: ${change.item?.size || 'unknown'} bytes\n`;
                                    gitDiff += `\n`;
                                }
                            }
                        } else {
                            console.log(`  ❌ Failed to get commit changes: ${commitChangesResponse.status}`);
                        }
                    } catch (commitError) {
                        console.log(`  ❌ Error processing commit ${commit.commitId}:`, commitError.message);
                    }
                }
                
                if (gitDiff.trim()) {
                    console.log('✅ NEW METHOD V2 SUCCESS: Created git diff from commits API!');
                    console.log(`📏 Total diff size: ${gitDiff.length} characters`);
                    return gitDiff;
                } else {
                    console.log('❌ NEW METHOD V2: No diff content generated from commits');
                }
            }
            
        } catch (newMethodV2Error) {
            console.log('❌ NEW METHOD V2 failed:', newMethodV2Error.message);
        }
        
        console.log('🔄 Falling back to old methods...');
        console.log('Starting PR diff fetch for:', { organization, project, repository, prId });
        
        // Method 0: Try PR comparison API (NEW)
        try {
            console.log('Method 0: Trying PR comparison API...');
            const prData = await fetchAzureDevOpsPR(prInfo, token);
            
            if (prData.sourceRefName && prData.targetRefName) {
                const sourceBranch = prData.sourceRefName.replace('refs/heads/', '');
                const targetBranch = prData.targetRefName.replace('refs/heads/', '');
                
                console.log(`Comparing ${targetBranch}...${sourceBranch}`);
                
                const compareUrl = `https://dev.azure.com/${organization}/${project}/_apis/git/repositories/${repository}/diffs/commits?baseVersion=${targetBranch}&targetVersion=${sourceBranch}&api-version=7.0`;
                
                const compareResponse = await fetch(compareUrl, {
                    headers: {
                        'Authorization': `Basic ${Buffer.from(`:${token}`).toString('base64')}`,
                        'Content-Type': 'application/json'
                    }
                });
                
                if (compareResponse.ok) {
                    const compareData = await compareResponse.json();
                    console.log('Branch comparison data:', JSON.stringify(compareData, null, 2));
                    
                    if (compareData.changes && compareData.changes.length > 0) {
                        return convertBranchComparisonToGitFormat(compareData);
                    }
                }
            }
        } catch (error) {
            console.log('Method 0 failed:', error.message);
        }
        
        // Method 0.5: Try getting file list first, then individual diffs
        try {
            console.log('Method 0.5: Trying file list approach...');
            const filesUrl = `https://dev.azure.com/${organization}/${project}/_apis/git/repositories/${repository}/pullrequests/${prId}/iterations/1/changes?api-version=7.0`;
            
            const filesResponse = await fetch(filesUrl, {
                headers: {
                    'Authorization': `Basic ${Buffer.from(`:${token}`).toString('base64')}`,
                    'Content-Type': 'application/json'
                }
            });
            
            if (filesResponse.ok) {
                const filesData = await filesResponse.json();
                console.log('Files list data:', JSON.stringify(filesData, null, 2));
                
                if (filesData.changeEntries && filesData.changeEntries.length > 0) {
                    let allDiffs = '';
                    
                    // Get detailed diff for each file
                    for (const change of filesData.changeEntries.slice(0, 5)) { // Limit to first 5 files
                        const filePath = change.item.path;
                        console.log(`Getting diff for file: ${filePath}`);
                        
                        // Try different APIs for this specific file
                        const fileVersionsUrl = `https://dev.azure.com/${organization}/${project}/_apis/git/repositories/${repository}/items?path=${encodeURIComponent(filePath)}&includeContent=true&api-version=7.0`;
                        
                        try {
                            const fileResponse = await fetch(fileVersionsUrl, {
                                headers: {
                                    'Authorization': `Basic ${Buffer.from(`:${token}`).toString('base64')}`,
                                    'Content-Type': 'application/json'
                                }
                            });
                            
                            if (fileResponse.ok) {
                                const fileData = await fileResponse.json();
                                console.log(`File ${filePath} data:`, JSON.stringify(fileData, null, 2));
                                
                                // Create a simple diff entry
                                allDiffs += `diff --git a${filePath} b${filePath}\n`;
                                allDiffs += `index unknown..unknown 100644\n`;
                                allDiffs += `--- a${filePath}\n`;
                                allDiffs += `+++ b${filePath}\n`;
                                allDiffs += `@@ -1,1 +1,1 @@\n`;
                                allDiffs += `+// File modified: ${filePath}\n`;
                                allDiffs += `+// Change type: ${change.changeType}\n`;
                                
                                if (fileData.content) {
                                    const content = fileData.content.substring(0, 500);
                                    allDiffs += `+// Current content preview:\n`;
                                    content.split('\n').slice(0, 10).forEach(line => {
                                        allDiffs += `+// ${line}\n`;
                                    });
                                }
                                allDiffs += '\n';
                            }
                        } catch (fileError) {
                            console.log(`Error fetching file ${filePath}:`, fileError.message);
                        }
                    }
                    
                    if (allDiffs) {
                        return allDiffs;
                    }
                }
            }
        } catch (error) {
            console.log('Method 0.5 failed:', error.message);
        }
        // Method 1: Try to get the actual diff from Azure DevOps Git API
        const gitDiffUrl = `https://dev.azure.com/${organization}/${project}/_apis/git/repositories/${repository}/pullrequests/${prId}/commits?api-version=7.0`;
        
        try {
            const commitsResponse = await fetch(gitDiffUrl, {
                headers: {
                    'Authorization': `Basic ${Buffer.from(`:${token}`).toString('base64')}`,
                    'Content-Type': 'application/json'
                }
            });
            
            if (commitsResponse.ok) {
                const commits = await commitsResponse.json();
                console.log('Commits response:', JSON.stringify(commits, null, 2));
                
                if (commits.value && commits.value.length > 0) {
                    // Try to get direct diff for each commit
                    for (const commit of commits.value) {
                        console.log('Processing commit:', commit.commitId);
                        
                        // Try getting diff for this specific commit
                        const singleCommitDiffUrl = `https://dev.azure.com/${organization}/${project}/_apis/git/repositories/${repository}/commits/${commit.commitId}/changes?api-version=7.0`;
                        
                        try {
                            const commitChangesResponse = await fetch(singleCommitDiffUrl, {
                                headers: {
                                    'Authorization': `Basic ${Buffer.from(`:${token}`).toString('base64')}`,
                                    'Content-Type': 'application/json'
                                }
                            });
                            
                            if (commitChangesResponse.ok) {
                                const commitChanges = await commitChangesResponse.json();
                                console.log('Commit changes:', JSON.stringify(commitChanges, null, 2));
                                
                                if (commitChanges.changes && commitChanges.changes.length > 0) {
                                    return convertCommitChangesToGitFormat(commitChanges.changes);
                                }
                            }
                        } catch (commitError) {
                            console.log('Error fetching commit changes:', commitError.message);
                        }
                    }
                    
                    // Fallback: Try diff between commits if multiple commits
                    if (commits.value.length > 1) {
                        const latestCommit = commits.value[0];
                        const previousCommit = commits.value[1];
                        
                        const diffBetweenCommitsUrl = `https://dev.azure.com/${organization}/${project}/_apis/git/repositories/${repository}/diffs/commits?baseVersion=${previousCommit.commitId}&targetVersion=${latestCommit.commitId}&api-version=7.0`;
                        
                        try {
                            const diffResponse = await fetch(diffBetweenCommitsUrl, {
                                headers: {
                                    'Authorization': `Basic ${Buffer.from(`:${token}`).toString('base64')}`,
                                    'Content-Type': 'application/json'
                                }
                            });
                            
                            if (diffResponse.ok) {
                                const diffData = await diffResponse.json();
                                console.log('Diff between commits:', JSON.stringify(diffData, null, 2));
                                return convertCommitDiffToGitFormat(diffData);
                            }
                        } catch (diffError) {
                            console.log('Error fetching diff between commits:', diffError.message);
                        }
                    }
                } else {
                    console.log('No commits found in PR');
                }
            } else {
                console.log('Failed to fetch commits:', commitsResponse.status, commitsResponse.statusText);
            }
        } catch (error) {
            console.log('Error in method 1:', error.message);
        }
        
        // Method 2: First try to get the actual diff from Azure DevOps
        console.log('Attempting to fetch raw diff...');
        const diffUrl = `https://dev.azure.com/${organization}/${project}/_apis/git/repositories/${repository}/pullrequests/${prId}/iterations/1/changes?api-version=7.0&$format=diff`;
        
        try {
            const diffResponse = await fetch(diffUrl, {
                headers: {
                    'Authorization': `Basic ${Buffer.from(`:${token}`).toString('base64')}`,
                    'Accept': 'text/plain'
                }
            });
            
            if (diffResponse.ok) {
                const diffText = await diffResponse.text();
                console.log('Raw diff response length:', diffText.length);
                console.log('Raw diff response sample:', diffText.substring(0, 500));
                
                if (diffText && diffText.trim() && !diffText.includes('{"count":') && !diffText.includes('<!DOCTYPE')) {
                    return diffText;
                }
            } else {
                console.log('Raw diff request failed:', diffResponse.status, diffResponse.statusText);
            }
        } catch (error) {
            console.log('Raw diff request error:', error.message);
        }
        
        // Method 3: Fallback - Get PR iterations to find the latest changes
        console.log('Attempting to fetch PR iterations...');
        const iterationsUrl = `https://dev.azure.com/${organization}/${project}/_apis/git/repositories/${repository}/pullrequests/${prId}/iterations?api-version=7.0`;
        
        const iterationsResponse = await fetch(iterationsUrl, {
            headers: {
                'Authorization': `Basic ${Buffer.from(`:${token}`).toString('base64')}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (!iterationsResponse.ok) {
            const errorText = await iterationsResponse.text();
            console.log('Iterations API error response:', errorText);
            throw new Error(`Failed to fetch PR iterations: ${iterationsResponse.status} ${iterationsResponse.statusText}`);
        }
        
        const iterations = await iterationsResponse.json();
        console.log('Iterations response:', JSON.stringify(iterations, null, 2));
        
        if (!iterations.value || iterations.value.length === 0) {
            throw new Error('No iterations found for this PR');
        }
        
        const latestIteration = iterations.value[iterations.value.length - 1];
        console.log('Using iteration:', latestIteration.id);
        
        // Get changes for the latest iteration with includeContent=true
        console.log('Attempting to fetch PR changes...');
        const changesUrl = `https://dev.azure.com/${organization}/${project}/_apis/git/repositories/${repository}/pullrequests/${prId}/iterations/${latestIteration.id}/changes?api-version=7.0&includeContent=true`;
        
        const changesResponse = await fetch(changesUrl, {
            headers: {
                'Authorization': `Basic ${Buffer.from(`:${token}`).toString('base64')}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (!changesResponse.ok) {
            const errorText = await changesResponse.text();
            console.log('Changes API error response:', errorText);
            throw new Error(`Failed to fetch PR changes: ${changesResponse.status} ${changesResponse.statusText}`);
        }
        
        const changes = await changesResponse.json();
        
        // Debug: Log the actual changes structure
        console.log('Azure DevOps Changes Structure:', JSON.stringify(changes, null, 2));
        
        // Method 4: Try to get individual file contents for real diff
        if (changes.changeEntries && changes.changeEntries.length > 0) {
            console.log('Attempting to fetch individual file contents...');
            
            for (const change of changes.changeEntries) {
                if (change.changeType === 'edit' && change.item && change.item.objectId) {
                    try {
                        // Get current file content
                        const currentFileUrl = `https://dev.azure.com/${organization}/${project}/_apis/git/repositories/${repository}/blobs/${change.item.objectId}?api-version=7.0`;
                        const currentFileResponse = await fetch(currentFileUrl, {
                            headers: {
                                'Authorization': `Basic ${Buffer.from(`:${token}`).toString('base64')}`,
                                'Accept': 'text/plain'
                            }
                        });
                        
                        if (currentFileResponse.ok) {
                            const currentContent = await currentFileResponse.text();
                            console.log(`Got current content for ${change.item.path}:`, currentContent.substring(0, 200));
                            
                            // Try to get original file content
                            if (change.originalObjectId) {
                                const originalFileUrl = `https://dev.azure.com/${organization}/${project}/_apis/git/repositories/${repository}/blobs/${change.originalObjectId}?api-version=7.0`;
                                const originalFileResponse = await fetch(originalFileUrl, {
                                    headers: {
                                        'Authorization': `Basic ${Buffer.from(`:${token}`).toString('base64')}`,
                                        'Accept': 'text/plain'
                                    }
                                });
                                
                                if (originalFileResponse.ok) {
                                    const originalContent = await originalFileResponse.text();
                                    console.log(`Got original content for ${change.item.path}:`, originalContent.substring(0, 200));
                                    
                                    // Create real diff with actual content
                                    return createRealDiff(change.item.path, originalContent, currentContent);
                                }
                            }
                        }
                    } catch (fileError) {
                        console.log(`Error fetching file content for ${change.item.path}:`, fileError.message);
                    }
                }
            }
        }
        
        // Method FINAL: Try getting actual Git commit diff using base and target commits
        try {
            console.log('Method FINAL: Trying Git commit comparison...');
            const prData = await fetchAzureDevOpsPR(prInfo, token);
            
            if (prData.lastMergeSourceCommit && prData.lastMergeTargetCommit) {
                const baseCommit = prData.lastMergeTargetCommit.commitId;
                const targetCommit = prData.lastMergeSourceCommit.commitId;
                
                console.log(`Comparing commits: ${baseCommit}..${targetCommit}`);
                
                const commitDiffUrl = `https://dev.azure.com/${organization}/${project}/_apis/git/repositories/${repository}/diffs/commits?baseVersionType=commit&baseVersion=${baseCommit}&targetVersionType=commit&targetVersion=${targetCommit}&api-version=7.0`;
                
                const commitDiffResponse = await fetch(commitDiffUrl, {
                    headers: {
                        'Authorization': `Basic ${Buffer.from(`:${token}`).toString('base64')}`,
                        'Content-Type': 'application/json'
                    }
                });
                
                if (commitDiffResponse.ok) {
                    const commitDiffData = await commitDiffResponse.json();
                    console.log('Git commit diff data:', JSON.stringify(commitDiffData, null, 2));
                    
                    if (commitDiffData.changes && commitDiffData.changes.length > 0) {
                        let realGitDiff = '';
                        
                        commitDiffData.changes.forEach(change => {
                            const filePath = change.item ? change.item.path : change.originalPath;
                            
                            realGitDiff += `diff --git a${filePath} b${filePath}\n`;
                            realGitDiff += `index ${change.originalObjectId?.substring(0, 7) || 'unknown'}..${change.item?.objectId?.substring(0, 7) || 'unknown'} 100644\n`;
                            realGitDiff += `--- a${filePath}\n`;
                            realGitDiff += `+++ b${filePath}\n`;
                            
                            // Add hunks if available
                            if (change.hunks && change.hunks.length > 0) {
                                change.hunks.forEach(hunk => {
                                    realGitDiff += `@@ -${hunk.oldStart},${hunk.oldLength} +${hunk.newStart},${hunk.newLength} @@\n`;
                                    
                                    if (hunk.lines && hunk.lines.length > 0) {
                                        hunk.lines.forEach(line => {
                                            const prefix = line.changeType === 1 ? '+' : line.changeType === 2 ? '-' : ' ';
                                            realGitDiff += `${prefix}${line.content || ''}\n`;
                                        });
                                    }
                                });
                            } else {
                                realGitDiff += `@@ -1,1 +1,1 @@\n`;
                                realGitDiff += `+// File ${change.changeType}: ${filePath}\n`;
                            }
                            
                            realGitDiff += '\n';
                        });
                        
                        if (realGitDiff && !realGitDiff.includes('// Branch comparison')) {
                            console.log('SUCCESS: Got real git diff with hunks!');
                            return realGitDiff;
                        }
                    }
                }
            }
        } catch (error) {
            console.log('Method FINAL failed:', error.message);
        }
        
        // Convert Azure DevOps changes format to git diff format
        return convertAzureDevOpsChangesToGitDiff(changes);
        
        // Method FINAL: Try getting raw diff using git refs
        try {
            console.log('Method FINAL: Trying git refs comparison...');
            const prData = await fetchAzureDevOpsPR(prInfo, token);
            
            if (prData.sourceRefName && prData.targetRefName) {
                const sourceRef = prData.sourceRefName;
                const targetRef = prData.targetRefName;
                
                // Try git diff API
                const gitDiffUrl = `https://dev.azure.com/${organization}/${project}/_apis/git/repositories/${repository}/diffs/commits?baseVersion=${targetRef}&targetVersion=${sourceRef}&api-version=7.0&diffCommonCommit=true`;
                
                const gitDiffResponse = await fetch(gitDiffUrl, {
                    headers: {
                        'Authorization': `Basic ${Buffer.from(`:${token}`).toString('base64')}`,
                        'Content-Type': 'application/json'
                    }
                });
                
                if (gitDiffResponse.ok) {
                    const gitDiffData = await gitDiffResponse.json();
                    console.log('Git refs diff data:', JSON.stringify(gitDiffData, null, 2));
                    
                    if (gitDiffData.changes && gitDiffData.changes.length > 0) {
                        return convertBranchComparisonToGitFormat(gitDiffData);
                    }
                }
                
                // Alternative: try with commit IDs instead of refs
                if (prData.lastMergeCommit) {
                    const commitDiffUrl = `https://dev.azure.com/${organization}/${project}/_apis/git/repositories/${repository}/commits/${prData.lastMergeCommit.commitId}/changes?api-version=7.0`;
                    
                    const commitResponse = await fetch(commitDiffUrl, {
                        headers: {
                            'Authorization': `Basic ${Buffer.from(`:${token}`).toString('base64')}`,
                            'Content-Type': 'application/json'
                        }
                    });
                    
                    if (commitResponse.ok) {
                        const commitData = await commitResponse.json();
                        console.log('Last merge commit data:', JSON.stringify(commitData, null, 2));
                        
                        if (commitData.changes && commitData.changes.length > 0) {
                            return convertCommitChangesToGitFormat(commitData.changes);
                        }
                    }
                }
            }
        } catch (error) {
            console.log('Method FINAL failed:', error.message);
        }
        
        // Method FINAL+1: Get actual file contents from both branches and create proper diff
        try {
            console.log('Method FINAL+1: Trying file content comparison approach...');
            
            // Get PR data to know source/target branches
            const prData = await fetchAzureDevOpsPR(prInfo, token);
            const sourceBranch = prData.sourceRefName?.replace('refs/heads/', '') || 'feature';
            const targetBranch = prData.targetRefName?.replace('refs/heads/', '') || 'main';
            
            console.log(`Comparing branches: ${targetBranch} (target) -> ${sourceBranch} (source)`);
            
            // Get file list from PR changes
            const changesResponse = await fetch(`https://dev.azure.com/${organization}/${project}/_apis/git/repositories/${repository}/pullrequests/${prId}/iterations/1/changes?api-version=7.0`, {
                headers: {
                    'Authorization': `Basic ${Buffer.from(`:${token}`).toString('base64')}`,
                    'Content-Type': 'application/json'
                }
            });
            
            if (changesResponse.ok) {
                const changesData = await changesResponse.json();
                console.log(`Processing ${changesData.changeEntries?.length || 0} file changes...`);
                
                if (changesData.changeEntries && changesData.changeEntries.length > 0) {
                    let gitDiff = '';
                    
                    // Process each changed file
                    for (const change of changesData.changeEntries.slice(0, 10)) { // Limit to first 10 files
                        const filePath = change.item?.path;
                        if (!filePath) continue;
                        
                        console.log(`Processing file: ${filePath} (${change.changeType})`);
                        
                        let sourceContent = '';
                        let targetContent = '';
                        
                        // Get content from source branch (PR branch)
                        try {
                            const sourceUrl = `https://dev.azure.com/${organization}/${project}/_apis/git/repositories/${repository}/items?path=${encodeURIComponent(filePath)}&version=${sourceBranch}&includeContent=true&api-version=7.0`;
                            const sourceResponse = await fetch(sourceUrl, {
                                headers: {
                                    'Authorization': `Basic ${Buffer.from(`:${token}`).toString('base64')}`,
                                    'Content-Type': 'application/json'
                                }
                            });
                            
                            if (sourceResponse.ok) {
                                const sourceData = await sourceResponse.json();
                                sourceContent = sourceData.content || '';
                                console.log(`✅ Source content: ${sourceContent.length} chars`);
                            } else {
                                console.log(`❌ Failed to get source content: ${sourceResponse.status}`);
                            }
                        } catch (error) {
                            console.log(`❌ Error getting source content:`, error.message);
                        }
                        
                        // Get content from target branch (only for edit/delete, not for new files)
                        if (change.changeType !== 'add') {
                            try {
                                const targetUrl = `https://dev.azure.com/${organization}/${project}/_apis/git/repositories/${repository}/items?path=${encodeURIComponent(filePath)}&version=${targetBranch}&includeContent=true&api-version=7.0`;
                                const targetResponse = await fetch(targetUrl, {
                                    headers: {
                                        'Authorization': `Basic ${Buffer.from(`:${token}`).toString('base64')}`,
                                        'Content-Type': 'application/json'
                                    }
                                });
                                
                                if (targetResponse.ok) {
                                    const targetData = await targetResponse.json();
                                    targetContent = targetData.content || '';
                                    console.log(`✅ Target content: ${targetContent.length} chars`);
                                } else {
                                    console.log(`❌ Failed to get target content: ${targetResponse.status}`);
                                }
                            } catch (error) {
                                console.log(`❌ Error getting target content:`, error.message);
                            }
                        } else {
                            console.log(`⭐ New file detected - no target content needed`);
                        }
                        
                        // Create git diff from content comparison
                        if (sourceContent || targetContent) {
                            const fileDiff = createGitDiffFromContent(filePath, targetContent, sourceContent, change.changeType);
                            gitDiff += fileDiff + '\n';
                            console.log(`✅ Created diff for ${filePath}`);
                        } else {
                            console.log(`⚠️ No content retrieved for ${filePath}`);
                        }
                    }
                    
                    if (gitDiff.trim()) {
                        console.log('✅ Method FINAL+1: Successfully created git diff from file contents!');
                        return gitDiff;
                    } else {
                        console.log('❌ Method FINAL+1: No diff content generated');
                    }
                }
            }
        } catch (error) {
            console.log('Method FINAL+1 failed:', error.message);
        }
        
    } catch (error) {
        console.error('Error fetching PR diff:', error);
        console.error('Error stack:', error.stack);
        
        // Return a meaningful error message with debugging info
        return `// Error fetching PR diff: ${error.message}
// 
// Debugging Information:
// - Organization: ${organization}
// - Project: ${project}  
// - Repository: ${repository}
// - PR ID: ${prId}
//
// All methods attempted:
// 1. PR comparison API (branch diff)
// 2. File list with individual content
// 3. Commit changes API
// 4. Raw diff format API  
// 5. PR iterations API
// 6. Individual file blobs API
// 7. Git refs comparison
// 8. Direct file content fetching
//
// Please check:
// 1. Personal Access Token is valid and has proper permissions
// 2. You have access to the Azure DevOps organization/project
// 3. The PR exists and is accessible
// 4. Check VS Code Developer Console (F12) for detailed error logs
//
// Azure DevOps may not provide detailed diff content through their REST API.
// Consider using git command line tools for detailed diffs.
`;
    }
}

/**
 * Convert branch comparison data to git format
 * @param {Object} compareData - Azure DevOps branch comparison data
 * @returns {string} Git diff format string
 */
function convertBranchComparisonToGitFormat(compareData) {
    if (!compareData.changes || compareData.changes.length === 0) {
        return '// No branch comparison data available\n';
    }
    
    let gitDiff = '';
    
    compareData.changes.forEach(change => {
        const filePath = change.item ? change.item.path : change.originalPath || 'unknown';
        
        gitDiff += `diff --git a${filePath} b${filePath}\n`;
        
        // Add change metadata
        if (change.changeType === 'add' || change.changeType === 1) {
            gitDiff += `new file mode 100644\n`;
            gitDiff += `index 0000000..${change.item?.objectId?.substring(0, 7) || 'unknown'}\n`;
            gitDiff += `--- /dev/null\n`;
            gitDiff += `+++ b${filePath}\n`;
        } else if (change.changeType === 'delete' || change.changeType === 2) {
            gitDiff += `deleted file mode 100644\n`;
            gitDiff += `index ${change.originalObjectId?.substring(0, 7) || 'unknown'}..0000000\n`;
            gitDiff += `--- a${filePath}\n`;
            gitDiff += `+++ /dev/null\n`;
        } else {
            // Edit or other changes
            const oldId = change.originalObjectId?.substring(0, 7) || 'unknown';
            const newId = change.item?.objectId?.substring(0, 7) || 'unknown';
            gitDiff += `index ${oldId}..${newId} 100644\n`;
            gitDiff += `--- a${filePath}\n`;
            gitDiff += `+++ b${filePath}\n`;
        }
        
        // Try to show actual diff if available
        if (change.hunks && change.hunks.length > 0) {
            change.hunks.forEach(hunk => {
                gitDiff += `@@ -${hunk.oldStart || 1},${hunk.oldLength || 1} +${hunk.newStart || 1},${hunk.newLength || 1} @@\n`;
                
                if (hunk.lines && hunk.lines.length > 0) {
                    hunk.lines.forEach(line => {
                        const prefix = line.changeType === 'add' ? '+' : 
                                     line.changeType === 'delete' ? '-' : 
                                     line.changeType === 'context' ? ' ' : ' ';
                        gitDiff += `${prefix}${line.content || line.text || ''}\n`;
                    });
                } else {
                    gitDiff += ` // Hunk content not available\n`;
                }
            });
        } else {
            // Fallback when no hunks
            gitDiff += `@@ -1,1 +1,1 @@\n`;
            gitDiff += `+// Branch comparison: ${change.changeType} - ${filePath}\n`;
            gitDiff += `+// Original: ${change.originalObjectId || 'N/A'}\n`;
            gitDiff += `+// Current: ${change.item?.objectId || 'N/A'}\n`;
        }
        
        gitDiff += '\n';
    });
    
    return gitDiff;
}

/**
 * Create real diff from original and current content
 * @param {string} filePath - File path
 * @param {string} originalContent - Original file content
 * @param {string} currentContent - Current file content
 * @returns {string} Git diff format string
 */
function createRealDiff(filePath, originalContent, currentContent) {
    const originalLines = originalContent.split('\n');
    const currentLines = currentContent.split('\n');
    
    let gitDiff = `diff --git a${filePath} b${filePath}\n`;
    gitDiff += `index unknown..unknown 100644\n`;
    gitDiff += `--- a${filePath}\n`;
    gitDiff += `+++ b${filePath}\n`;
    
    // Simple line-by-line diff
    const maxLines = Math.max(originalLines.length, currentLines.length);
    let hasChanges = false;
    
    // Find first difference to create proper hunk header
    let firstDiff = -1;
    for (let i = 0; i < maxLines; i++) {
        const origLine = originalLines[i] || '';
        const currLine = currentLines[i] || '';
        if (origLine !== currLine) {
            firstDiff = i;
            break;
        }
    }
    
    if (firstDiff >= 0) {
        gitDiff += `@@ -${firstDiff + 1},${originalLines.length - firstDiff} +${firstDiff + 1},${currentLines.length - firstDiff} @@\n`;
        
        // Show context and changes
        for (let i = Math.max(0, firstDiff - 3); i < maxLines && i < firstDiff + 20; i++) {
            const origLine = originalLines[i] || '';
            const currLine = currentLines[i] || '';
            
            if (i < firstDiff) {
                // Context lines before change
                gitDiff += ` ${origLine}\n`;
            } else if (origLine !== currLine) {
                // Changed lines
                if (i < originalLines.length) {
                    gitDiff += `-${origLine}\n`;
                }
                if (i < currentLines.length) {
                    gitDiff += `+${currLine}\n`;
                }
                hasChanges = true;
            } else {
                // Context lines after change
                gitDiff += ` ${origLine}\n`;
            }
        }
    }
    
    if (!hasChanges) {
        gitDiff += `@@ -1,1 +1,1 @@\n`;
        gitDiff += ` // No visible differences detected\n`;
    }
    
    return gitDiff + '\n';
}

/**
 * Convert commit changes to git format
 * @param {Array} changes - Azure DevOps commit changes array
 * @returns {string} Git diff format string
 */
function convertCommitChangesToGitFormat(changes) {
    if (!changes || changes.length === 0) {
        return '// No commit changes available\n';
    }
    
    let gitDiff = '';
    
    changes.forEach(change => {
        const filePath = change.item ? change.item.path : change.sourceServerItem || 'unknown';
        
        gitDiff += `diff --git a${filePath} b${filePath}\n`;
        
        // Add change metadata
        if (change.changeType === 'add' || change.changeType === 1) {
            gitDiff += `new file mode 100644\n`;
            gitDiff += `index 0000000..${change.item?.objectId?.substring(0, 7) || 'unknown'}\n`;
            gitDiff += `--- /dev/null\n`;
            gitDiff += `+++ b${filePath}\n`;
        } else if (change.changeType === 'delete' || change.changeType === 2) {
            gitDiff += `deleted file mode 100644\n`;
            gitDiff += `index ${change.originalObjectId?.substring(0, 7) || 'unknown'}..0000000\n`;
            gitDiff += `--- a${filePath}\n`;
            gitDiff += `+++ /dev/null\n`;
        } else {
            // Edit or other changes
            const oldId = change.originalObjectId?.substring(0, 7) || 'unknown';
            const newId = change.item?.objectId?.substring(0, 7) || 'unknown';
            gitDiff += `index ${oldId}..${newId} 100644\n`;
            gitDiff += `--- a${filePath}\n`;
            gitDiff += `+++ b${filePath}\n`;
        }
        
        // Add a simple diff placeholder
        gitDiff += `@@ -1,1 +1,1 @@\n`;
        gitDiff += `-// File ${change.changeType === 'add' ? 'added' : change.changeType === 'delete' ? 'deleted' : 'modified'}: ${filePath}\n`;
        gitDiff += `+// CHANGE TYPE: ${change.changeType} - ${filePath}\n`;
        gitDiff += `+// Note: Actual file content diff not available from this API endpoint\n`;
        gitDiff += '\n';
    });
    
    return gitDiff;
}

/**
 * Convert commit diff data to git format
 * @param {Object} diffData - Azure DevOps commit diff data
 * @returns {string} Git diff format string
 */
function convertCommitDiffToGitFormat(diffData) {
    if (!diffData.changes || diffData.changes.length === 0) {
        return '// No commit diff data available\n';
    }
    
    let gitDiff = '';
    
    diffData.changes.forEach(change => {
        const filePath = change.item ? change.item.path : change.originalPath || 'unknown';
        
        gitDiff += `diff --git a${filePath} b${filePath}\n`;
        
        // Add change metadata
        if (change.changeType === 'add') {
            gitDiff += `new file mode 100644\n`;
        } else if (change.changeType === 'delete') {
            gitDiff += `deleted file mode 100644\n`;
        }
        
        // Add index line
        const oldId = change.originalObjectId ? change.originalObjectId.substring(0, 7) : '0000000';
        const newId = change.item && change.item.objectId ? change.item.objectId.substring(0, 7) : '0000000';
        gitDiff += `index ${oldId}..${newId} 100644\n`;
        
        // Add file headers
        gitDiff += `--- ${change.changeType === 'add' ? '/dev/null' : 'a' + filePath}\n`;
        gitDiff += `+++ ${change.changeType === 'delete' ? '/dev/null' : 'b' + filePath}\n`;
        
        // Add hunks if available
        if (change.hunks && change.hunks.length > 0) {
            change.hunks.forEach(hunk => {
                gitDiff += `@@ -${hunk.oldStart},${hunk.oldLength} +${hunk.newStart},${hunk.newLength} @@\n`;
                if (hunk.lines) {
                    hunk.lines.forEach(line => {
                        const prefix = line.changeType === 'add' ? '+' : line.changeType === 'delete' ? '-' : ' ';
                        gitDiff += `${prefix}${line.content || ''}\n`;
                    });
                }
            });
        } else {
            // Fallback if no hunks
            gitDiff += `@@ -1,1 +1,1 @@\n`;
            gitDiff += `-// File ${change.changeType}: ${filePath} (detailed diff not available)\n`;
            gitDiff += `+// ${change.changeType.toUpperCase()}: ${filePath}\n`;
        }
        
        gitDiff += '\n';
    });
    
    return gitDiff;
}

/**
 * Convert Azure DevOps changes format to git diff format
 * @param {Object} changes - Azure DevOps changes object
 * @returns {string} Git diff format string
 */
function convertAzureDevOpsChangesToGitDiff(changes) {
    console.log('Converting changes to git diff:', changes);
    
    if (!changes.changeEntries || changes.changeEntries.length === 0) {
        return '// No changes found in this PR\n';
    }
    
    let gitDiff = '';
    
    changes.changeEntries.forEach((change, index) => {
        console.log(`Processing change ${index + 1}:`, change);
        
        const filePath = change.item.path;
        
        gitDiff += `diff --git a${filePath} b${filePath}\n`;
        
        if (change.changeType === 'add') {
            gitDiff += `new file mode 100644\n`;
            gitDiff += `index 0000000..${change.item.objectId ? change.item.objectId.substring(0, 7) : 'unknown'}\n`;
            gitDiff += `--- /dev/null\n`;
            gitDiff += `+++ b${filePath}\n`;
            
            // Try to get actual content
            if (change.item && change.item.content) {
                const lines = change.item.content.split('\n');
                gitDiff += `@@ -0,0 +1,${lines.length} @@\n`;
                lines.forEach(line => {
                    gitDiff += `+${line}\n`;
                });
            } else {
                gitDiff += `@@ -0,0 +1,1 @@\n`;
                gitDiff += `+// New file added: ${filePath} (content not available)\n`;
            }
        } else if (change.changeType === 'delete') {
            gitDiff += `deleted file mode 100644\n`;
            gitDiff += `index ${change.originalObjectId ? change.originalObjectId.substring(0, 7) : 'unknown'}..0000000\n`;
            gitDiff += `--- a${filePath}\n`;
            gitDiff += `+++ /dev/null\n`;
            
            // Try to get original content
            if (change.originalContent) {
                const lines = change.originalContent.split('\n');
                gitDiff += `@@ -1,${lines.length} +0,0 @@\n`;
                lines.forEach(line => {
                    gitDiff += `-${line}\n`;
                });
            } else {
                gitDiff += `@@ -1,1 +0,0 @@\n`;
                gitDiff += `-// File deleted: ${filePath} (original content not available)\n`;
            }
        } else if (change.changeType === 'edit') {
            gitDiff += `index ${change.originalObjectId ? change.originalObjectId.substring(0, 7) : 'unknown'}..${change.item.objectId ? change.item.objectId.substring(0, 7) : 'unknown'} 100644\n`;
            gitDiff += `--- a${filePath}\n`;
            gitDiff += `+++ b${filePath}\n`;
            
            // Try to get actual diff content
            if (change.originalContent && change.item && change.item.content) {
                const originalLines = change.originalContent.split('\n');
                const newLines = change.item.content.split('\n');
                gitDiff += `@@ -1,${originalLines.length} +1,${newLines.length} @@\n`;
                
                // Simple diff - show original as removed, new as added
                originalLines.forEach(line => {
                    gitDiff += `-${line}\n`;
                });
                newLines.forEach(line => {
                    gitDiff += `+${line}\n`;
                });
            } else {
                // Fallback when content is not available
                gitDiff += `@@ -1,${change.originalSize || 'unknown'} +1,${change.item.size || 'unknown'} @@\n`;
                gitDiff += `-// File modified: ${filePath} (showing ${change.originalSize || 'unknown'} -> ${change.item.size || 'unknown'} bytes)\n`;
                gitDiff += `+// Original content not available via API\n`;
                gitDiff += `+// This is a ${change.changeType} operation on file: ${filePath}\n`;
            }
        } else {
            // Handle other change types (rename, etc.)
            gitDiff += `index ${change.originalObjectId ? change.originalObjectId.substring(0, 7) : 'unknown'}..${change.item.objectId ? change.item.objectId.substring(0, 7) : 'unknown'} 100644\n`;
            gitDiff += `--- a${filePath}\n`;
            gitDiff += `+++ b${filePath}\n`;
            gitDiff += `@@ -1,1 +1,1 @@\n`;
            gitDiff += `-// Change type: ${change.changeType}\n`;
            gitDiff += `+// ${change.changeType}: ${filePath}\n`;
        }
        
        gitDiff += '\n';
    });
    
    console.log('Generated git diff:', gitDiff);
    return gitDiff;
}

/**
 * Main handler for Azure DevOps PR review
 * @param {string} prUrl - Azure DevOps PR URL
 * @param {Object} stream - VS Code chat stream
 * @param {Object} context - VS Code extension context  
 * @param {Object} request - Chat request object
 */
async function handleAzureDevOpsPRReview(prUrl, stream, context, request) {
    const config = getAzureDevOpsConfig();
    
    // Check if token is configured
    if (!config.token) {
        stream.markdown('❌ **Configuration Required**\n\n');
        stream.markdown('Please configure your Azure DevOps Personal Access Token:\n\n');
        stream.markdown('**Method 1: VS Code Settings UI**\n');
        stream.markdown('1. Go to VS Code Settings (`Ctrl/Cmd + ,`)\n');
        stream.markdown('2. Search for "azure devops"\n');
        stream.markdown('3. Set your Personal Access Token\n\n');
        stream.markdown('**Method 2: Settings JSON**\n');
        stream.markdown('1. Open Command Palette (`Ctrl/Cmd + Shift + P`)\n');
        stream.markdown('2. Type: `Preferences: Open Settings (JSON)`\n');
        stream.markdown('3. Add:\n');
        stream.markdown('```json\n');
        stream.markdown('{\n');
        stream.markdown('  "aiCodeReviewer.azureDevOps.personalAccessToken": "your-token-here",\n');
        stream.markdown('  "aiCodeReviewer.azureDevOps.organization": "your-org-name"\n');
        stream.markdown('}\n');
        stream.markdown('```\n\n');
        stream.markdown('**How to get Personal Access Token:**\n');
        stream.markdown('1. Go to Azure DevOps → User Settings → Personal Access Tokens\n');
        stream.markdown('2. Create new token with `Code (read)` and `Pull Request (read)` permissions\n');
        stream.markdown('3. Copy and paste the token in VS Code settings\n\n');
        return;
    }
    
    try {
        // Parse PR URL
        stream.markdown('🔄 **Parsing PR URL...**\n\n');
        const prInfo = parseAzureDevOpsPRUrl(prUrl);
        
        // Display PR info header using existing function
        displayReviewHeader(stream, 'Azure DevOps PR Review', prUrl, null, null);
        
        stream.markdown(`**Organization:** ${prInfo.organization}\n`);
        stream.markdown(`**Project:** ${prInfo.project}\n`);
        stream.markdown(`**Repository:** ${prInfo.repository}\n`);
        stream.markdown(`**PR ID:** #${prInfo.prId}\n\n`);
        
        // Fetch PR data
        stream.markdown('🔄 **Fetching PR data from Azure DevOps...**\n\n');
        const prData = await fetchAzureDevOpsPR(prInfo, config.token);
        
        stream.markdown('✅ **PR Data Retrieved Successfully**\n\n');
        stream.markdown(`**Title:** ${prData.title}\n\n`);
        stream.markdown(`**Author:** ${prData.createdBy.displayName}\n\n`);
        stream.markdown(`**Status:** ${prData.status}\n\n`);
        stream.markdown(`**Source Branch:** ${prData.sourceRefName.replace('refs/heads/', '')}\n\n`);
        stream.markdown(`**Target Branch:** ${prData.targetRefName.replace('refs/heads/', '')}\n\n`);
        stream.markdown(`**Created:** ${new Date(prData.creationDate).toLocaleDateString()}\n`);
        if (prData.description) {
            stream.markdown(`**Description:** ${prData.description.substring(0, 200)}${prData.description.length > 200 ? '...' : ''}\n`);
        }
        stream.markdown('\n');
        
        // Fetch PR diff
        stream.markdown('🔄 **Fetching PR changes and generating diff...**\n\n');
        const prDiff = await fetchAzureDevOpsPRDiff(prInfo, config.token);
        
        console.log('=== AZURE DEVOPS DIFF DEBUG ===');
        console.log('PR Diff length:', prDiff ? prDiff.length : 0);
        console.log('PR Diff preview (first 1000 chars):', prDiff ? prDiff.substring(0, 1000) : 'null');
        console.log('=== END DIFF DEBUG ===');
        
        if (!prDiff || prDiff.trim().length === 0) {
            stream.markdown('⚠️ **No changes found in this PR**\n\n');
            stream.markdown('**Possible reasons:**\n');
            stream.markdown('- PR has no file changes\n');
            stream.markdown('- Insufficient permissions to access changes\n');
            stream.markdown('- PR is in draft status\n\n');
            return;
        }
        
        // Check if we got meaningful diff content
        if (prDiff.includes('// Branch comparison: edit') || prDiff.includes('// File modified:') || prDiff.includes('# Commit:')) {
            stream.markdown('⚠️ **Azure DevOps API Limitation**\n\n');
            stream.markdown('Azure DevOps REST API does not provide actual code content for external tools - only file metadata.\n\n');
            stream.markdown('**Available Information:**\n');
            stream.markdown('- File paths and names\n');
            stream.markdown('- Change types (add/edit/delete)\n');
            stream.markdown('- File sizes and object IDs\n');
            stream.markdown('- Commit messages and authors\n\n');
            stream.markdown('**To view actual code changes:**\n');
            stream.markdown(`1. 🌐 **Web Interface:** [Open PR in Azure DevOps](${prUrl})\n`);
            stream.markdown(`2. 💻 **Git CLI:** Clone repo and run \`git diff ${prData.targetRefName?.replace('refs/heads/', 'main') || 'main'}..${prData.sourceRefName?.replace('refs/heads/', '') || 'feature-branch'}\`\n`);
            stream.markdown(`3. 🔧 **Azure CLI:** \`az repos pr diff --id ${prInfo.prId}\`\n\n`);
            stream.markdown('**Metadata-Based Review:**\n');
            stream.markdown('The AI will analyze available metadata (file paths, change types, commit messages) to provide architectural and structural insights.\n\n');
            
            // Extract file list from diff content
            const fileMatches = prDiff.match(/Branch comparison: edit - (.+)/g);
            if (fileMatches) {
                // Filter to only show actual files (with extensions), not directories
                const actualFiles = fileMatches.map(match => 
                    match.replace('Branch comparison: edit - ', '')
                ).filter(path => {
                    // Only include paths that have file extensions (contain a dot after the last slash)
                    const fileName = path.split('/').pop();
                    return fileName && fileName.includes('.');
                });
                
                if (actualFiles.length > 0) {
                    stream.markdown('**Files in this PR:**\n');
                    actualFiles.slice(0, 10).forEach(fullPath => {
                        stream.markdown(`• ${fullPath}\n`); // Show full path of actual files only
                    });
                    if (actualFiles.length > 10) {
                        stream.markdown(`• ... and ${actualFiles.length - 10} more files\n`);
                    }
                    stream.markdown('\n');
                }
            }
        }
        
        stream.markdown('✅ **PR Changes Retrieved - Starting AI Analysis...**\n\n');
        stream.markdown('---\n\n');
        
        // Use existing review logic with PR changes - PASS REQUEST PARAMETER
        await reviewWithInMemoryTemplate(prDiff, stream, 'Azure DevOps PR Changes', null, context, request);
        
    } catch (error) {
        stream.markdown(`❌ **Azure DevOps API Error:** ${error.message}\n\n`);
        stream.markdown('**Troubleshooting Steps:**\n');
        stream.markdown('1. **Check Token:** Ensure your Personal Access Token is valid and not expired\n');
        stream.markdown('2. **Check Permissions:** Token needs `Code (read)` and `Pull Request (read)` scopes\n');
        stream.markdown('3. **Check URL:** Ensure PR URL format is correct\n');
        stream.markdown('4. **Check Access:** Ensure you have access to the organization/project\n');
        stream.markdown('5. **Check Network:** Ensure you can access dev.azure.com\n\n');
        stream.markdown('**PR URL Format:**\n');
        stream.markdown('`https://dev.azure.com/{org}/{project}/_git/{repo}/pullrequest/{id}`\n\n');
        console.error('Azure DevOps PR Review detailed error:', error);
    }
}

// #endregion Azure DevOps PR Review Functions

/**
 * Get file content from Azure DevOps repository
 * @param {string} organization - Azure DevOps organization
 * @param {string} project - Project name
 * @param {string} repository - Repository name  
 * @param {string} filePath - File path
 * @param {string} branch - Branch name
 * @param {string} token - Personal Access Token
 * @returns {string} File content
 */
async function getFileContent(organization, project, repository, filePath, branch, token) {
    const itemUrl = `https://dev.azure.com/${organization}/${project}/_apis/git/repositories/${repository}/items?path=${encodeURIComponent(filePath)}&version=${branch}&includeContent=true&api-version=7.0`;
    
    const response = await fetch(itemUrl, {
        headers: {
            'Authorization': `Basic ${Buffer.from(`:${token}`).toString('base64')}`,
            'Content-Type': 'application/json'
        }
    });
    
    if (!response.ok) {
        if (response.status === 404) {
            return ''; // File doesn't exist in this branch (normal for add/delete)
        }
        throw new Error(`Failed to get file content: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    return data.content || '';
}

function deactivate() {}

module.exports = {
    activate,
    deactivate
};
