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
        if (family.includes('4.5') || family.includes('4-5')) return 'claude-sonnet-4.5';
        if (family.includes('4')) return 'claude-sonnet-4';
        if (family.includes('3.7') || family.includes('3-7')) {
            if (family.includes('thinking')) return 'claude-sonnet-3.7-thinking';
            return 'claude-sonnet-3.7';
        }
        if (family.includes('3.5') || family.includes('3-5')) return 'claude-sonnet-3.5';
        if (family.includes('sonnet')) return 'claude-sonnet-3.5'; // Default claude
        return 'claude-sonnet-3.5';
    }
    
    // GPT models
    if (family.includes('gpt')) {
        if (family.includes('4.1') || family.includes('4-1')) return 'gpt-4.1';
        if (family.includes('5') && (family.includes('codex') || family.includes('preview'))) return 'gpt-5-codex';
        if (family.includes('5') && family.includes('mini')) return 'gpt-5-mini';
        if (family.includes('5') && family.includes('nano')) return 'gpt-5-nano';
        if (family.includes('5')) return 'gpt-5';
        if (family.includes('4o') && family.includes('mini')) return 'gpt-4o-mini';
        if (family.includes('4o')) return 'gpt-4o';
        if (family.includes('4') && family.includes('turbo')) return 'gpt-4-turbo';
        if (family.includes('4')) return 'gpt-4';
        return 'gpt-4o'; // Default GPT
    }
    
    // Gemini models  
    if (family.includes('gemini')) {
        if (family.includes('2.5') || family.includes('2-5')) {
            if (family.includes('pro')) return 'gemini-2.5-pro';
            return 'gemini-2.5-pro';
        }
        if (family.includes('2.0') && family.includes('flash')) return 'gemini-2.0-flash';
        if (family.includes('2-0') && family.includes('flash')) return 'gemini-2.0-flash';
        if (family.includes('flash')) return 'gemini-2.0-flash';
        return 'gemini-2.5-pro'; // Default gemini
    }
    
    // O-series models
    if (family.includes('o4') && family.includes('mini')) return 'o4-mini';
    if (family.includes('o3') && family.includes('mini')) return 'o3-mini';
    if (family.includes('o1') && family.includes('mini')) return 'o1-mini';
    
    // Grok models
    if (family.includes('grok')) {
        if (family.includes('code') && family.includes('fast')) return 'grok-code-fast-1';
        return 'grok-code-fast-1';
    }
    
    // Handle exact model names from Copilot that might not match patterns
    // Direct mapping for common Copilot model names
    const directMappings = {
        'claude sonnet 4': 'claude-sonnet-4',
        'claude sonnet 3.5': 'claude-sonnet-3.5',
        'claude 4': 'claude-sonnet-4',
        'claude 3.5': 'claude-sonnet-3.5',
        'gpt 4o': 'gpt-4o',
        'gpt 4.1': 'gpt-4.1',
        'gpt 5': 'gpt-5',
        'gemini 2.5 pro': 'gemini-2.5-pro'
    };
    
    if (directMappings[family]) {
        return directMappings[family];
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
/**
 * Get comprehensive pricing data for AI models across different providers
 * Updated as of October 2025
 */
function getModelPricing() {
    return {
        // OpenAI Official (api.openai.com)
        'openai': {
            'gpt-5': { input: 5.00, output: 15.00 },
            'gpt-4o': { input: 2.50, output: 10.00 },
            'gpt-4o-mini': { input: 0.15, output: 0.60 },
            'gpt-4': { input: 30.00, output: 60.00 },
            'gpt-4-turbo': { input: 10.00, output: 30.00 },
            'gpt-3.5-turbo': { input: 0.50, output: 1.50 },
            'o1': { input: 15.00, output: 60.00 },
            'o1-mini': { input: 3.00, output: 12.00 },
            'o1-preview': { input: 15.00, output: 60.00 }
        },
        
        // STU Platform (aiportalapi.stu-platform.live) - From screenshot
        'stu': {
            'gpt-5': { input: 1.25, output: 10.00 },        // From screenshot
            'gpt-5-mini': { input: 0.25, output: 2.00 },    // From screenshot  
            'gpt-5-nano': { input: 0.10, output: 1.00 },    // Estimated from pattern
            'gpt-4o': { input: 2.00, output: 8.00 },        // STU discount ~20%
            'gpt-4o-mini': { input: 0.12, output: 0.50 },   // STU discount ~20%
            'claude-3-5-sonnet': { input: 2.50, output: 12.00 }  // STU discount ~20%
        },
        
        // Anthropic Official (api.anthropic.com)
        'anthropic': {
            'claude-3-5-sonnet': { input: 3.00, output: 15.00 },
            'claude-3-5-haiku': { input: 0.25, output: 1.25 },
            'claude-3-opus': { input: 15.00, output: 75.00 },
            'claude-3-sonnet': { input: 3.00, output: 15.00 },
            'claude-3-haiku': { input: 0.25, output: 1.25 }
        },
        
        // Google AI (googleapis.com)
        'google': {
            'gemini-1.5-pro': { input: 1.25, output: 5.00 },
            'gemini-1.5-flash': { input: 0.075, output: 0.30 },
            'gemini-2.0-flash': { input: 0.075, output: 0.30 },
            'gemini-pro': { input: 0.50, output: 1.50 },
            'palm-2': { input: 1.00, output: 2.00 }
        },
        
        // Azure OpenAI (azure.com)
        'azure': {
            'gpt-4o': { input: 5.00, output: 15.00 },        // Azure premium
            'gpt-4': { input: 30.00, output: 60.00 },
            'gpt-35-turbo': { input: 0.50, output: 1.50 }
        },
        
        // Cohere (cohere.ai)
        'cohere': {
            'command-r-plus': { input: 3.00, output: 15.00 },
            'command-r': { input: 0.50, output: 1.50 },
            'command': { input: 1.00, output: 2.00 }
        },
        
        // HuggingFace (huggingface.co)
        'huggingface': {
            'meta-llama/llama-2-70b-chat': { input: 0.70, output: 0.90 },
            'mistralai/mixtral-8x7b-instruct': { input: 0.27, output: 0.27 },
            'codellama/codellama-34b-instruct': { input: 0.35, output: 0.35 }
        },
        
        // Ollama (localhost - free)
        'ollama': {
            'llama2': { input: 0.00, output: 0.00 },
            'codellama': { input: 0.00, output: 0.00 },
            'mistral': { input: 0.00, output: 0.00 }
        },
        
        // GitHub Copilot (standard per-token pricing)
        // All models use standard input/output token pricing
        'copilot': {
            // Popular models
            'gpt-5-mini': { input: 0.15, output: 0.60 },
            'gpt-4.1': { input: 2.50, output: 10.00 },
            'gpt-4o': { input: 2.50, output: 10.00 },
            'claude-sonnet-4': { input: 3.00, output: 15.00 },
            'claude-sonnet-3.5': { input: 3.00, output: 15.00 },
            'claude-opus-4.1': { input: 15.00, output: 75.00 },
            'gemini-2.5-pro': { input: 1.25, output: 5.00 },
            'gemini-2.0-flash': { input: 0.075, output: 0.30 },
            'gpt-5': { input: 5.00, output: 15.00 },
            'o3-mini': { input: 3.00, output: 12.00 },
            'o4-mini': { input: 3.00, output: 12.00 },
            'grok-code-fast-1': { input: 2.00, output: 8.00 },
            
            // Legacy models for backward compatibility
            'gpt-4': { input: 2.50, output: 10.00 },
            'claude-3-5-sonnet': { input: 3.00, output: 15.00 }
        }
    };
}

function estimateCost(inputTokens, outputTokens, modelFamily, provider = null, apiHost = null) {
    // For backward compatibility, handle old function signature
    if (typeof modelFamily === 'object' && modelFamily.family) {
        modelFamily = modelFamily.family;
    }
    
    const pricing = getModelPricing();
    
    // Detect provider if not provided
    if (!provider && apiHost) {
        provider = detectProvider(apiHost, modelFamily || 'unknown');
    }
    if (!provider) {
        provider = 'copilot'; // Default to copilot for backward compatibility
    }
    
    console.log(`💰 Cost calculation: ${provider}/${modelFamily} - ${inputTokens}+${outputTokens} tokens`);
    
    // Get provider-specific pricing
    const providerPricing = pricing[provider] || pricing['copilot'];
    
    // Normalize model name for lookup
    const modelKey = normalizeModelFamily(modelFamily);
    
    // Get rates for the model
    const rates = providerPricing[modelKey] || 
                 providerPricing[modelFamily] || 
                 providerPricing['gpt-4o'] || 
                 { input: 2.50, output: 10.00 }; // Default fallback rates
    
    console.log(`💰 Provider pricing keys: ${Object.keys(providerPricing).join(', ')}`);
    console.log(`💰 Looking for model key: ${modelKey} (original: ${modelFamily})`);
    console.log(`💰 Using rates for ${provider}/${modelKey}:`, rates);
    
    // Calculate standard per-token pricing
    const inputCost = (inputTokens / 1000000) * rates.input;
    const outputCost = (outputTokens / 1000000) * rates.output;
    const totalCost = inputCost + outputCost;
    
    console.log(`💰 Calculated costs: input=$${inputCost.toFixed(6)}, output=$${outputCost.toFixed(6)}, total=$${totalCost.toFixed(6)}`);
    
    return {
        inputCost: inputCost,
        outputCost: outputCost,
        totalCost: totalCost,
        inputRate: rates.input,
        outputRate: rates.output,
        provider: provider,
        modelKey: modelKey,
        currency: 'USD'
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
        // Check if API key mode is enabled - no fallback needed for API key mode
        if (shouldUseApiKey()) {
            console.log('🔑 API Key mode enabled - no fallback needed');
            return null;
        }
        
        // Get all available models
        const allModels = await vscode.lm.selectChatModels();
        const availableModels = allModels.filter(m => m.id !== currentModel.id);
        
        if (availableModels.length === 0) {
            throw new Error('No alternative models available for fallback');
        }
        
        // Fallback priority order (respecting user choice):
        // 1. Available Claude models
        // 2. Available GPT models
        // 3. First available model
        
        let fallbackModel = null;
        
        // Priority 1: Claude models (if available)
        fallbackModel = availableModels.find(m => 
            m.family.toLowerCase().includes('claude') && 
            (m.family.includes('4') || m.family.toLowerCase().includes('sonnet'))
        );
        
        // Priority 2: GPT models (if no Claude available)
        if (!fallbackModel) {
            fallbackModel = availableModels.find(m => 
                m.family.toLowerCase().includes('gpt') && 
                (m.family.includes('4o') || m.family.includes('4'))
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
 * 🔄 Response mapping functions for different providers
 */
function mapOpenAIResponse(data) {
    return {
        content: data.choices?.[0]?.message?.content || null,
        inputTokens: data.usage?.prompt_tokens || 0,
        outputTokens: data.usage?.completion_tokens || 0,
        totalTokens: data.usage?.total_tokens || 0
    };
}

function mapAnthropicResponse(data) {
    return {
        content: data.content?.[0]?.text || data.completion || null,
        inputTokens: data.usage?.input_tokens || 0,
        outputTokens: data.usage?.output_tokens || 0,
        totalTokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0)
    };
}

function mapGoogleResponse(data) {
    return {
        content: data.candidates?.[0]?.content?.parts?.[0]?.text || null,
        inputTokens: data.usage?.prompt_token_count || 0,
        outputTokens: data.usage?.candidates_token_count || 0,
        totalTokens: data.usage?.total_token_count || 0
    };
}

function mapSTUResponse(data) {
    console.log('🔍 STU Response Mapping - Full structure analysis:');
    console.log('📊 Top-level keys:', Object.keys(data));
    
    if (data.choices) {
        console.log('📊 Choices array length:', data.choices.length);
        if (data.choices[0]) {
            console.log('📊 First choice keys:', Object.keys(data.choices[0]));
            if (data.choices[0].message) {
                console.log('📊 Message keys:', Object.keys(data.choices[0].message));
                console.log('📊 Message content type:', typeof data.choices[0].message.content);
                console.log('📊 Message content length:', data.choices[0].message.content?.length || 'null/undefined');
            }
        }
    }
    
    if (data.usage) {
        console.log('📊 Usage:', JSON.stringify(data.usage, null, 2));
    }
    
    // STU Platform may have different response structure
    let content = null;
    
    // Primary: Standard OpenAI format
    if (data.choices?.[0]?.message?.content) {
        content = data.choices[0].message.content;
        console.log('✅ Content found in standard location');
    }
    
    // Special case: STU Platform sometimes returns empty content even with tokens
    if (!content && data.usage?.completion_tokens > 0) {
        console.warn('⚠️ STU Platform returned tokens but empty content:');
        console.warn(`   - Input tokens: ${data.usage.prompt_tokens}`);
        console.warn(`   - Output tokens: ${data.usage.completion_tokens}`);
        console.warn(`   - Total tokens: ${data.usage.total_tokens}`);
        console.warn('   - Checking alternative content fields...');
        
        // Try alternative fields
        const alternatives = ['content', 'answer', 'generated_text', 'completion', 'text'];
        for (const field of alternatives) {
            if (data[field]) {
                console.log(`✅ Found content in alternative field: ${field}`);
                content = data[field];
                break;
            }
        }
        
        // Check nested structures
        if (!content && data.data) {
            console.log('🔍 Checking nested data structure...');
            content = data.data.choices?.[0]?.message?.content || data.data.content;
        }
        
        // If still no content but we have tokens, try aggressive parsing
        if (!content) {
            console.warn('⚠️ STU Platform: Trying aggressive content parsing...');
            
            // Enhanced content extraction for complex structures
            const smartContentExtraction = (obj, path = '', depth = 0) => {
                // Prevent infinite recursion
                if (depth > 10) return null;
                
                // Check for string content (more flexible length check)
                if (typeof obj === 'string') {
                    const trimmed = obj.trim();
                    // Accept any meaningful text content (even short ones)
                    if (trimmed.length > 10 && (trimmed.includes('#') || trimmed.includes('**') || trimmed.includes('```') || trimmed.length > 50)) {
                        console.log(`✅ Found meaningful content at ${path}: ${trimmed.substring(0, 150)}...`);
                        return trimmed;
                    }
                }
                
                // Handle arrays (common in streaming responses)
                if (Array.isArray(obj)) {
                    for (let i = 0; i < obj.length; i++) {
                        const result = smartContentExtraction(obj[i], `${path}[${i}]`, depth + 1);
                        if (result) return result;
                    }
                }
                
                // Handle objects with priority fields first
                if (typeof obj === 'object' && obj !== null) {
                    // Priority fields (likely to contain content)
                    const priorityFields = ['content', 'message', 'text', 'response', 'answer', 'data', 'result'];
                    
                    for (const field of priorityFields) {
                        if (obj[field] !== undefined) {
                            const result = smartContentExtraction(obj[field], `${path}.${field}`, depth + 1);
                            if (result) return result;
                        }
                    }
                    
                    // Then check all other fields
                    for (const [key, value] of Object.entries(obj)) {
                        if (!priorityFields.includes(key)) {
                            const result = smartContentExtraction(value, `${path}.${key}`, depth + 1);
                            if (result) return result;
                        }
                    }
                }
                
                return null;
            };
            
            content = smartContentExtraction(data);
            
            // Advanced recovery: Try to reconstruct content from partial data
            if (!content) {
                console.warn('🔄 STU Platform: Attempting advanced content recovery...');
                
                // Try to find any text fragments
                const fragments = [];
                const collectTextFragments = (obj, maxDepth = 5, currentDepth = 0) => {
                    if (currentDepth >= maxDepth) return;
                    
                    if (typeof obj === 'string' && obj.trim().length > 5) {
                        fragments.push(obj.trim());
                    } else if (Array.isArray(obj)) {
                        obj.forEach(item => collectTextFragments(item, maxDepth, currentDepth + 1));
                    } else if (typeof obj === 'object' && obj !== null) {
                        Object.values(obj).forEach(value => collectTextFragments(value, maxDepth, currentDepth + 1));
                    }
                };
                
                collectTextFragments(data);
                
                // If we found fragments, try to piece them together
                if (fragments.length > 0) {
                    // Filter meaningful fragments (avoid single chars, numbers, etc.)
                    const meaningfulFragments = fragments.filter(frag => 
                        frag.length > 10 && 
                        /[a-zA-Z]/.test(frag) && 
                        !frag.match(/^[\d\s\-_]+$/)
                    );
                    
                    if (meaningfulFragments.length > 0) {
                        content = meaningfulFragments.join('\n\n');
                        console.log(`✅ STU Platform: Reconstructed content from ${meaningfulFragments.length} fragments`);
                    }
                }
                
                // Final fallback: Check if this is a streaming response issue
                if (!content && data.choices && data.choices.length > 0) {
                    const choice = data.choices[0];
                    if (choice.delta && choice.delta.content) {
                        content = choice.delta.content;
                        console.log('✅ STU Platform: Found content in streaming delta');
                    }
                }
                
                // If absolutely no content found, return error for fallback
                if (!content) {
                    console.error('❌ STU Platform: All content recovery attempts failed');
                    console.error('🔧 Falling back to Copilot for this request');
                    return { content: null, error: 'COMPLEX_PARSING_FAILED', inputTokens: data.usage?.prompt_tokens || 0, outputTokens: data.usage?.completion_tokens || 0 };
                }
            }
        }
    }
    
    // Fallback for other fields if still no content
    if (!content) {
        console.log('🔍 Fallback content search...');
        content = data.content || 
                  data.answer || 
                  data.generated_text ||
                  data.completion ||
                  null;
    }
    
    const result = {
        content: content,
        inputTokens: data.usage?.prompt_tokens || 0,
        outputTokens: data.usage?.completion_tokens || 0,
        totalTokens: data.usage?.total_tokens || 0
    };
    
    console.log('🎯 Final STU mapping result:', {
        hasContent: !!result.content,
        contentLength: result.content?.length || 0,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens
    });
    
    return result;
}

function mapGenericResponse(data) {
    // Generic fallback for any provider
    return {
        content: data.choices?.[0]?.message?.content ||
                 data.choices?.[0]?.text ||
                 data.content ||
                 data.text ||
                 data.result ||
                 data.response ||
                 data.output ||
                 data.completion || null,
        inputTokens: data.usage?.prompt_tokens || data.usage?.input_tokens || 0,
        outputTokens: data.usage?.completion_tokens || data.usage?.output_tokens || 0,
        totalTokens: data.usage?.total_tokens || 0
    };
}

/**
 * 🎯 Map API response based on provider
 * @param {object} rawResponse - Raw API response
 * @param {string} provider - Provider name
 * @returns {object} - Mapped response with content and token info
 */
function mapProviderResponse(rawResponse, provider) {
    console.log(`🔄 Mapping response for provider: ${provider}`);
    
    switch (provider) {
        case 'openai':
        case 'azure':
            return mapOpenAIResponse(rawResponse);
        case 'anthropic':
            return mapAnthropicResponse(rawResponse);
        case 'google':
            return mapGoogleResponse(rawResponse);
        case 'stu':
            return mapSTUResponse(rawResponse);
        case 'cohere':
        case 'huggingface':
        case 'ollama':
        case 'custom':
        default:
            return mapGenericResponse(rawResponse);
    }
}

/**
 * Check if user wants to use API key instead of Copilot
 * @returns {boolean} - true if API key mode is enabled
 */
function shouldUseApiKey() {
    const config = vscode.workspace.getConfiguration('aiSelfCheck');
    const useApiKey = config.get('useApiKeyInsteadOfCopilot', false);
    const apiKey = config.get('ai.apiKey');
    
    console.log(`🔍 API Key mode check: useApiKeyInsteadOfCopilot=${useApiKey}, hasApiKey=${!!apiKey}`);
    
    return useApiKey && !!apiKey;
}

/**
 * Execute AI call using API key (OpenAI, Claude, etc.)
 * @param {string} userPrompt - The prompt to send
 * @param {object} stream - Chat stream for output
 * @param {string} reviewType - Type of review
 * @param {number} attemptCount - Current attempt number
 * @returns {Promise<boolean>} - true if successful
 */
async function executeAIReviewWithApiKey(userPrompt, stream, reviewType, attemptCount = 0) {
    try {
        const config = vscode.workspace.getConfiguration('aiSelfCheck');
        const apiKey = config.get('ai.apiKey');
        let apiHost = config.get('ai.apiHost') || 'https://api.openai.com';
        const model = config.get('ai.model') || 'gpt-4o';
        
        // Ensure API host has the correct endpoint
        if (!apiHost.includes('/chat/completions') && !apiHost.includes('/v1')) {
            if (apiHost.includes('openai.com')) {
                apiHost = apiHost.replace(/\/$/, '') + '/v1/chat/completions';
            } else if (apiHost.includes('anthropic.com')) {
                apiHost = apiHost.replace(/\/$/, '') + '/v1/messages';
            } else {
                // Assume OpenAI-compatible format for custom hosts
                apiHost = apiHost.replace(/\/$/, '') + '/v1/chat/completions';
            }
        }
        
        if (!apiKey) {
            throw new Error('AI API key not configured. Please set aiSelfCheck.ai.apiKey in VS Code settings.');
        }
        
        console.log(`📤 API Key mode - Attempt ${attemptCount + 1}: Sending request to ${apiHost} with model: ${model}`);
        console.log(`🔑 API Key configured: ${apiKey ? 'Yes' : 'No'}`);
        console.log(`🌐 Final API Host: ${apiHost}`);
        
        const reviewIcon = reviewType === 'Changes' ? '🔍' : '📄';
        const modelStatus = attemptCount === 0 ? 'API key mode' : `API key fallback (attempt ${attemptCount + 1})`;
        
        stream.markdown(`🤖 **Streaming ${reviewType} ${reviewIcon}** (using ${model} - ${modelStatus}):\n\n`);
        stream.markdown(`🔧 **Host**: ${apiHost}\n\n`);
        stream.markdown('---\n\n');
        
        // Debug: Check if userPrompt contains template and diff
        console.log(`🔍 UserPrompt length: ${userPrompt.length} characters`);
        console.log(`🔍 UserPrompt preview (first 500 chars):`, userPrompt.substring(0, 500));
        console.log(`🔍 UserPrompt contains 'MANDATORY CHANGE ANALYSIS':`, userPrompt.includes('MANDATORY CHANGE ANALYSIS'));
        console.log(`🔍 UserPrompt contains diff (+++/-):`, userPrompt.includes('+++') || userPrompt.includes('---'));
        
        // Use the shared callAI function
        const defaultOptions = {
            temperature: 0.1,
            max_tokens: 4000,
            stream: true, // Enable streaming for better UX
            response_format: undefined // Remove JSON format for reviews
        };
        
        const result = await callAI('You are an expert code reviewer and software architect. Provide detailed, actionable code review feedback.', userPrompt, defaultOptions);
        
        let mappedResponse;
        let outputText = '';
        
        // Detect provider for both streaming and non-streaming responses
        const provider = detectProvider(result.apiHost, result.model || model);
        
        if (result.isStreaming) {
            console.log('🔄 Handling streaming response...');
            
            // Handle streaming response
            const reader = result.streamResponse.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            let totalInputTokens = 0;
            let totalOutputTokens = 0;
            
            try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    
                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split('\n');
                    buffer = lines.pop() || '';
                    
                    for (const line of lines) {
                        if (line.startsWith('data: ')) {
                            const data = line.slice(6);
                            if (data === '[DONE]') continue;
                            
                            try {
                                const parsed = JSON.parse(data);
                                const content = parsed.choices?.[0]?.delta?.content || '';
                                if (content) {
                                    outputText += content;
                                    stream.markdown(content); // Stream each chunk immediately
                                }
                                
                                // Collect token usage if available
                                if (parsed.usage) {
                                    totalInputTokens = parsed.usage.prompt_tokens || 0;
                                    totalOutputTokens = parsed.usage.completion_tokens || 0;
                                }
                            } catch (e) {
                                console.warn('⚠️ Failed to parse streaming chunk:', data);
                            }
                        }
                    }
                }
                
                // Fallback to estimation if streaming didn't provide token usage
                if (totalInputTokens === 0 && totalOutputTokens === 0) {
                    console.warn('⚠️ STU Platform streaming: No token usage in response, falling back to estimation');
                    totalInputTokens = estimateTokenCount(userPrompt);
                    totalOutputTokens = estimateTokenCount(outputText);
                }
                
                mappedResponse = {
                    content: outputText,
                    inputTokens: totalInputTokens,
                    outputTokens: totalOutputTokens,
                    totalTokens: totalInputTokens + totalOutputTokens
                };
                
            } finally {
                reader.releaseLock();
            }
        } else {
            // Handle non-streaming response
            mappedResponse = mapProviderResponse(result.rawResponse, provider);
            
        console.log(`🎯 Mapped response for ${provider}:`, mappedResponse);
        
        // Handle complex parsing failure - trigger fallback to Copilot
        if (mappedResponse.error === 'COMPLEX_PARSING_FAILED') {
            console.warn(`⚠️ ${provider} failed on complex content parsing - triggering Copilot fallback`);
            // Only throw if we truly have no content
            if (!mappedResponse.content || mappedResponse.content.trim().length === 0) {
                throw new Error(`${provider} complex parsing failed - content too complex for current parser`);
            } else {
                console.log(`✅ ${provider} recovered content despite parsing complexity - proceeding normally`);
                // Clear the error flag since we have content
                delete mappedResponse.error;
            }
        }
        
        if (!mappedResponse.content) {
            console.warn(`⚠️ No content extracted from ${provider} response, but API call succeeded`);
            // Don't throw error - API succeeded, just show a helpful message
            const fallbackMessage = `⚠️ **${provider.toUpperCase()} API Response Issue**: The API call succeeded and returned ${mappedResponse.outputTokens} tokens, but content extraction failed. This suggests a response format compatibility issue rather than an API failure.\n\n**Possible solutions:**\n- Try a different model (e.g., switch from GPT-5 to GPT-4o)\n- Check API provider documentation for response format changes\n- Contact support if the issue persists\n\n**Debug info**: Provider: ${provider}, Output tokens: ${mappedResponse.outputTokens}`;
            
            stream.markdown(fallbackMessage);
            
            // Show token statistics even with empty content (using actual tokens)
            const actualTokens = {
                inputTokens: mappedResponse.inputTokens,
                outputTokens: mappedResponse.outputTokens,
                totalTokens: mappedResponse.totalTokens
            };
            showTokenStatistics(stream, userPrompt, fallbackMessage, { family: model }, reviewType, attemptCount, provider, result.apiHost, actualTokens);
            
            return true; // Don't trigger fallback since API actually worked
        }            // Handle both JSON and text responses
            outputText = typeof mappedResponse.content === 'string' ? mappedResponse.content : JSON.stringify(mappedResponse.content, null, 2);
            
            // Stream the output (simulate streaming for consistency)
            stream.markdown(outputText);
        }
        
        // Show completion with token statistics using actual tokens from API
        const actualTokens = {
            inputTokens: mappedResponse.inputTokens,
            outputTokens: mappedResponse.outputTokens,
            totalTokens: mappedResponse.totalTokens
        };
        
        showTokenStatistics(stream, userPrompt, outputText, { family: model }, reviewType, attemptCount, provider, result.apiHost, actualTokens);
        
        return true;
        
    } catch (apiError) {
        console.error(`❌ API Key mode failed (attempt ${attemptCount + 1}):`, apiError);
        
        // Provide detailed error information
        let errorDetails = apiError.message;
        if (apiError.message.includes('fetch')) {
            errorDetails += `\n🔍 **Debug**: Check API Host (${apiHost}) and network connectivity`;
        }
        if (!apiKey) {
            errorDetails += `\n🔑 **Missing API Key**: Please set aiSelfCheck.ai.apiKey in VS Code settings`;
        }
        
        stream.markdown(`❌ **API Key mode failed:** ${errorDetails}\n\n`);
        throw apiError;
    }
}

/**
 * 🔍 Detect AI provider from API host and model (moved from scan-app.js)
 * @param {string} apiHost - API host URL
 * @param {string} model - Model name
 * @returns {string} - Provider identifier
 */
function detectProvider(apiHost, model) {
    const host = apiHost.toLowerCase();
    const modelLower = model.toLowerCase();
    
    // Check by API host
    if (host.includes('openai.com')) return 'openai';
    if (host.includes('anthropic.com')) return 'anthropic';
    if (host.includes('googleapis.com') || host.includes('google.com')) return 'google';
    if (host.includes('cohere.ai') || host.includes('cohere.com')) return 'cohere';
    if (host.includes('aiportalapi.stu-platform.live')) return 'stu';
    if (host.includes('azure.com') || host.includes('openai.azure.com')) return 'azure';
    if (host.includes('huggingface.co')) return 'huggingface';
    if (host.includes('ollama') || host.includes('localhost:11434')) return 'ollama';
    
    // Check by model name
    if (modelLower.includes('gpt') || modelLower.includes('davinci') || modelLower.includes('curie')) return 'openai';
    if (modelLower.includes('claude')) return 'anthropic';
    if (modelLower.includes('gemini') || modelLower.includes('palm') || modelLower.includes('bison')) return 'google';
    if (modelLower.includes('command') || modelLower.includes('cohere')) return 'cohere';
    if (modelLower.includes('llama') || modelLower.includes('mistral') || modelLower.includes('codellama')) return 'ollama';
    
    return 'custom';
}

/**
 * 🔧 Normalize API parameters based on provider/model (moved from scan-app.js)
 * @param {string} model - Model name
 * @param {string} apiHost - API host URL
 * @param {object} options - Original options
 * @returns {object} - Normalized options
 */
function normalizeApiParameters(model, apiHost, options) {
    const normalized = { ...options };
    
    // Detect provider from API host or model name
    const provider = detectProvider(apiHost, model);
    
    console.log(`🔄 Normalizing parameters for provider: ${provider}`);
    
    switch (provider) {
        case 'openai':
            // OpenAI uses max_tokens
            if (options.max_completion_tokens) {
                normalized.max_tokens = options.max_completion_tokens;
                delete normalized.max_completion_tokens;
            }
            break;
            
        case 'anthropic':
            // Anthropic uses max_tokens but different structure
            if (options.max_tokens) {
                normalized.max_tokens = options.max_tokens;
            }
            // Remove OpenAI-specific parameters
            delete normalized.response_format;
            break;
            
        case 'google':
            // Google PaLM/Gemini uses different parameter names
            if (options.max_tokens) {
                normalized.max_output_tokens = options.max_tokens;
                delete normalized.max_tokens;
            }
            if (options.max_completion_tokens) {
                normalized.max_output_tokens = options.max_completion_tokens;
                delete normalized.max_completion_tokens;
            }
            break;
            
        case 'cohere':
            // Cohere uses max_generation_length
            if (options.max_tokens) {
                normalized.max_generation_length = options.max_tokens;
                delete normalized.max_tokens;
            }
            if (options.max_completion_tokens) {
                normalized.max_generation_length = options.max_completion_tokens;
                delete normalized.max_completion_tokens;
            }
            break;
            
        case 'stu':
            // STU Platform - experimental GPT-5 compatibility mode
            console.log('🔧 STU Platform detected - applying compatibility fixes...');
            
            // Remove ALL potentially problematic parameters for GPT-5
            if (model.includes('gpt-5') || model.toLowerCase().includes('gpt-5')) {
                console.warn('⚠️ GPT-5 on STU Platform - Using minimal parameter set');
                
                // Keep only essential parameters
                const essentialParams = {
                    model: normalized.model,
                    messages: normalized.messages,
                    stream: normalized.stream || false
                };
                
                // Clear all other parameters that might cause conflicts
                Object.keys(normalized).forEach(key => {
                    if (!essentialParams.hasOwnProperty(key)) {
                        delete normalized[key];
                    }
                });
                
                console.log('🔧 STU GPT-5 params:', Object.keys(normalized));
            } else {
                // For non-GPT-5 models, use standard parameter mapping
                if (options.max_tokens) {
                    normalized.max_completion_tokens = options.max_tokens;
                    delete normalized.max_tokens;
                }
            }
            break;
            
        case 'azure':
            // Azure OpenAI uses max_completion_tokens for most models
            if (options.max_tokens) {
                // Azure prefers max_completion_tokens for all GPT models
                normalized.max_completion_tokens = options.max_tokens;
                delete normalized.max_tokens;
            }
            if (options.max_completion_tokens) {
                // Keep it if already set
                normalized.max_completion_tokens = options.max_completion_tokens;
            }
            break;
            
        case 'huggingface':
            // HuggingFace uses max_new_tokens
            if (options.max_tokens) {
                normalized.max_new_tokens = options.max_tokens;
                delete normalized.max_tokens;
            }
            if (options.max_completion_tokens) {
                normalized.max_new_tokens = options.max_completion_tokens;
                delete normalized.max_completion_tokens;
            }
            break;
            
        case 'ollama':
            // Ollama uses num_predict
            if (options.max_tokens) {
                normalized.num_predict = options.max_tokens;
                delete normalized.max_tokens;
            }
            if (options.max_completion_tokens) {
                normalized.num_predict = options.max_completion_tokens;
                delete normalized.max_completion_tokens;
            }
            // Remove OpenAI-specific parameters
            delete normalized.response_format;
            break;
            
        case 'custom':
        default:
            // For custom providers, try to detect based on model name
            if (model.includes('claude')) {
                // Likely Anthropic-compatible
                delete normalized.response_format;
            } else if (model.includes('gemini') || model.includes('palm')) {
                // Likely Google-compatible
                if (options.max_tokens) {
                    normalized.max_output_tokens = options.max_tokens;
                    delete normalized.max_tokens;
                }
            }
            break;
    }
    
    return normalized;
}

/**
 * 🤖 Reusable AI API call function (moved from scan-app.js)
 * @param {string} systemPrompt - System prompt
 * @param {string} userPrompt - User prompt  
 * @param {object} options - API call options
 * @returns {Promise<object>} - API response with token usage
 */
async function callAI(systemPrompt, userPrompt, options = {}) {
    const config = vscode.workspace.getConfiguration('aiSelfCheck');
    const apiKey = config.get('ai.apiKey');
    let apiHost = config.get('ai.apiHost') || 'https://api.openai.com';
    const model = config.get('ai.model') || 'gpt-4o';
    
    if (!apiKey) {
        throw new Error('AI API key not configured. Please set aiSelfCheck.ai.apiKey in VS Code settings.');
    }
    
    // Ensure API host has the correct endpoint
    if (!apiHost.includes('/chat/completions') && !apiHost.includes('/v1') && !apiHost.includes('/messages')) {
        if (apiHost.includes('openai.com')) {
            apiHost = apiHost.replace(/\/$/, '') + '/v1/chat/completions';
        } else if (apiHost.includes('anthropic.com')) {
            apiHost = apiHost.replace(/\/$/, '') + '/v1/messages';
        } else {
            // Assume OpenAI-compatible format for custom hosts
            apiHost = apiHost.replace(/\/$/, '') + '/v1/chat/completions';
        }
    }
    
    const defaultOptions = {
        temperature: 0.1,
        max_tokens: 4000,
        response_format: { type: "json_object" },
        ...options
    };
    
    // Normalize API parameters based on provider/model
    const normalizedOptions = normalizeApiParameters(model, apiHost, defaultOptions);
    
    console.log(`🔑 Making API call to: ${apiHost}`);
    console.log(`🤖 Using model: ${model}`);
    console.log(`📋 Request payload:`, JSON.stringify({
        model: model,
        messages: [
            { role: 'system', content: systemPrompt.substring(0, 100) + '...' },
            { role: 'user', content: userPrompt.substring(0, 200) + '...' }
        ],
        ...normalizedOptions
    }, null, 2));
    
    const response = await fetch(apiHost, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
            'User-Agent': 'VS Code AI Self Check Extension'
        },
        body: JSON.stringify({
            model: model,
            messages: [
                {
                    role: 'system',
                    content: systemPrompt
                },
                {
                    role: 'user',
                    content: userPrompt
                }
            ],
            ...normalizedOptions
        })
    });
    
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`AI API error: ${response.status} - ${errorText}`);
    }
    
    // Handle streaming vs non-streaming responses
    if (normalizedOptions.stream) {
        console.log('🔄 Streaming response detected');
        return {
            streamResponse: response,
            apiHost: apiHost,
            model: model,
            isStreaming: true
        };
    } else {
        const data = await response.json();
        console.log('🔍 Raw API response received:', JSON.stringify(data, null, 2));
        
        // Just return the raw response - mapping will be done by caller
        return {
            rawResponse: data,
            apiHost: apiHost,
            model: model,
            isStreaming: false
        };
    }
}

