const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { executeAIReview, getReviewTemplate, displayReviewHeader, getUnifiedModel, getChecklistStatusIcon } = require('./review-common');

// Import handleEnterTwiceLogic from extension.js
let handleEnterTwiceLogic;
try {
    const extensionModule = require('../extension');
    handleEnterTwiceLogic = extensionModule.handleEnterTwiceLogic;
} catch (error) {
    console.log('⚠️ Could not import handleEnterTwiceLogic from extension.js');
}

/**
 * Initialize review-changes functionality
 * @param {vscode.ExtensionContext} context
 * @returns {object} - Chat participant and related functions
 */
function initializeReviewChanges(context) {
    // Create chat participant for review-changes
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
                    // Use shared "Enter twice" logic for confirmation
                    if (handleEnterTwiceLogic) {
                        const shouldContinue = await handleEnterTwiceLogic(
                            'review-changes', 
                            activeEditor, 
                            stream, 
                            async () => {
                                await aiReviewChanges(activeEditor.document.fileName, stream, null, context, request);
                            }
                        );
                        
                        // If handleEnterTwiceLogic returns true, it handled everything (second enter)
                        // If it returns false, it's showing the confirmation dialog (first enter)
                        return;
                    } else {
                        // Fallback: Direct call to aiReviewChanges if handleEnterTwiceLogic is not available
                        await aiReviewChanges(activeEditor.document.fileName, stream, null, context, request);
                        return;
                    }
                } else {
                    stream.markdown('# 🔍 Code Review Assistant\n\n');
                    stream.markdown('Please provide a file path or open a file to review.\n\n');
                    stream.markdown('**Examples:**\n');
                    stream.markdown('- `@review-changes` - Review current git changes\n');
                    stream.markdown('- `@review-changes src/app/component.ts` - Review specific file\n');
                    return;
                }
            }
            
            // Use unified AI review changes function
            await aiReviewChanges(input, stream, null, context, request);
            
        } catch (error) {
            stream.markdown(`❌ Error: ${error.message}\n\n`);
            stream.markdown('**Fallback:** Try running a git status check first, or specify a file path to review.\n');
            console.error('Review Changes error:', error);
        }
    });

    // Set custom icon for chat participant
    reviewChangesParticipant.iconPath = vscode.Uri.file(path.join(context.extensionPath, 'icons', 'icon.svg'));

    return {
        reviewChangesParticipant,
        aiReviewChanges
    };
}

// HELPER: Get target file information from input
function getTargetFileInfo(input) {
    // Check if input contains file path indicators
    const isFilePath = input && (
        input.includes('.ts') || input.includes('.js') || 
        input.includes('.html') || input.includes('.css') || 
        input.includes('/') || input.includes('\\')
    );
    
    if (isFilePath) {
        return {
            type: 'file',
            path: input.trim(),
            source: 'input'
        };
    }
    
    // Get current editor file
    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor) {
        return {
            type: 'file',
            path: activeEditor.document.fileName,
            source: 'editor'
        };
    }
    
    return {
        type: 'workspace',
        path: null,
        source: 'workspace'
    };
}

