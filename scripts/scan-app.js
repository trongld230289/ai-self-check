const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const { showTokenStatistics, estimateTokenCount, callAI, normalizeApiParameters, detectProvider, mapProviderResponse } = require('./review-common');

// Add fetch polyfill for older Node.js versions
if (!global.fetch) {
    try {
        const fetch = require('node-fetch');
        global.fetch = fetch;
        console.log('✅ node-fetch loaded successfully');
    } catch (error) {
        console.warn('⚠️ node-fetch not available, using https module fallback');
        // You can add a custom fetch implementation here if needed
    }
}

/**
 * Initialize Smart App Scanner with AST analysis
 */
function initializeScanApp(context) {
    console.log('🚀 Initializing scan-app participant...');
    
    try {
        const scanAppParticipant = vscode.chat.createChatParticipant('scan-app', async (request, context, stream, token) => {
            console.log('🔍 Smart Scanner called:', request.prompt);
            
            try {
                const query = request.prompt.trim().toLowerCase();
                
                if (query.includes('api') || query.includes('endpoint')) {
                    await scanApiPatterns(stream, query);
                } else if (query.includes('component') || query.includes('class')) {
                    await scanComponentPatterns(stream, query);
                } else if (query.includes('function') || query.includes('method')) {
                    await scanFunctionPatterns(stream, query);
                } else if (query.includes('duplicate') || query.includes('similar')) {
                    await scanAllPatterns(stream, query);
                } else if (query.includes('architecture') || query.includes('structure')) {
                    await analyzeArchitecture(stream);
                } else {
                    await showSmartScanHelp(stream);
                }
                
            } catch (error) {
                console.error('Smart Scanner error:', error);
                stream.markdown(`❌ **Error:** ${error.message}`);
            }
        });
        
        console.log('✅ scan-app participant created successfully');

        scanAppParticipant.iconPath = vscode.Uri.file(
            path.join(context.extensionPath, 'icons', 'extension-icon.png')
        );
        
        scanAppParticipant.followupProvider = {
            provideFollowups(result, context, token) {
                return [
                    {
                        prompt: 'scan all duplicates',
                        label: '🔍 Smart duplicate detection'
                    },
                    {
                        prompt: 'analyze architecture',
                        label: '🏗️ Architecture analysis'
                    },
                    {
                        prompt: 'find similar functions',
                        label: '⚡ Function similarity'
                    },
                    {
                        prompt: 'api',
                        label: '🌐 API pattern analysis'
                    }
                ];
            }
        };

        return { scanAppParticipant };
        
    } catch (error) {
        console.error('❌ Failed to create scan-app participant:', error);
        throw error;
    }
}

/**
 * Scan API patterns across the entire codebase
 */
async function scanApiPatterns(stream, query) {
    stream.markdown('# 🚀 API Analysis Dashboard\n\n');
    
    // Initialize token tracking
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let aiModel = null;
    
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        stream.markdown('❌ No workspace folder found');
        return;
    }

    // Show simple loading with progress
    stream.markdown('  **Scanning workspace...**\n\n');
    
    // Smart file discovery for API-related files
    const apiFiles = await findApiFiles(workspaceFolder.uri.fsPath);
    
    stream.markdown('⚡ **Extracting API endpoints...**\n\n');
    
    // Extract all API endpoints (with token tracking)
    const extractionResult = await extractAllApiEndpoints(apiFiles, stream);
    const apiEndpoints = extractionResult.endpoints;
    totalInputTokens += extractionResult.inputTokens;
    totalOutputTokens += extractionResult.outputTokens;
    if (extractionResult.model) aiModel = extractionResult.model;
    
    stream.markdown('  **Analyzing patterns...**\n\n');
    
    // Analyze by business domains
    const businessAnalysis = await analyzeByBusiness(apiEndpoints);
    
    // AI Smart Analysis
    if (apiEndpoints.length > 0) {
        stream.markdown('🤖 **AI Smart Analysis...**\n\n');
        const analysisResult = await callOpenAIForSmartAnalysis(apiEndpoints, 'API Pattern');
        if (analysisResult && analysisResult.analysis) {
            await displayAIAnalysis(stream, analysisResult.analysis);
            totalInputTokens += analysisResult.inputTokens;
            totalOutputTokens += analysisResult.outputTokens;
            if (analysisResult.model) aiModel = analysisResult.model;
        }
    }
    
    stream.markdown('✅ **Analysis complete!**\n\n');
    stream.markdown('---\n\n');
    
    // Display simple, clean results
    await displayBusinessApiResults(stream, businessAnalysis, apiEndpoints);
    
    // Show token statistics if AI was used
    if (totalInputTokens > 0 || totalOutputTokens > 0) {
        // Create realistic input/output text samples for cost calculation
        const inputText = `# Smart API Pattern Analysis

Analyze ${apiEndpoints.length} API endpoints across ${apiFiles.length} files and provide intelligent insights on semantic duplicates, architecture patterns, REST conventions, security concerns, and performance issues.

API Endpoints Data: [${apiEndpoints.length} endpoints with business logic analysis...]

Response Format (JSON): Quality assessment, semantic duplicates, architecture insights, prioritized actions...`;

        const outputText = `{
  "semanticDuplicates": [...],
  "architectureInsights": [...],
  "restConventionIssues": [...],
  "securityConcerns": [...],
  "performanceIssues": [...],
  "qualityScore": {...},
  "prioritizedActions": [...]
}

Generated comprehensive API analysis with business domain classification, duplicate detection, and actionable recommendations.`;

        const mockModel = { family: aiModel || 'gpt-4o' };
        
        // Calculate actual cost based on real token usage with provider detection
        const config = vscode.workspace.getConfiguration('aiSelfCheck');
        const apiHost = config.get('ai.apiHost') || 'https://api.openai.com';
        const { estimateCost } = require('./review-common');
        const costBreakdown = estimateCost(totalInputTokens, totalOutputTokens, aiModel || 'gpt-4o', null, apiHost);
        
        stream.markdown(`\n\n---\n\n`);
        stream.markdown(`📊 **Token Usage Summary:**\n`);
        stream.markdown(`- **Input tokens**: ${totalInputTokens.toLocaleString()} ($${costBreakdown.inputRate.toFixed(2)}/1M)\n`);
        stream.markdown(`- **Output tokens**: ${totalOutputTokens.toLocaleString()} ($${costBreakdown.outputRate.toFixed(2)}/1M)\n`);
        stream.markdown(`- **Total tokens**: ${(totalInputTokens + totalOutputTokens).toLocaleString()}\n`);
        stream.markdown(`- **Cost**: $${costBreakdown.totalCost.toFixed(4)} (Input: $${costBreakdown.inputCost.toFixed(4)} | Output: $${costBreakdown.outputCost.toFixed(4)})\n`);
        stream.markdown(`- **Model used**: ${aiModel || 'gpt-4o'}${costBreakdown.provider ? ` (${costBreakdown.provider})` : ''}\n\n`);
        stream.markdown(`✅ **API Pattern Analysis complete** - successfully analyzed ${apiEndpoints.length} endpoints\n\n`);
    }
}

