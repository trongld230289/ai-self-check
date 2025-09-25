const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const https = require('https');
const { URL } = require('url');

// Session tracking for "Enter twice" functionality and change scores
const chatSessions = new Map();

// Token counting utilities
/**
 * Estimate token count from text using approximate ratios
 * @param {string} text - Input text to count tokens for
 * @returns {number} - Estimated token count
 */
function estimateTokenCount(text) {
    if (!text || typeof text !== 'string') return 0;
    
    // Approximate token-to-character ratios for different languages
    // English: ~4 characters per token
    // Code: ~3.5 characters per token (more dense)
    // Mixed content: ~3.8 characters per token
    
    const charCount = text.length;
    const avgCharsPerToken = 3.8;
    
    return Math.ceil(charCount / avgCharsPerToken);
}

/**
 * Normalize model family name for consistent pricing lookup
 * @param {string} modelFamily - Raw model family name
 * @returns {string} - Normalized model key
 */
function normalizeModelFamily(modelFamily) {
    if (!modelFamily || typeof modelFamily !== 'string') {
        return 'unknown';
    }
    
    const family = modelFamily.toLowerCase().trim();
    
    // Claude models
    if (family.includes('claude')) {
        if (family.includes('4')) return 'claude-sonnet-4';
        if (family.includes('3.7') && family.includes('thinking')) return 'claude-sonnet-3.7-thinking';
        if (family.includes('3.7')) return 'claude-sonnet-3.7';
        if (family.includes('3.5')) return 'claude-sonnet-3.5';
        if (family.includes('sonnet')) return 'claude-sonnet-3.5'; // Default claude
        return 'claude-sonnet-3.5';
    }
    
    // GPT models
    if (family.includes('gpt')) {
        if (family.includes('5') && family.includes('mini')) return 'gpt-5-mini';
        if (family.includes('5')) return 'gpt-5';
        if (family.includes('4.1') || family.includes('4-1')) return 'gpt-4.1';
        if (family.includes('4o') && family.includes('mini')) return 'gpt-4o-mini';
        if (family.includes('4o')) return 'gpt-4o';
        return 'gpt-4o'; // Default GPT
    }
    
    // Gemini models
    if (family.includes('gemini')) {
        if (family.includes('2.0') && family.includes('flash')) return 'gemini-2.0-flash';
        if (family.includes('2-0') && family.includes('flash')) return 'gemini-2.0-flash';
        if (family.includes('2.5') && family.includes('pro')) return 'gemini-2.5-pro';
        if (family.includes('2-5') && family.includes('pro')) return 'gemini-2.5-pro';
        if (family.includes('flash')) return 'gemini-2.0-flash';
        return 'gemini-2.5-pro'; // Default gemini
    }
    
    // O-series models
    if (family.includes('o3') && family.includes('mini')) return 'o3-mini';
    if (family.includes('o4') && family.includes('mini')) return 'o4-mini';
    
    // Grok models
    if (family.includes('grok')) {
        if (family.includes('code') && family.includes('fast')) return 'grok-code-fast-1';
        return 'grok-code-fast-1';
    }
    
    // Unknown model
    return 'unknown';
}

/**
 * Get estimated cost for token usage based on model
 * @param {number} inputTokens - Input token count
 * @param {number} outputTokens - Output token count
 * @param {string} modelFamily - Model family name
 * @returns {object} - Cost breakdown
 */
