const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const https = require('https');
const { URL } = require('url');

// Import all required functions including showAvailableModels
const {
    executeAIReview,
    getReviewTemplate,
    displayReviewHeader,
    getUnifiedModel,
    getChecklistStatusIcon,
    showAvailableModels
} = require('./scripts/review-common');

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
        // Set the session flag to indicate the user confirmed (simulate second enter)
        const sessionKey = `review-changes-${filePath}`;
        chatSessions.set(sessionKey, true);
        console.log(`🔍 Confirmation button clicked - Session set: ${sessionKey} = true`);

        // Open chat and trigger changes review for the specific file
        await vscode.commands.executeCommand('workbench.panel.chat.view.copilot.focus');
        // Send the file path to @review-changes (will now proceed directly due to session flag)
        await vscode.commands.executeCommand('workbench.action.chat.open', {
            query: `@review-changes ${filePath}`
        });
    });

    let confirmFileReview = vscode.commands.registerCommand('aiSelfCheck.confirmFileReview', async (filePath) => {
        // Set the session flag to indicate the user confirmed (simulate second enter)
        const sessionKey = `review-file-${filePath}`;
        chatSessions.set(sessionKey, true);
        console.log(`📁 Confirmation button clicked - Session set: ${sessionKey} = true`);

        // Open chat and trigger file review for the specific file
        await vscode.commands.executeCommand('workbench.panel.chat.view.copilot.focus');
        // Send the file path to @review-file (will now proceed directly due to session flag)
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

    // Initialize scan-app functionality from external script
    let scanAppParticipant;
    try {
        const scanApp = require('./scripts/scan-app');
        const result = scanApp.initializeScanApp(context);
        scanAppParticipant = result.scanAppParticipant;
        console.log('✅ Scan-app participant initialized successfully');
    } catch (error) {
        console.error('❌ Failed to initialize scan-app participant:', error);
        // Create a dummy participant to prevent errors
        scanAppParticipant = null;
    }

    // Initialize create-app functionality from external script
    let createAppParticipant;
    try {
        const createApp = require('./scripts/create-app');
        const result = createApp.initializeCreateApp(context);
        createAppParticipant = result.createAppParticipant;
        console.log('✅ Create-app participant initialized successfully');
    } catch (error) {
        console.error('❌ Failed to initialize create-app participant:', error);
        // Create a dummy participant to prevent errors
        createAppParticipant = null;
    }

    // Register command to view PR diff in webview
    const viewPrDiffCommand = vscode.commands.registerCommand('aiSelfCheck.viewPrDiff', async (diffId) => {
        try {
            console.log(`📄 Opening diff webview for: ${diffId}`);

            // Get diff data from global cache
            const diffData = global.prDiffCache?.[diffId];
            if (!diffData) {
                vscode.window.showErrorMessage('Diff data not found. Please refresh the PR review.');
                return;
            }

            // Create webview panel
            const panel = vscode.window.createWebviewPanel(
                'prDiffView',
                `Diff: ${path.basename(diffData.path)}`,
                vscode.ViewColumn.One,
                {
                    enableScripts: true,
                    retainContextWhenHidden: true,
                    localResourceRoots: [
                        vscode.Uri.file(path.join(context.extensionPath, 'monaco-editor'))
                    ]
                }
            );

            // Add message handler for file switching
            panel.webview.onDidReceiveMessage(async (message) => {
                console.log('📨 Received message from webview:', message);
                
                if (message.type === 'openFileInMonaco') {
                    try {
                        const filePath = message.filePath;
                        console.log('🔄 Loading new file for Monaco:', filePath);
                        
                        // Find file in cache
                        const cache = global.prDiffCache;
                        let newDiffData = null;
                        
                        if (cache) {
                            const cacheKeys = Object.keys(cache);
                            for (const key of cacheKeys) {
                                if (key.startsWith('pr') && cache[key].path === filePath) {
                                    newDiffData = cache[key];
                                    break;
                                }
                            }
                        }
                        
                        if (newDiffData) {
                            // Update panel title and content
                            panel.title = `Diff: ${path.basename(filePath)}`;
                            panel.webview.html = await getMonacoWebviewContent(newDiffData, panel, context);
                            console.log('✅ Successfully loaded new file:', filePath);
                        } else {
                            console.error('❌ File not found in cache:', filePath);
                            vscode.window.showErrorMessage(`File not found: ${filePath}`);
                        }
                        
                    } catch (error) {
                        console.error('❌ Error loading file:', error);
                        vscode.window.showErrorMessage(`Failed to load file: ${error.message}`);
                    }
                }
            });

            // Set webview content
            panel.webview.html = await getMonacoWebviewContent(diffData, panel, context);

        } catch (error) {
            console.error('Error opening diff webview:', error);
            vscode.window.showErrorMessage(`Failed to open diff: ${error.message}`);
        }
    });

    // Register command to view all PR diffs in tabbed webview
    const viewAllPrDiffsCommand = vscode.commands.registerCommand('aiSelfCheck.viewAllPrDiffs', async (prId) => {
        try {
            console.log(`📊 Opening all diffs for PR: ${prId}`);

            // Support both GitHub and Azure DevOps PR cache patterns
            let allDiffIds = [];
            const cacheKeys = Object.keys(global.prDiffCache || {});
            
            if (prId.startsWith('github_')) {
                // GitHub PR: prId format is "github_{id}"
                allDiffIds = cacheKeys.filter(id => id.startsWith(`${prId}_`));
                console.log(`🐙 GitHub PR: Looking for cache keys starting with "${prId}_"`);
            } else {
                // Azure DevOps PR: prId is just the number
                allDiffIds = cacheKeys.filter(id => id.startsWith(`pr${prId}_`));
                console.log(`🔵 Azure DevOps PR: Looking for cache keys starting with "pr${prId}_"`);
            }

            console.log(`📊 Found ${allDiffIds.length} cached diffs:`, allDiffIds);

            if (allDiffIds.length === 0) {
                vscode.window.showErrorMessage('No diff data found. Please refresh the PR review.');
                return;
            }

            // Determine provider and title
            const isGitHubPR = prId.startsWith('github_');
            const displayId = isGitHubPR ? prId.replace('github_', '') : prId;
            const providerName = isGitHubPR ? 'GitHub' : 'Azure DevOps';

            // Create webview panel with tabs
            const panel = vscode.window.createWebviewPanel(
                'prAllDiffsView',
                `${providerName} PR #${displayId} - All Diffs (${allDiffIds.length} files)`,
                vscode.ViewColumn.One,
                {
                    enableScripts: true,
                    retainContextWhenHidden: true
                }
            );

            // Generate HTML with tabs for all diffs
            panel.webview.html = await getAllDiffsWebviewContent(prId, allDiffIds);

        } catch (error) {
            console.error('Error opening all diffs webview:', error);
            vscode.window.showErrorMessage(`Failed to open diffs: ${error.message}`);
        }
    });

    // Register command to show available models
    const showModelsCommand = vscode.commands.registerCommand('aiSelfCheck.showAvailableModels', showAvailableModels);

    // Add all subscriptions, filtering out null values
    const subscriptions = [
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
        scanAppParticipant,
        createAppParticipant,
        showModelsCommand,
        viewPrDiffCommand,
        viewAllPrDiffsCommand
    ].filter(item => item !== null && item !== undefined);

    context.subscriptions.push(...subscriptions);
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

/**
 * Generate webview HTML content for displaying diff
 * @param {object} diffData - Diff data containing path, diff, changeType, etc.
 * @returns {string} HTML content for webview
 */
/**
 * Generate minimap data for diff overview
 * Visual representation of changes in the file with dots showing added/removed lines
 * @param {Array} originalLines - Original file lines from left panel
 * @param {Array} modifiedLines - Modified file lines from right panel
 * @returns {string} - HTML for minimap with positioned dots
 */
function generateMinimap(originalLines, modifiedLines) {
    console.log('🗺️ Generating minimap...');

    // Early return for empty files
    if (!modifiedLines?.length && !originalLines?.length) {
        console.log('⚠️ No file content for minimap');
        return '';
    }

    // Get document statistics
    const totalLines = Math.max(originalLines?.length || 0, modifiedLines?.length || 0);
    console.log(`📊 Document stats: ${totalLines} total lines`);

    // STEP 1: Verify each line is actually changed before adding to map
    // We'll only mark lines that are actually added/removed, not just have the class
    const changes = [];

    // Process added lines (right side/modified) - only if they're actually new content
    if (modifiedLines?.length) {
        modifiedLines.forEach((line, index) => {
            // Verify this is actually an added line with content
            // Skip lines that just have a CSS class but aren't real changes
            if (line.type === 'added' && line.content?.trim() !== '') {
                // Double check it's not just whitespace change or identical content
                const matchingOriginalLine = originalLines?.find(ol => ol.lineNum === line.lineNum);
                const isRealChange = !matchingOriginalLine || matchingOriginalLine.content?.trim() !== line.content?.trim();

                if (isRealChange) {
                    // Calculate normalized position as percentage of viewport
                    const position = ((index + 1) / modifiedLines.length) * 100;
                    changes.push({
                        type: 'added',
                        lineNum: line.lineNum,
                        visibleIndex: index,
                        position,
                        content: line.content?.substring(0, 20)
                    });
                    console.log(`🔍 Verified added line ${line.lineNum} (idx: ${index}): "${line.content?.substring(0, 20)}"`);
                } else {
                    console.log(`⚠️ Skipping false-positive added line ${line.lineNum}: "${line.content?.substring(0, 20)}"`);
                }
            }
        });
    }

    // Process removed lines (left side/original) - only if they're actually removed content
    if (originalLines?.length) {
        originalLines.forEach((line, index) => {
            // Verify this is actually a removed line with content
            if (line.type === 'removed' && line.content?.trim() !== '') {
                // Double check it's not just whitespace change or identical content  
                const matchingModifiedLine = modifiedLines?.find(ml => ml.lineNum === line.lineNum);
                const isRealChange = !matchingModifiedLine || matchingModifiedLine.content?.trim() !== line.content?.trim();

                if (isRealChange) {
                    // Calculate normalized position as percentage of viewport
                    const position = ((index + 1) / originalLines.length) * 100;
                    changes.push({
                        type: 'removed',
                        lineNum: line.lineNum,
                        visibleIndex: index,
                        position,
                        content: line.content?.substring(0, 20)
                    });
                    console.log(`🔍 Verified removed line ${line.lineNum} (idx: ${index}): "${line.content?.substring(0, 20)}"`);
                } else {
                    console.log(`⚠️ Skipping false-positive removed line ${line.lineNum}: "${line.content?.substring(0, 20)}"`);
                }
            }
        });
    }

    // STEP 2: Handle overlapping changes (priority: added > removed)
    // Group by similar positions (within 1% tolerance)
    const positionGroups = new Map();

    changes.forEach(change => {
        // Round to nearest 0.5% for grouping similar positions
        const roundedPos = Math.round(change.position * 2) / 2; // More precise positioning

        if (!positionGroups.has(roundedPos)) {
            positionGroups.set(roundedPos, []);
        }
        positionGroups.get(roundedPos).push(change);
    });

    // STEP 3: Generate HTML - prioritizing added > removed when at same position
    let minimapHtml = '';
    let addedCount = 0;
    let removedCount = 0;

    // Process each position group - ordered by position
    const sortedPositions = Array.from(positionGroups.keys()).sort((a, b) => a - b);

    sortedPositions.forEach(position => {
        const changesAtPosition = positionGroups.get(position);

        // Check if there's any 'added' change in this group
        const hasAdded = changesAtPosition.some(c => c.type === 'added');

        // If we have both added and removed at same position, prefer added (green)
        const change = hasAdded
            ? changesAtPosition.find(c => c.type === 'added')
            : changesAtPosition[0];

        // Generate dot for this position
        const className = change.type === 'added' ? 'added' : 'removed';
        minimapHtml += `<div class="minimap-line ${className}" style="top: ${change.position.toFixed(1)}%;" title="Line ${change.lineNum}: ${change.type}"></div>`;

        // Update counters and log with more details
        if (change.type === 'added') {
            addedCount++;
            console.log(`📗 Added dot: Line ${change.lineNum} (idx: ${change.visibleIndex}) at ${change.position.toFixed(1)}% - "${change.content}"`);
        } else {
            removedCount++;
            console.log(`📕 Removed dot: Line ${change.lineNum} (idx: ${change.visibleIndex}) at ${change.position.toFixed(1)}% - "${change.content}"`);
        }
    });

    // Report results
    const totalDots = addedCount + removedCount;
    console.log(`✅ Generated minimap with ${totalDots} dots (${addedCount} added, ${removedCount} removed)`);

    return minimapHtml;
}

/**
 * Generate diff HTML content for a single file
 * @param {object} diffData - Diff data containing path, diff, changeType, etc.
 * @returns {string} HTML content for the diff view
 */
async function generateDiffHtml(diffData) {
    const { path: filePath, diff } = diffData;

    // Parse diff to reconstruct full file content for both sides with enhanced method
    const { originalLines, modifiedLines } = await parseFullDiffContentEnhanced(diff, filePath);

    // Generate side-by-side HTML with full file content
    let leftSide = '';
    let rightSide = '';
    const maxLines = Math.max(originalLines.length, modifiedLines.length);

    for (let i = 0; i < maxLines; i++) {
        const originalLine = originalLines[i] || { content: '', lineNum: '', type: 'empty' };
        const modifiedLine = modifiedLines[i] || { content: '', lineNum: '', type: 'empty' };

        // Left side (original)
        leftSide += `<div class="diff-line ${originalLine.type}">
            <span class="line-num">${originalLine.lineNum}</span>
            <span class="line-content">${escapeHtml(originalLine.content)}</span>
        </div>\n`;

        // Right side (modified) with change indicator
        const changeIndicator = getChangeIndicator(modifiedLine.type);
        rightSide += `<div class="diff-line ${modifiedLine.type}">
            <span class="line-num">${modifiedLine.lineNum}</span>
            <span class="line-content">${escapeHtml(modifiedLine.content)}</span>
            <span class="change-indicator ${modifiedLine.type}">${changeIndicator}</span>
        </div>\n`;
    }

    // Generate minimap data
    console.log(`🔍 Generating minimap for ${filePath}...`);
    const minimapData = generateMinimap(originalLines, modifiedLines);
    console.log(`📊 Minimap data for ${filePath}:`, minimapData);

    return `
        <div class="diff-side-by-side">
            <div class="diff-side left-side">
                <div class="side-header">Original File</div>
                ${leftSide}
            </div>
            <div class="diff-side right-side">
                <div class="side-header">Modified File</div>
                ${rightSide}
            </div>
            <div class="minimap-container">
                <div class="minimap">
                    ${minimapData}
                </div>
            </div>
        </div>
    `;
}

async function getWebviewContent(diffData) {
    const { path: filePath, changeType, additions, deletions } = diffData;

    // Use the new shared function
    const diffHtml = await generateDiffHtml(diffData);

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Diff View: ${escapeHtml(filePath)}</title>
    <style>
        body {
            font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
            font-size: 13px;
            line-height: 1.5;
            margin: 0;
            padding: 0;
            background-color: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
        }
        
        .header {
            padding: 16px 20px;
            background-color: var(--vscode-editorWidget-background);
            border-bottom: 1px solid var(--vscode-panel-border);
            position: sticky;
            top: 0;
            z-index: 100;
        }
        
        .file-path {
            font-size: 16px;
            font-weight: bold;
            margin-bottom: 8px;
            color: var(--vscode-editor-foreground);
        }
        
        .file-stats {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
        }
        
        .stats-badge {
            display: inline-block;
            padding: 2px 4px;
            margin-right: 4px;
            border-radius: 3px;
            font-weight: 600;
        }
        
        .badge-add {
            background-color: rgba(46, 160, 67, 0.2);
            color: #2ea043;
        }
        
        .badge-remove {
            background-color: rgba(248, 81, 73, 0.2);
            color: #f85149;
        }
        
        .badge-type {
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }
        
        .diff-container {
            padding: 0;
        }
        
        .diff-side-by-side {
            display: flex;
            height: calc(100vh - 80px);
            position: relative;
        }
        
        .diff-side {
            flex: 1;
            overflow-y: auto;
            overflow-x: auto;
            border-right: 1px solid var(--vscode-panel-border);
            scroll-behavior: auto;
        }
        
        .diff-side:last-child {
            border-right: none;
        }
        
        /* Minimap Styles */
        .minimap-container {
            position: relative;
            background-color: var(--vscode-editorWidget-background);
            border-left: 1px solid var(--vscode-panel-border);
            flex-shrink: 0;
        }
        
        .minimap-header {
            background-color: var(--vscode-editorWidget-background);
            color: var(--vscode-editor-foreground);
            font-weight: bold;
            font-size: 11px;
            padding: 8px 4px;
            border-bottom: 1px solid var(--vscode-panel-border);
            text-align: center;
            position: sticky;
            top: 0;
            z-index: 50;
        }
        
        .minimap {
            position: relative;
            width: 12px;
            height: calc(100vh - 120px);
            background-color: #2d2d2d;
            border-left: 1px solid #3a3a3a;
            overflow: hidden;
        }

        .minimap-line {
            position: absolute;
            height: 2px;
            width: 100%;
            cursor: pointer;
            transition: opacity 0.2s ease;
        }
        
        .minimap-line:hover {
            opacity: 1 !important;
            height: 3px;
        }
        
        .minimap-line.added {
            background-color: #3cde65;
            opacity: 0.9;
        }
        
        .minimap-line.removed {
            background-color: #ff4d4d;
            opacity: 0.9;
        }
        
        .minimap-line.modified {
            background-color: #ffcc33;
            opacity: 0.9;
        }
        
        .minimap-line.empty {
            background-color: transparent;
        }
        
        /* Viewport indicator */
        .minimap-viewport {
            position: absolute;
            left: 0;
            right: 0;
            background-color: rgba(80, 80, 80, 0.25);
            border: 1px solid rgba(255, 255, 255, 0.3);
            border-left: 3px solid var(--vscode-focusBorder);
            opacity: 0.8;
            pointer-events: auto; /* Enable interaction with viewport */
            z-index: 10;
            cursor: grab; /* Show grab cursor to indicate it can be dragged */
        }
        
        /* Style when dragging */
        .minimap-viewport.dragging {
            cursor: grabbing;
            background-color: rgba(100, 100, 100, 0.4);
        }
        
        .side-header {
            background-color: var(--vscode-editorWidget-background);
            color: var(--vscode-editor-foreground);
            font-weight: bold;
            padding: 8px 12px;
            border-bottom: 1px solid var(--vscode-panel-border);
            position: sticky;
            top: 0;
            z-index: 50;
        }
        
        .diff-line, .diff-context, .diff-add, .diff-remove, .diff-empty, .diff-hunk {
            padding: 2px 4px;
            white-space: pre;
            display: flex;
            min-height: 20px;
            line-height: 20px;
        }
        
        .line-num {
            display: inline-block;
            width: 50px;
            text-align: right;
            padding-right: 8px;
            color: var(--vscode-editorLineNumber-foreground);
            background-color: var(--vscode-editorGutter-background);
            user-select: none;
            flex-shrink: 0;
        }
        
        .line-content {
            flex: 1;
            padding-left: 8px;
        }
        
        .diff-add {
            background-color: rgba(46, 160, 67, 0.15);
        }
        
        .diff-add .line-num {
            background-color: rgba(46, 160, 67, 0.3);
            color: #2ea043;
            font-weight: bold;
        }
        
        .diff-remove {
            background-color: rgba(248, 81, 73, 0.15);
        }
        
        .diff-remove .line-num {
            background-color: rgba(248, 81, 73, 0.3);
            color: #f85149;
            font-weight: bold;
        }
        
        .diff-context {
            background-color: var(--vscode-editor-background);
        }
        
        .diff-empty {
            background-color: rgba(128, 128, 128, 0.05);
        }
        
        .diff-empty .line-num {
            background-color: var(--vscode-editorGutter-background);
        }
        
        .diff-hunk {
            background-color: var(--vscode-editorGutter-background);
            color: var(--vscode-editorLineNumber-foreground);
            font-weight: bold;
        }
        
        .diff-hunk .line-num {
            background-color: var(--vscode-editorGutter-background);
        }
        
        .left-side .diff-add {
            display: none;
        }
        
        .right-side .diff-remove {
            display: none;
        }
        
        /* Horizontal scroll support */
        .line-content {
            white-space: nowrap !important;
            min-width: max-content !important;
            padding-right: 4px !important;
        }
        
        .diff-line, .diff-context, .diff-add, .diff-remove, .diff-empty, .diff-hunk {
            min-width: max-content !important;
        }
        
        /* Change indicator styles for full file view */
        .change-indicator {
            width: 20px;
            text-align: center;
            font-weight: bold;
            flex-shrink: 0;
            font-size: 14px;
            padding: 0 2px;
        }
        
        .change-indicator.added {
            color: #2ea043;
            background-color: rgba(46, 160, 67, 0.3);
        }
        
        .change-indicator.removed {
            color: #f85149;
            background-color: rgba(248, 81, 73, 0.3);
        }
        
        .diff-line.added {
            background-color: rgba(46, 160, 67, 0.08) !important;
        }
        
        .diff-line.added .line-num {
            background-color: rgba(46, 160, 67, 0.15) !important;
            color: #2ea043 !important;
            font-weight: bold !important;
        }
        
        .diff-line.removed {
            background-color: rgba(248, 81, 73, 0.08) !important;
        }
        
        .diff-line.removed .line-num {
            background-color: rgba(248, 81, 73, 0.15) !important;
            color: #f85149 !important;
            font-weight: bold !important;
        }
        
        .diff-line.context {
            background-color: var(--vscode-editor-background) !important;
        }
        
        .diff-line.empty {
            background-color: rgba(128, 128, 128, 0.02) !important;
        }
        

        
        .diff-side:hover .diff-context,
        .diff-side:hover .diff-add,
        .diff-side:hover .diff-remove {
            background-color: var(--vscode-list-hoverBackground);
        }
        
        /* Toggle button styles */
        .view-toggle {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-top: 8px;
        }
        
        .toggle-group {
            display: flex;
            border: 1px solid var(--vscode-button-border);
            border-radius: 4px;
            overflow: hidden;
        }
        
        .toggle-btn {
            padding: 6px 12px;
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            border: none;
            cursor: pointer;
            font-size: 11px;
            font-weight: 500;
            transition: all 0.2s ease;
            min-width: 85px;
            text-align: center;
            white-space: nowrap;
        }
        
        .toggle-btn:hover {
            background-color: var(--vscode-button-hoverBackground);
        }
        
        .toggle-btn.active {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
        }
        
        .toggle-label {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
        }
        
        /* Inline mode styles */
        .diff-inline {
            display: block;
        }
        
        .diff-inline .diff-side-by-side {
            display: none;
        }
        
        .diff-inline-content {
            padding: 0;
            font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
            overflow: auto;
            height: calc(100vh - 120px);
        }
        
        .diff-inline .diff-line {
            display: flex;
            min-height: 20px;
            line-height: 20px;
            border-left: 3px solid transparent;
        }
        
        .diff-inline .diff-line.added {
            background-color: rgba(46, 160, 67, 0.15);
            border-left-color: #2ea043;
        }
        
        .diff-inline .diff-line.removed {
            background-color: rgba(248, 81, 73, 0.15);
            border-left-color: #f85149;
        }
        
        .diff-inline .diff-line.context {
            background-color: var(--vscode-editor-background);
        }
        
        .diff-inline .line-num {
            width: 60px;
            text-align: right;
            padding-right: 8px;
            color: var(--vscode-editorLineNumber-foreground);
            background-color: var(--vscode-editorGutter-background);
            user-select: none;
            flex-shrink: 0;
        }
        
        .diff-inline .line-content {
            flex: 1;
            padding-left: 8px;
            white-space: pre;
        }
    </style>
</head>
<body>
    <div class="header">
        <div class="file-path">📄 ${escapeHtml(filePath)}</div>
        <div class="file-stats">
            <span class="stats-badge badge-type">${escapeHtml(changeType)}</span>
            <span class="stats-badge badge-add">+${additions}</span>
            <span class="stats-badge badge-remove">-${deletions}</span>
        </div>
        <div class="view-toggle">
            <span class="toggle-label">View:</span>
            <div class="toggle-group">
                <button class="toggle-btn active" data-mode="side-by-side">📊 Side by side</button>
                <button class="toggle-btn" data-mode="inline">📝 Inline</button>
            </div>
        </div>
    </div>
    <div class="diff-container" id="diffContainer">
        ${diffHtml}
        <div class="diff-inline-content" id="inlineContent" style="display: none;">
            <!-- Inline diff content will be generated here -->
        </div>
    </div>
    
    <script>
        // Synchronized scrolling between left and right sides
        document.addEventListener('DOMContentLoaded', function() {
            const leftSide = document.querySelector('.left-side');
            const rightSide = document.querySelector('.right-side');
            const minimap = document.querySelector('.minimap');
            const minimapLines = document.querySelectorAll('.minimap-line');
            
            if (leftSide && rightSide) {
                let isVerticalScrolling = false;
                let isHorizontalScrolling = false;
                
                // Sync both vertical and horizontal scroll
                leftSide.addEventListener('scroll', function() {
                    if (!isVerticalScrolling) {
                        isVerticalScrolling = true;
                        rightSide.scrollTop = leftSide.scrollTop;
                        updateMinimapViewport();
                        setTimeout(() => { isVerticalScrolling = false; }, 10);
                    }
                    if (!isHorizontalScrolling) {
                        isHorizontalScrolling = true;
                        rightSide.scrollLeft = leftSide.scrollLeft;
                        setTimeout(() => { isHorizontalScrolling = false; }, 10);
                    }
                });
                
                rightSide.addEventListener('scroll', function() {
                    if (!isVerticalScrolling) {
                        isVerticalScrolling = true;
                        leftSide.scrollTop = rightSide.scrollTop;
                        updateMinimapViewport();
                        setTimeout(() => { isVerticalScrolling = false; }, 10);
                    }
                    if (!isHorizontalScrolling) {
                        isHorizontalScrolling = true;
                        leftSide.scrollLeft = rightSide.scrollLeft;
                        setTimeout(() => { isHorizontalScrolling = false; }, 10);
                    }
                });
                
                // Minimap click-to-scroll functionality
                minimapLines.forEach(function(line) {
                    line.addEventListener('click', function() {
                        const lineIndex = parseInt(this.dataset.line);
                        const diffLines = rightSide.querySelectorAll('.diff-line');
                        
                        if (diffLines[lineIndex]) {
                            diffLines[lineIndex].scrollIntoView({ 
                                behavior: 'smooth', 
                                block: 'center' 
                            });
                        }
                    });
                });
                
                // Create and update viewport indicator
                let viewportIndicator = null;
                let isDraggingViewport = false;
                let lastDragY = 0;
                let scrollHeightCache = 0;
                let minimapHeightCache = 0;
                
                function updateMinimapViewport() {
                    if (!viewportIndicator && minimap) {
                        viewportIndicator = document.createElement('div');
                        viewportIndicator.className = 'minimap-viewport';
                        minimap.appendChild(viewportIndicator);
                        
                        // Add drag event handlers for viewport indicator
                        viewportIndicator.addEventListener('mousedown', startDraggingViewport);
                    }
                    
                    if (viewportIndicator && rightSide) {
                        const scrollTop = rightSide.scrollTop;
                        const scrollHeight = rightSide.scrollHeight;
                        const clientHeight = rightSide.clientHeight;
                        const minimapHeight = minimap.clientHeight;
                        
                        // Cache these values for drag calculations
                        scrollHeightCache = scrollHeight;
                        minimapHeightCache = minimapHeight;
                        
                        const viewportTop = (scrollTop / scrollHeight) * minimapHeight;
                        const viewportHeight = (clientHeight / scrollHeight) * minimapHeight;
                        
                        viewportIndicator.style.top = viewportTop + 'px';
                        viewportIndicator.style.height = Math.max(2, viewportHeight) + 'px';
                    }
                }
                
                // Viewport dragging functionality
                function startDraggingViewport(e) {
                    if (!viewportIndicator) return;
                    
                    e.preventDefault();
                    e.stopPropagation();
                    
                    isDraggingViewport = true;
                    viewportIndicator.classList.add('dragging');
                    lastDragY = e.clientY;
                    
                    // Add global event listeners for dragging
                    document.addEventListener('mousemove', moveViewport);
                    document.addEventListener('mouseup', stopDraggingViewport);
                }
                
                function moveViewport(e) {
                    if (!isDraggingViewport || !viewportIndicator || !rightSide) return;
                    
                    e.preventDefault();
                    
                    const dragDelta = e.clientY - lastDragY;
                    lastDragY = e.clientY;
                    
                    // Calculate how much to scroll based on drag distance
                    if (minimapHeightCache > 0 && scrollHeightCache > 0) {
                        const scrollRatio = scrollHeightCache / minimapHeightCache;
                        const scrollAmount = dragDelta * scrollRatio;
                        
                        rightSide.scrollTop += scrollAmount;
                    }
                }
                
                function stopDraggingViewport() {
                    if (viewportIndicator) {
                        viewportIndicator.classList.remove('dragging');
                    }
                    isDraggingViewport = false;
                    
                    // Remove global event listeners
                    document.removeEventListener('mousemove', moveViewport);
                    document.removeEventListener('mouseup', stopDraggingViewport);
                }
                
                // Initial viewport update
                setTimeout(updateMinimapViewport, 100);
            }
            
            // Toggle functionality for inline/side-by-side view
            const toggleButtons = document.querySelectorAll('.toggle-btn');
            const diffContainer = document.getElementById('diffContainer');
            const inlineContent = document.getElementById('inlineContent');
            
            toggleButtons.forEach(button => {
                button.addEventListener('click', function() {
                    const mode = this.dataset.mode;
                    
                    // Update button states
                    toggleButtons.forEach(btn => btn.classList.remove('active'));
                    this.classList.add('active');
                    
                    if (mode === 'inline') {
                        // Switch to inline mode
                        diffContainer.classList.add('diff-inline');
                        generateInlineContent();
                        inlineContent.style.display = 'block';
                    } else {
                        // Switch to side-by-side mode
                        diffContainer.classList.remove('diff-inline');
                        inlineContent.style.display = 'none';
                    }
                });
            });
            
            function generateInlineContent() {
                const leftLines = document.querySelectorAll('.left-side .diff-line');
                const rightLines = document.querySelectorAll('.right-side .diff-line');
                let inlineHtml = '';
                
                // Helper function to check if content has meaningful text
                function hasTextContent(content) {
                    if (!content) return false;
                    // Remove HTML tags and check if there's meaningful text
                    const textOnly = content.replace(/<[^>]*>/g, '').trim();
                    // Skip empty lines, lines with just +/-, or lines that are just image tags
                    return textOnly.length > 0 && 
                           textOnly !== '+' && 
                           textOnly !== '-' && 
                           !textOnly.match(/^\s*$/);
                }
                
                // Combine left and right side lines into inline format
                const maxLines = Math.max(leftLines.length, rightLines.length);
                
                for (let i = 0; i < maxLines; i++) {
                    const leftLine = leftLines[i];
                    const rightLine = rightLines[i];
                    
                    // Handle removed lines (from left side)
                    if (leftLine && leftLine.classList.contains('diff-remove')) {
                        const lineNum = leftLine.querySelector('.line-num')?.textContent || '';
                        const content = leftLine.querySelector('.line-content')?.textContent || '';
                        
                        // Only show if there's meaningful text content
                        if (hasTextContent(content)) {
                            inlineHtml += '<div class="diff-line removed">' +
                                '<span class="line-num">' + lineNum + '</span>' +
                                '<span class="line-content">-' + content + '</span>' +
                            '</div>';
                        }
                    }
                    
                    // Handle added lines (from right side)
                    if (rightLine && rightLine.classList.contains('diff-add')) {
                        const lineNum = rightLine.querySelector('.line-num')?.textContent || '';
                        const content = rightLine.querySelector('.line-content')?.textContent || '';
                        
                        // Only show if there's meaningful text content
                        if (hasTextContent(content)) {
                            inlineHtml += '<div class="diff-line added">' +
                                '<span class="line-num">' + lineNum + '</span>' +
                                '<span class="line-content">+' + content + '</span>' +
                            '</div>';
                        }
                    }
                    
                    // Handle context lines (show once, preferring right side)
                    const contextLine = rightLine || leftLine;
                    if (contextLine && contextLine.classList.contains('diff-context')) {
                        const lineNum = contextLine.querySelector('.line-num')?.textContent || '';
                        const content = contextLine.querySelector('.line-content')?.textContent || '';
                        
                        // Only show if there's meaningful text content
                        if (hasTextContent(content)) {
                            inlineHtml += '<div class="diff-line context">' +
                                '<span class="line-num">' + lineNum + '</span>' +
                                '<span class="line-content">' + content + '</span>' +
                            '</div>';
                        }
                    }
                }
                
                inlineContent.innerHTML = inlineHtml;
            }
        });
    </script>
</body>
</html>`;
}

/**
 * Get Monaco Editor language identifier from file extension
 * @param {string} fileExtension - File extension (e.g., ".js", ".py")
 * @returns {string} Monaco language identifier
 */
function getMonacoLanguage(fileExtension) {
    const languageMap = {
        '.js': 'javascript',
        '.jsx': 'javascript',
        '.ts': 'typescript',
        '.tsx': 'typescript',
        '.py': 'python',
        '.java': 'java',
        '.cs': 'csharp',
        '.cpp': 'cpp',
        '.c': 'c',
        '.h': 'c',
        '.hpp': 'cpp',
        '.php': 'php',
        '.rb': 'ruby',
        '.go': 'go',
        '.rs': 'rust',
        '.swift': 'swift',
        '.kt': 'kotlin',
        '.scala': 'scala',
        '.sh': 'shell',
        '.bash': 'shell',
        '.ps1': 'powershell',
        '.html': 'html',
        '.htm': 'html',
        '.xml': 'xml',
        '.css': 'css',
        '.scss': 'scss',
        '.sass': 'sass',
        '.less': 'less',
        '.json': 'json',
        '.yaml': 'yaml',
        '.yml': 'yaml',
        '.md': 'markdown',
        '.sql': 'sql',
        '.r': 'r',
        '.lua': 'lua',
        '.dart': 'dart',
        '.vue': 'vue'
    };
    
    return languageMap[fileExtension.toLowerCase()] || 'plaintext';
}

/**
 * Generate Monaco Editor webview content for enhanced diff viewing
 * @param {Object} diffData - The diff data object
 * @param {Object} panel - The webview panel
 * @param {Object} context - The extension context
 * @returns {string} HTML content for webview with Monaco Editor
 */
async function getMonacoWebviewContent(diffData, panel, context) {
    const { path: filePath, changeType, additions, deletions, diff } = diffData;
    
    console.log('🚀 Monaco webview content generation started for:', filePath);

    // Get all files in PR for sidebar
    let allFiles = [];
    let currentFileIndex = 0;
    const cache = global.prDiffCache;
    
    if (cache) {
        const cacheKeys = Object.keys(cache).filter(key => key.startsWith('pr') && cache[key].path);
        allFiles = cacheKeys.map((key, index) => {
            const file = cache[key];
            const isCurrentFile = file.path === filePath;
            if (isCurrentFile) currentFileIndex = index;
            
            return {
                path: file.path,
                name: file.path.split('/').pop(),
                additions: file.additions || 0,
                deletions: file.deletions || 0,
                changeType: file.changeType || 'modified',
                active: isCurrentFile
            };
        });
        
        console.log('📁 Found', allFiles.length, 'files in PR, current file index:', currentFileIndex);
    }

    // Generate file URL for Azure DevOps/GitHub (PR context)
    let fileUrl = null;
    
    if (cache && cache.organization && cache.project && cache.repository) {
        // Get PR ID from any cached diff data
        let prId = null;
        const cacheKeys = Object.keys(cache);
        for (const key of cacheKeys) {
            if (key.startsWith('pr') && cache[key].prId) {
                prId = cache[key].prId;
                break;
            }
        }
        
        if (prId) {
            // Azure DevOps PR file URL format
            fileUrl = `https://dev.azure.com/${cache.organization}/${cache.project}/_git/${cache.repository}/pullrequest/${prId}?_a=files&path=${encodeURIComponent(filePath)}`;
            console.log('🔗 Generated Azure DevOps PR file URL:', fileUrl);
        }
    } else if (diffData.provider === 'github' && diffData.owner && diffData.repo && diffData.prId) {
        // GitHub PR file URL format
        fileUrl = `https://github.com/${diffData.owner}/${diffData.repo}/pull/${diffData.prId}/files#diff-${encodeURIComponent(filePath)}`;
        console.log('🔗 Generated GitHub PR file URL:', fileUrl);
    }

    // Get Monaco Editor URIs
    const monacoUri = panel.webview.asWebviewUri(
        vscode.Uri.file(path.join(context.extensionPath, 'monaco-editor', 'min', 'vs'))
    );
    
    console.log('📁 Monaco URI:', monacoUri.toString());

    // Parse diff to get original and modified content
    const { originalLines, modifiedLines } = await parseFullDiffContentEnhanced(diff, filePath);
    
    console.log('📊 Original lines:', originalLines.length, 'Modified lines:', modifiedLines.length);
    
    // Reconstruct full file content
    const originalContent = originalLines.map(line => line.content).join('\n');
    const modifiedContent = modifiedLines.map(line => line.content).join('\n');
    
    console.log('📝 Original content length:', originalContent.length, 'Modified content length:', modifiedContent.length);
    
    // Detect file language from extension
    const fileExtension = path.extname(filePath);
    const language = getMonacoLanguage(fileExtension);
    
    console.log('🔤 Detected language:', language, 'for extension:', fileExtension);

    // Generate file list HTML for sidebar
    let fileListHtml = '';
    if (allFiles.length > 0) {
        fileListHtml = allFiles.map((file, index) => `
            <div class="file-item ${file.active ? 'active' : ''}" data-path="${escapeHtml(file.path)}" title="${escapeHtml(file.path)}">
                <div class="file-icon">📄</div>
                <div class="file-details">
                    <div class="file-name">${escapeHtml(file.name)}</div>
                    <div class="file-path">${escapeHtml(file.path)}</div>
                    <div class="file-stats">
                        <span class="additions">+${file.additions}</span>
                        <span class="deletions">-${file.deletions}</span>
                        <span class="change-type">${escapeHtml(file.changeType)}</span>
                    </div>
                </div>
            </div>
        `).join('');
    }

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" 
          content="default-src 'none'; 
                   script-src ${panel.webview.cspSource} 'unsafe-inline'; 
                   style-src ${panel.webview.cspSource} 'unsafe-inline';">
    <title>Monaco Diff View: ${escapeHtml(filePath)}</title>
    <style>
        body {
            margin: 0;
            padding: 0;
            background-color: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
            font-family: var(--vscode-editor-font-family);
        }
        
        .header {
            padding: 16px 20px;
            background-color: var(--vscode-editorWidget-background);
            border-bottom: 1px solid var(--vscode-panel-border);
            position: sticky;
            top: 0;
            z-index: 100;
        }
        
        .header-content {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            gap: 20px;
        }
        
        .file-info {
            flex: 1;
            min-width: 0; /* Allow text to truncate */
        }
        
        .file-path {
            font-size: 16px;
            font-weight: bold;
            margin-bottom: 8px;
            color: var(--vscode-editor-foreground);
        }
        
        .file-path-link {
            color: var(--vscode-textLink-foreground);
            text-decoration: none;
            border-bottom: 1px solid transparent;
            transition: all 0.2s ease;
        }
        
        .file-path-link:hover {
            color: var(--vscode-textLink-activeForeground);
            border-bottom-color: var(--vscode-textLink-activeForeground);
        }
        
        .file-path-link:focus {
            outline: 1px solid var(--vscode-focusBorder);
            outline-offset: 2px;
        }
        
        .file-stats {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
        }
        
        .stats-badge {
            display: inline-block;
            padding: 2px 4px;
            margin-right: 4px;
            border-radius: 3px;
            font-weight: 600;
        }
        
        .badge-add {
            background-color: rgba(46, 160, 67, 0.2);
            color: #2ea043;
        }
        
        .badge-remove {
            background-color: rgba(248, 81, 73, 0.2);
            color: #f85149;
        }
        
        .badge-type {
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }

        #container {
            height: calc(100vh - 120px);
            width: 100%;
        }
        
        /* Force scrollbar visibility for Monaco Diff Editor */
        .monaco-diff-editor .editor.modified .monaco-scrollable-element > .scrollbar,
        .monaco-diff-editor .editor.original .monaco-scrollable-element > .scrollbar {
            visibility: visible !important;
            opacity: 1 !important;
        }
        
        .monaco-diff-editor .editor.modified .monaco-scrollable-element > .scrollbar.horizontal,
        .monaco-diff-editor .editor.original .monaco-scrollable-element > .scrollbar.horizontal {
            visibility: visible !important;
            opacity: 1 !important;
            height: 14px !important;
        }
        
        .monaco-diff-editor .editor.modified .monaco-scrollable-element > .scrollbar.vertical,
        .monaco-diff-editor .editor.original .monaco-scrollable-element > .scrollbar.vertical {
            visibility: visible !important;
            opacity: 1 !important;
            width: 14px !important;
        }
        
        /* Force scrollbar track visibility */
        .monaco-diff-editor .monaco-scrollable-element .scrollbar .slider {
            visibility: visible !important;
            opacity: 1 !important;
        }
        
        .view-toggle {
            display: flex;
            align-items: center;
            gap: 8px;
            flex-shrink: 0; /* Don't shrink on small screens */
        }
        
        .toggle-group {
            display: flex;
            border: 1px solid var(--vscode-button-border);
            border-radius: 4px;
            overflow: hidden;
            background-color: var(--vscode-button-secondaryBackground);
        }
        
        .toggle-btn {
            padding: 6px 12px;
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            border: none;
            cursor: pointer;
            font-size: 11px;
            font-weight: 500;
            transition: all 0.2s ease;
            min-width: 85px;
            text-align: center;
            white-space: nowrap;
        }
        
        .toggle-btn:hover {
            background-color: var(--vscode-button-hoverBackground);
        }
        
        .toggle-btn.active {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            font-weight: 600;
        }
        
        .toggle-label {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            font-weight: 500;
        }
        
        /* Azure DevOps Style Layout */
        .main-container {
            display: flex;
            height: calc(100vh - 80px);
            overflow: hidden;
        }
        
        body.resizing {
            cursor: col-resize !important;
            user-select: none;
        }
        
        body.resizing * {
            cursor: col-resize !important;
            user-select: none;
        }
        
        .file-sidebar {
            width: 350px;
            background-color: var(--vscode-sideBar-background);
            border-right: 1px solid var(--vscode-panel-border);
            overflow-y: hidden;              /* Bỏ scroll bar */
            overflow-x: hidden;              /* Bỏ scroll horizontal */
            flex-shrink: 0;
            min-width: 200px;
            max-width: 600px;
            position: relative;
            user-select: none; /* Prevent text selection during resize */
        }
        
        /* Custom resize handle - full height drag area */
        .file-sidebar .resize-handle {
            position: absolute;
            top: 0;
            right: -2px;
            width: 4px;
            height: 100%;
            background-color: transparent;
            cursor: col-resize;
            z-index: 100;
            transition: background-color 0.2s ease;
        }
        
        .file-sidebar .resize-handle:hover {
            background-color: var(--vscode-focusBorder);
            opacity: 0.7;
        }
        
        .file-sidebar .resize-handle.dragging {
            background-color: var(--vscode-focusBorder);
            opacity: 1;
        }
        
        /* Remove default resize styles */
        .file-sidebar::after {
            display: none;
        }
        
        .sidebar-header {
            padding: 12px 16px;
            border-bottom: 1px solid var(--vscode-panel-border);
            background-color: var(--vscode-editorWidget-background);
            font-weight: 600;
            font-size: 14px;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        
        .files-count {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
            font-weight: normal;
        }
        
        .file-item {
            padding: 12px 16px;
            border-bottom: 1px solid var(--vscode-panel-border);
            cursor: pointer;
            transition: background-color 0.2s;
            display: flex;
            align-items: flex-start;
            gap: 12px;
        }
        
        .file-item:hover {
            background-color: var(--vscode-list-hoverBackground);
        }
        
        .file-item.active {
            background-color: var(--vscode-list-activeSelectionBackground);
            color: var(--vscode-list-activeSelectionForeground);
        }
        
        .file-icon {
            font-size: 16px;
            flex-shrink: 0;
            margin-top: 2px;
        }
        
        .file-details {
            flex: 1;
            min-width: 0;
        }
        
        .file-item .file-name {
            font-weight: 600;
            margin-bottom: 4px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            font-size: 13px;
        }
        
        .file-item .file-path {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
            margin-bottom: 6px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        
        .file-item .file-stats {
            display: flex;
            gap: 8px;
            font-size: 11px;
            flex-wrap: wrap;
        }
        
        .file-item .additions {
            color: var(--vscode-gitDecoration-addedResourceForeground);
            font-weight: 500;
        }
        
        .file-item .deletions {
            color: var(--vscode-gitDecoration-deletedResourceForeground);
            font-weight: 500;
        }
        
        .file-item .change-type {
            color: var(--vscode-descriptionForeground);
            font-size: 10px;
            text-transform: uppercase;
            font-weight: 500;
        }
        
        .editor-area {
            flex: 1;
            display: flex;
            flex-direction: column;
        }
        
        #container {
            flex: 1;
            overflow: hidden;
        }
        
        /* Hide sidebar when no files */
        .hide-sidebar .file-sidebar {
            display: none;
        }
        
        .hide-sidebar .editor-area {
            width: 100%;
        }
        
        /* Inline mode styles - Keep sidebar on left, only change editor area */
        .inline-mode .main-container {
            display: flex; /* Keep horizontal layout */
            height: calc(100vh - 80px);
        }
        
        .inline-mode .file-sidebar {
            width: 350px; /* Keep default width */
            height: calc(100vh - 80px); /* Keep full height */
            resize: horizontal; /* Keep horizontal resize */
            min-width: 200px;
            max-width: 600px;
            border-right: 1px solid var(--vscode-panel-border);
            border-bottom: none; /* Remove bottom border */
        }
        
        .inline-mode .file-sidebar::after {
            top: 0; /* Reset to default */
            right: 0;
            bottom: auto;
            left: auto;
            width: 4px; /* Keep horizontal resize handle */
            height: 100%;
            cursor: col-resize; /* Keep horizontal cursor */
        }
        
        .inline-mode .editor-area {
            flex: 1;
            overflow: hidden;
        }
        
        /* Inline diff styles */
        .inline-diff-container {
            display: none;
            height: 100%;
            overflow: auto;
            background-color: var(--vscode-editor-background);
            font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
        }
        
        .inline-mode .inline-diff-container {
            display: block;
        }
        
        .inline-mode #container {
            display: none;
        }
        
        .inline-diff-line {
            display: flex;
            min-height: 20px;
            line-height: 20px;
            padding: 2px 0;
            border-left: 3px solid transparent;
            font-size: 13px;
        }
        
        .inline-diff-line.added {
            background-color: rgba(46, 160, 67, 0.15);
            border-left-color: #2ea043;
        }
        
        .inline-diff-line.removed {
            background-color: rgba(248, 81, 73, 0.15);
            border-left-color: #f85149;
        }
        
        .inline-diff-line.context {
            background-color: var(--vscode-editor-background);
        }
        
        .inline-line-num {
            width: 80px;
            text-align: right;
            padding: 0 8px;
            color: var(--vscode-editorLineNumber-foreground);
            background-color: var(--vscode-editorGutter-background);
            user-select: none;
            flex-shrink: 0;
            font-size: 12px;
            display: flex;
            gap: 4px;
        }
        
        .inline-line-content {
            flex: 1;
            padding: 0 8px;
            color: var(--vscode-editor-foreground);
            white-space: pre;
            overflow-x: auto;
        }
        
        .inline-change-indicator {
            width: 20px;
            text-align: center;
            font-weight: bold;
            flex-shrink: 0;
            color: var(--vscode-editor-foreground);
        }
        
        /* Loading spinner styles - lightweight version */
        .loading-spinner {
            display: inline-block;
            width: 20px;
            height: 20px;
            border: 2px solid var(--vscode-button-secondaryBackground);
            border-radius: 50%;
            border-top: 2px solid var(--vscode-button-background);
            animation: spin 1s linear infinite;
        }
        
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
        
        /* Lightweight loading for diff editor */
        .editor-loading {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            z-index: 10;
            background-color: var(--vscode-editor-background);
            padding: 12px;
            border-radius: 6px;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 13px;
            color: var(--vscode-editor-foreground);
        }
        
        .editor-loading .loading-spinner {
            width: 16px;
            height: 16px;
            border-width: 2px;
        }
        
        /* Remove heavy overlay styles */
        .loading-overlay {
            display: none; /* Disable heavy overlay */
        }
        
        .file-item.loading .file-name::before {
            content: '';
            display: inline-block;
            width: 10px;
            height: 10px;
            border: 1px solid var(--vscode-button-secondaryBackground);
            border-radius: 50%;
            border-top: 1px solid var(--vscode-button-background);
            animation: spin 0.8s linear infinite;
            margin-right: 6px;
        }
    </style>
