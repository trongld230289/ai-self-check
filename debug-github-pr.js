const vscode = require('vscode');
const path = require('path');
const https = require('https');

/**
 * Debug script to test GitHub PR parsing
 * This helps us understand why webview might not work with GitHub data
 */

// Sample GitHub PR data structure (what we expect from GitHub API)
const sampleGitHubFileChange = {
    "filename": "index.js",
    "additions": 8,
    "deletions": 8,
    "changes": 16,
    "status": "modified",
    "patch": "@@ -1,6 +1,6 @@\n // index.js\n-// Content reconstructed from Azure DevOps PR diff\n-// This is a cross-repository review\n+// Content reconstructed from GitHub PR diff\n+// This is a GitHub pull request review\n \n // Actual file changes are shown below\n-// Please view full context in Azure DevOps if needed\n+// Please view full context in GitHub if needed"
};

// Sample Azure DevOps file change structure (for comparison)
const sampleAzureFileChange = {
    "path": "index.js", 
    "changeType": "edit",
    "additions": 8,
    "deletions": 8,
    "diffContent": "diff --git a/index.js b/index.js\nindex 1234567..abcdefg 100644\n--- a/index.js\n+++ b/index.js\n@@ -1,6 +1,6 @@\n // index.js\n-// Content reconstructed from Azure DevOps PR diff\n-// This is a cross-repository review\n+// Content reconstructed from GitHub PR diff\n+// This is a GitHub pull request review\n \n // Actual file changes are shown below\n-// Please view full context in Azure DevOps if needed\n+// Please view full context in GitHub if needed",
    "diff": "same as diffContent"
};

/**
 * Simulate GitHub file change processing to match extension expectation
 */
function processGitHubFileChange(githubFile) {
    console.log('\n🐙 DEBUG: Processing GitHub file change:');
    console.log('📄 File:', githubFile.filename);
    console.log('📊 Stats:', { additions: githubFile.additions, deletions: githubFile.deletions, status: githubFile.status });
    console.log('🔍 Has patch:', !!githubFile.patch);
    
    if (githubFile.patch) {
        console.log('📝 Raw patch content:');
        console.log(githubFile.patch);
        console.log('\n🔧 Building complete diff format...');
        
        // This is how the extension builds diff content for GitHub
        let diffContent = `diff --git a/${githubFile.filename} b/${githubFile.filename}\n`;
        
        if (githubFile.status === 'added') {
            diffContent += `new file mode 100644\n`;
            diffContent += `--- /dev/null\n`;
            diffContent += `+++ b/${githubFile.filename}\n`;
        } else if (githubFile.status === 'removed') {
            diffContent += `deleted file mode 100644\n`;
            diffContent += `--- a/${githubFile.filename}\n`;
            diffContent += `+++ /dev/null\n`;
        } else if (githubFile.status === 'renamed') {
            diffContent += `--- a/${githubFile.previous_filename || githubFile.filename}\n`;
            diffContent += `+++ b/${githubFile.filename}\n`;
        } else {
            diffContent += `--- a/${githubFile.filename}\n`;
            diffContent += `+++ b/${githubFile.filename}\n`;
        }
        
        diffContent += githubFile.patch;
        
        console.log('✅ Complete diff content:');
        console.log(diffContent);
        
        return {
            path: githubFile.filename,
            changeType: githubFile.status,
            additions: githubFile.additions || 0,
            deletions: githubFile.deletions || 0,
            changes: githubFile.changes || 0,
            diffContent: diffContent,
            diff: diffContent, // For compatibility
            source: 'GitHub API'
        };
    }
    
    return null;
}

/**
 * Test diff parsing logic
 */
function testDiffParsing(diffData) {
    console.log('\n🧪 TESTING: Diff parsing for webview...');
    console.log('📊 Input data:');
    console.log('- Path:', diffData.path);
    console.log('- Change Type:', diffData.changeType);
    console.log('- Source:', diffData.source);
    console.log('- Has diffContent:', !!diffData.diffContent);
    console.log('- Has diff:', !!diffData.diff);
    
    // This is what the webview generation should do
    const diffText = diffData.diffContent || diffData.diff;
    
    if (!diffText || diffText.trim().length === 0) {
        console.log('❌ ERROR: No diff content available!');
        return false;
    }
    
    console.log('✅ Diff content available:', diffText.length, 'characters');
    console.log('📝 First 200 chars:', diffText.substring(0, 200));
    
    // Test hunk detection
    const hasHunks = diffText.includes('@@');
    console.log('🎯 Contains hunks (@@):', hasHunks);
    
    if (hasHunks) {
        const hunkMatches = diffText.match(/@@ -\d+(?:,\d+)? \+\d+(?:,\d+)? @@/g);
        console.log('📍 Found hunks:', hunkMatches?.length || 0);
        if (hunkMatches) {
            hunkMatches.forEach((hunk, i) => console.log(`  ${i + 1}: ${hunk}`));
        }
    }
    
    return true;
}

/**
 * Main debug function
 */
function runDebugTests() {
    console.log('🚀 DEBUG: GitHub PR Parsing Test');
    console.log('======================================\n');
    
    // Test 1: GitHub file change processing
    console.log('TEST 1: GitHub API file change processing');
    const processedGithubFile = processGitHubFileChange(sampleGitHubFileChange);
    
    if (processedGithubFile) {
        console.log('\n✅ Processed GitHub file successfully');
        
        // Test 2: Compare with Azure format
        console.log('\n\nTEST 2: Comparison with Azure DevOps format');
        console.log('🔵 Azure format:');
        console.log('- Uses "diffContent" and "diff" properties');
        console.log('- Change type as "changeType"');
        console.log('- Path as "path"');
        
        console.log('\n🐙 GitHub format (after processing):');
        console.log('- Uses "diffContent" and "diff" properties ✅');
        console.log('- Change type as "changeType" ✅');
        console.log('- Path as "path" ✅');
        
        // Test 3: Diff parsing
        testDiffParsing(processedGithubFile);
        testDiffParsing(sampleAzureFileChange);
        
        console.log('\n\n🎯 CONCLUSION:');
        console.log('GitHub file changes should be compatible with webview generation');
        console.log('The issue might be in:');
        console.log('1. Data caching (global.prDiffCache)');
        console.log('2. Webview HTML generation');
        console.log('3. CSS/styling differences');
        console.log('4. Empty/missing patch content from GitHub API');
        
    } else {
        console.log('❌ Failed to process GitHub file change');
    }
}

// Export for use in extension
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        runDebugTests,
        processGitHubFileChange,
        testDiffParsing
    };
}

// Run tests if called directly
if (require.main === module) {
    runDebugTests();
}