function estimateCost(inputTokens, outputTokens, modelFamily) {
    // Pricing per 1M tokens (last updated: 2025-09-24)
    const pricing = {
        // Claude Models
        'claude-3-5-sonnet': { input: 3.0, output: 15.0 },
        'claude-sonnet-3.5': { input: 3.0, output: 15.0 },
        'claude-3-7-sonnet': { input: 3.0, output: 15.0 },
        'claude-sonnet-3.7': { input: 3.0, output: 15.0 },
        'claude-3-7-thinking': { input: 3.75, output: 18.75 }, // 1.25x multiplier
        'claude-sonnet-3.7-thinking': { input: 3.75, output: 18.75 },
        'claude-4': { input: 3.0, output: 15.0 },
        'claude-sonnet-4': { input: 3.0, output: 15.0 },
        
        // GPT Models  
        'gpt-4.1': { input: 2.5, output: 10.0 },
        'gpt-4-1': { input: 2.5, output: 10.0 },
        'gpt-4o': { input: 2.5, output: 10.0 },
        'gpt-4o-mini': { input: 0.15, output: 0.6 },
        'gpt-5': { input: 5.0, output: 15.0 }, // Estimated premium pricing
        'gpt-5-mini': { input: 0.50, output: 1.5 }, // Estimated
        
        // Gemini Models
        'gemini-2.0-flash': { input: 0.075, output: 0.3 }, // 0.25x multiplier
        'gemini-2-0-flash': { input: 0.075, output: 0.3 },
        'gemini-2.5-pro': { input: 1.25, output: 5.0 },
        'gemini-2-5-pro': { input: 1.25, output: 5.0 },
        'gemini': { input: 1.25, output: 5.0 }, // Default gemini
        
        // O-series Models
        'o3-mini': { input: 0.25, output: 1.0 }, // 0.33x estimated
        'o4-mini': { input: 0.25, output: 1.0 }, // 0.33x estimated
        'o4-mini-preview': { input: 0.25, output: 1.0 },
        
        // Grok Models
        'grok-code-fast-1': { input: 1.0, output: 3.0 }, // Estimated
        'grok-code-fast-1-preview': { input: 1.0, output: 3.0 },
        
        // Unknown/Fallback
        'unknown': { input: 0, output: 0 }
    };
    
    // Normalize model family name for lookup
    const normalizedFamily = normalizeModelFamily(modelFamily);
    console.log(`🔍 Cost calculation - Original: "${modelFamily}" -> Normalized: "${normalizedFamily}"`);
    
    // Get pricing or fallback to unknown
    const modelPricing = pricing[normalizedFamily] || pricing['unknown'];
    console.log(`💰 Pricing found:`, modelPricing);
    
    const inputCost = (inputTokens / 1000000) * modelPricing.input;
    const outputCost = (outputTokens / 1000000) * modelPricing.output;
    const totalCost = inputCost + outputCost;
    
    return {
        inputCost: inputCost,
        outputCost: outputCost,
        totalCost: totalCost,
        inputTokens: inputTokens,
        outputTokens: outputTokens,
        pricing: modelPricing // Include pricing info for display
    };
}

/**
 * Strip internal blocks from AI output before displaying to user
 * @param {string} output - The raw AI output text
 * @returns {string} - Cleaned output with internal blocks removed
 */
function stripInternalBlocks(output) {
    // Remove <INTERNAL_ONLY>...</INTERNAL_ONLY> blocks
    let cleanedOutput = output.replace(/<INTERNAL_ONLY>[\s\S]*?<\/INTERNAL_ONLY>/g, '');
    
    // // Remove HTML comments (<!-- ... -->)
    // cleanedOutput = cleanedOutput.replace(/<!--[\s\S]*?-->/g, '');

    // // Clean up multiple newlines
    // cleanedOutput = cleanedOutput.replace(/\n{3,}/g, '\n\n');
    
    return cleanedOutput.trim();
}

/**
 * Unified AI execution function with token counting, streaming, and fallback logic
 * @param {string} userPrompt - The prompt to send to the AI model
 * @param {object} model - The AI model to use
 * @param {object} stream - Chat stream for output
 * @param {string} reviewType - Type of review ('Changes' or 'File')
 * @param {number} attemptCount - Current attempt number for recursion
 * @returns {Promise<boolean>} - true if successful, false if failed
 */
