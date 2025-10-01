const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
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
    "aiSelfCheck.azureDevOps.organization": "YOUR_ORG_HERE",
    "aiSelfCheck.azureDevOps.defaultProject": "YOUR_PROJECT_HERE"
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
    let reviewFileCommand = vscode.commands.registerCommand('aiSelfCheck.reviewFile', async (uri) => {
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

    let reviewChangesCommand = vscode.commands.registerCommand('aiSelfCheck.reviewChanges', async (uri) => {
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

    // Initialize review modules from external scripts
    const reviewChanges = require('./scripts/review-changes');
    const { reviewChangesParticipant } = reviewChanges.initializeReviewChanges(context);

    const reviewFile = require('./scripts/review-file');
    const { reviewFileParticipant } = reviewFile.initializeReviewFile(context);

    // Initialize PR review functionality from external script
    const prReview = require('./scripts/review-pr');
    const { reviewPrParticipant, reviewPullRequest } = prReview.initializePrReview(context);
    
    // Initialize MemDiff provider for PR diffs
    global.memDiffProvider = prReview.registerMemDiffProvider(context);
    console.log('✅ MemDiff provider initialized for PR reviews');

    // Register command to show available models
    const showModelsCommand = vscode.commands.registerCommand('aiSelfCheck.showAvailableModels', showAvailableModels);

    context.subscriptions.push(
        setupAzureDevOps,
        confirmChangesReview,
        confirmFileReview,
        showChangesHelp,
        showFileHelp,
        reviewFileCommand,
        reviewChangesCommand,
        reviewChangesParticipant, 
        reviewFileParticipant,
        reviewPrParticipant,
        reviewPullRequest,
        showModelsCommand
    );
}

/**
 * Ensures templates exist in workspace instructions folder
 * Combines common template with specific templates before copying
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

        // Template files to process
        const templateFiles = ['review-file.md', 'review-changes.md', 'quick-review-pr.md'];
        
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

function deactivate() {}

module.exports = {
    activate,
    deactivate,
    handleEnterTwiceLogic  // Export for use in review-changes.js and review-file.js
};