/**
 * Find API-related files in the workspace
 */
async function findApiFiles(workspacePath) {
    const apiFiles = [];
    
    function scanDirectory(dir, depth = 0) {
        if (depth > 8) return;
        
        try {
            const files = fs.readdirSync(dir);
            
            for (const file of files) {
                if (shouldSkipDirectory(file)) continue;
                
                const filePath = path.join(dir, file);
                const stat = fs.statSync(filePath);
                
                if (stat.isDirectory()) {
                    scanDirectory(filePath, depth + 1);
                } else if (isApiRelated(filePath, file)) {
                    apiFiles.push({
                        path: filePath,
                        relativePath: path.relative(workspacePath, filePath),
                        name: file,
                        type: detectApiFileType(filePath, file),
                        size: stat.size
                    });
                }
            }
        } catch (error) {
            console.error(`Error scanning directory ${dir}:`, error);
        }
    }
    
    scanDirectory(workspacePath);
    return apiFiles;
}

/**
 * Detect if file contains API-related code
 */
function isApiRelated(filePath, fileName) {
    // Skip test files
    if (fileName.includes('.spec.') || fileName.includes('.test.') || fileName.includes('_test.')) {
        return false;
    }
    
    // Check by filename patterns
    const apiPatterns = [
        'service', 'api', 'controller', 'endpoint', 'route', 
        'client', 'http', 'request', 'rest'
    ];
    
    const lowerName = fileName.toLowerCase();
    if (apiPatterns.some(pattern => lowerName.includes(pattern))) {
        return true;
    }
    
    // Check by file extension
    const codeExtensions = ['.ts', '.js', '.cs', '.java', '.py', '.php', '.go'];
    if (!codeExtensions.includes(path.extname(fileName))) {
        return false;
    }
    
    // Check content for API indicators
    try {
        const content = fs.readFileSync(filePath, 'utf8').substring(0, 2000);
        const apiIndicators = [
            'http.get', 'http.post', 'http.put', 'http.delete',
            '@Get', '@Post', '@Put', '@Delete', '@Patch',
            'app.get', 'app.post', 'app.put', 'app.delete',
            'router.get', 'router.post', 'router.put', 'router.delete',
            'HttpGet', 'HttpPost', 'HttpPut', 'HttpDelete',
            'fetch(', 'axios.', 'request(', 'ajax(',
            'endpoint', 'baseUrl', 'apiUrl', '/api/'
        ];
        
        return apiIndicators.some(indicator => content.includes(indicator));
    } catch {
        return false;
    }
}

/**
 * Detect API file type
 */
function detectApiFileType(filePath, fileName) {
    const content = fs.readFileSync(filePath, 'utf8').substring(0, 1500);
    
    // Framework-specific detection
    if (content.includes('@Injectable') && content.includes('HttpClient')) return 'angular-service';
    if (content.includes('@Controller') || content.includes('@RestController')) return 'spring-controller';
    if (content.includes('ApiController') || content.includes('[HttpGet]')) return 'dotnet-controller';
    if (content.includes('express') && content.includes('app.')) return 'express-server';
    if (content.includes('router.') && content.includes('req, res')) return 'express-router';
    if (content.includes('FastAPI') || content.includes('@app.get')) return 'fastapi-endpoint';
    if (content.includes('axios') || content.includes('fetch(')) return 'http-client';
    
    // Business domain detection for better categorization
    const businessDomains = {
        'billing': ['billing', 'payment', 'invoice', 'fee'],
        'user': ['user', 'auth', 'profile', 'account'],
        'address': ['address', 'location', 'place'],
        'label': ['label', 'shipping', 'shipment'],
        'package': ['package', 'parcel', 'item'],
        'pickup': ['pickup', 'schedule', 'collection'],
        'product': ['product', 'inventory', 'catalog'],
        'report': ['report', 'analytics', 'dashboard'],
        'rate': ['rate', 'pricing', 'cost']
    };
    
    const lowerFileName = fileName.toLowerCase();
    for (const [domain, keywords] of Object.entries(businessDomains)) {
        if (keywords.some(keyword => lowerFileName.includes(keyword))) {
            return `${domain}-service`;
        }
    }
    
    // Generic patterns
    if (fileName.includes('.service.')) return 'service';
    if (fileName.includes('.controller.')) return 'controller';
    if (fileName.includes('.client.')) return 'client';
    if (fileName.includes('.api.')) return 'api';
    
    return 'api-related';
}

/**
 * Extract all API endpoints from files
 */
async function extractAllApiEndpoints(apiFiles, stream) {
    const endpoints = [];
    let processed = 0;
    let aiUsed = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let aiModel = null;
    
    for (const file of apiFiles) {
        try {
            const content = fs.readFileSync(file.path, 'utf8');
            
            // Smart extraction decision (with token tracking)
            const extractionResult = await smartExtractEndpoints(content, file);
            const fileEndpoints = extractionResult.endpoints || extractionResult;
            
            // Track tokens if AI was used
            if (extractionResult.inputTokens && extractionResult.inputTokens > 0) {
                totalInputTokens += extractionResult.inputTokens;
                totalOutputTokens += extractionResult.outputTokens;
                if (extractionResult.model) aiModel = extractionResult.model;
                aiUsed++;
                console.log(`✅ AI used for ${file.name}: ${extractionResult.inputTokens}+${extractionResult.outputTokens} tokens`);
            }
            
            endpoints.push(...fileEndpoints);
            
            processed++;
            if (processed % 5 === 0) {
                stream.markdown(`   📊 Processed ${processed}/${apiFiles.length} files... (🤖 AI: ${aiUsed})\n`);
            }
            
        } catch (error) {
            console.error(`Error processing file ${file.path}:`, error);
        }
    }
    
    stream.markdown(`✅ **Extraction complete**: Found ${endpoints.length} API endpoints (🤖 ${aiUsed} files used AI)\n\n`);
    
    return {
        endpoints: endpoints,
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        model: aiModel
    };
}