async function executeAIReview(userPrompt, model, stream, reviewType = 'Analysis', attemptCount = 0, originalRequestedModel = null) {
    const maxAttempts = 3;
    
    try {
        // Calculate input tokens and estimated cost (for final summary only)
        const inputTokens = estimateTokenCount(userPrompt);
        const messages = [vscode.LanguageModelChatMessage.User(userPrompt)];
        
        console.log(`📤 Attempt ${attemptCount + 1}: Sending request to model:`, model.family);
        
        const chatResponse = await model.sendRequest(messages, {}, new vscode.CancellationTokenSource().token);
        
        // Show successful model usage with accurate status  
        const reviewIcon = reviewType === 'Changes' ? '🔍' : '📄';
        
        // Determine if this is really the originally requested model
        let modelStatus;
        if (attemptCount === 0) {
            // First attempt - check if this matches original request
            if (originalRequestedModel && model.family === originalRequestedModel) {
                modelStatus = 'selected model';
            } else if (originalRequestedModel && model.family !== originalRequestedModel) {
                modelStatus = `fallback model (${originalRequestedModel} not available)`;
            } else {
                // No original model info, assume this is user's choice
                modelStatus = 'selected model';
            }
        } else {
            // Subsequent attempts are always fallbacks
            modelStatus = `fallback model (attempt ${attemptCount + 1})`;
        }
        
        stream.markdown(`🤖 **Streaming ${reviewType} ${reviewIcon}** (using ${model.family} - ${modelStatus}):\n\n`);
        
        let fragmentCount = 0;
        let outputText = '';
        
        // Collect all output first
        for await (const fragment of chatResponse.text) {
            outputText += fragment;
            fragmentCount++;
            
            // Progress indicator every 50 fragments
            if (fragmentCount % 50 === 0) {
                console.log(`Streaming progress: ${fragmentCount} fragments processed`);
            }
        }
        
        // Clean the output to remove internal blocks
        const cleanedOutput = stripInternalBlocks(outputText);
        console.log(`🧹 Cleaned output: ${outputText.length} chars -> ${cleanedOutput.length} chars`);
        
        // Display the cleaned output
        stream.markdown('---\n\n');
        stream.markdown(cleanedOutput);
        
        // Calculate output tokens and total cost
        const outputTokens = estimateTokenCount(outputText);
        const finalCost = estimateCost(inputTokens, outputTokens, model.family);
        
        // Show completion with token statistics
        const completionStatus = attemptCount === 0 ? 'original model' : `fallback model (${model.family})`;
        stream.markdown(`\n\n---\n\n`);
        stream.markdown(`📊 **Token Usage Summary:**\n`);
        stream.markdown(`- **Input tokens**: ${inputTokens.toLocaleString()} ($${finalCost.pricing.input.toFixed(2)}/1M)\n`);
        stream.markdown(`- **Output tokens**: ${outputTokens.toLocaleString()} ($${finalCost.pricing.output.toFixed(2)}/1M tokens)\n`);
        stream.markdown(`- **Total tokens**: ${(inputTokens + outputTokens).toLocaleString()}\n`);
        stream.markdown(`- **Estimated cost**: $${finalCost.totalCost.toFixed(4)} (Input: $${finalCost.inputCost.toFixed(4)} | Output: $${finalCost.outputCost.toFixed(4)})\n`);
        stream.markdown(`- **Model used**: ${model.family}\n\n`);
        stream.markdown(`✅ **${reviewType} Analysis complete** - successfully used ${completionStatus}\n\n`);
        
        console.log(`✅ ${reviewType} review completed successfully with model:`, model.family);
        console.log(`📊 Token usage - Input: ${inputTokens}, Output: ${outputTokens}, Cost: $${finalCost.totalCost.toFixed(4)}`);
        
        return true; // Success
        
    } catch (modelError) {
        console.error(`❌ Model ${model.family} failed (attempt ${attemptCount + 1}):`, modelError);
        
        // If we've reached max attempts, throw the error
        if (attemptCount >= maxAttempts - 1) {
            throw new Error(`All ${maxAttempts} model attempts failed. Last error: ${modelError.message}`);
        }
        
        // Handle quota/rate limit errors
        if (modelError.message && (
            modelError.message.includes('exhausted your premium model quota') ||
            modelError.message.includes('quota') ||
            modelError.message.includes('rate limit') ||
            modelError.message.includes('too many requests') ||
            modelError.message.includes('limit exceeded')
        )) {
            stream.markdown(`🚫 **${model.family} quota exceeded** - Switching to alternative model...\n\n`);
            stream.markdown(`💡 **Reason:** Premium model quota exhausted. Automatically falling back to available model.\n\n`);
            
            try {
                const fallbackModel = await getFallbackModel(model, stream, attemptCount + 1);
                return await executeAIReview(userPrompt, fallbackModel, stream, reviewType, attemptCount + 1, originalRequestedModel || model.family);
            } catch (fallbackError) {
                stream.markdown(`❌ **Fallback failed:** ${fallbackError.message}\n\n`);
                throw new Error(`Quota exceeded and fallback failed: ${fallbackError.message}`);
            }
        }
        // Handle model not supported errors
        else if (modelError.message && (
            modelError.message.includes('model_not_supported') || 
            modelError.message.includes('not supported') ||
            modelError.message.includes('model is not available') ||
            modelError.message.includes('The requested model is not supported')
        )) {
            stream.markdown(`❌ **${model.family} not supported** - Switching to alternative model...\n\n`);
            stream.markdown(`💡 **Reason:** Model not available in current environment. Automatically falling back.\n\n`);
            
            try {
                const fallbackModel = await getFallbackModel(model, stream, attemptCount + 1);
                return await executeAIReview(userPrompt, fallbackModel, stream, reviewType, attemptCount + 1, originalRequestedModel || model.family);
            } catch (fallbackError) {
                stream.markdown(`❌ **Fallback failed:** ${fallbackError.message}\n\n`);
                throw new Error(`Model not supported and fallback failed: ${fallbackError.message}`);
            }
        } else {
            // Other errors, don't retry
            stream.markdown(`❌ **${model.family} failed** (attempt ${attemptCount + 1}): ${modelError.message}\n\n`);
            throw modelError;
        }
    }
}

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
            console.log('📥 Request object:', request);
            console.log('📥 Request.model:', request.model);
            console.log('📥 Request.model?.family:', request.model?.family);
            console.log('📥 Request.model?.id:', request.model?.id);
            
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
                await handleActiveFileChangesReview(stream, null, context, request);
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
    reviewChangesParticipant.iconPath = vscode.Uri.file(path.join(context.extensionPath, 'icons', 'icon.svg'));
    reviewFileParticipant.iconPath = vscode.Uri.file(path.join(context.extensionPath, 'icons', 'icon.svg'));

    // Initialize PR review functionality from external script
    const prReview = require('./scripts/review-pr');
    const { reviewPrParticipant, reviewPullRequest } = prReview.initializePrReview(context);
    
    // Initialize MemDiff provider for PR diffs
    global.memDiffProvider = prReview.registerMemDiffProvider(context);
    console.log('✅ MemDiff provider initialized for PR reviews');

    // Register command to show available models
    const showModelsCommand = vscode.commands.registerCommand('aiSelfCheck.showAvailableModels', showAvailableModels);

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
        reviewPrParticipant,
        reviewPullRequest,
        reviewPrParticipant,
        showModelsCommand
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
            await reviewFileContent(document.fileName, stream, requestedModel, context);
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