// Legacy function names for backward compatibility
const normalizeApiParametersForReview = normalizeApiParameters;
const detectProviderForReview = detectProvider;

/**
 * Unified AI execution function with token counting, streaming, and fallback logic
 * Enhanced with API key support for users without Copilot license
 * @param {string} userPrompt - The prompt to send to the AI model
 * @param {object} model - The AI model to use (null if using API key mode)
 * @param {object} stream - Chat stream for output
 * @param {string} reviewType - Type of review ('Changes' or 'File')
 * @param {number} attemptCount - Current attempt number for recursion
 * @returns {Promise<boolean>} - true if successful, false if failed
 */
async function executeAIReview(userPrompt, model, stream, reviewType = 'Analysis', attemptCount = 0, originalRequestedModel = null) {
    const maxAttempts = 3;
    
    // Check if user wants to use API key instead of Copilot
    if (shouldUseApiKey()) {
        console.log('🔑 Using API key mode instead of Copilot');
        stream.markdown(`🔑 **API Key Mode Enabled** - Using your configured AI service\n\n`);
        
        try {
            return await executeAIReviewWithApiKey(userPrompt, stream, reviewType, attemptCount);
        } catch (apiError) {
            // If API key fails and we have attempts left, fall back to Copilot if available
            if (attemptCount < maxAttempts - 1 && model) {
                stream.markdown(`🔄 **API key failed, falling back to Copilot...**\n\n`);
                console.log('🔄 API key failed, attempting Copilot fallback');
                return await executeAIReviewWithCopilot(userPrompt, model, stream, reviewType, attemptCount + 1, originalRequestedModel);
            } else {
                throw apiError;
            }
        }
    }
    
    // Original Copilot mode
    return await executeAIReviewWithCopilot(userPrompt, model, stream, reviewType, attemptCount, originalRequestedModel);
}