/**
 * 🤖 AI-powered endpoint extraction
 */
async function extractApiEndpointsWithAI(content, file) {
    const config = vscode.workspace.getConfiguration('aiSelfCheck');
    const apiKey = config.get('ai.apiKey');
    
    if (!apiKey) {
        console.log('⚠️ No AI API key - falling back to rule-based extraction');
        return extractApiEndpointsFromContent(content, file);
    }
    
    const prompt = `
# Smart API Endpoint Extraction

Analyze this TypeScript/JavaScript code and extract ALL HTTP API calls, including dynamic URLs.

## Code to analyze:
\`\`\`typescript
${content}
\`\`\`

## File info: ${file.relativePath}

## Instructions:
1. Find ALL HTTP calls (get, post, put, delete, patch)
2. For dynamic URLs, extract the ACTUAL endpoint pattern
3. Understand baseUrl patterns, string concatenation, template literals
4. Extract business logic from method names and context

## Examples:
- \`this.http.get(this.baseUrl + '/users')\` → \`GET users\`
- \`this.http.post(\\\`\${apiUrl}/billing/\${id}\\\`)\` → \`POST billing/{id}\`
- \`getUserProfile()\` method → likely \`GET user/profile\`

## Response format (JSON):
{
  "endpoints": [
    {
      "method": "GET|POST|PUT|DELETE|PATCH",
      "endpoint": "actual/endpoint/path", 
      "line": 25,
      "confidence": 0.95,
      "context": "method or variable name for context",
      "isInferred": false,
      "businessDomain": "user|billing|product|etc"
    }
  ]
}`;

    try {
        const response = await callAIForExtraction(prompt);
        if (response && response.response && response.response.endpoints) {
            const endpoints = response.response.endpoints.map(ep => ({
                method: ep.method,
                endpoint: ep.endpoint,
                file: file.relativePath,
                line: ep.line,
                code: `AI-detected: ${ep.context}`,
                type: ep.isInferred ? 'ai-inferred' : 'ai-detected',
                framework: 'Angular',
                confidence: ep.confidence,
                businessDomain: ep.businessDomain
            }));
            
            return {
                endpoints: endpoints,
                inputTokens: response.inputTokens,
                outputTokens: response.outputTokens,
                model: response.model
            };
        }
    } catch (error) {
        console.error('AI extraction failed:', error);
    }
    
    // Fallback to rule-based
    return {
        endpoints: extractApiEndpointsFromContent(content, file),
        inputTokens: 0,
        outputTokens: 0,
        model: null
    };
}

async function callAIForExtraction(prompt) {
    const systemPrompt = 'You are an expert code analyzer specialized in extracting HTTP API endpoints from source code. You understand various patterns: baseUrl concatenation, template literals, string interpolation, and can infer endpoints from method names and context.';
    
    const result = await callAI(systemPrompt, prompt);
    
    // Map the response using provider-specific mapping
    const provider = detectProvider(result.apiHost, result.model);
    const mappedResponse = mapProviderResponse(result.rawResponse, provider);
    
    // Parse JSON response
    let parsedResponse;
    try {
        parsedResponse = typeof mappedResponse.content === 'string' 
            ? JSON.parse(mappedResponse.content) 
            : mappedResponse.content;
    } catch (parseError) {
        console.warn('⚠️ Failed to parse AI response as JSON:', parseError);
        parsedResponse = { endpoints: [] };
    }
    
    // Return in the expected format
    return {
        response: parsedResponse,
        inputTokens: mappedResponse.inputTokens,
        outputTokens: mappedResponse.outputTokens,
        model: result.model
    };
}

/**
 * Smart extraction: Try AI first for complex cases, fallback to rules
 */
async function smartExtractEndpoints(content, file) {
    // Quick check: if content has complex patterns, use AI
    const hasComplexPatterns = [
        'baseUrl +',
        'this.baseUrl +',
        'apiUrl +', 
        'this.apiUrl +',
        '${',
        '`/',
        '.endpoint',
        'buildUrl',
        'getUrl',
        'this.http.get(this.',
        'this.http.post(this.',
        '.http.get(this.',
        '.http.post(this.'
    ].some(pattern => content.includes(pattern));
    
    if (hasComplexPatterns) {
        console.log(`🤖 Using AI extraction for ${file.name} (complex patterns detected) - FULL FILE SCAN`);
        return await extractApiEndpointsWithAI(content, file);
    } else {
        console.log(`⚡ Using rule extraction for ${file.name} (simple patterns)`);
        // Return in consistent format for non-AI extraction
        return {
            endpoints: extractApiEndpointsFromContent(content, file),
            inputTokens: 0,
            outputTokens: 0,
            model: null
        };
    }
}

/**
 * Extract API endpoints from file content
 */