</head>
<body class="${allFiles.length > 1 ? '' : 'hide-sidebar'}">
    <div class="header">
        <div class="header-content">
            <div class="file-info">
                <div class="file-path">
                    🚀 Monaco Diff View: 
                    ${fileUrl ? 
                        `<a href="${fileUrl}" target="_blank" class="file-path-link" title="Open this file in PR on Azure DevOps">${escapeHtml(filePath)}</a>` : 
                        escapeHtml(filePath)
                    }
                </div>
                <div class="file-stats">
                    <span class="stats-badge badge-type">${escapeHtml(changeType)}</span>
                    <span class="stats-badge badge-add">+${additions}</span>
                    <span class="stats-badge badge-remove">-${deletions}</span>
                    <span style="margin-left: 10px; color: var(--vscode-descriptionForeground);">Language: ${language}</span>
                </div>
            </div>
            <div class="view-toggle">
                <div class="toggle-group">
                    <button class="toggle-btn active" data-mode="side-by-side" title="Side by side comparison">📊 Side by Side</button>
                    <button class="toggle-btn" data-mode="inline" title="Inline unified diff">📝 Inline</button>
                </div>
            </div>
        </div>
    </div>
    
    <div class="main-container">
        ${allFiles.length > 1 ? `
        <div class="file-sidebar">
            <div class="sidebar-header">
                Files Changed
                <span class="files-count">${allFiles.length} files</span>
            </div>
            <div class="file-list">
                ${fileListHtml}
            </div>
            <div class="resize-handle"></div>
        </div>
        ` : ''}
        
        <div class="editor-area">
            <div id="container"></div>
            <div class="inline-diff-container" id="inlineContainer">
                <!-- Inline diff content will be generated here -->
            </div>
        </div>
    </div>
    
    <script src="${monacoUri}/loader.js"></script>
    <script>
        console.log('🚀 Monaco script loading started');
        console.log('📁 Monaco URI:', '${monacoUri}');
        
        // Add error handler
        window.addEventListener('error', function(e) {
            console.error('❌ Script error:', e.error, e.filename, e.lineno);
        });
        
        require.config({ paths: { vs: '${monacoUri}' } });
        
        console.log('⚙️ Require config set, loading Monaco...');
        
        require(['vs/editor/editor.main'], function() {
            console.log('✅ Monaco editor loaded successfully');
            
            try {
                // Configure Monaco Editor theme to match VS Code
                monaco.editor.defineTheme('vs-code-dark', {
                    base: 'vs-dark',
                    inherit: true,
                    rules: [],
                    colors: {
                        'editor.background': '#1e1e1e',
                        'editor.foreground': '#d4d4d4'
                    }
                });
                
                console.log('🎨 Theme configured');

                // Create diff editor
                const diffEditor = monaco.editor.createDiffEditor(document.getElementById('container'), {
                    theme: 'vs-code-dark',
                    readOnly: true,
                    automaticLayout: true,
                    renderSideBySide: true,
                    renderOverviewRuler: true,
                    diffWordWrap: 'off',           // Turn OFF word wrap để code không bị break
                    wordWrap: 'off',               // Also disable regular word wrap
                    scrollBeyondLastLine: false,
                    scrollbar: {
                        horizontal: 'auto',        // auto = chỉ hiện khi cần
                        vertical: 'auto',          // auto = chỉ hiện khi cần  
                        horizontalScrollbarSize: 14,
                        verticalScrollbarSize: 14,
                        useShadows: false,         // bỏ shadow cho scrollbar
                        handleMouseWheel: true,
                        alwaysConsumeMouseWheel: false
                    },
                    overviewRuler: {
                        border: true
                    },
                    minimap: {
                        enabled: true,
                        side: 'right'
                    },
                    fontSize: 13,
                    lineHeight: 20,
                    fontFamily: 'Consolas, Monaco, "Courier New", monospace',
                    enableSplitViewResizing: false,
                    renderIndicators: true,
                    ignoreTrimWhitespace: false,
                    originalEditable: false,
                    diffAlgorithm: 'advanced'
                });
            
            console.log('🎯 Diff editor created');

            // Set the model for diff editor
            const originalModel = monaco.editor.createModel(
                ${JSON.stringify(originalContent)},
                '${language}'
            );
            
            console.log('📄 Original model created, language:', '${language}');
            
            const modifiedModel = monaco.editor.createModel(
                ${JSON.stringify(modifiedContent)}, 
                '${language}'
            );
            
            console.log('📄 Modified model created');

            diffEditor.setModel({
                original: originalModel,
                modified: modifiedModel
            });
            
            console.log('✅ Diff models set successfully');

            // Get individual editors and force scrollbar settings
            const originalEditor = diffEditor.getOriginalEditor();
            const modifiedEditor = diffEditor.getModifiedEditor();
            
            // Force scrollbar settings on both editors individually
            originalEditor.updateOptions({
                scrollbar: {
                    horizontal: 'auto',        // chỉ hiện khi content overflow
                    vertical: 'auto',          // chỉ hiện khi content overflow
                    horizontalScrollbarSize: 14,
                    verticalScrollbarSize: 14,
                    useShadows: false,         // bỏ shadow 
                    handleMouseWheel: true,
                    alwaysConsumeMouseWheel: false
                },
                wordWrap: 'off',               // Disable word wrap
                wordWrapColumn: 120            // Set wrap column if needed
            });
            
            modifiedEditor.updateOptions({
                scrollbar: {
                    horizontal: 'auto',        // chỉ hiện khi content overflow 
                    vertical: 'auto',          // chỉ hiện khi content overflow
                    horizontalScrollbarSize: 14,
                    verticalScrollbarSize: 14,
                    useShadows: false,         // bỏ shadow
                    handleMouseWheel: true,
                    alwaysConsumeMouseWheel: false
                },
                wordWrap: 'off',               // Disable word wrap
                wordWrapColumn: 120            // Set wrap column if needed
            });
            
            console.log('🔧 Individual editor scrollbar settings applied');
            
            // Force layout refresh to ensure scrollbars are visible
            setTimeout(() => {
                diffEditor.layout();
                originalEditor.layout();
                modifiedEditor.layout();
                console.log('🔄 Layout refreshed for scrollbar visibility');
                
                // Force refresh by updating options again
                if (originalModel && modifiedModel) {
                    // Force refresh by updating options again
                    diffEditor.updateOptions({
                        scrollbar: {
                            horizontal: 'visible',     // Force visible instead of auto
                            vertical: 'visible',       // Force visible instead of auto
                            horizontalScrollbarSize: 14,
                            verticalScrollbarSize: 14,
                            useShadows: false,
                            handleMouseWheel: true,
                            alwaysConsumeMouseWheel: false
                        },
                        diffWordWrap: 'off',           // Ensure word wrap is OFF
                        wordWrap: 'off'                // Ensure word wrap is OFF
                    });
                    
                    // Also force on individual editors again
                    originalEditor.updateOptions({
                        scrollbar: {
                            horizontal: 'visible',
                            vertical: 'visible',
                            horizontalScrollbarSize: 14,
                            verticalScrollbarSize: 14,
                            useShadows: false,
                            handleMouseWheel: true,
                            alwaysConsumeMouseWheel: false
                        },
                        wordWrap: 'off'                // Disable word wrap
                    });
                    
                    modifiedEditor.updateOptions({
                        scrollbar: {
                            horizontal: 'visible',
                            vertical: 'visible',
                            horizontalScrollbarSize: 14,
                            verticalScrollbarSize: 14,
                            useShadows: false,
                            handleMouseWheel: true,
                            alwaysConsumeMouseWheel: false
                        },
                        wordWrap: 'off'                // Disable word wrap
                    });
                    
                    console.log('🔄 Scrollbar options refreshed with forced visibility');
                }
            }, 100);

            // Use a flag to prevent infinite loop
            let isScrolling = false;
            
            // Synchronize scrolling between editors using DOM events as fallback
            originalEditor.onDidScrollChange((e) => {
                if (isScrolling) return;
                isScrolling = true;
                
                if (e.scrollLeftChanged) {
                    modifiedEditor.setScrollLeft(e.scrollLeft);
                }
                if (e.scrollTopChanged) {
                    modifiedEditor.setScrollTop(e.scrollTop);
                }
                
                setTimeout(() => { isScrolling = false; }, 10);
            });
            
            modifiedEditor.onDidScrollChange((e) => {
                if (isScrolling) return;
                isScrolling = true;
                
                if (e.scrollLeftChanged) {
                    originalEditor.setScrollLeft(e.scrollLeft);
                }
                if (e.scrollTopChanged) {
                    originalEditor.setScrollTop(e.scrollTop);
                }
                
                setTimeout(() => { isScrolling = false; }, 10);
            });
            
            // Additional DOM-based scroll sync as backup
            setTimeout(() => {
                const originalDomNode = originalEditor.getDomNode();
                const modifiedDomNode = modifiedEditor.getDomNode();
                
                if (originalDomNode && modifiedDomNode) {
                    // Force scrollbar visibility by manipulating DOM
                    const forceScrollbarVisibility = (editorNode, editorName) => {
                        const scrollbars = editorNode.querySelectorAll('.monaco-scrollable-element > .scrollbar');
                        scrollbars.forEach((scrollbar, index) => {
                            scrollbar.style.visibility = 'visible';
                            scrollbar.style.opacity = '1';
                            console.log('🔧 Forced scrollbar ' + index + ' visibility for ' + editorName);
                        });
                        
                        const sliders = editorNode.querySelectorAll('.monaco-scrollable-element .scrollbar .slider');
                        sliders.forEach((slider, index) => {
                            slider.style.visibility = 'visible';
                            slider.style.opacity = '1';
                            console.log('🔧 Forced slider ' + index + ' visibility for ' + editorName);
                        });
                    };
                    
                    forceScrollbarVisibility(originalDomNode, 'original');
                    forceScrollbarVisibility(modifiedDomNode, 'modified');
                    
                    const originalScrollable = originalDomNode.querySelector('.monaco-scrollable-element');
                    const modifiedScrollable = modifiedDomNode.querySelector('.monaco-scrollable-element');
                    
                    if (originalScrollable && modifiedScrollable) {
                        let domScrolling = false;
                        
                        originalScrollable.addEventListener('scroll', function() {
                            if (domScrolling) return;
                            domScrolling = true;
                            modifiedScrollable.scrollLeft = this.scrollLeft;
                            modifiedScrollable.scrollTop = this.scrollTop;
                            console.log('🔄 DOM sync: Original → Modified', this.scrollLeft, this.scrollTop);
                            setTimeout(() => { domScrolling = false; }, 10);
                        });
                        
                        modifiedScrollable.addEventListener('scroll', function() {
                            if (domScrolling) return;
                            domScrolling = true;
                            originalScrollable.scrollLeft = this.scrollLeft;
                            originalScrollable.scrollTop = this.scrollTop;
                            console.log('🔄 DOM sync: Modified → Original', this.scrollLeft, this.scrollTop);
                            setTimeout(() => { domScrolling = false; }, 10);
                        });
                        
                        console.log('🔄 DOM-based scroll sync configured as backup');
                    }
                }
            }, 500);
            
            console.log('🔄 Scroll synchronization configured');

            // Add toggle functionality for side-by-side vs inline mode with resizable sidebar
            const toggleButtons = document.querySelectorAll('.toggle-btn');
            toggleButtons.forEach(btn => {
                btn.addEventListener('click', function() {
                    const mode = this.getAttribute('data-mode');
                    
                    // Update button states
                    toggleButtons.forEach(b => b.classList.remove('active'));
                    this.classList.add('active');
                    
                    if (mode === 'inline') {
                        console.log('🔄 Switching to Monaco inline mode');
                        
                        // Use Monaco's built-in inline mode
                        diffEditor.updateOptions({
                            renderSideBySide: false
                        });
                        
                    } else {
                        console.log('🔄 Switching to Monaco side-by-side mode');
                        
                        // Use Monaco's side-by-side mode
                        diffEditor.updateOptions({
                            renderSideBySide: true
                        });
                    }
                    
                    // Trigger layout update
                    setTimeout(() => {
                        diffEditor.layout();
                    }, 100);
                });
            });
            
            // Handle window resize
            window.addEventListener('resize', () => {
                diffEditor.layout();
            });
            
            } catch (error) {
                console.error('❌ Error creating Monaco diff editor:', error);
                document.getElementById('container').innerHTML = '<div style="padding: 20px; color: red;">Error loading Monaco Editor: ' + error.message + '</div>';
            }
        }, function(error) {
            console.error('❌ Error loading Monaco editor:', error);
            document.getElementById('container').innerHTML = '<div style="padding: 20px; color: red;">Failed to load Monaco Editor: ' + error + '</div>';
        });
        
        // File sidebar click handlers
        document.addEventListener('DOMContentLoaded', function() {
            // File item click handlers
            const fileItems = document.querySelectorAll('.file-item');
            const editorArea = document.querySelector('.editor-area');
            
            fileItems.forEach(item => {
                item.addEventListener('click', function() {
                    const filePath = this.getAttribute('data-path');
                    if (filePath && !this.classList.contains('loading')) {
                        console.log('🔄 Loading file:', filePath);
                        
                        // Add loading state to clicked item
                        fileItems.forEach(f => f.classList.remove('active', 'loading'));
                        this.classList.add('active', 'loading');
                        
                        // Show lightweight loading spinner in editor area
                        const loadingSpinner = document.createElement('div');
                        loadingSpinner.className = 'editor-loading';
                        loadingSpinner.innerHTML = '<div class="loading-spinner"></div>Loading...';
                        editorArea.style.position = 'relative';
                        editorArea.appendChild(loadingSpinner);
                        
                        // Update header with simple loading
                        const filePathElement = document.querySelector('.file-path');
                        if (filePathElement) {
                            const originalContent = filePathElement.innerHTML;
                            filePathElement.innerHTML = '🔄 ' + filePath;
                        }
                        
                        // Send message to VS Code extension to load new file
                        try {
                            // Use VS Code webview message API to request file content
                            if (window.acquireVsCodeApi) {
                                const vscode = window.acquireVsCodeApi();
                                vscode.postMessage({
                                    type: 'openFileInMonaco',
                                    filePath: filePath
                                });
                                console.log('📤 Sent message to VS Code to load file:', filePath);
                            } else {
                                // Fallback for testing
                                console.warn('⚠️ VS Code API not available, simulating file load');
                                simulateFileLoad(filePath, this, loadingSpinner);
                            }
                        } catch (error) {
                            console.error('❌ Error sending message to VS Code:', error);
                            simulateFileLoad(filePath, this, loadingSpinner);
                        }
                    }
                });
            });
            
            // Simulate file loading for testing
            function simulateFileLoad(filePath, clickedItem, loadingOverlay) {
                setTimeout(() => {
                    // Remove loading states
                    clickedItem.classList.remove('loading');
                    if (loadingOverlay && loadingOverlay.parentNode) {
                        loadingOverlay.parentNode.removeChild(loadingOverlay);
                    }
                    
                    // Update header
                    const filePathElement = document.querySelector('.file-path');
                    if (filePathElement) {
                        filePathElement.innerHTML = '� Monaco Diff View: ' + filePath;
                    }
                    
                    console.log('✅ File loaded successfully (simulated):', filePath);
                    
                }, 800); // Faster loading time
            }

            // Resize handle functionality
            const resizeHandle = document.querySelector('.resize-handle');
            const fileSidebar = document.querySelector('.file-sidebar');
            
            if (resizeHandle && fileSidebar) {
                let isResizing = false;
                let startX, startWidth;
                
                resizeHandle.addEventListener('mousedown', function(e) {
                    isResizing = true;
                    startX = e.clientX;
                    startWidth = parseInt(getComputedStyle(fileSidebar).width, 10);
                    
                    document.body.classList.add('resizing');
                    document.addEventListener('mousemove', doResize);
                    document.addEventListener('mouseup', stopResize);
                    
                    e.preventDefault();
                });
                
                function doResize(e) {
                    if (!isResizing) return;
                    
                    const diffX = e.clientX - startX;
                    const newWidth = startWidth + diffX;
                    
                    // Constrain width between 200px and 800px
                    const minWidth = 200;
                    const maxWidth = 800;
                    const constrainedWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));
                    
                    fileSidebar.style.width = constrainedWidth + 'px';
                }
                
                function stopResize() {
                    isResizing = false;
                    document.body.classList.remove('resizing');
                    document.removeEventListener('mousemove', doResize);
                    document.removeEventListener('mouseup', stopResize);
                }
            }
        });
    </script>