async function handleActiveFileChangesReview(stream, selectedModel = null, context = null, request = null) {
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
        
        // Show detailed fallback information with reasoning
        const availableList = availableModels.map(m => m.family).join(', ');
        
        console.log(`🔄 Fallback ${attemptNumber}: ${currentModel.family} → ${fallbackModel.family}`);
        
        // Show user-friendly fallback messaging
        stream.markdown(`🔄 **Switching models** (attempt ${attemptNumber}):\n`);
        stream.markdown(`   ❌ **Previous:** ${currentModel.family} (failed)\n`);
        stream.markdown(`   ✅ **New:** ${fallbackModel.family} (selected as fallback)\n\n`);
        
        // Show fallback reasoning
        if (fallbackModel.family.toLowerCase().includes('claude')) {
            stream.markdown(`� **Fallback reason:** Switched to Claude model (Priority 1 fallback)\n\n`);
        } else if (fallbackModel.family.toLowerCase().includes('gpt')) {
            stream.markdown(`💡 **Fallback reason:** Switched to GPT model (Priority 2 fallback)\n\n`);
        } else {
            stream.markdown(`💡 **Fallback reason:** Using first available model (Priority 3 fallback)\n\n`);
        }
        
        stream.markdown(`�📋 **All available models:** ${availableList}\n\n`);
        stream.markdown('⏳ **Continuing analysis with new model...**\n\n');
        
        return fallbackModel;
        
    } catch (error) {
        console.error('❌ Fallback model selection failed:', error);
        stream.markdown(`❌ **Fallback failed:** ${error.message}\n\n`);
        throw error;
    }
}