function extractApiEndpointsFromContent(content, file) {
    const endpoints = [];
    const lines = content.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        const lineNum = i + 1;
        
        // Angular HttpClient patterns - more comprehensive
        const angularMatch = line.match(/this\.http\.(get|post|put|delete|patch)\s*[<(]/i);
        if (angularMatch) {
            // Extract URL from various patterns
            let endpoint = 'dynamic-url';
            
            // Pattern 1: this.http.get('direct-url')
            const directUrl = line.match(/this\.http\.(get|post|put|delete|patch)\s*[<(]\s*['"`]([^'"`]+)['"`]/i);
            if (directUrl) {
                endpoint = directUrl[2];
            }
            // Pattern 2: this.http.get(this.baseUrl + 'endpoint')
            else if (line.includes('baseUrl')) {
                const baseUrlMatch = line.match(/baseUrl\s*\+\s*['"`]([^'"`]+)['"`]/i);
                if (baseUrlMatch) {
                    endpoint = baseUrlMatch[1];
                }
            }
            // Pattern 3: Look for URL in string concatenation
            else {
                const urlInString = line.match(/['"`]([^'"`]*\/[^'"`]*)['"`]/);
                if (urlInString) {
                    endpoint = urlInString[1];
                }
            }
            
            endpoints.push({
                method: angularMatch[1].toUpperCase(),
                endpoint: endpoint,
                file: file.relativePath,
                line: lineNum,
                code: line,
                type: 'angular-httpclient',
                framework: 'Angular'
            });
        }
        
        // Express.js patterns
        const expressMatch = line.match(/(app|router)\.(get|post|put|delete|patch)\s*\(\s*['"`]([^'"`]+)['"`]/i);
        if (expressMatch) {
            endpoints.push({
                method: expressMatch[2].toUpperCase(),
                endpoint: expressMatch[3],
                file: file.relativePath,
                line: lineNum,
                code: line,
                type: 'express-route',
                framework: 'Express.js'
            });
        }
        
        // ASP.NET Controller patterns
        const dotnetMatch = line.match(/\[Http(Get|Post|Put|Delete|Patch)\s*(?:\(\s*['"`]([^'"`]+)['"`]\s*\))?\]/i);
        if (dotnetMatch) {
            const endpoint = dotnetMatch[2] || extractMethodName(lines, i + 1);
            endpoints.push({
                method: dotnetMatch[1].toUpperCase(),
                endpoint: endpoint,
                file: file.relativePath,
                line: lineNum,
                code: line,
                type: 'dotnet-attribute',
                framework: 'ASP.NET'
            });
        }
        
        // Spring Boot patterns
        const springMatch = line.match(/@(Get|Post|Put|Delete|Patch)Mapping\s*(?:\(\s*['"`]([^'"`]+)['"`]\s*\))?/i);
        if (springMatch) {
            const endpoint = springMatch[2] || extractMethodName(lines, i + 1);
            endpoints.push({
                method: springMatch[1].toUpperCase(),
                endpoint: endpoint,
                file: file.relativePath,
                line: lineNum,
                code: line,
                type: 'spring-annotation',
                framework: 'Spring Boot'
            });
        }
        
        // Fetch/Axios patterns
        const fetchMatch = line.match(/(fetch|axios)\.(get|post|put|delete|patch)\s*\(\s*['"`]([^'"`]+)['"`]/i);
        if (fetchMatch) {
            endpoints.push({
                method: fetchMatch[2].toUpperCase(),
                endpoint: fetchMatch[3],
                file: file.relativePath,
                line: lineNum,
                code: line,
                type: 'http-client',
                framework: 'JavaScript'
            });
        }
        
        // Generic URL patterns in strings
        const urlMatch = line.match(/['"`](\/api\/[^'"`]+)['"`]/);
        if (urlMatch && !line.includes('//') && !line.includes('/*')) {
            endpoints.push({
                method: 'UNKNOWN',
                endpoint: urlMatch[1],
                file: file.relativePath,
                line: lineNum,
                code: line,
                type: 'url-reference',
                framework: 'Generic'
            });
        }
        
        // Additional Angular service patterns
        const httpClientMatch = line.match(/\.http\.(get|post|put|delete|patch)\s*\(/i);
        if (httpClientMatch && !angularMatch) {
            let endpoint = 'service-call';
            
            // Look for URL patterns
            const urlPattern = line.match(/['"`]([^'"`]*(?:api|Api|API)[^'"`]*)['"`]/);
            if (urlPattern) {
                endpoint = urlPattern[1];
            }
            
            endpoints.push({
                method: httpClientMatch[1].toUpperCase(),
                endpoint: endpoint,
                file: file.relativePath,
                line: lineNum,
                code: line,
                type: 'http-service',
                framework: 'Angular'
            });
        }
    }
    
    return endpoints;
}

/**
 * Analyze API patterns and find duplicates/issues
 */
async function analyzeApiPatterns(endpoints) {
    const analysis = {
        totalEndpoints: endpoints.length,
        byMethod: {},
        byFramework: {},
        duplicates: [],
        patterns: {},
        issues: [],
        recommendations: []
    };
    
    // Group by HTTP method
    endpoints.forEach(ep => {
        analysis.byMethod[ep.method] = (analysis.byMethod[ep.method] || 0) + 1;
    });
    
    // Group by framework
    endpoints.forEach(ep => {
        analysis.byFramework[ep.framework] = (analysis.byFramework[ep.framework] || 0) + 1;
    });
    
    // Find duplicate endpoints
    const endpointGroups = {};
    endpoints.forEach(ep => {
        const key = `${ep.method}:${normalizeEndpoint(ep.endpoint)}`;
        if (!endpointGroups[key]) endpointGroups[key] = [];
        endpointGroups[key].push(ep);
    });
    
    Object.entries(endpointGroups).forEach(([key, group]) => {
        if (group.length > 1) {
            analysis.duplicates.push({
                pattern: key,
                count: group.length,
                endpoints: group,
                severity: group.length > 3 ? 'critical' : group.length > 2 ? 'high' : 'medium'
            });
        }
    });
    
    // Find common patterns
    const pathPatterns = {};
    endpoints.forEach(ep => {
        const pattern = extractPathPattern(ep.endpoint);
        if (!pathPatterns[pattern]) pathPatterns[pattern] = [];
        pathPatterns[pattern].push(ep);
    });
    
    Object.entries(pathPatterns).forEach(([pattern, eps]) => {
        if (eps.length > 2) {
            analysis.patterns[pattern] = {
                count: eps.length,
                endpoints: eps,
                methods: [...new Set(eps.map(e => e.method))]
            };
        }
    });
    
    // Identify issues
    if (analysis.duplicates.length > 0) {
        analysis.issues.push({
            type: 'duplicates',
            count: analysis.duplicates.length,
            message: `Found ${analysis.duplicates.length} duplicate endpoint patterns`
        });
    }
    
    const unknownMethods = endpoints.filter(e => e.method === 'UNKNOWN').length;
    if (unknownMethods > 0) {
        analysis.issues.push({
            type: 'unknown-methods',
            count: unknownMethods,
            message: `${unknownMethods} endpoints have unknown HTTP methods`
        });
    }
    
    // Generate recommendations
    if (analysis.duplicates.length > 0) {
        analysis.recommendations.push('Consider consolidating duplicate API endpoints');
    }
    
    if (Object.keys(analysis.byFramework).length > 2) {
        analysis.recommendations.push('Multiple API frameworks detected - consider standardizing');
    }
    
    return analysis;
}

/**
 * Display AI-powered analysis results
 */
async function displayAIAnalysis(stream, aiAnalysis) {
    const config = vscode.workspace.getConfiguration('aiSelfCheck');
    const model = config.get('ai.model') || 'gpt-4o';
    const apiHost = config.get('ai.apiHost') || 'https://api.openai.com/v1/chat/completions';
    
    stream.markdown(`## 🤖 AI Smart Analysis Results (${model})\n\n`);
    stream.markdown(`**API Host**: ${apiHost} | **Model**: ${model}\n\n`);
    
    // Quality Score Overview
    if (aiAnalysis.qualityScore) {
        stream.markdown('### 📊 AI Quality Assessment\n\n');
        const score = aiAnalysis.qualityScore;
        stream.markdown(`**Overall Score**: ${score.overall}/10 ${getScoreEmoji(score.overall)}\n\n`);
        stream.markdown(`- **REST Compliance**: ${score.restCompliance}/10\n`);
        stream.markdown(`- **Code Reuse**: ${score.codeReuse}/10\n`);
        stream.markdown(`- **Naming Conventions**: ${score.naming}/10\n`);
        stream.markdown(`- **Security**: ${score.security}/10\n\n`);
    }
    
    // Prioritized Actions
    if (aiAnalysis.prioritizedActions && aiAnalysis.prioritizedActions.length > 0) {
        stream.markdown('### 🎯 AI-Recommended Priority Actions\n\n');
        aiAnalysis.prioritizedActions.forEach((action, index) => {
            const priorityIcon = action.priority === 1 ? '🔥' : action.priority === 2 ? '⚠️' : '💡';
            stream.markdown(`${priorityIcon} **Priority ${action.priority}**: ${action.action}\n`);
            stream.markdown(`   - **Effort**: ${action.effort}\n`);
            stream.markdown(`   - **Impact**: ${action.impact}\n\n`);
        });
    }
    
    // Semantic Duplicates (Most Important)
    if (aiAnalysis.semanticDuplicates && aiAnalysis.semanticDuplicates.length > 0) {
        stream.markdown('### 🎯 AI-Detected Semantic Duplicates\n\n');
        
        aiAnalysis.semanticDuplicates.forEach((duplicate, index) => {
            const impactIcon = duplicate.impact === 'high' ? '🚨' : 
                              duplicate.impact === 'medium' ? '⚠️' : '💡';
            
            stream.markdown(`#### ${impactIcon} ${duplicate.pattern}\n\n`);
            stream.markdown(`**Business Logic**: ${duplicate.businessLogic}\n`);
            stream.markdown(`**AI Confidence**: ${(duplicate.confidence * 100).toFixed(1)}%\n`);
            stream.markdown(`**Impact**: ${duplicate.impact} | **Effort to Fix**: ${duplicate.effortToFix}\n\n`);
            
            stream.markdown('**Affected Endpoints**:\n');
            duplicate.items.forEach(item => {
                stream.markdown(`- \`${item.endpoint}\` in \`${item.file}\`:${item.line} (${item.framework})\n`);
            });
            
            stream.markdown(`\n**🤖 AI Reasoning**: ${duplicate.reasoning}\n\n`);
            stream.markdown(`**💡 Consolidation Suggestion**: ${duplicate.consolidationSuggestion}\n\n`);
            stream.markdown('---\n\n');
        });
    }
    
    // Architecture Insights
    if (aiAnalysis.architectureInsights && aiAnalysis.architectureInsights.length > 0) {
        stream.markdown('### 🏗️ Architecture Insights\n\n');
        
        aiAnalysis.architectureInsights.forEach(insight => {
            const severityIcon = insight.severity === 'critical' ? '🚨' : 
                               insight.severity === 'warning' ? '⚠️' : '💡';
            
            stream.markdown(`#### ${severityIcon} ${insight.title}\n\n`);
            stream.markdown(`**Category**: ${insight.category} | **Severity**: ${insight.severity}\n\n`);
            stream.markdown(`${insight.description}\n\n`);
            
            if (insight.affectedEndpoints && insight.affectedEndpoints.length > 0) {
                stream.markdown('**Affected Endpoints**: ' + insight.affectedEndpoints.join(', ') + '\n\n');
            }
            
            stream.markdown(`**💡 Recommendation**: ${insight.recommendation}\n\n`);
            stream.markdown('---\n\n');
        });
    }
    
    // REST Convention Issues
    if (aiAnalysis.restConventionIssues && aiAnalysis.restConventionIssues.length > 0) {
        stream.markdown('### 📐 REST Convention Issues\n\n');
        
        aiAnalysis.restConventionIssues.forEach(issue => {
            const severityIcon = issue.severity === 'high' ? '🚨' : 
                               issue.severity === 'medium' ? '⚠️' : '💡';
            
            stream.markdown(`${severityIcon} **${issue.endpoint}**\n`);
            stream.markdown(`   - **Issue**: ${issue.issue}\n`);
            stream.markdown(`   - **Reason**: ${issue.reason}\n\n`);
        });
    }
    
    // Security Concerns
    if (aiAnalysis.securityConcerns && aiAnalysis.securityConcerns.length > 0) {
        stream.markdown('### 🔒 Security Concerns\n\n');
        
        aiAnalysis.securityConcerns.forEach(concern => {
            const riskIcon = concern.risk === 'high' ? '🚨' : 
                           concern.risk === 'medium' ? '⚠️' : '💡';
            
            stream.markdown(`${riskIcon} **${concern.endpoint}**\n`);
            stream.markdown(`   - **Concern**: ${concern.concern}\n`);
            stream.markdown(`   - **Risk Level**: ${concern.risk}\n`);
            stream.markdown(`   - **Recommendation**: ${concern.recommendation}\n\n`);
        });
    }
    
    // Performance Issues
    if (aiAnalysis.performanceIssues && aiAnalysis.performanceIssues.length > 0) {
        stream.markdown('### ⚡ Performance Issues\n\n');
        
        aiAnalysis.performanceIssues.forEach(issue => {
            stream.markdown(`**Pattern**: ${issue.pattern}\n`);
            stream.markdown(`**Impact**: ${issue.impact}\n`);
            stream.markdown(`**Suggestion**: ${issue.suggestion}\n\n`);
        });
    }
}

function getScoreEmoji(score) {
    if (score >= 9) return '🏆';
    if (score >= 8) return '✅';
    if (score >= 7) return '👍';
    if (score >= 6) return '⚠️';
    return '🚨';
}

/**
 * Display comprehensive API analysis results
 */
async function displayApiAnalysis(stream, analysis, endpoints) {
    // Summary
    stream.markdown('## 📊 API Analysis Summary\n\n');
    stream.markdown(`- **Total Endpoints**: ${analysis.totalEndpoints}\n`);
    stream.markdown(`- **HTTP Methods**: ${Object.keys(analysis.byMethod).join(', ')}\n`);
    stream.markdown(`- **Frameworks**: ${Object.keys(analysis.byFramework).join(', ')}\n`);
    stream.markdown(`- **Duplicate Patterns**: ${analysis.duplicates.length}\n`);
    stream.markdown(`- **Common Patterns**: ${Object.keys(analysis.patterns).length}\n\n`);
    
    // Method breakdown
    stream.markdown('### 📈 HTTP Methods Distribution\n\n');
    Object.entries(analysis.byMethod).forEach(([method, count]) => {
        const percentage = ((count / analysis.totalEndpoints) * 100).toFixed(1);
        stream.markdown(`- **${method}**: ${count} endpoints (${percentage}%)\n`);
    });
    stream.markdown('\n');
    
    // Framework breakdown
    stream.markdown('### 🏗️ Framework Distribution\n\n');
    Object.entries(analysis.byFramework).forEach(([framework, count]) => {
        const percentage = ((count / analysis.totalEndpoints) * 100).toFixed(1);
        stream.markdown(`- **${framework}**: ${count} endpoints (${percentage}%)\n`);
    });
    stream.markdown('\n');
    
    // Duplicates
    if (analysis.duplicates.length > 0) {
        stream.markdown('## 🚨 Duplicate API Patterns\n\n');
        
        analysis.duplicates.forEach(duplicate => {
            const icon = duplicate.severity === 'critical' ? '🔥' : 
                        duplicate.severity === 'high' ? '⚠️' : '💡';
            
            stream.markdown(`### ${icon} ${duplicate.pattern}\n\n`);
            stream.markdown(`**Occurrences**: ${duplicate.count} times\n\n`);
            
            duplicate.endpoints.forEach(ep => {
                stream.markdown(`- \`${ep.file}\`:${ep.line} (${ep.framework})\n`);
            });
            stream.markdown('\n');
        });
    }
    
    // Common patterns
    if (Object.keys(analysis.patterns).length > 0) {
        stream.markdown('## 🔍 Common API Patterns\n\n');
        
        Object.entries(analysis.patterns).forEach(([pattern, info]) => {
            stream.markdown(`### Pattern: \`${pattern}\`\n\n`);
            stream.markdown(`**Count**: ${info.count} endpoints\n`);
            stream.markdown(`**Methods**: ${info.methods.join(', ')}\n\n`);
            
            info.endpoints.forEach(ep => {
                stream.markdown(`- \`${ep.method} ${ep.endpoint}\` in \`${ep.file}\`:${ep.line}\n`);
            });
            stream.markdown('\n');
        });
    }
    
    // Issues and recommendations
    if (analysis.issues.length > 0) {
        stream.markdown('## ⚠️ Issues Detected\n\n');
        analysis.issues.forEach(issue => {
            stream.markdown(`- **${issue.type}**: ${issue.message}\n`);
        });
        stream.markdown('\n');
    }
    
    if (analysis.recommendations.length > 0) {
        stream.markdown('## 💡 Recommendations\n\n');
        analysis.recommendations.forEach(rec => {
            stream.markdown(`- ${rec}\n`);
        });
        stream.markdown('\n');
    }
    
    // All endpoints
    stream.markdown('## 📋 All Endpoints\n\n');
    endpoints.forEach(ep => {
        stream.markdown(`- \`${ep.method} ${ep.endpoint}\` - ${ep.framework} in \`${ep.file}\`:${ep.line}\n`);
    });
}

// Helper functions
function shouldSkipDirectory(dir) {
    const skipDirs = [
        'node_modules', '.git', '.vscode', 'dist', 'build', 
        'coverage', '.nyc_output', 'tmp', 'temp', '.cache',
        'vendor', 'packages', '.next', '.nuxt', '__pycache__'
    ];
    return skipDirs.includes(dir) || dir.startsWith('.');
}

function normalizeEndpoint(endpoint) {
    return endpoint
        .replace(/\/\d+/g, '/:id')
        .replace(/\/[a-f0-9-]{36}/g, '/:uuid')
        .replace(/\/[a-f0-9-]{8,}/g, '/:hash')
        .toLowerCase();
}

function extractPathPattern(endpoint) {
    return endpoint
        .replace(/\/\d+/g, '/:id')
        .replace(/\/[a-zA-Z]+\d+/g, '/:param')
        .replace(/\/[a-f0-9-]{8,}/g, '/:hash')
        .split('/').slice(0, 3).join('/');
}

function extractMethodName(lines, startIndex) {
    for (let i = startIndex; i < Math.min(startIndex + 3, lines.length); i++) {
        const match = lines[i].match(/public.*?(\w+)\s*\(/);
        if (match) return match[1];
    }
    return 'unknown';
}

// AI functions moved to review-common.js for reusability

/**
 * 🤖 AI-Powered Smart Analysis using OpenAI
 */
async function callOpenAIForSmartAnalysis(endpoints, analysisType) {
    const config = vscode.workspace.getConfiguration('aiSelfCheck');
    const apiKey = config.get('ai.apiKey');
    const apiHost = config.get('ai.apiHost') || 'https://api.openai.com/v1/chat/completions';
    const model = config.get('ai.model') || 'gpt-4o';
    
    if (!apiKey) {
        console.warn('⚠️ AI API key not configured - using static analysis only');
        return null;
    }
    
    console.log(`🤖 Calling AI API (${apiHost}) with model ${model} for smart ${analysisType} analysis...`);
    
    const instruction = `
# Smart ${analysisType} Analysis

You are a senior software architect and API design expert. Analyze these API endpoints and provide intelligent insights.

## Analysis Goals:
1. **Semantic Duplicate Detection**: Find endpoints with same business logic but different implementations
2. **Architecture Analysis**: Identify design patterns, anti-patterns, and inconsistencies  
3. **Business Logic Consolidation**: Detect workflow duplications across different endpoints
4. **Security & Performance Issues**: Spot potential vulnerabilities and inefficiencies
5. **REST Convention Analysis**: Check adherence to REST principles and naming conventions

## API Endpoints Data:
${JSON.stringify(endpoints, null, 2)}

## Response Format (JSON):
{
  "semanticDuplicates": [
    {
      "type": "semantic|functional|workflow",
      "confidence": 0.95,
      "pattern": "Brief description of duplicate pattern",
      "businessLogic": "What business functionality is duplicated",
      "items": [
        {
          "file": "path/to/file.ts",
          "line": 25,
          "endpoint": "GET /api/users/profile",
          "code": "actual code snippet",
          "framework": "Angular"
        }
      ],
      "reasoning": "Detailed explanation why these are semantic duplicates",
      "consolidationSuggestion": "Specific refactoring recommendation",
      "impact": "high|medium|low",
      "effortToFix": "1-2 hours|half-day|1-2 days"
    }
  ],
  "architectureInsights": [
    {
      "category": "design-pattern|anti-pattern|convention|security",
      "severity": "critical|warning|info",
      "title": "Insight title",
      "description": "Detailed description",
      "affectedEndpoints": ["endpoint1", "endpoint2"],
      "recommendation": "Actionable improvement suggestion"
    }
  ],
  "restConventionIssues": [
    {
      "endpoint": "POST /api/getUserData",
      "issue": "Should be GET /api/users/:id",
      "reason": "Violates REST conventions - GET operation using POST method",
      "severity": "high"
    }
  ],
  "securityConcerns": [
    {
      "endpoint": "GET /api/admin/users/all",
      "concern": "No authentication check visible",
      "risk": "high",
      "recommendation": "Add authorization middleware"
    }
  ],
  "performanceIssues": [
    {
      "pattern": "Multiple similar endpoints for data fetching",
      "impact": "Increased bundle size and maintenance overhead",
      "suggestion": "Consolidate into single parameterized endpoint"
    }
  ],
  "qualityScore": {
    "overall": 7.5,
    "restCompliance": 6.8,
    "codeReuse": 8.2,
    "naming": 7.9,
    "security": 6.5
  },
  "prioritizedActions": [
    {
      "priority": 1,
      "action": "Fix critical security issue in admin endpoints",
      "effort": "2-3 hours",
      "impact": "high"
    }
  ]
}
`;

    try {
        const systemPrompt = 'You are a world-class software architect and code quality expert with 15+ years of experience in API design, microservices architecture, and code refactoring. You specialize in identifying semantic duplicates, architectural anti-patterns, and providing actionable improvement suggestions.';
        
        const result = await callAI(systemPrompt, instruction);
        
        // Map the response using provider-specific mapping
        const provider = detectProvider(result.apiHost, result.model);
        const mappedResponse = mapProviderResponse(result.rawResponse, provider);
        
        const aiAnalysis = mappedResponse.content;
        
        console.log(`✅ AI API (${result.model}) analysis completed successfully`);
        console.log(`📊 Token usage: ${(mappedResponse.inputTokens + mappedResponse.outputTokens) || 'unknown'} tokens`);
        console.log(`🌐 API Host: ${result.apiHost}`);
        
        return {
            analysis: aiAnalysis,
            inputTokens: result.inputTokens,
            outputTokens: result.outputTokens,
            model: result.model
        };
        
    } catch (error) {
        console.error('❌ AI API call failed:', error);
        console.error(`📡 API Host: ${apiHost}, Model: ${model}`);
        return null;
    }
}

// Placeholder functions for other scan types
async function scanComponentPatterns(stream, query) {
    stream.markdown('# 🧩 Component Pattern Analysis\n\n');
    stream.markdown('🔄 **Coming soon**: Smart component duplicate detection\n\n');
}

async function scanFunctionPatterns(stream, query) {
    stream.markdown('# ⚡ Function Pattern Analysis\n\n');
    stream.markdown('🔄 **Coming soon**: Function similarity analysis\n\n');
}

async function scanAllPatterns(stream, query) {
    stream.markdown('# 🔍 Comprehensive Code Analysis\n\n');
    stream.markdown('🔄 **Coming soon**: Full codebase pattern analysis\n\n');
}

async function analyzeArchitecture(stream) {
    stream.markdown('# 🏗️ Architecture Analysis\n\n');
    stream.markdown('🔄 **Coming soon**: Smart architecture analysis with dependency graphs\n\n');
}

function showSmartScanHelp(stream) {
    stream.markdown('# 🧠 Smart App Scanner\n\n');
    stream.markdown('## Intelligent Code Analysis\n\n');
    stream.markdown('### Available Commands:\n\n');
    stream.markdown('- `@scan-app api` - Analyze API endpoint patterns\n');
    stream.markdown('- `@scan-app all duplicates` - Comprehensive duplicate detection\n');
    stream.markdown('- `@scan-app function similarities` - Find similar functions\n');
    stream.markdown('- `@scan-app architecture analysis` - Analyze code architecture\n\n');
    stream.markdown('### Features:\n\n');
    stream.markdown('✅ **Multi-language support** - Works with TypeScript, JavaScript, C#, Java, Python\n');
    stream.markdown('✅ **Framework awareness** - Understands Angular, React, Express, ASP.NET, Spring Boot\n');
    stream.markdown('✅ **Smart detection** - Finds code patterns by content analysis\n');
    stream.markdown('✅ **Pattern recognition** - Detects similar patterns across different files\n');
    stream.markdown('✅ **AI-powered analysis** - Semantic understanding with GPT-4/5, Claude, or custom models\n');
    stream.markdown('✅ **Duplicate detection** - Identifies redundant code and APIs\n\n');
    stream.markdown('### Configuration:\n\n');
    stream.markdown('Configure AI settings in VS Code:\n');
    stream.markdown('```json\n');
    stream.markdown('{\n');
    stream.markdown('  "aiSelfCheck.ai.apiKey": "your-api-key-here",\n');
    stream.markdown('  "aiSelfCheck.ai.apiHost": "https://api.openai.com",\n');
    stream.markdown('  "aiSelfCheck.ai.model": "gpt-4o"\n');
    stream.markdown('}\n');
    stream.markdown('```\n\n');
    stream.markdown('**Supported Providers:**\n');
    stream.markdown('- **OpenAI**: `https://api.openai.com` with `gpt-4o`, `gpt-4-turbo`, `gpt-4`\n');
    stream.markdown('- **Anthropic**: `https://api.anthropic.com` with `claude-3-sonnet`, `claude-3-opus`\n');
    stream.markdown('- **Custom**: Your own AI service endpoint\n\n');
}

/**
 * Analyze APIs by business domains
 */
async function analyzeByBusiness(endpoints) {
    const businessDomains = {};
    const duplicates = {};
    
    endpoints.forEach(endpoint => {
        // Extract business domain from endpoint path
        const domain = extractBusinessDomain(endpoint.endpoint);
        
        if (!businessDomains[domain]) {
            businessDomains[domain] = [];
        }
        businessDomains[domain].push(endpoint);
        
        // Check for duplicates
        const key = `${endpoint.method}:${endpoint.endpoint}`;
        if (!duplicates[key]) {
            duplicates[key] = [];
        }
        duplicates[key].push(endpoint);
    });
    
    // Filter only actual duplicates
    const actualDuplicates = Object.entries(duplicates)
        .filter(([key, endpoints]) => endpoints.length > 1)
        .map(([key, endpoints]) => ({
            pattern: key,
            count: endpoints.length,
            endpoints: endpoints
        }));
    
    return {
        businessDomains,
        duplicates: actualDuplicates,
        totalEndpoints: endpoints.length
    };
}

/**
 * Extract business domain from endpoint
 */
function extractBusinessDomain(endpoint) {
    // Remove dynamic parts and get first meaningful segment
    const cleanEndpoint = endpoint.toLowerCase()
        .replace(/\$\{[^}]+\}/g, '') // Remove ${variables}
        .replace(/\/\d+/g, '') // Remove numbers
        .replace(/^\/+/, '') // Remove leading slashes
        .split('/')
        .filter(segment => segment && segment !== 'api')[0];
    
    // Map to business domains
    const domainMap = {
        'address': 'Address Management',
        'billing': 'Billing & Payment',
        'invoice': 'Invoice Management', 
        'user': 'User Management',
        'users': 'User Management',
        'label': 'Label Management',
        'package': 'Package Management',
        'pickup': 'Pickup Service',
        'masterdata': 'Master Data',
        'unit': 'Unit Management',
        'product': 'Product Management',
        'import': 'Import Service',
        'packageevent': 'Package Tracking',
        'register': 'Authentication',
        'login': 'Authentication',
        'auth': 'Authentication',
        'carrier': 'Carrier Settings',
        'dynamic-url': 'Dynamic Operations'
    };
    
    return domainMap[cleanEndpoint] || cleanEndpoint || 'Other';
}

/**
 * Display business-focused API results
 */
async function displayBusinessApiResults(stream, analysis, allEndpoints) {
    // Header with total count
    stream.markdown(`# 📊 API Summary\n\n`);
    stream.markdown(`**Total APIs: ${analysis.totalEndpoints}**\n\n`);
    
    // Business domain breakdown
    stream.markdown('## 🏢 APIs by Business Domain\n\n');
    
    const sortedDomains = Object.entries(analysis.businessDomains)
        .sort(([,a], [,b]) => b.length - a.length);
    
    sortedDomains.forEach(([domain, endpoints]) => {
        const percentage = ((endpoints.length / analysis.totalEndpoints) * 100).toFixed(1);
        stream.markdown(`### ${getBusinessIcon(domain)} ${domain}\n`);
        stream.markdown(`**${endpoints.length} APIs** (${percentage}%)\n\n`);
        
        // Show ALL endpoints
        endpoints.forEach(ep => {
            stream.markdown(`- \`${ep.method} ${ep.endpoint}\`\n`);
        });
        stream.markdown('\n');
    });
    
    // Duplicates section
    if (analysis.duplicates.length > 0) {
        stream.markdown('---\n\n');
        stream.markdown(`## 🚨 Duplicate APIs: ${analysis.duplicates.length}\n\n`);
        
        analysis.duplicates.forEach(duplicate => {
            const [method, endpoint] = duplicate.pattern.split(':');
            stream.markdown(`### ⚠️ \`${method} ${endpoint}\`\n`);
            stream.markdown(`**Found ${duplicate.count} times:**\n\n`);
            
            duplicate.endpoints.forEach(ep => {
                const fileName = ep.file.split('\\').pop();
                stream.markdown(`- **${fileName}** (line ${ep.line})\n`);
            });
            stream.markdown('\n');
        });
    } else {
        stream.markdown('## ✅ No Duplicate APIs Found\n\n');
    }
    
    // Quick stats
    stream.markdown('---\n\n');
    stream.markdown('## 📈 Quick Stats\n\n');
    stream.markdown(`- **Total Business Domains**: ${Object.keys(analysis.businessDomains).length}\n`);
    stream.markdown(`- **Duplicate APIs**: ${analysis.duplicates.length}\n`);
    stream.markdown(`- **Unique Endpoints**: ${analysis.totalEndpoints - analysis.duplicates.reduce((sum, d) => sum + (d.count - 1), 0)}\n`);
}

/**
 * Get business domain icon
 */
function getBusinessIcon(domain) {
    const icons = {
        'Address Management': '🏠',
        'Billing & Payment': '💳',
        'Invoice Management': '🧾',
        'User Management': '👥',
        'Label Management': '🏷️',
        'Package Management': '📦',
        'Pickup Service': '🚚',
        'Master Data': '🗃️',
        'Unit Management': '📏',
        'Product Management': '🛍️',
        'Import Service': '📤',
        'Package Tracking': '📍',
        'Authentication': '🔐',
        'Carrier Settings': '⚙️',
        'Dynamic Operations': '🔄'
    };
    
    return icons[domain] || '📋';
}

module.exports = {
    initializeScanApp
};