</body>
</html>`;
}

/**
 * Generate webview HTML content for displaying all diffs with tabs
 * @param {number} prId - PR ID
 * @param {Array<string>} diffIds - Array of diff IDs
 * @returns {string} HTML content for webview
 */
async function getAllDiffsWebviewContent(prId, diffIds) {
    // Generate tab buttons and tab content
    let tabButtons = '';
    let tabContents = '';

    // Use for loop instead of forEach to handle async operations
    for (let index = 0; index < diffIds.length; index++) {
        const diffId = diffIds[index];
        const diffData = global.prDiffCache[diffId];
        if (!diffData) continue;

        const fileName = diffData.path.split('/').pop();
        const isActive = index === 0 ? 'active' : '';

        // Tab button
        tabButtons += `
            <button class="tab-button ${isActive}" onclick="openTab(event, 'tab${index}')">
                ${escapeHtml(fileName)}
                <span class="tab-stats">
                    <span class="add">+${diffData.additions}</span>
                    <span class="remove">-${diffData.deletions}</span>
                </span>
            </button>
        `;

        // Tab content - Use shared diff generation function
        const diffHtml = await generateDiffHtml(diffData);

        tabContents += `
            <div id="tab${index}" class="tab-content ${isActive}">
                <div class="file-header">
                    <div class="file-path">📄 ${escapeHtml(diffData.path)}</div>
                    <div class="file-stats">
                        <span class="stats-badge badge-type">${escapeHtml(diffData.changeType)}</span>
                        <span class="stats-badge badge-add">+${diffData.additions}</span>
                        <span class="stats-badge badge-remove">-${diffData.deletions}</span>
                    </div>
                </div>
                <div class="diff-container">
                    ${diffHtml}
                    <div class="diff-inline-content" id="inlineContent${index}">
                        <!-- Inline diff content will be generated here -->
                    </div>
                </div>
            </div>
        `;
    }

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>PR #${prId} - All Diffs</title>
    <style>
        body {
            font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
            font-size: 13px;
            line-height: 1.5;
            margin: 0;
            padding: 0;
            background-color: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
            height: 100vh;
            overflow-y: auto;
        }
        
        .header {
            padding: 12px 20px;
            background-color: var(--vscode-editorWidget-background);
            border-bottom: 2px solid var(--vscode-panel-border);
            position: sticky !important;
            top: 0 !important;
            z-index: 9999 !important;
            height: 50px;
            box-sizing: border-box;
        }
        
        .header-content {
            display: flex;
            justify-content: space-between;
            align-items: center;
            width: 100%;
        }
        
        .header h2 {
            margin: 0;
            font-size: 16px;
            color: var(--vscode-editor-foreground);
            line-height: 26px;
        }
        
        .toggle-switch {
            position: relative;
            display: inline-block;
            width: 71px;
            height: 26px;
            cursor: pointer;
        }
        
        .toggle-switch input {
            opacity: 0;
            width: 0;
            height: 0;
        }
        
        .slider {
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background-color: #2ea043; /* Green for FULL mode */
            border-radius: 20px;
            transition: all 0.3s ease;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 2px 4px rgba(0,0,0,0.2);
        }
        
        .slider:before {
            position: absolute;
            content: "";
            height: 18px;
            width: 18px;
            left: 4px;
            top: 4px;
            background-color: white;
            border-radius: 50%;
            transition: all 0.3s ease;
            box-shadow: 0 2px 4px rgba(0,0,0,0.3);
        }
        
        .slider-text {
            position: absolute;
            top: 50%;
            transform: translateY(-50%);
            color: white;
            font-size: 11px;
            font-weight: bold;
            letter-spacing: 0.5px;
            text-shadow: 0 1px 2px rgba(0,0,0,0.3);
            transition: all 0.3s ease;
            width: 100%;
            text-align: right;
            right: 12px;
        }
        
        input:checked + .slider {
            background-color: #f85149; /* Red for DIFF mode */
        }
        
        input:checked + .slider:before {
            transform: translateX(43px);
        }
        
        input:checked + .slider .slider-text {
            content: 'DIFF';
            text-align: left;
            left: 12px;
            right: auto;
        }
        
        .tabs {
            display: flex;
            overflow-x: auto;
            background-color: var(--vscode-editorGroupHeader-tabsBackground);
            border-bottom: 1px solid var(--vscode-panel-border);
            padding: 0;
            position: sticky !important;
            top: 50px !important;
            z-index: 9998 !important;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        
        .tab-button {
            background-color: var(--vscode-tab-inactiveBackground);
            color: var(--vscode-tab-inactiveForeground);
            border: none;
            padding: 10px 16px;
            cursor: pointer;
            transition: all 0.2s;
            border-right: 1px solid var(--vscode-panel-border);
            display: flex;
            align-items: center;
            gap: 8px;
            white-space: nowrap;
        }
        
        .tab-button:hover {
            background-color: var(--vscode-tab-hoverBackground);
        }
        
        .tab-button.active {
            background-color: var(--vscode-tab-activeBackground);
            color: var(--vscode-tab-activeForeground);
            border-bottom: 2px solid var(--vscode-focusBorder);
        }
        
        .tab-stats {
            display: flex;
            gap: 4px;
            font-size: 11px;
        }
        
        .tab-stats .add {
            color: #2ea043;
        }
        
        .tab-stats .remove {
            color: #f85149;
        }
        
        .tab-content {
            display: none;
            padding-top: 0;
            position: relative;
            z-index: 1;
        }
        
        .tab-content.active {
            display: block;
        }
        
        .file-header {
            padding: 16px 20px;
            background-color: var(--vscode-editorWidget-background);
            border-bottom: 1px solid var(--vscode-panel-border);
            position: relative;
            z-index: 1;
        }
        
        .file-path {
            font-size: 14px;
            font-weight: bold;
            margin-bottom: 8px;
            color: var(--vscode-editor-foreground);
        }
        
        .file-stats {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
        }
        
        .stats-badge {
            display: inline-block;
            padding: 2px 8px;
            margin-right: 8px;
            border-radius: 3px;
            font-weight: 600;
        }
        
        .badge-add {
            background-color: rgba(46, 160, 67, 0.2);
            color: #2ea043;
        }
        
        .badge-remove {
            background-color: rgba(248, 81, 73, 0.2);
            color: #f85149;
        }
        
        .badge-type {
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }
        
        .diff-container {
            padding: 0;
            overflow-x: auto;
        }
        
        .diff-line {
            display: flex;
            padding: 0;
            white-space: pre;
            border-left: 0.4px solid transparent;
            font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
        }
        
        .diff-side-by-side {
            display: flex;
            height: calc(100vh - 140px);
            position: relative;
        }
        
        .diff-side {
            flex: 1;
            overflow-y: auto;
            overflow-x: auto;
            border-right: 1px solid var(--vscode-panel-border);
            scroll-behavior: auto;
        }
        
        .diff-side:last-child {
            border-right: none;
        }
        
        .side-header {
            background-color: var(--vscode-editorWidget-background);
            color: var(--vscode-editor-foreground);
            font-weight: bold;
            padding: 8px 12px;
            border-bottom: 1px solid var(--vscode-panel-border);
            position: sticky;
            top: 0;
            z-index: 50;
        }
        
        .diff-line, .diff-context, .diff-add, .diff-remove, .diff-empty, .diff-hunk {
            padding: 2px 4px;
            white-space: pre;
            display: flex;
            min-height: 20px;
            line-height: 20px;
        }
        
        .line-num {
            display: inline-block;
            width: 50px;
            text-align: right;
            padding-right: 8px;
            color: var(--vscode-editorLineNumber-foreground);
            background-color: var(--vscode-editorGutter-background);
            user-select: none;
            flex-shrink: 0;
        }
        
        .line-content {
            flex: 1;
            padding-left: 8px;
        }
        
        .diff-add {
            background-color: rgba(46, 160, 67, 0.15);
        }
        
        .diff-add .line-num {
            background-color: rgba(46, 160, 67, 0.3);
            color: #2ea043;
            font-weight: bold;
        }
        
        .diff-remove {
            background-color: rgba(248, 81, 73, 0.15);
        }
        
        .diff-remove .line-num {
            background-color: rgba(248, 81, 73, 0.3);
            color: #f85149;
            font-weight: bold;
        }
        
        .diff-context {
            background-color: var(--vscode-editor-background);
        }
        
        .diff-empty {
            background-color: rgba(128, 128, 128, 0.05);
        }
        
        .diff-empty .line-num {
            background-color: var(--vscode-editorGutter-background);
        }
        
        .diff-hunk {
            background-color: var(--vscode-editorGutter-background);
            color: var(--vscode-editorLineNumber-foreground);
            font-weight: bold;
        }
        
        .diff-hunk .line-num {
            background-color: var(--vscode-editorGutter-background);
        }
        
        .left-side .diff-add {
            display: none;
        }
        
        .right-side .diff-remove {
            display: none;
        }
        
        /* Horizontal scroll support */
        .line-content {
            white-space: nowrap !important;
            min-width: max-content !important;
            padding-right: 4px !important;
        }
        
        .diff-line, .diff-context, .diff-add, .diff-remove, .diff-empty, .diff-hunk {
            min-width: max-content !important;
        }
        
        /* Change indicator styles for tabbed view */
        .change-indicator {
            width: 20px;
            text-align: center;
            font-weight: bold;
            flex-shrink: 0;
            font-size: 14px;
            padding: 0 2px;
        }
        
        .change-indicator.added {
            color: #2ea043;
            background-color: rgba(46, 160, 67, 0.3);
        }
        
        .change-indicator.removed {
            color: #f85149;
            background-color: rgba(248, 81, 73, 0.3);
        }
        
        .diff-line.added {
            background-color: rgba(46, 160, 67, 0.08) !important;
        }
        
        .diff-line.added .line-num {
            background-color: rgba(46, 160, 67, 0.15) !important;
            color: #2ea043 !important;
            font-weight: bold !important;
        }
        
        .diff-line.removed {
            background-color: rgba(248, 81, 73, 0.08) !important;
        }
        
        .diff-line.removed .line-num {
            background-color: rgba(248, 81, 73, 0.15) !important;
            color: #f85149 !important;
            font-weight: bold !important;
        }
        
        .diff-line.context {
            background-color: var(--vscode-editor-background) !important;
        }
        
        .diff-line.context-header {
            background-color: rgba(91, 175, 255, 0.08) !important;
            font-style: italic;
            font-weight: bold;
            color: #569cd6;
            border-top: 1px solid rgba(91, 175, 255, 0.2);
            border-bottom: 1px solid rgba(91, 175, 255, 0.2);
        }
        
        .diff-line.context-gap {
            background-color: rgba(128, 128, 128, 0.05) !important;
            font-style: italic;
            color: #8b949e;
            text-align: center;
            border-top: 1px dashed rgba(128, 128, 128, 0.3);
            border-bottom: 1px dashed rgba(128, 128, 128, 0.3);
        }
        
        .diff-line.function-header {
            background-color: rgba(75, 181, 67, 0.1) !important;
            font-weight: bold;
            color: #4bb543;
            border-left: 4px solid #4bb543;
            padding-left: 8px;
            font-size: 14px;
            border-top: 2px solid rgba(75, 181, 67, 0.3);
            border-bottom: 1px solid rgba(75, 181, 67, 0.3);
        }
        
        .diff-line.function-separator {
            background-color: rgba(128, 128, 128, 0.03) !important;
            height: 8px;
            border-bottom: 2px solid rgba(128, 128, 128, 0.2);
            margin: 4px 0;
        }
        
        .diff-line.empty {
            background-color: rgba(128, 128, 128, 0.02) !important;
        }
        
        .diff-file {
            background-color: var(--vscode-editorWidget-background);
            color: var(--vscode-descriptionForeground);
            font-weight: bold;
        }
        
        .diff-file .line-num {
            background-color: var(--vscode-editorWidget-background);
        }
        
        .diff-side:hover .diff-context,
        .diff-side:hover .diff-add,
        .diff-side:hover .diff-remove {
            background-color: var(--vscode-list-hoverBackground);
        }
        
        /* Diff-only mode styles */
        .diff-line.context[style*="display: none"],
        .diff-line.empty[style*="display: none"] {
            display: none !important;
        }
        
        /* Enhanced highlighting for diff-only mode */
        body.diff-only-mode .diff-line.added {
            border-left: 3px solid #2ea043;
        }
        
        body.diff-only-mode .diff-line.removed {
            border-left: 3px solid #f85149;
        }
        
        /* Minimap styles */
        .minimap-container {
            position: absolute;
            top: 0;
            right: 0;
            width: 15px;
            height: 100%;
            background-color: var(--vscode-editorWidget-background);
            border-left: 1px solid var(--vscode-panel-border);
            z-index: 10;
            overflow: hidden;
            pointer-events: auto; /* Enable interactions with the minimap */
        }
        
        .minimap {
            position: relative;
            width: 12px;
            height: 100%;
            background-color: #2d2d2d;
            overflow: hidden;
        }
        
        .minimap-line {
            position: absolute;
            left: 0;
            width: 100%;
            height: 2px;
            border-radius: 1px;
            cursor: pointer;
            transition: opacity 0.2s ease, height 0.2s ease;
            pointer-events: auto;
        }
        
        .minimap-line:hover {
            opacity: 1 !important;
            height: 3px;
        }
        
        .minimap-line.added {
            background-color: #3cde65; /* Brighter green for dark background */
            opacity: 0.9;
        }
        
        .minimap-line.removed {
            background-color: #ff4d4d; /* Brighter red for dark background */
            opacity: 0.9;
        }
        
        .minimap-line.modified {
            background-color: #ffcc33; /* Brighter yellow for dark background */
            opacity: 0.9;
        }
        
        /* Viewport indicator */
        .minimap-viewport {
            position: absolute;
            left: 0;
            right: 0;
            background-color: rgba(80, 80, 80, 0.25);
            border: 1px solid rgba(255, 255, 255, 0.3);
            border-left: 3px solid var(--vscode-focusBorder);
            opacity: 0.8;
            pointer-events: auto; /* Enable interaction with viewport */
            z-index: 10;
            cursor: grab; /* Show grab cursor to indicate it can be dragged */
        }
        
        /* Style when dragging */
        .minimap-viewport.dragging {
            cursor: grabbing;
            background-color: rgba(100, 100, 100, 0.4);
        }
        
        /* Toggle button styles for view mode */
        .view-toggle-group {
            display: flex;
            align-items: center;
            gap: 12px;
        }
        
        .view-mode-toggle {
            display: flex;
            border: 1px solid var(--vscode-button-border);
            border-radius: 4px;
            overflow: hidden;
        }
        
        .view-mode-btn {
            padding: 6px 12px;
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            border: none;
            cursor: pointer;
            font-size: 11px;
            font-weight: 500;
            transition: all 0.2s ease;
            min-width: 85px;
            text-align: center;
            white-space: nowrap;
        }
        
        .view-mode-btn:hover {
            background-color: var(--vscode-button-hoverBackground);
        }
        
        .view-mode-btn.active {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
        }
        
        /* Inline mode styles for tabbed view */
        .tab-content.diff-inline .diff-side-by-side {
            display: none !important;
        }
        
        .tab-content.diff-inline .diff-inline-content {
            display: block !important;
            padding: 8px;
            font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
            overflow: auto;
            height: calc(100vh - 170px);
            background-color: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
        }
        
        .tab-content .diff-inline-content {
            display: none;
        }
        
        .diff-inline-content .diff-line {
            display: flex !important;
            min-height: 20px;
            line-height: 20px;
            border-left: 3px solid transparent;
            padding: 2px 4px;
            white-space: pre;
            font-size: 13px;
        }
        
        .diff-inline-content .diff-line.added {
            background-color: rgba(46, 160, 67, 0.15) !important;
            border-left-color: #2ea043 !important;
        }
        
        .diff-inline-content .diff-line.removed {
            background-color: rgba(248, 81, 73, 0.15) !important;
            border-left-color: #f85149 !important;
        }
        
        .diff-inline-content .diff-line.context {
            background-color: var(--vscode-editor-background) !important;
        }
        
        .diff-inline-content .line-num {
            width: 60px;
            text-align: right;
            padding-right: 8px;
            color: var(--vscode-editorLineNumber-foreground);
            background-color: var(--vscode-editorGutter-background);
            user-select: none;
            flex-shrink: 0;
            font-weight: normal;
        }
        
        .diff-inline-content .line-content {
            flex: 1;
            padding-left: 8px;
            color: var(--vscode-editor-foreground);
        }
    </style>
    <script>
        function openTab(evt, tabId) {
            // Hide all tab contents
            const tabContents = document.getElementsByClassName('tab-content');
            for (let i = 0; i < tabContents.length; i++) {
                tabContents[i].classList.remove('active');
            }
            
            // Remove active class from all buttons
            const tabButtons = document.getElementsByClassName('tab-button');
            for (let i = 0; i < tabButtons.length; i++) {
                tabButtons[i].classList.remove('active');
            }
            
            // Show selected tab and mark button as active
            document.getElementById(tabId).classList.add('active');
            evt.currentTarget.classList.add('active');
            
            // Setup synchronized scrolling for the newly opened tab
            setupSyncScrolling(tabId);
        }
        
        function toggleViewMode() {
            const toggleInput = document.getElementById('viewToggle');
            const sliderText = document.querySelector('.slider-text');
            const allDiffLines = document.querySelectorAll('.diff-line');
            
            const isDiffOnly = toggleInput.checked;
            
            if (isDiffOnly) {
                // Switch to Diff Only view
                sliderText.textContent = 'DIFF';
                document.body.classList.add('diff-only-mode');
                
                // Hide context lines, show only added/removed lines
                let hiddenCount = 0;
                let shownCount = 0;
                allDiffLines.forEach(line => {
                    if (line.classList.contains('context') || line.classList.contains('empty')) {
                        line.style.display = 'none';
                        hiddenCount++;
                    } else {
                        line.style.display = 'flex';
                        shownCount++;
                    }
                });
                
                console.log('Switched to Diff Only view - hidden: ' + hiddenCount + ', shown: ' + shownCount);
            } else {
                // Switch to Full Code view
                sliderText.textContent = 'FULL';
                document.body.classList.remove('diff-only-mode');
                
                // Show all lines including context
                allDiffLines.forEach(line => {
                    line.style.display = 'flex';
                });
                
                console.log('Switched to Full Code view - showing all lines');
            }
            
            // Re-setup scrolling for active tab after view change
            const activeTab = document.querySelector('.tab-content.active');
            if (activeTab) {
                // Small delay to allow DOM updates
                setTimeout(() => {
                    setupSyncScrolling(activeTab.id);
                }, 100);
            }
        }
        
        function setupSyncScrolling(tabId) {
            const tabContent = document.getElementById(tabId);
            if (!tabContent) return;
            
            const leftSide = tabContent.querySelector('.left-side');
            const rightSide = tabContent.querySelector('.right-side');
            const minimap = tabContent.querySelector('.minimap');
            
            if (leftSide && rightSide) {
                // Remove existing listeners if any
                leftSide.onscroll = null;
                rightSide.onscroll = null;
                
                let isVerticalScrolling = false;
                let isHorizontalScrolling = false;
                let viewportIndicator = null;
                
                // Dragging state variables
                let isDraggingViewport = false;
                let lastDragY = 0;
                let scrollHeightCache = 0;
                let minimapHeightCache = 0;
                
                // Setup minimap viewport indicator for this tab
                function updateMinimapViewport() {
                    if (minimap && !viewportIndicator) {
                        viewportIndicator = document.createElement('div');
                        viewportIndicator.className = 'minimap-viewport';
                        minimap.appendChild(viewportIndicator);
                        
                        // Add drag event handlers for viewport indicator
                        viewportIndicator.addEventListener('mousedown', startDraggingViewport);
                    }
                    
                    if (viewportIndicator && rightSide && minimap) {
                        const scrollTop = rightSide.scrollTop;
                        const scrollHeight = rightSide.scrollHeight;
                        const clientHeight = rightSide.clientHeight;
                        const minimapHeight = minimap.clientHeight;
                        
                        // Cache these values for drag calculations
                        scrollHeightCache = scrollHeight;
                        minimapHeightCache = minimapHeight;
                        
                        const viewportTop = (scrollTop / scrollHeight) * minimapHeight;
                        const viewportHeight = (clientHeight / scrollHeight) * minimapHeight;
                        
                        viewportIndicator.style.top = viewportTop + 'px';
                        viewportIndicator.style.height = Math.max(2, viewportHeight) + 'px';
                    }
                }
                
                // Viewport dragging functionality
                function startDraggingViewport(e) {
                    if (!viewportIndicator) return;
                    
                    e.preventDefault();
                    e.stopPropagation();
                    
                    isDraggingViewport = true;
                    viewportIndicator.classList.add('dragging');
                    lastDragY = e.clientY;
                    
                    // Add global event listeners for dragging
                    document.addEventListener('mousemove', moveViewport);
                    document.addEventListener('mouseup', stopDraggingViewport);
                }
                
                function moveViewport(e) {
                    if (!isDraggingViewport || !viewportIndicator || !rightSide) return;
                    
                    e.preventDefault();
                    
                    const dragDelta = e.clientY - lastDragY;
                    lastDragY = e.clientY;
                    
                    // Calculate how much to scroll based on drag distance
                    if (minimapHeightCache > 0 && scrollHeightCache > 0) {
                        const scrollRatio = scrollHeightCache / minimapHeightCache;
                        const scrollAmount = dragDelta * scrollRatio;
                        
                        rightSide.scrollTop += scrollAmount;
                    }
                }
                
                function stopDraggingViewport() {
                    if (viewportIndicator) {
                        viewportIndicator.classList.remove('dragging');
                    }
                    isDraggingViewport = false;
                    
                    // Remove global event listeners
                    document.removeEventListener('mousemove', moveViewport);
                    document.removeEventListener('mouseup', stopDraggingViewport);
                }
                
                // Setup minimap click navigation
                if (minimap) {
                    minimap.addEventListener('click', function(event) {
                        if (rightSide) {
                            const minimapHeight = minimap.clientHeight;
                            const clickRatio = event.offsetY / minimapHeight;
                            const scrollTarget = clickRatio * rightSide.scrollHeight;
                            rightSide.scrollTop = scrollTarget;
                        }
                    });
                    
                    // Setup minimap hover effects for markers
                    const minimapLines = tabContent.querySelectorAll('.minimap-line');
                    minimapLines.forEach(function(line) {
                        line.addEventListener('click', function() {
                            const lineTop = parseFloat(this.style.top);
                            const minimapHeight = minimap.clientHeight;
                            const scrollRatio = lineTop / 100;
                            const scrollTarget = scrollRatio * rightSide.scrollHeight;
                            rightSide.scrollTop = scrollTarget;
                        });
                    });
                }
                
                // Sync both vertical and horizontal scroll
                leftSide.addEventListener('scroll', function() {
                    if (!isVerticalScrolling) {
                        isVerticalScrolling = true;
                        rightSide.scrollTop = leftSide.scrollTop;
                        updateMinimapViewport();
                        setTimeout(() => { isVerticalScrolling = false; }, 10);
                    }
                    if (!isHorizontalScrolling) {
                        isHorizontalScrolling = true;
                        rightSide.scrollLeft = leftSide.scrollLeft;
                        setTimeout(() => { isHorizontalScrolling = false; }, 10);
                    }
                });
                
                rightSide.addEventListener('scroll', function() {
                    if (!isVerticalScrolling) {
                        isVerticalScrolling = true;
                        leftSide.scrollTop = rightSide.scrollTop;
                        updateMinimapViewport();
                        setTimeout(() => { isVerticalScrolling = false; }, 10);
                    }
                    if (!isHorizontalScrolling) {
                        isHorizontalScrolling = true;
                        leftSide.scrollLeft = rightSide.scrollLeft;
                        setTimeout(() => { isHorizontalScrolling = false; }, 10);
                    }
                });
                
                // Initialize minimap viewport
                setTimeout(updateMinimapViewport, 100);
            }
        }
        
        // Setup sync scrolling for the initially active tab
        document.addEventListener('DOMContentLoaded', function() {
            const activeTab = document.querySelector('.tab-content.active');
            if (activeTab) {
                setupSyncScrolling(activeTab.id);
            }
            
            // Setup inline mode toggle
            const viewModeButtons = document.querySelectorAll('.view-mode-btn');
            viewModeButtons.forEach(button => {
                button.addEventListener('click', function() {
                    const mode = this.dataset.mode;
                    
                    // Update button states
                    viewModeButtons.forEach(btn => btn.classList.remove('active'));
                    this.classList.add('active');
                    
                    // Apply mode to all tab contents
                    const tabContents = document.querySelectorAll('.tab-content');
                    tabContents.forEach((tab, index) => {
                        if (mode === 'inline') {
                            tab.classList.add('diff-inline');
                            generateInlineContentForTab(tab, index);
                        } else {
                            tab.classList.remove('diff-inline');
                        }
                    });
                });
            });
        });
        
        function generateInlineContentForTab(tabElement, tabIndex) {
            console.log('🔧 Generating inline content for tab:', tabIndex);
            
            const leftLines = tabElement.querySelectorAll('.left-side .diff-line');
            const rightLines = tabElement.querySelectorAll('.right-side .diff-line');
            const inlineContainer = tabElement.querySelector('#inlineContent' + tabIndex);
            
            console.log('📊 Found elements:', {
                leftLines: leftLines.length,
                rightLines: rightLines.length,
                inlineContainer: !!inlineContainer
            });
            
            if (!inlineContainer) {
                console.error('❌ Inline container not found for tab', tabIndex);
                return;
            }
            
            let inlineHtml = '';
            const maxLines = Math.max(leftLines.length, rightLines.length);
            console.log('📏 Max lines to process:', maxLines);
            
            // Helper function to check if content has meaningful text
            function hasTextContent(content) {
                if (!content) return false;
                // Remove HTML tags and check if there's meaningful text
                const textOnly = content.replace(/<[^>]*>/g, '').trim();
                // Skip empty lines, lines with just +/-, or lines that are just image tags
                return textOnly.length > 0 && 
                       textOnly !== '+' && 
                       textOnly !== '-' && 
                       !textOnly.match(/^\s*$/);
            }
            
            // If no diff lines found, try different selectors
            if (maxLines === 0) {
                console.log('🔍 No diff lines found, trying alternative selectors...');
                const allLines = tabElement.querySelectorAll('.diff-line');
                console.log('📄 All diff lines found:', allLines.length);
                
                // Fallback: show all lines as context
                allLines.forEach((line, i) => {
                    const lineNum = line.querySelector('.line-num')?.textContent || i + 1;
                    const content = line.querySelector('.line-content')?.textContent || line.textContent || '';
                    
                    // Skip lines without meaningful text content
                    if (!hasTextContent(content)) {
                        return;
                    }
                    
                    let className = 'context';
                    let displayContent = content;
                    if (line.classList.contains('diff-add') || line.classList.contains('added')) {
                        className = 'added';
                        displayContent = '+' + content;
                    } else if (line.classList.contains('diff-remove') || line.classList.contains('removed')) {
                        className = 'removed';
                        displayContent = '-' + content;
                    }
                    
                    inlineHtml += '<div class="diff-line ' + className + '">' +
                        '<span class="line-num">' + lineNum + '</span>' +
                        '<span class="line-content">' + displayContent + '</span>' +
                    '</div>';
                });
            } else {
                // Original logic for side-by-side processing
                for (let i = 0; i < maxLines; i++) {
                    const leftLine = leftLines[i];
                    const rightLine = rightLines[i];
                    
                    // Handle removed lines (from left side)
                    if (leftLine && (leftLine.classList.contains('diff-remove') || leftLine.classList.contains('removed'))) {
                        const lineNum = leftLine.querySelector('.line-num')?.textContent || '';
                        const content = leftLine.querySelector('.line-content')?.textContent || '';
                        
                        // Only show if there's meaningful text content
                        if (hasTextContent(content)) {
                            inlineHtml += '<div class="diff-line removed">' +
                                '<span class="line-num">' + lineNum + '</span>' +
                                '<span class="line-content">-' + content + '</span>' +
                            '</div>';
                        }
                    }
                    
                    // Handle added lines (from right side)
                    if (rightLine && (rightLine.classList.contains('diff-add') || rightLine.classList.contains('added'))) {
                        const lineNum = rightLine.querySelector('.line-num')?.textContent || '';
                        const content = rightLine.querySelector('.line-content')?.textContent || '';
                        
                        // Only show if there's meaningful text content
                        if (hasTextContent(content)) {
                            inlineHtml += '<div class="diff-line added">' +
                                '<span class="line-num">' + lineNum + '</span>' +
                                '<span class="line-content">+' + content + '</span>' +
                            '</div>';
                        }
                    }
                    
                    // Handle context lines (show once, preferring right side)
                    const contextLine = rightLine || leftLine;
                    if (contextLine && (contextLine.classList.contains('diff-context') || contextLine.classList.contains('context'))) {
                        const lineNum = contextLine.querySelector('.line-num')?.textContent || '';
                        const content = contextLine.querySelector('.line-content')?.textContent || '';
                        
                        // Only show if there's meaningful text content
                        if (hasTextContent(content)) {
                            inlineHtml += '<div class="diff-line context">' +
                                '<span class="line-num">' + lineNum + '</span>' +
                                '<span class="line-content">' + content + '</span>' +
                            '</div>';
                        }
                    }
                }
            }
            
            console.log('📝 Generated inline HTML length:', inlineHtml.length);
            
            if (inlineHtml.length === 0) {
                inlineHtml = '<div class="diff-line context">' +
                    '<span class="line-num">-</span>' +
                    '<span class="line-content">No diff content available for inline view</span>' +
                '</div>';
            }
            
            inlineContainer.innerHTML = inlineHtml;
            console.log('✅ Inline content generated for tab', tabIndex);
        }
    </script>
</head>
<body>
    <div class="header">
        <div class="header-content">
            <h2>📊 PR #${prId} - All Diffs (${diffIds.length} files)</h2>
            <div class="view-toggle-group">
                <div class="view-mode-toggle">
                    <button class="view-mode-btn active" data-mode="side-by-side">📊 Side by side</button>
                    <button class="view-mode-btn" data-mode="inline">📝 Inline</button>
                </div>
                <label class="toggle-switch" for="viewToggle">
                    <input type="checkbox" id="viewToggle" onchange="toggleViewMode()">
                    <span class="slider">
                        <span class="slider-text">FULL</span>
                    </span>
                </label>
            </div>
        </div>
    </div>
    <div class="tabs">
        ${tabButtons}
    </div>
    ${tabContents}
</body>
</html>`;
}