// HELPER: Get git diff for target
async function getGitDiffForTarget(targetInfo, workspaceFolder) {
    try {
        if (targetInfo.type === 'file' && targetInfo.path) {
            // Get diff for specific file
            let cleanPath = targetInfo.path.replace(/^['"](.*)['"]$/, '$1'); // Remove quotes
            
            // Make absolute path if relative
            if (!path.isAbsolute(cleanPath)) {
                cleanPath = path.join(workspaceFolder.uri.fsPath, cleanPath);
            }
            
            // Check if file exists
            if (!fs.existsSync(cleanPath)) {
                return {
                    success: false,
                    message: `File not found: ${cleanPath}`
                };
            }
            
            // Get git diff for specific file
            let gitDiff = execSync(`git diff HEAD -- "${cleanPath}"`, { 
                cwd: workspaceFolder.uri.fsPath,
                encoding: 'utf8' 
            });
            
            if (!gitDiff.trim()) {
                // Try staged changes
                gitDiff = execSync(`git diff --staged -- "${cleanPath}"`, { 
                    cwd: workspaceFolder.uri.fsPath,
                    encoding: 'utf8' 
                });
                
                if (gitDiff.trim()) {
                    return {
                        success: true,
                        diff: gitDiff,
                        changeType: 'Staged Changes',
                        filePath: cleanPath
                    };
                }
                
                return {
                    success: false,
                    message: `No changes found for file: ${path.basename(cleanPath)}`
                };
            }
            
            return {
                success: true,
                diff: gitDiff,
                changeType: 'Current Changes',
                filePath: cleanPath
            };
        }
        
        // Get workspace-wide diff
        let gitDiff = execSync('git diff HEAD', { 
            cwd: workspaceFolder.uri.fsPath,
            encoding: 'utf8' 
        });
        
        if (!gitDiff.trim()) {
            // Try staged changes
            gitDiff = execSync('git diff --staged', { 
                cwd: workspaceFolder.uri.fsPath,
                encoding: 'utf8' 
            });
            
            if (gitDiff.trim()) {
                return {
                    success: true,
                    diff: gitDiff,
                    changeType: 'Staged Changes'
                };
            }
            
            return {
                success: false,
                message: 'No git changes found - workspace is clean'
            };
        }
        
        return {
            success: true,
            diff: gitDiff,
            changeType: 'Current Changes'
        };
        
    } catch (gitError) {
        return {
            success: false,
            message: `Git command failed: ${gitError.message}`
        };
    }
}

// HELPER: Handle scenario when no changes found
async function handleNoChangesScenario(stream, selectedModel, context, message) {
    stream.markdown(`✅ **${message}**\n\n`);
    
    // Offer to review active file instead
    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor) {
        const fileName = path.basename(activeEditor.document.fileName);
        stream.markdown(`💡 **Would you like to review the active file?**\n`);
        stream.markdown(`📂 **Current file:** \`${fileName}\`\n\n`);
        
        // Create button for confirming file review
        stream.button({
            command: 'aiSelfCheck.confirmFileReview',
            title: `✅ Yes, review file ${fileName}`,
            arguments: [activeEditor.document.fileName]
        });
        
        stream.markdown('\n');
        
        stream.button({
            command: 'aiSelfCheck.showFileHelp',
            title: '❌ No, show help instead',
            arguments: []
        });
        
        stream.markdown('\n\n');
        stream.markdown(`**Question:** Do you want to review the file \`${fileName}\`?\n\n`);
        stream.markdown('💡 **Tip:** You can also type `@review-file` to review the active file\n');
    } else {
        stream.markdown('💡 **Tips to get started:**\n');
        stream.markdown('- Make some code changes and try again\n');
        stream.markdown('- Open a file and use `@review-file`\n');
        stream.markdown('- Use `@review-changes workspace` for full workspace review\n');
    }
}

// HELPER: Get template path
function getTemplatePath(workspaceFolder, context, templateName) {
    let templatePath = path.join(workspaceFolder.uri.fsPath, 'instructions', templateName);
    if (!fs.existsSync(templatePath) && context) {
        templatePath = path.join(context.extensionPath, 'templates', templateName);
    }
    return templatePath;
}

// UNIFIED AI REVIEW CHANGES FUNCTION
async function aiReviewChanges(input, stream, selectedModel = null, context = null, request = null) {
    try {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            stream.markdown('❌ **No workspace folder found**\n\n');
            stream.markdown('💡 **Tips:**\n');
            stream.markdown('- Open a folder in VS Code\n');
            stream.markdown('- Or try `@review-file` to review the active file instead\n');
            return;
        }

        // Get file path from input or current editor
        const targetInfo = getTargetFileInfo(input);
        
        // Get git diff for the target
        const diffResult = await getGitDiffForTarget(targetInfo, workspaceFolder);
        
        if (!diffResult.success) {
            // Handle no changes scenario
            await handleNoChangesScenario(stream, selectedModel, context, diffResult.message);
            return;
        }

        // Always use the modern review approach
        await reviewChanges(diffResult.diff, stream, diffResult.changeType, selectedModel, context, request, diffResult.filePath, workspaceFolder);

    } catch (error) {
        stream.markdown(`❌ **Review process failed:** ${error.message}\n\n`);
        stream.markdown('**Fallback options:**\n');
        stream.markdown('- Try `@review-file` for active file review\n');
        stream.markdown('- Check if VS Code has proper workspace access\n');
        stream.markdown('- Restart VS Code if issues persist\n');
        console.error('AI Review Changes error:', error);
    }
}

// SIMPLIFIED: Direct template-based approach without command conflicts
async function reviewChanges(diffContent, stream, changeType, selectedModel = null, context = null, request = null, filePath = null, workspaceFolder = null) {
    
    // Display review header if workspace folder is provided
    if (workspaceFolder) {
        const templatePath = getTemplatePath(workspaceFolder, context, 'review-changes.md');
        const displayPath = filePath ? path.relative(workspaceFolder.uri.fsPath, filePath) : changeType;
        displayReviewHeader(stream, 'Changes Review', displayPath, diffContent.length, templatePath);
    }
    
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
        await reviewDiffWithChecklist(diffContent, stream, changeType, filePath);
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
    stream.markdown('# 📋 Start Code Review\n\n');
    
    try {
        // Use unified model detection (same as review-file)
        const model = await getUnifiedModel(stream, selectedModel, context, request);
        
        if (!model) {
            stream.markdown('❌ **AI models not available** - falling back to template display\n\n');
            throw new Error('No AI models available');
        }
            
        stream.markdown('🔄 **AI Analysis in progress...** (streaming git changes)\n\n');
        
        // Use the unified AI execution function
        const success = await executeAIReview(finalContent, model, stream, 'Changes');
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

async function reviewDiffWithChecklist(diffContent, stream, changeType, filePath = null) {
    // Analyze the diff using structured review checklist
    const analysis = analyzeGitDiffStructured(diffContent);
    
    // 1. Summary (as per instruction format) 
    const fileInfo = filePath ? `for file: ${path.basename(filePath)}` : '';
    stream.markdown('### 📋 Summary\n\n');
    stream.markdown(`**Overall Impact:** Changes ${fileInfo} affect ${analysis.filesChanged.size} file(s) with ${analysis.linesAdded} additions and ${analysis.linesRemoved} deletions.\n\n`);
    
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

module.exports = {
    initializeReviewChanges,
    aiReviewChanges,
    reviewChanges,
    getTargetFileInfo,
    getGitDiffForTarget,
    handleNoChangesScenario
};