/**
 * Execute AI review using Copilot (original function logic)
 * @param {string} userPrompt - The prompt to send to the AI model
 * @param {object} model - The AI model to use
 * @param {object} stream - Chat stream for output
 * @param {string} reviewType - Type of review ('Changes' or 'File')
 * @param {number} attemptCount - Current attempt number for recursion
 * @returns {Promise<boolean>} - true if successful, false if failed
 */
async function executeAIReviewWithCopilot(userPrompt, model, stream, reviewType = 'Analysis', attemptCount = 0, originalRequestedModel = null) {
    const maxAttempts = 3;
    
    try {
        if (!model) {
            throw new Error('No Copilot model available. Please ensure GitHub Copilot is installed and active, or enable API key mode.');
        }
        
        // Calculate input tokens and estimated cost (for final summary only)
        const inputTokens = estimateTokenCount(userPrompt);
        const messages = [vscode.LanguageModelChatMessage.User(userPrompt)];
        
        console.log(`📤 Copilot mode - Attempt ${attemptCount + 1}: Sending request to model:`, model.family);
        
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
        
        // Show completion with token statistics
        showTokenStatistics(stream, userPrompt, outputText, model, reviewType, attemptCount, 'copilot', null, null);
        
        return true; // Success
        
    } catch (modelError) {
        console.error(`❌ Copilot model ${model?.family || 'unknown'} failed (attempt ${attemptCount + 1}):`, modelError);
        
        // If we've reached max attempts, throw the error
        if (attemptCount >= maxAttempts - 1) {
            throw new Error(`All ${maxAttempts} Copilot attempts failed. Last error: ${modelError.message}`);
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
                return await executeAIReviewWithCopilot(userPrompt, fallbackModel, stream, reviewType, attemptCount + 1, originalRequestedModel || model.family);
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
                return await executeAIReviewWithCopilot(userPrompt, fallbackModel, stream, reviewType, attemptCount + 1, originalRequestedModel || model.family);
            } catch (fallbackError) {
                stream.markdown(`❌ **Fallback failed:** ${fallbackError.message}\n\n`);
                throw new Error(`Model not supported and fallback failed: ${fallbackError.message}`);
            }
        } else {
            // Other errors, don't retry
            stream.markdown(`❌ **${model?.family || 'Unknown model'} failed** (attempt ${attemptCount + 1}): ${modelError.message}\n\n`);
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
    
    // PRIORITY 0: Check if API key mode is enabled - if so, skip ALL Copilot model detection
    if (shouldUseApiKey()) {
        console.log('🔑 API Key mode enabled - skipping ALL Copilot model detection');
        console.log('=== getUnifiedModel DEBUG END (API KEY MODE) ===');
        return null; // Let API key mode handle the AI calls
    }
    
    console.log('🔍 Full request object:', JSON.stringify(request, null, 2));
    console.log('🔍 Request keys:', request ? Object.keys(request) : 'null');
    console.log('🔍 Request.model:', request?.model);
    console.log('🔍 Request.model?.family:', request?.model?.family);
    console.log('🔍 Request.model?.id:', request?.model?.id);
    
    // Check ALL possible model locations in request
    if (request) {
        console.log('🔍 Checking all request properties for model...');
        for (const key in request) {
            console.log(`   - request.${key}:`, typeof request[key] === 'object' ? JSON.stringify(request[key]).substring(0, 200) : request[key]);
        }
    }
    
    // PRIORITY 1: Check request.model first (this is where VS Code puts the selected model!)
    if (request && request.model) {
        console.log('✅ Found model in request.model:', request.model);
        console.log('✅ Model family:', request.model.family);
        console.log('✅ Model id:', request.model.id);
        console.log('🎯 Using user-selected model from VS Code chat');
        
        // Add warning if user selected GPT but wanted Claude
        if (request.model.family && request.model.family.toLowerCase().includes('gpt')) {
            console.log('ℹ️ NOTE: User selected GPT model. To use Claude, please select a Claude model in VS Code chat dropdown.');
        }
        
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
        
        if (models.length === 0) {
            console.warn('⚠️ No Copilot models available - check GitHub Copilot installation and authentication');
            // If API key is configured, suggest using it instead
            if (vscode.workspace.getConfiguration('aiSelfCheck').get('ai.apiKey')) {
                console.log('💡 Suggestion: Enable API key mode in settings: aiSelfCheck.useApiKeyInsteadOfCopilot = true');
            }
            return null;
        }
        
        if (models.length > 0) {
            // FALLBACK 1: Smart model selection based on quality preference (respecting user choice)
            const modelPreferences = [
                // Tier 1: High-quality models (Claude and GPT)
                'claude-sonnet-4', 'claude-4', 'claude-3.5-sonnet', 'claude-3.7-sonnet',
                'gpt-4o', 'gpt-4-turbo', 'gpt-4',
                // Tier 2: Other advanced models
                'gpt-4o-mini', 'o4-mini', 'o3-mini', 'gemini-2.5-pro', 'gemini-2.0-flash', 
                // Tier 3: Fallback options
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
        console.error('❌ Error getting Copilot models:', error.message);
        
        // Check if this is a GitHub authentication error
        if (error.message.includes('GitHubLoginFailed') || error.message.includes('authentication')) {
            console.warn('🔑 GitHub Copilot authentication failed. Consider using API key mode instead.');
            
            // If user has API key configured, suggest enabling API key mode
            const config = vscode.workspace.getConfiguration('aiSelfCheck');
            const hasApiKey = config.get('ai.apiKey');
            
            if (hasApiKey) {
                console.log('💡 You have an API key configured. Enable API key mode: aiSelfCheck.useApiKeyInsteadOfCopilot = true');
            } else {
                console.log('💡 Configure an API key in settings: aiSelfCheck.ai.apiKey and enable aiSelfCheck.useApiKeyInsteadOfCopilot');
            }
        }
        
        models = [];
    }
    
    const finalModel = models.length > 0 ? models[0] : null;
    console.log('🏁 Final model selected:', finalModel);
    
    // If no model is available, provide helpful guidance
    if (!finalModel) {
        console.warn('⚠️ No AI models available. Options:');
        console.warn('   1. Install and authenticate GitHub Copilot');
        console.warn('   2. Configure API key mode in extension settings');
        console.warn('   3. Check VS Code language model permissions');
        
        // Show user-friendly error in stream if available
        if (stream) {
            stream.markdown('❌ **No AI models available**\n\n');
            stream.markdown('**Options to fix this:**\n');
            stream.markdown('1. **GitHub Copilot**: Install and authenticate GitHub Copilot extension\n');
            stream.markdown('2. **API Key Mode**: Configure an API key in extension settings\n');
            stream.markdown('3. **Permissions**: Check VS Code language model permissions\n\n');
            stream.markdown('💡 **Tip**: If you have an API key, enable `aiSelfCheck.useApiKeyInsteadOfCopilot` in settings\n');
        }
    }
    
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
        // Check if API key mode is enabled - return empty array for Copilot models
        if (shouldUseApiKey()) {
            console.log('🔑 API Key mode enabled - returning API provider models');
            return []; // Return empty for Copilot models since we're using API key
        }
        
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
 * Show token usage statistics and completion status
 * @param {object} stream - Chat stream for output
 * @param {string} inputText - Input text sent to AI
 * @param {string} outputText - Output text received from AI
 * @param {object} model - AI model used
 * @param {string} reviewType - Type of analysis
 * @param {number} attemptCount - Current attempt number
 */
function showTokenStatistics(stream, inputText, outputText, model, reviewType, attemptCount, provider = null, apiHost = null, actualTokens = null) {
    // Use actual tokens from API response if available, otherwise estimate
    let inputTokens, outputTokens;
    
    if (actualTokens && actualTokens.inputTokens !== undefined && actualTokens.outputTokens !== undefined) {
        // Use actual tokens from API response (more accurate)
        inputTokens = actualTokens.inputTokens;
        outputTokens = actualTokens.outputTokens;
        console.log(`📊 Using actual tokens from API: Input=${inputTokens}, Output=${outputTokens}`);
    } else {
        // Fall back to estimation (for Copilot mode)
        inputTokens = estimateTokenCount(inputText);
        outputTokens = estimateTokenCount(outputText);
        console.log(`📊 Using estimated tokens: Input=${inputTokens}, Output=${outputTokens}`);
    }
    
    // Get cost estimation with GitHub Copilot quota logic
    const finalCost = estimateCost(inputTokens, outputTokens, model.family, provider, apiHost, 'pro', 0);
    
    // Determine completion status
    const completionStatus = attemptCount === 0 ? 'original model' : `fallback model (${model.family})`;
    
    // Display token statistics with provider info
    stream.markdown(`\n\n---\n\n`);
    stream.markdown(`📊 **Token Usage Summary:**\n`);
    stream.markdown(`- **Input tokens**: ${inputTokens.toLocaleString()} ($${finalCost.inputRate.toFixed(2)}/1M)\n`);
    stream.markdown(`- **Output tokens**: ${outputTokens.toLocaleString()} ($${finalCost.outputRate.toFixed(2)}/1M)\n`);
    stream.markdown(`- **Total tokens**: ${(inputTokens + outputTokens).toLocaleString()}\n`);
    
    // Show cost information - always calculate by token
    stream.markdown(`- **Cost**: $${finalCost.totalCost.toFixed(4)} (Input: $${finalCost.inputCost.toFixed(4)} | Output: $${finalCost.outputCost.toFixed(4)})\n`);
    
    stream.markdown(`- **Model used**: ${model.family}${finalCost.provider ? ` (${finalCost.provider})` : ''}\n\n`);
    stream.markdown(`✅ **${reviewType} Analysis complete** - successfully used ${completionStatus}\n\n`);
    
    // Console logging
    console.log(`✅ ${reviewType} review completed successfully with model:`, model.family);
    console.log(`📊 Token usage - Input: ${inputTokens}, Output: ${outputTokens}, Cost: $${finalCost.totalCost.toFixed(4)}`);
}

/**
 * Execute API call for scan-app pattern analysis
 * @param {string} prompt - The prompt to send to the AI model
 * @param {object} stream - Chat stream for output
 * @param {string} analysisType - Type of analysis (e.g. 'API Pattern Analysis')
 * @returns {Promise<object|null>} - Parsed AI response or null if failed
 */
async function executeApiAnalysisCall(prompt, stream, analysisType = 'API Pattern Analysis') {
    try {
        // Get AI model
        const model = await getUnifiedModel(stream);
        if (!model) {
            // Check if this is API key mode before showing error
            if (shouldUseApiKey()) {
                // API key mode - try executeAIReview which will handle API key calls
                console.log('🔑 API key mode enabled for analysis - proceeding with executeAIReview');
                const success = await executeAIReview(prompt, null, stream, analysisType);
                return success ? { analysis: 'API key mode analysis completed' } : null;
            } else {
                stream.markdown('❌ **No AI model available** - Please select a model in VS Code\n\n');
                return null;
            }
        }
        
        console.log(`📤 Starting ${analysisType} with model:`, model.family);
        
        // Show analysis start
        stream.markdown(`🤖 **${analysisType}** (using ${model.family}):\n\n`);
        stream.markdown('🔄 **Processing with AI...**\n\n');
        
        // Execute AI call
        const messages = [vscode.LanguageModelChatMessage.User(prompt)];
        const chatResponse = await model.sendRequest(messages, {}, new vscode.CancellationTokenSource().token);
        
        // Collect output
        let outputText = '';
        for await (const fragment of chatResponse.text) {
            outputText += fragment;
        }
        
        // Show token statistics
        showTokenStatistics(stream, prompt, outputText, model, analysisType, 0);
        
        // Try to parse JSON response
        try {
            const parsedResponse = JSON.parse(outputText);
            console.log(`✅ ${analysisType} JSON parsed successfully`);
            return parsedResponse;
        } catch (parseError) {
            console.log(`⚠️ ${analysisType} response is not JSON, returning raw text`);
            return { rawResponse: outputText };
        }
        
    } catch (error) {
        console.error(`❌ ${analysisType} failed:`, error);
        stream.markdown(`❌ **${analysisType} failed:** ${error.message}\n\n`);
        
        // Try fallback if quota/model error
        if (error.message && (
            error.message.includes('quota') ||
            error.message.includes('rate limit') ||
            error.message.includes('not supported')
        )) {
            stream.markdown(`🔄 **Attempting fallback model...**\n\n`);
            try {
                const fallbackModel = await getFallbackModel(model, stream, 1);
                const messages = [vscode.LanguageModelChatMessage.User(prompt)];
                const chatResponse = await fallbackModel.sendRequest(messages, {}, new vscode.CancellationTokenSource().token);
                
                let outputText = '';
                for await (const fragment of chatResponse.text) {
                    outputText += fragment;
                }
                
                showTokenStatistics(stream, prompt, outputText, fallbackModel, analysisType, 1);
                
                try {
                    const parsedResponse = JSON.parse(outputText);
                    console.log(`✅ ${analysisType} fallback JSON parsed successfully`);
                    return parsedResponse;
                } catch (parseError) {
                    return { rawResponse: outputText };
                }
                
            } catch (fallbackError) {
                stream.markdown(`❌ **Fallback also failed:** ${fallbackError.message}\n\n`);
                return null;
            }
        }
        
        return null;
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
    executeAIReviewWithApiKey,
    executeAIReviewWithCopilot,
    shouldUseApiKey,
    callAI,
    normalizeApiParameters,
    detectProvider,
    mapProviderResponse,
    getModelPricing,
    normalizeApiParametersForReview,
    detectProviderForReview,
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
    getLanguageFromExtension,
    showTokenStatistics,
    executeApiAnalysisCall
};