/**
 * Read full file content from workspace
 * @param {string} filePath - Relative path to the file
 * @returns {string[]} - Array of file lines
 */
async function getFullFileContent(filePath) {
    try {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            console.log('❌ No workspace folder found');
            return [];
        }

        // Try multiple path variations
        const pathVariations = [
            path.join(workspaceFolder.uri.fsPath, filePath),
            path.join(workspaceFolder.uri.fsPath, filePath.replace(/^\//, '')),
            path.join(workspaceFolder.uri.fsPath, 'src', filePath.replace(/^.*\/src\//, ''))
        ];

        console.log(`🔍 Trying to read file: ${filePath}`);
        console.log(`📁 Workspace: ${workspaceFolder.uri.fsPath}`);

        for (const fullPath of pathVariations) {
            console.log(`🔍 Checking path: ${fullPath}`);
            if (fs.existsSync(fullPath)) {
                const content = fs.readFileSync(fullPath, 'utf8');
                const lines = content.split('\n');
                console.log(`✅ Successfully read ${lines.length} lines from ${fullPath}`);
                return lines;
            }
        }

        console.log(`❌ File not found in any path variation`);
    } catch (error) {
        console.error('❌ Error reading file:', error);
    }
    return [];
}

/**
 * Read full file content from workspace or git
 * @param {string} filePath - Relative path to the file
 * @param {string} revision - Git revision (e.g., 'HEAD~1', 'HEAD')
 * @returns {string[]} - Array of file lines
 */
async function getFullFileContentFromGit(filePath, revision = 'HEAD') {
    try {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            return [];
        }

        const { exec } = require('child_process');
        const util = require('util');
        const execAsync = util.promisify(exec);

        // Try to get file content from git
        const command = `git show ${revision}:${filePath}`;
        const { stdout } = await execAsync(command, {
            cwd: workspaceFolder.uri.fsPath
        });

        return stdout.split('\n');
    } catch (error) {
        console.error('Error reading file from git:', error);
        return [];
    }
}

/**
 * Parse diff content to reconstruct full file content for both sides
 * ENHANCED VERSION: For cross-repo PR reviews - reconstructs content directly from diff
 * @param {string} diff - Git diff content
 * @param {string} filePath - Path to the file being diffed
 * @returns {object} - { originalLines: [], modifiedLines: [] }
 */
async function parseFullDiffContentEnhanced(diff, filePath) {
    console.log('🔍 parseFullDiffContentEnhanced - FULL FILE CONTENT mode for:', filePath);
    
    // Check if we have Azure DevOps cache data for full file content retrieval
    const cache = global.prDiffCache;
    if (cache && cache.accessToken && cache.sourceCommit && cache.targetCommit) {
        console.log('✅ Azure DevOps cache available - fetching FULL FILE CONTENT');
        return await getFullFileContentFromAzureDevOps(filePath, diff);
    } else {
        console.log('⚠️ No Azure DevOps cache - falling back to diff reconstruction');
        console.log('🔍 Attempting DIRECT Azure DevOps detection from diff content...');
        
        // Try to detect Azure DevOps info from diff and fetch full content anyway
        const azureInfo = detectAzureDevOpsFromDiff(diff);
        if (azureInfo && azureInfo.organization) {
            console.log('🎯 Detected Azure DevOps info from diff:', azureInfo);
            return await getFullContentWithDetectedInfo(filePath, diff, azureInfo);
        }
        
        return await reconstructFromDiffFallback(diff, filePath);
    }
}

/**
 * Detect Azure DevOps info from diff content
 */
function detectAzureDevOpsFromDiff(diff) {
    // Look for Azure DevOps patterns in diff
    const orgMatch = diff.match(/dev\.azure\.com\/([^\/]+)/);
    const projectMatch = diff.match(/\/_git\/([^\/]+)/);
    
    if (orgMatch && projectMatch) {
        return {
            organization: orgMatch[1],
            project: projectMatch[1],
            repository: projectMatch[1] // Assume same as project for now
        };
    }
    
    // Check if this looks like Azure DevOps based on diff format
    if (diff.includes('BusinessWebUS') || diff.includes('Shippo')) {
        return {
            organization: 'BusinessWebUS',
            project: 'Shippo', 
            repository: 'Shippo-Web'
        };
    }
    
    return null;
}

/**
 * Get full content using detected Azure DevOps info
 */
async function getFullContentWithDetectedInfo(filePath, diff, azureInfo) {
    console.log('🔄 Attempting to fetch full content with detected info...');
    
    // Try to get access token from vscode settings or prompt user
    const config = vscode.workspace.getConfiguration('aiSelfCheck');
    const accessToken = config.get('azureDevOps.personalAccessToken');
    
    if (!accessToken) {
        console.log('❌ No Azure DevOps token available in settings');
        return await reconstructFromDiffFallback(diff, filePath);
    }
    
    // Extract commit info from diff if possible
    const commits = extractCommitsFromDiff(diff);
    if (!commits.sourceCommit || !commits.targetCommit) {
        console.log('❌ Could not extract commit info from diff');
        return await reconstructFromDiffFallback(diff, filePath);
    }
    
    console.log('✅ Detected commits:', commits);
    
    try {
        // Import and use getFileContent if available
        const reviewPrPath = path.join(__dirname, 'scripts', 'review-pr.js');
        if (fs.existsSync(reviewPrPath)) {
            const reviewPrModule = require(reviewPrPath);
            const getFileContent = reviewPrModule.getFileContent;
            
            if (typeof getFileContent === 'function') {
                // 🔧 FIX: Commit terminology - need to swap for correct Monaco display
                // commits.sourceCommit = NEW code = Monaco "modified" (RIGHT)
                // commits.targetCommit = OLD code = Monaco "original" (LEFT)
                const [targetContent, sourceContent] = await Promise.all([
                    getFileContent(azureInfo.organization, azureInfo.project, azureInfo.repository, filePath, commits.targetCommit, accessToken), // OLD = original = LEFT
                    getFileContent(azureInfo.organization, azureInfo.project, azureInfo.repository, filePath, commits.sourceCommit, accessToken)  // NEW = modified = RIGHT
                ]);
                
                if (targetContent || sourceContent) {
                    console.log(`✅ SUCCESS: Got full content - Original (OLD): ${targetContent ? targetContent.length : 0}, Modified (NEW): ${sourceContent ? sourceContent.length : 0}`);
                    
                    // Convert to format using the enhanced logic
                    return convertFullContentToLineFormat(targetContent || '', sourceContent || '');
                }
            }
        }
        
    } catch (error) {
        console.log('❌ Error fetching with detected info:', error.message);
    }
    
    return await reconstructFromDiffFallback(diff, filePath);
}

/**
 * Extract commit IDs from diff content
 */
function extractCommitsFromDiff(diff) {
    // Look for commit hashes in diff header
    const indexMatch = diff.match(/index ([a-f0-9]{7,40})\.\.([a-f0-9]{7,40})/);
    if (indexMatch) {
        return {
            sourceCommit: indexMatch[1],
            targetCommit: indexMatch[2]
        };
    }
    
    // Look for other patterns
    const commitMatches = diff.match(/[a-f0-9]{40}/g);
    if (commitMatches && commitMatches.length >= 2) {
        return {
            sourceCommit: commitMatches[0],
            targetCommit: commitMatches[1]
        };
    }
    
    return {};
}

/**
 * Get complete file content from Azure DevOps API for both commits
 */
async function getFullFileContentFromAzureDevOps(filePath, diff) {
    const cache = global.prDiffCache;
    
    try {
        console.log(`🔄 Fetching FULL content for ${filePath} from both commits`);
        
        // Import getFileContent function from review-pr.js if available
        const reviewPrPath = path.join(__dirname, 'scripts', 'review-pr.js');
        if (fs.existsSync(reviewPrPath)) {
            const reviewPrModule = require(reviewPrPath);
            const getFileContent = reviewPrModule.getFileContent;
            
            if (typeof getFileContent === 'function') {
                // 🔧 FIX: Azure DevOps PR terminology vs Monaco terminology
                // sourceCommit = NEW code (feature branch) = Monaco "modified" (RIGHT)
                // targetCommit = OLD code (base branch) = Monaco "original" (LEFT)
                const [targetContent, sourceContent] = await Promise.all([
                    getFileContent(cache.organization, cache.project, cache.repository, filePath, cache.targetCommit, cache.accessToken), // OLD = original = LEFT
                    getFileContent(cache.organization, cache.project, cache.repository, filePath, cache.sourceCommit, cache.accessToken)  // NEW = modified = RIGHT
                ]);
                
                if (targetContent || sourceContent) {
                    console.log(`✅ SUCCESS: Got full content - Original (OLD): ${targetContent ? targetContent.length : 0}, Modified (NEW): ${sourceContent ? sourceContent.length : 0}`);
                    
                    return convertFullContentToLineFormat(targetContent || '', sourceContent || '');
                }
            }
        }
        
    } catch (error) {
        console.log('❌ Error fetching from Azure DevOps API:', error.message);
    }
    
    return await reconstructFromDiffFallback(diff, filePath);
}

/**
 * Convert full file content to line format using diff.js for proper alignment
 */
function convertFullContentToLineFormat(baseContent, targetContent) {
    // Try to import diff library if available
    let diff;
    try {
        diff = require('diff');
    } catch (error) {
        console.log('❌ diff library not available, using simple reconstruction');
        return {
            originalLines: baseContent.split('\n').map((line, i) => ({ content: line, lineNum: i + 1, type: 'context' })),
            modifiedLines: targetContent.split('\n').map((line, i) => ({ content: line, lineNum: i + 1, type: 'context' }))
        };
    }
    
    // ⚡ PERFORMANCE: Quick check for identical content
    if (baseContent === targetContent) {
        console.log('⚡ Files identical - using fast path');
        const lines = baseContent.split('\n');
        return {
            originalLines: lines.map((line, i) => ({ content: line, lineNum: i + 1, type: 'context' })),
            modifiedLines: lines.map((line, i) => ({ content: line, lineNum: i + 1, type: 'context' }))
        };
    }
    
    console.time('⚡ Diff processing');
    // Use diff to properly align lines for side-by-side view
    const changes = diff.diffLines(baseContent, targetContent);
    console.timeEnd('⚡ Diff processing');
    
    const originalLines = [];
    const modifiedLines = [];
    
    let baseLineNum = 1;
    let targetLineNum = 1;
    
    for (const change of changes) {
        const lines = change.value.split('\n');
        // Remove empty last element if exists (from split)
        if (lines[lines.length - 1] === '') {
            lines.pop();
        }
        
        if (change.added) {
            // Lines added in target (new code) - show empty on left, added on right
            for (const line of lines) {
                originalLines.push({
                    content: '',
                    lineNum: '',
                    type: 'empty'
                });
                
                modifiedLines.push({
                    content: line,
                    lineNum: targetLineNum,
                    type: 'added'
                });
                
                targetLineNum++;
            }
        } else if (change.removed) {
            // Lines removed from base (old code) - show removed on left, empty on right
            for (const line of lines) {
                originalLines.push({
                    content: line,
                    lineNum: baseLineNum,
                    type: 'removed'
                });
                
                modifiedLines.push({
                    content: '',
                    lineNum: '',
                    type: 'empty'
                });
                
                baseLineNum++;
            }
        } else {
            // Unchanged lines - show on both sides
            for (const line of lines) {
                originalLines.push({
                    content: line,
                    lineNum: baseLineNum,
                    type: 'context'
                });
                
                modifiedLines.push({
                    content: line,
                    lineNum: targetLineNum,
                    type: 'context'
                });
                
                baseLineNum++;
                targetLineNum++;
            }
        }
    }
    
    console.log(`✅ ENHANCED SIDE-BY-SIDE: ${originalLines.length} original lines, ${modifiedLines.length} modified lines`);
    console.log(`📊 Added: ${modifiedLines.filter(l => l.type === 'added').length}, Removed: ${originalLines.filter(l => l.type === 'removed').length}`);
    
    return { originalLines, modifiedLines };
}

/**
 * Fallback to diff reconstruction when full content is not available
 */
async function reconstructFromDiffFallback(diff, filePath) {
    console.log('🔄 Using fallback diff reconstruction for:', filePath);
    
    // Use the existing reconstruction logic
    const { originalLines, modifiedLines } = reconstructFromGitDiff(diff, filePath);

    console.log(`✅ Fallback reconstruction completed: ${originalLines.length} original, ${modifiedLines.length} modified lines`);
    return { originalLines, modifiedLines };
}

/**
 * Reconstruct file content from git diff (for cross-repo PR reviews)
 * @param {string} diff - Git diff content
 * @param {string} filePath - File path for context
 * @returns {object} - { originalLines: [], modifiedLines: [] }
 */
function reconstructFromGitDiff(diff, filePath) {
    console.log('� Reconstructing file content from git diff for cross-repo PR');

    const diffLines = diff.split('\n');
    const originalLines = [];
    const modifiedLines = [];

    let oldLineNum = 1;
    let newLineNum = 1;
    let inHunk = false;

    for (const line of diffLines) {
        // Skip diff headers
        if (line.startsWith('diff --git') || line.startsWith('+++') || line.startsWith('---') || line.startsWith('index ')) {
            continue;
        }

        if (line.startsWith('@@')) {
            // Parse hunk header to get starting line numbers
            const hunkMatch = line.match(/@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
            if (hunkMatch) {
                oldLineNum = parseInt(hunkMatch[1]);
                newLineNum = parseInt(hunkMatch[3]);
                inHunk = true;
                console.log(`📍 Hunk: starting at old line ${oldLineNum}, new line ${newLineNum}`);
            }
            continue;
        }

        if (inHunk) {
            if (line.startsWith(' ')) {
                // Context line (unchanged)
                const content = line.substring(1);
                originalLines.push({
                    content: content,
                    lineNum: oldLineNum,
                    type: 'context'
                });
                modifiedLines.push({
                    content: content,
                    lineNum: newLineNum,
                    type: 'context'
                });
                oldLineNum++;
                newLineNum++;
            } else if (line.startsWith('-')) {
                // Removed line
                const content = line.substring(1);
                originalLines.push({
                    content: content,
                    lineNum: oldLineNum,
                    type: 'removed'
                });
                modifiedLines.push({
                    content: '',
                    lineNum: '',
                    type: 'empty'
                });
                oldLineNum++;
            } else if (line.startsWith('+')) {
                // Added line
                const content = line.substring(1);
                originalLines.push({
                    content: '',
                    lineNum: '',
                    type: 'empty'
                });
                modifiedLines.push({
                    content: content,
                    lineNum: newLineNum,
                    type: 'added'
                });
                newLineNum++;
            } else if (line.trim() === '') {
                // Empty line in diff
                originalLines.push({
                    content: '',
                    lineNum: oldLineNum,
                    type: 'context'
                });
                modifiedLines.push({
                    content: '',
                    lineNum: newLineNum,
                    type: 'context'
                });
                oldLineNum++;
                newLineNum++;
            }
        }
    }

    console.log(`✅ Reconstructed ${originalLines.length} original lines, ${modifiedLines.length} modified lines`);
    console.log(`📊 Changes: ${originalLines.filter(l => l.type === 'removed').length} removed, ${modifiedLines.filter(l => l.type === 'added').length} added`);

    return { originalLines, modifiedLines };
}

/**
 * Parse diff content to reconstruct full file content for both sides
 * @param {string} diff - Git diff content
 * @returns {object} - { originalLines: [], modifiedLines: [] }
 */
function parseFullDiffContent(diff) {
    const diffLines = diff.split('\n');
    const originalLines = [];
    const modifiedLines = [];

    // Try to extract more context from the diff
    const hunks = [];
    let currentHunk = null;

    for (const line of diffLines) {
        // Skip diff headers
        if (line.startsWith('diff --git') || line.startsWith('+++') || line.startsWith('---') || line.startsWith('index ')) {
            continue;
        }

        if (line.startsWith('@@')) {
            // Save previous hunk
            if (currentHunk) {
                hunks.push(currentHunk);
            }

            // Parse hunk header
            const hunkMatch = line.match(/@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)/);
            if (hunkMatch) {
                currentHunk = {
                    oldStart: parseInt(hunkMatch[1]),
                    oldCount: parseInt(hunkMatch[2]) || 1,
                    newStart: parseInt(hunkMatch[3]),
                    newCount: parseInt(hunkMatch[4]) || 1,
                    header: hunkMatch[5] ? hunkMatch[5].trim() : '',
                    lines: []
                };
            }
        } else if (currentHunk && (line.startsWith('+') || line.startsWith('-') || line.startsWith(' ') || line === '')) {
            currentHunk.lines.push(line);
        }
    }

    // Save last hunk
    if (currentHunk) {
        hunks.push(currentHunk);
    }

    // If no hunks found, fall back to simple line-by-line parsing
    if (hunks.length === 0) {
        let oldLineNum = 1;
        let newLineNum = 1;

        for (const line of diffLines) {
            if (line.startsWith('+++') || line.startsWith('---') || line.startsWith('diff ') || line.startsWith('@@')) {
                continue;
            }

            if (line.startsWith('+')) {
                modifiedLines.push({
                    content: line.substring(1),
                    lineNum: newLineNum++,
                    type: 'added'
                });
                originalLines.push({
                    content: '',
                    lineNum: '',
                    type: 'empty'
                });
            } else if (line.startsWith('-')) {
                originalLines.push({
                    content: line.substring(1),
                    lineNum: oldLineNum++,
                    type: 'removed'
                });
                modifiedLines.push({
                    content: '',
                    lineNum: '',
                    type: 'empty'
                });
            } else if (line.startsWith(' ') || line === '') {
                const content = line.startsWith(' ') ? line.substring(1) : '';
                originalLines.push({
                    content: content,
                    lineNum: oldLineNum++,
                    type: 'context'
                });
                modifiedLines.push({
                    content: content,
                    lineNum: newLineNum++,
                    type: 'context'
                });
            }
        }

        return { originalLines, modifiedLines };
    }

    // Process hunks to build comprehensive content
    let totalProcessedLines = 0;
    let totalAddedLines = 0;
    let totalRemovedLines = 0;

    // Enhanced logging for SCSS files
    const isSCSS = filePath.toLowerCase().endsWith('.scss');
    if (isSCSS) {
        console.log(`🎨 SCSS file ${filePath} has ${hunks.length} hunks to process`);
    }

    for (let hunkIndex = 0; hunkIndex < hunks.length; hunkIndex++) {
        const hunk = hunks[hunkIndex];
        let oldNum = hunk.oldStart;
        let newNum = hunk.newStart;

        if (isSCSS) {
            console.log(`  Hunk #${hunkIndex + 1}: old lines ${hunk.oldStart}-${hunk.oldStart + hunk.oldLines - 1}, new lines ${hunk.newStart}-${hunk.newStart + hunk.newLines - 1}`);
        }

        // Add function/class context if available
        if (hunk.header) {
            originalLines.push({
                content: `// ${hunk.header}`,
                lineNum: '',
                type: 'context-header'
            });
            modifiedLines.push({
                content: `// ${hunk.header}`,
                lineNum: '',
                type: 'context-header'
            });
        }

        // Process lines in this hunk
        for (const line of hunk.lines) {
            if (line.startsWith(' ') || line === '') {
                // Context line - appears in both versions
                const content = line.startsWith(' ') ? line.substring(1) : '';

                originalLines.push({
                    content: content,
                    lineNum: oldNum,
                    type: 'context'
                });

                modifiedLines.push({
                    content: content,
                    lineNum: newNum,
                    type: 'context'
                });

                oldNum++;
                newNum++;
            } else if (line.startsWith('-')) {
                // Removed line - only in original
                originalLines.push({
                    content: line.substring(1),
                    lineNum: oldNum,
                    type: 'removed'
                });

                // Add placeholder for alignment
                modifiedLines.push({
                    content: '',
                    lineNum: '',
                    type: 'empty'
                });

                // Extra debug for SCSS
                if (isSCSS) {
                    console.log(`    ❌ Removed line ${oldNum}: "${line.substring(1).trim().substring(0, 30)}${line.length > 30 ? '...' : ''}"`);
                    totalRemovedLines++;
                }

                oldNum++;
            } else if (line.startsWith('+')) {
                // Added line - only in modified
                modifiedLines.push({
                    content: line.substring(1),
                    lineNum: newNum,
                    type: 'added'
                });

                // Add placeholder for alignment
                originalLines.push({
                    content: '',
                    lineNum: '',
                    type: 'empty'
                });

                // Extra debug for SCSS
                if (isSCSS) {
                    console.log(`    ✅ Added line ${newNum}: "${line.substring(1).trim().substring(0, 30)}${line.length > 30 ? '...' : ''}"`);
                    totalAddedLines++;
                }

                newNum++;
            }
        }

        // Add full content between hunks instead of gap summary
        if (hunkIndex < hunks.length - 1) {
            const nextHunk = hunks[hunkIndex + 1];
            const gapStart = oldNum;
            const gapEnd = nextHunk.oldStart - 1;

            // Add all unchanged lines between hunks for full context
            for (let lineNum = gapStart; lineNum <= gapEnd; lineNum++) {
                // Try to get actual line content from file if available
                const content = `// Line ${lineNum} (unchanged)`; // Placeholder - could be enhanced to read actual file

                originalLines.push({
                    content: content,
                    lineNum: lineNum,
                    type: 'context'
                });
                modifiedLines.push({
                    content: content,
                    lineNum: lineNum,
                    type: 'context'
                });
            }
        }

        totalProcessedLines += hunk.lines.length;
    }

    // Print summary for SCSS files
    if (isSCSS) {
        console.log(`🎨 SCSS File Summary for ${filePath}:`);
        console.log(`   - Original lines: ${originalLines.length}`);
        console.log(`   - Modified lines: ${modifiedLines.length}`);
        console.log(`   - Added lines: ${totalAddedLines}`);
        console.log(`   - Removed lines: ${totalRemovedLines}`);
        console.log(`   - First 3 original lines types: ${originalLines.slice(0, 3).map(l => l.type).join(', ')}`);
        console.log(`   - First 3 modified lines types: ${modifiedLines.slice(0, 3).map(l => l.type).join(', ')}`);
    }

    return { originalLines, modifiedLines };
}

/**
 * Get change indicator symbol for different line types
 * @param {string} type - Line type: 'added', 'removed', 'context', 'empty'
 * @returns {string} - Indicator symbol
 */
function getChangeIndicator(type) {
    switch (type) {
        case 'added': return '+';
        case 'removed': return '-';
        case 'context': return '';
        case 'context-header': return '●';
        case 'context-gap': return '⋯';
        case 'function-header': return '🔧';
        case 'function-separator': return '';
        case 'empty': return '';
        default: return '';
    }
}

/**
 * Detect if a line is a function/method/class declaration
 * @param {string} line - Code line to analyze
 * @returns {object} - { isFunction: boolean, type: string, name: string, indent: number }
 */
function detectFunctionStart(line) {
    const trimmed = line.trim();
    const indent = line.length - line.trimStart().length;

    // TypeScript/JavaScript function patterns
    const patterns = [
        // Regular functions: function name() {
        { regex: /^(export\s+)?(async\s+)?function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\([^)]*\)\s*[:{]/, type: 'function', nameIndex: 3 },
        // Arrow functions: const name = () => {
        { regex: /^(export\s+)?(const|let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*(\([^)]*\)|[a-zA-Z_$][a-zA-Z0-9_$]*)\s*=>\s*[{]/, type: 'arrow-function', nameIndex: 3 },
        // Class methods: methodName() {
        { regex: /^(public|private|protected|static\s+)*(async\s+)?([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\([^)]*\)\s*[:{]/, type: 'method', nameIndex: 3 },
        // Class declaration: class ClassName {
        { regex: /^(export\s+)?(abstract\s+)?class\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*(<[^>]*>)?\s*(extends\s+[a-zA-Z_$][a-zA-Z0-9_$]*)?\s*(implements\s+[^{]*)?\s*[{]/, type: 'class', nameIndex: 3 },
        // Interface declaration: interface InterfaceName {
        { regex: /^(export\s+)?interface\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*(<[^>]*>)?\s*(extends\s+[^{]*)?\s*[{]/, type: 'interface', nameIndex: 2 },
        // Enum declaration: enum EnumName {
        { regex: /^(export\s+)?enum\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*[{]/, type: 'enum', nameIndex: 2 }
    ];

    for (const pattern of patterns) {
        const match = trimmed.match(pattern.regex);
        if (match && match[pattern.nameIndex]) {
            return {
                isFunction: true,
                type: pattern.type,
                name: match[pattern.nameIndex],
                indent: indent,
                fullLine: line
            };
        }
    }

    return { isFunction: false, type: null, name: null, indent: indent };
}

/**
 * Find function boundaries in code lines
 * @param {Array} lines - Array of code lines
 * @param {number} changeLineIndex - Index of line that has changes
 * @returns {object} - { start: number, end: number, functionInfo: object }
 */
function findFunctionBoundaries(lines, changeLineIndex) {
    if (!lines || changeLineIndex < 0 || changeLineIndex >= lines.length) {
        return null;
    }

    let functionStart = -1;
    let functionEnd = -1;
    let functionInfo = null;
    let braceCount = 0;
    let functionIndent = -1;

    // Search backwards for function start
    for (let i = changeLineIndex; i >= 0; i--) {
        const line = lines[i];
        const detection = detectFunctionStart(line);

        if (detection.isFunction) {
            functionStart = i;
            functionInfo = detection;
            functionIndent = detection.indent;
            braceCount = 1; // Start counting from the opening brace
            break;
        }
    }

    if (functionStart === -1) {
        return null;
    }

    // Search forwards for function end
    for (let i = functionStart + 1; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        // Count braces to find function end
        for (const char of trimmed) {
            if (char === '{') {
                braceCount++;
            } else if (char === '}') {
                braceCount--;
                if (braceCount === 0) {
                    functionEnd = i;
                    break;
                }
            }
        }

        if (functionEnd !== -1) {
            break;
        }

        // Safety check: if we find another function at the same or lower indent level, stop
        const detection = detectFunctionStart(line);
        if (detection.isFunction && detection.indent <= functionIndent) {
            functionEnd = i - 1;
            break;
        }
    }

    // If we couldn't find the end, use a reasonable default
    if (functionEnd === -1) {
        functionEnd = Math.min(functionStart + 50, lines.length - 1);
    }

    return {
        start: functionStart,
        end: functionEnd,
        functionInfo: functionInfo
    };
}

/**
 * Fetch full file content from Azure DevOps API
 * @param {string} organization - Azure DevOps organization
 * @param {string} project - Project name
 * @param {string} repositoryId - Repository ID
 * @param {string} filePath - File path in repository
 * @param {string} commitId - Commit ID to fetch file content from
 * @param {string} token - Personal Access Token
 * @returns {Promise<string>} - Full file content
 */
async function fetchFileContentFromAzureDevOps(organization, project, repositoryId, filePath, commitId, token) {
    try {
        const url = `https://dev.azure.com/${organization}/${project}/_apis/git/repositories/${repositoryId}/items?path=${encodeURIComponent(filePath)}&versionDescriptor.version=${commitId}&versionDescriptor.versionType=commit&api-version=6.0`;

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Authorization': `Basic ${Buffer.from(`:${token}`).toString('base64')}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            console.error(`Failed to fetch file content: ${response.status} ${response.statusText}`);
            return null;
        }

        const content = await response.text();
        return content;
    } catch (error) {
        console.error('Error fetching file content from Azure DevOps:', error);
        return null;
    }
}

/**
 * Enhanced parseFullDiffContent with function context expansion
 * @param {string} diff - Git diff content
 * @param {string} originalFileContent - Full original file content (optional)
 * @param {string} modifiedFileContent - Full modified file content (optional)
 * @returns {object} - { originalLines: [], modifiedLines: [], hasFullContent: boolean }
 */
function parseFullDiffContentWithFunctionContext(diff, originalFileContent = null, modifiedFileContent = null) {
    // If we have full file content, use it to show complete functions
    if (originalFileContent && modifiedFileContent) {
        return parseFullFileContentWithDiff(diff, originalFileContent, modifiedFileContent);
    }

    // Otherwise, fall back to enhanced diff parsing method
    // Note: This function should be made async if we want to use the enhanced method
    return parseFullDiffContent(diff);
}

/**
 * Parse full file content and apply diff highlights with function context
 * @param {string} diff - Git diff content
 * @param {string} originalContent - Full original file content
 * @param {string} modifiedContent - Full modified file content
 * @returns {object} - { originalLines: [], modifiedLines: [], hasFullContent: boolean }
 */
function parseFullFileContentWithDiff(diff, originalContent, modifiedContent) {
    const originalLines = originalContent.split('\n');
    const modifiedLines = modifiedContent.split('\n');

    // Parse diff to identify which lines have changes
    const changes = parseDiffChanges(diff);
    const functionsWithChanges = new Set();

    // Find functions that contain changes
    for (const change of changes) {
        if (change.originalLineNumber) {
            const functionBoundary = findFunctionBoundaries(originalLines, change.originalLineNumber - 1);
            if (functionBoundary) {
                functionsWithChanges.add(JSON.stringify(functionBoundary));
            }
        }
        if (change.modifiedLineNumber) {
            const functionBoundary = findFunctionBoundaries(modifiedLines, change.modifiedLineNumber - 1);
            if (functionBoundary) {
                functionsWithChanges.add(JSON.stringify(functionBoundary));
            }
        }
    }

    // Build result with function context
    const resultOriginal = [];
    const resultModified = [];
    const processedFunctions = new Set();

    // Process each function that has changes
    for (const functionStr of functionsWithChanges) {
        const functionBoundary = JSON.parse(functionStr);
        const functionKey = `${functionBoundary.start}-${functionBoundary.end}`;

        if (processedFunctions.has(functionKey)) continue;
        processedFunctions.add(functionKey);

        // Add function header
        if (functionBoundary.functionInfo) {
            resultOriginal.push({
                content: `/// FUNCTION: ${functionBoundary.functionInfo.name} (${functionBoundary.functionInfo.type})`,
                lineNum: '',
                type: 'function-header'
            });
            resultModified.push({
                content: `/// FUNCTION: ${functionBoundary.functionInfo.name} (${functionBoundary.functionInfo.type})`,
                lineNum: '',
                type: 'function-header'
            });
        }

        // Add function lines with change detection
        const maxLines = Math.max(
            functionBoundary.end - functionBoundary.start + 1,
            functionBoundary.end - functionBoundary.start + 1
        );

        for (let i = 0; i <= maxLines; i++) {
            const origIndex = functionBoundary.start + i;
            const modIndex = functionBoundary.start + i;

            const origLine = origIndex < originalLines.length ? originalLines[origIndex] : '';
            const modLine = modIndex < modifiedLines.length ? modifiedLines[modIndex] : '';

            // Determine line type based on changes
            let origType = 'context';
            let modType = 'context';

            for (const change of changes) {
                if (change.originalLineNumber === origIndex + 1 && change.type === 'removed') {
                    origType = 'removed';
                }
                if (change.modifiedLineNumber === modIndex + 1 && change.type === 'added') {
                    modType = 'added';
                }
            }

            if (origIndex < originalLines.length) {
                resultOriginal.push({
                    content: origLine,
                    lineNum: origIndex + 1,
                    type: origType
                });
            }

            if (modIndex < modifiedLines.length) {
                resultModified.push({
                    content: modLine,
                    lineNum: modIndex + 1,
                    type: modType
                });
            }
        }

        // Add separator
        resultOriginal.push({
            content: '',
            lineNum: '',
            type: 'function-separator'
        });
        resultModified.push({
            content: '',
            lineNum: '',
            type: 'function-separator'
        });
    }

    return {
        originalLines: resultOriginal,
        modifiedLines: resultModified,
        hasFullContent: true
    };
}

/**
 * Parse diff to extract change information
 * @param {string} diff - Git diff content
 * @returns {Array} - Array of change objects
 */
function parseDiffChanges(diff) {
    const changes = [];
    const diffLines = diff.split('\n');
    let oldLineNum = 0;
    let newLineNum = 0;

    for (const line of diffLines) {
        if (line.startsWith('@@')) {
            const hunkMatch = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
            if (hunkMatch) {
                oldLineNum = parseInt(hunkMatch[1]);
                newLineNum = parseInt(hunkMatch[2]);
            }
        } else if (line.startsWith('+') && !line.startsWith('+++')) {
            changes.push({
                type: 'added',
                originalLineNumber: null,
                modifiedLineNumber: newLineNum,
                content: line.substring(1)
            });
            newLineNum++;
        } else if (line.startsWith('-') && !line.startsWith('---')) {
            changes.push({
                type: 'removed',
                originalLineNumber: oldLineNum,
                modifiedLineNumber: null,
                content: line.substring(1)
            });
            oldLineNum++;
        } else if (line.startsWith(' ')) {
            oldLineNum++;
            newLineNum++;
        }
    }

    return changes;
}

/**
 * Escape HTML special characters
 * @param {string} text - Text to escape
 * @returns {string} Escaped text
 */
function escapeHtml(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return String(text).replace(/[&<>"']/g, m => map[m]);
}

/**
 * Parse diff to extract change information for accurate highlighting
 * @param {string} diff - Git diff content
 * @returns {Array} - Array of change objects { type, lineNumber, lines, oldLines, newLines }
 */
function parseDiffToExtractChanges(diff) {
    const changes = [];
    const diffLines = diff.split('\n');

    let currentHunk = null;
    let oldLineNum = 0;
    let newLineNum = 0;

    console.log('🔍 Parsing diff with', diffLines.length, 'lines');

    for (let i = 0; i < diffLines.length; i++) {
        const line = diffLines[i];

        if (line.startsWith('@@')) {
            // Parse hunk header: @@ -old_start,old_count +new_start,new_count @@
            const match = line.match(/@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
            if (match) {
                oldLineNum = parseInt(match[1]);
                newLineNum = parseInt(match[3]);
                currentHunk = { oldStart: oldLineNum, newStart: newLineNum };
                console.log(`📍 Hunk: old=${oldLineNum}, new=${newLineNum}`);
            }
        } else if (line.startsWith('+') && !line.startsWith('+++')) {
            // Added line - use newLineNum for position in final file
            console.log(`➕ Added line ${newLineNum}: "${line.substring(1, 50)}"`);
            changes.push({
                type: 'added',
                lineNumber: newLineNum,
                lines: [line.substring(1)],
                content: line.substring(1)
            });
            newLineNum++;
        } else if (line.startsWith('-') && !line.startsWith('---')) {
            // Removed line - use oldLineNum and don't map to final file
            console.log(`➖ Removed line ${oldLineNum}: "${line.substring(1, 50)}"`);
            changes.push({
                type: 'removed',
                lineNumber: oldLineNum, // Use original position
                lines: [line.substring(1)],
                content: line.substring(1)
            });
            oldLineNum++;
            // Don't increment newLineNum since this line doesn't exist in final file
        } else if (line.startsWith(' ')) {
            // Context line (unchanged)
            oldLineNum++;
            newLineNum++;
        } else if (line.startsWith('diff --git') || line.startsWith('+++') || line.startsWith('---') || line.startsWith('index ')) {
            // Skip file headers
            continue;
        }
    }

    console.log(`📊 Raw changes found: ${changes.length}`);
    changes.forEach(c => console.log(`   ${c.type} at line ${c.lineNumber}`));

    // Group consecutive changes for better highlighting
    const groupedChanges = [];
    let currentGroup = null;

    for (const change of changes) {
        if (!currentGroup ||
            currentGroup.type !== change.type ||
            currentGroup.lineNumber + currentGroup.lines.length !== change.lineNumber) {

            if (currentGroup) {
                groupedChanges.push(currentGroup);
            }

            currentGroup = {
                type: change.type,
                lineNumber: change.lineNumber,
                lines: [change.content]
            };
        } else {
            currentGroup.lines.push(change.content);
        }
    }

    if (currentGroup) {
        groupedChanges.push(currentGroup);
    }

    console.log(`� Grouped changes: ${groupedChanges.length}`);
    groupedChanges.forEach(c => console.log(`   ${c.type} at line ${c.lineNumber}-${c.lineNumber + c.lines.length - 1}`));

    return groupedChanges;
}

/**
 * Parse diff to extract change information for full file reconstruction
 * @param {string} diff - Git diff content
 * @returns {Array} - Array of change objects with type, lineNumber, content, etc.
 */
function parseDiffChanges(diff) {
    const diffLines = diff.split('\n');
    const changes = [];
    let currentHunk = null;

    for (const line of diffLines) {
        if (line.startsWith('diff --git') || line.startsWith('+++') || line.startsWith('---') || line.startsWith('index ')) {
            continue;
        }

        if (line.startsWith('@@')) {
            const hunkMatch = line.match(/@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
            if (hunkMatch) {
                currentHunk = {
                    oldStart: parseInt(hunkMatch[1]),
                    oldCount: parseInt(hunkMatch[2]) || 1,
                    newStart: parseInt(hunkMatch[3]),
                    newCount: parseInt(hunkMatch[4]) || 1,
                    lines: []
                };
            }
        } else if (currentHunk && (line.startsWith('+') || line.startsWith('-') || line.startsWith(' ') || line === '')) {
            currentHunk.lines.push(line);
        }
    }

    // Process hunks to create change objects
    if (currentHunk) {
        let oldLineNum = currentHunk.oldStart;
        let newLineNum = currentHunk.newStart;
        let pendingDeletion = null;
        let pendingAddition = null;

        for (const line of currentHunk.lines) {
            if (line.startsWith(' ') || line === '') {
                // Context line - no change
                oldLineNum++;
                newLineNum++;
            } else if (line.startsWith('-')) {
                // Deletion
                if (!pendingDeletion) {
                    pendingDeletion = {
                        type: 'deletion',
                        lineNumber: newLineNum,
                        content: [],
                        count: 0
                    };
                }
                pendingDeletion.content.push(line.substring(1));
                pendingDeletion.count++;
                oldLineNum++;
            } else if (line.startsWith('+')) {
                // Addition
                if (!pendingAddition) {
                    pendingAddition = {
                        type: 'addition',
                        lineNumber: newLineNum,
                        content: [],
                        count: 0
                    };
                }
                pendingAddition.content.push(line.substring(1));
                pendingAddition.count++;
                newLineNum++;

                // If we have both deletion and addition, it's a modification
                if (pendingDeletion) {
                    changes.push({
                        type: 'modification',
                        lineNumber: pendingDeletion.lineNumber,
                        oldContent: pendingDeletion.content,
                        newContent: pendingAddition.content,
                        count: Math.max(pendingDeletion.count, pendingAddition.count)
                    });
                    pendingDeletion = null;
                    pendingAddition = null;
                }
            }
        }

        // Handle remaining pending changes
        if (pendingDeletion) {
            changes.push(pendingDeletion);
        }
        if (pendingAddition) {
            changes.push(pendingAddition);
        }
    }

    return changes;
}

function deactivate() { }

module.exports = {
    activate,
    deactivate,
    handleEnterTwiceLogic  // Export for use in review-changes.js and review-file.js
};