/**
 * Get review template (simplified - templates already combined in workspace)
 * @param {string} templateName - Name of template file (e.g., 'review-changes.md')
 * @param {object} context - VS Code extension context
 * @returns {object} - {content: string, source: string, path: string}
 */
function getReviewTemplate(templateName, context = null) {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    
    // Determine template paths - workspace first, then extension fallback
    let templatePath, templateSource;
    
    if (workspaceFolder) {
        templatePath = path.join(workspaceFolder.uri.fsPath, 'instructions', templateName);
        templateSource = 'workspace';
        
        // If workspace template doesn't exist, try extension templates
        if (!fs.existsSync(templatePath) && context) {
            templatePath = path.join(context.extensionPath, 'templates', templateName);
            templateSource = 'extension';
        }
    } else if (context) {
        // No workspace, use extension templates directly
        templatePath = path.join(context.extensionPath, 'templates', templateName);
        templateSource = 'extension';
    } else {
        throw new Error('No workspace folder or extension context available');
    }
    
    try {
        if (fs.existsSync(templatePath)) {
            const content = fs.readFileSync(templatePath, 'utf8');
            console.log(`✅ Loaded template from: ${templatePath}`);
            
            return {
                content: content,
                source: templateSource,
                path: templatePath
            };
        } else {
            throw new Error(`Template not found at: ${templatePath}`);
        }
        
    } catch (error) {
        console.error('❌ Template loading error:', error);
        throw new Error(`Failed to load template: ${error.message}`);
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
        // Parse the completed instruction content and perform review
        if (reviewContent !== instructionTemplate) {
            await reviewChanges(diffContent, stream, changeType, selectedModel, context, request);
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
async function reviewChanges(diffContent, stream, changeType, selectedModel = null, context = null, request = null) {
    let templateContent;
    
    try {
        // Use simplified template loading function
        const templateResult = getReviewTemplate('review-changes.md', context);
        templateContent = templateResult.content;
        
        console.log(`✅ Loaded review template from: ${templateResult.source} (${templateResult.content.length} characters)`);
        
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
            
        const userPrompt = `You are a senior code reviewer. Analyze this git diff following the review-changes.md template format:
            ${finalContent}
            Follow the template structure for comprehensive analysis.`;
        
        stream.markdown('🔄 **AI Analysis in progress...** (streaming git changes)\n\n');
        
        // Use the unified AI execution function
        const success = await executeAIReview(userPrompt, model, stream, 'Changes');
        if (!success) {
            // Model not available, review was stopped
            return;
        }
        
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
        await reviewFileContent(cleanPath, stream, requestedModel, context);

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
    // await reviewWithInMemoryTemplate(gitDiff, stream, changeType, null, context, request);
    await reviewChanges(gitDiff, stream, changeType, null, context, request);
}

async function reviewFileContent(filePath, stream, requestedModel = null, context = null) {
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        const fileExtension = path.extname(filePath);
        const fileName = path.basename(filePath);
        
        // Determine template path for header display
        let templatePath = null;
        try {
            const templateResult = getReviewTemplate('review-file.md', context);
            templatePath = templateResult.path;
        } catch (error) {
            // Template not found, use default display
            console.log('Template path detection failed:', error.message);
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
            
            // Use simplified template loading function
            try {
                const templateResult = getReviewTemplate('review-file.md', context);
                let template = templateResult.content;
                
                console.log(`✅ Loaded file review template from: ${templateResult.source} (${template.length} characters)`);
                
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

            } catch (templateError) {
                stream.markdown('⚠️ **Template not found** - using basic review\n\n');
                console.log(`⚠️ Template loading failed: ${templateError.message}`);
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

                stream.markdown('🚀 **Starting comprehensive file review...**\n\n');
                
                // Use the unified AI execution function
                const success = await executeAIReview(reviewPrompt, model, stream, 'File');
                
                if (!success) {
                    // AI analysis failed, falling back to basic analysis
                    stream.markdown('⚠️ **AI analysis failed - using basic analysis**\n\n');
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
    console.log('getUnifiedModel - request object:', request);
    console.log('getUnifiedModel - request.model:', request?.model);
    console.log('getUnifiedModel - request.model?.family:', request?.model?.family);
    console.log('getUnifiedModel - request.model?.id:', request?.model?.id);
    
    // PRIORITY 1: Check request.model first (this is where VS Code puts the selected model!)
    if (request && request.model) {
        console.log('✅ Found model in request.model:', request.model);
        console.log('✅ Model family:', request.model.family);
        console.log('✅ Model id:', request.model.id);
        return request.model;
    } else {
        console.log('❌ No model found in request.model');
        console.log('❌ Request is:', request ? 'valid object' : 'null/undefined');
        console.log('❌ Request.model is:', request?.model ? 'valid' : 'null/undefined');
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
        console.log('📋 All available models:', models.map(m => `${m.family || m.id} (${m.vendor || 'Unknown'})`));
        
        if (models.length > 0) {
            // FALLBACK 1: Smart model selection based on quality preference
            const modelPreferences = [
                // Tier 1: Latest Claude models (best for code review)
                'claude-sonnet-4', 'claude-4', 'claude-3.7-sonnet', 'claude-3.5-sonnet',
                // Tier 2: Latest GPT models  
                'gpt-5', 'gpt-4.1', 'gpt-4o', 'gpt-4-turbo', 'gpt-4',
                // Tier 3: Other advanced models
                'o4-mini', 'o3-mini', 'gemini-2.5-pro', 'gemini-2.0-flash', 
                // Tier 4: Fallback options
                'gpt-3.5-turbo', 'grok-code'
            ];

            // Try to find best available model based on preference order
            for (const preference of modelPreferences) {
                selectedModel = models.find(m => {
                    const modelName = (m.family || m.id).toLowerCase();
                    const prefLower = preference.toLowerCase();
                    
                    // Exact match or contains match
                    return modelName === prefLower || 
                           modelName.includes(prefLower) ||
                           modelName.replace(/[-_]/g, '').includes(prefLower.replace(/[-_]/g, ''));
                });
                
                if (selectedModel) {
                    console.log(`✅ Found preferred model: ${selectedModel.family || selectedModel.id} (preference: ${preference})`);
                    break;
                }
            }

            // If no preferred model found, use first available
            if (!selectedModel && models.length > 0) {
                selectedModel = models[0];
                console.log(`⚠️ No preferred model found, using first available: ${selectedModel.family || selectedModel.id}`);
            }

            if (selectedModel) {
                models = [selectedModel];
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

        // Template files to process (no need to copy review-common.md)
        const templateFiles = ['review-file.md', 'review-changes.md'];
        
        for (const templateFile of templateFiles) {
            const sourcePath = path.join(extensionTemplatesPath, templateFile);
            const destPath = path.join(instructionsPath, templateFile);
            
            // Only copy if destination doesn't exist (don't overwrite user customizations)
            if (!fs.existsSync(destPath) && fs.existsSync(sourcePath)) {
                
                // For all templates, combine with common template
                try {
                    // Temporarily use extension context to get combined template
                    const tempContext = { extensionPath: context.extensionPath };
                    
                    // Create a temporary getReviewTemplate that works with extension templates only
                    const getExtensionTemplate = (mainTemplateName) => {
                        const mainTemplatePath = path.join(extensionTemplatesPath, mainTemplateName);
                        const commonTemplatePath = path.join(extensionTemplatesPath, 'review-common.md');
                        
                        let commonContent = '';
                        let mainContent = '';
                        
                        // Load common template if exists
                        if (fs.existsSync(commonTemplatePath)) {
                            commonContent = fs.readFileSync(commonTemplatePath, 'utf8');
                            console.log(`✅ Loaded common template for combination: ${commonTemplatePath}`);
                        }
                        
                        // Load main template
                        if (fs.existsSync(mainTemplatePath)) {
                            mainContent = fs.readFileSync(mainTemplatePath, 'utf8');
                            console.log(`✅ Loaded main template for combination: ${mainTemplatePath}`);
                        } else {
                            throw new Error(`Main template not found: ${mainTemplatePath}`);
                        }
                        
                        // Combine templates: common + main
                        const combinedContent = commonContent + '\n\n' + mainContent;
                        console.log(`✅ Combined templates for copy: ${commonContent.length} + ${mainContent.length} = ${combinedContent.length} characters`);
                        
                        return combinedContent;
                    };
                    
                    // Get combined content
                    const combinedContent = getExtensionTemplate(templateFile);
                    
                    // Write combined content to destination
                    fs.writeFileSync(destPath, combinedContent, 'utf8');
                    console.log(`Generated combined template: ${templateFile} (${combinedContent.length} characters)`);
                    
                } catch (combineError) {
                    console.log(`⚠️ Failed to combine template ${templateFile}, copying as-is:`, combineError.message);
                    // Fallback to simple copy
                    fs.copyFileSync(sourcePath, destPath);
                    console.log(`Generated template (fallback): ${templateFile}`);
                }
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

/**
 * Get all available language models from VS Code API
 * @returns {Promise<Array>} Array of available models with details
 */
async function getAvailableModels() {
    try {
        const models = await vscode.lm.selectChatModels();
        return models.map(model => ({
            id: model.id,
            family: model.family || model.id,
            name: model.name || model.family || model.id,
            vendor: model.vendor,
            version: model.version,
            maxInputTokens: model.maxInputTokens,
            countTokens: model.countTokens ? 'supported' : 'not supported'
        }));
    } catch (error) {
        console.error('Error fetching available models:', error);
        return [];
    }
}

/**
 * Display available models information
 */
async function showAvailableModels() {
    try {
        const models = await getAvailableModels();
        
        if (models.length === 0) {
            vscode.window.showInformationMessage('❌ No language models available');
            return;
        }

        const modelList = models.map(model => 
            `• **${model.family}** (${model.id})\n  - Vendor: ${model.vendor || 'Unknown'}\n  - Max tokens: ${model.maxInputTokens || 'Unknown'}\n  - Token counting: ${model.countTokens}`
        ).join('\n\n');

        const message = `🤖 **Available Language Models** (${models.length} found):\n\n${modelList}`;
        
        // Show in information message (for quick view)
        const action = await vscode.window.showInformationMessage(
            `Found ${models.length} available language models`,
            'Show Details',
            'Copy List'
        );

        if (action === 'Show Details') {
            // Create and show in untitled document for detailed view
            const doc = await vscode.workspace.openTextDocument({
                content: message,
                language: 'markdown'
            });
            await vscode.window.showTextDocument(doc);
        } else if (action === 'Copy List') {
            // Copy to clipboard
            const simpleList = models.map(m => `${m.family} (${m.id})`).join('\n');
            await vscode.env.clipboard.writeText(simpleList);
            vscode.window.showInformationMessage('✅ Model list copied to clipboard');
        }

    } catch (error) {
        console.error('Error showing available models:', error);
        vscode.window.showErrorMessage(`Error fetching models: ${error.message}`);
    }
}

function deactivate() {}

module.exports = {
    activate,
    deactivate,
    getAvailableModels,
    showAvailableModels
};
