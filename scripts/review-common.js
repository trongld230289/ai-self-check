const vscode = require('vscode');
const fs = require('fs');
const path = require('path');

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
            stream.markdown(`💡 **Fallback reason:** Switched to Claude model (Priority 1 fallback)\n\n`);
        } else if (fallbackModel.family.toLowerCase().includes('gpt')) {
            stream.markdown(`💡 **Fallback reason:** Switched to GPT model (Priority 2 fallback)\n\n`);
        } else {
            stream.markdown(`💡 **Fallback reason:** Using first available model (Priority 3 fallback)\n\n`);
        }
        
        stream.markdown(`📋 **All available models:** ${availableList}\n\n`);
        stream.markdown('⏳ **Continuing analysis with new model...**\n\n');
        
        return fallbackModel;
        
    } catch (error) {
        console.error('❌ Fallback model selection failed:', error);
        stream.markdown(`❌ **Fallback failed:** ${error.message}\n\n`);
        throw error;
    }
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
        
        // Stream output in real-time
        stream.markdown('---\n\n');
        
        for await (const fragment of chatResponse.text) {
            outputText += fragment;
            fragmentCount++;
            
            // Stream each fragment immediately for real-time display
            stream.markdown(fragment);
            
            // Progress indicator every 50 fragments
            if (fragmentCount % 50 === 0) {
                console.log(`Streaming progress: ${fragmentCount} fragments processed`);
            }
        }
        
        // TODO: Clean the output to remove internal blocks (temporarily disabled for streaming)
        // const cleanedOutput = stripInternalBlocks(outputText);
        // console.log(`🧹 Cleaned output: ${outputText.length} chars -> ${cleanedOutput.length} chars`);
        
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

/**
 * Unified model detection function used by both @review-file and @review-changes
 * @param {object} stream - Chat stream for output
 * @param {object} requestedModel - Requested model object
 * @param {object} chatContext - VS Code chat context
 * @param {object} request - VS Code request object
 * @returns {Promise<object|null>} - Selected AI model or null
 */
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

            let selectedModel = null;
            
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
 * Reusable function for displaying review headers
 * @param {object} stream - Chat stream for output
 * @param {string} reviewType - Type of review (e.g., 'Changes Review', 'File Review')
 * @param {string} filePath - Path to the file being reviewed
 * @param {number|null} diffLength - Length of diff content (for changes review)
 * @param {string|null} templatePath - Path to the template being used
 */
function displayReviewHeader(stream, reviewType, filePath, diffLength = null, templatePath = null) {
    const path = require('path');
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
 * Get checklist status icon based on status
 * @param {string} status - Status value (ok, warning, critical, suggestion, unknown)
 * @returns {string} - Corresponding emoji icon
 */
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

/**
 * Get programming language identifier from file extension
 * @param {string} ext - File extension (with or without dot)
 * @returns {string} - Language identifier for syntax highlighting
 */
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

module.exports = {
    executeAIReview,
    getFallbackModel,
    estimateTokenCount,
    estimateCost,
    normalizeModelFamily,
    stripInternalBlocks,
    getReviewTemplate,
    displayReviewHeader,
    getUnifiedModel,
    getChecklistStatusIcon,
    getAvailableModels,
    showAvailableModels,
    getLanguageFromExtension
};
