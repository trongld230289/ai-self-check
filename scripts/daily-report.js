// Daily Report Chat Participant
// Handles @daily-report commands to generate and display project reports

const vscode = require('vscode');
const path = require('path');
const { createDailyReport } = require('./daily/daily-report');

/**
 * Initialize daily report chat participant
 * @param {vscode.ExtensionContext} context - VS Code extension context
 * @returns {Object} - Daily report participant and related functions
 */
function initializeDailyReport(context) {
    console.log('🚀 Initializing Daily Report participant...');

    // Create daily report chat participant
    const dailyReportParticipant = vscode.chat.createChatParticipant('daily-report', async (request, context, stream, token) => {
        try {
            console.log('📊 Daily Report participant activated');
            
            // Show initial loading message
            stream.markdown('# 📊 Daily Report Generator\n\n');
            stream.markdown('🔄 **Generating your daily project report...**\n\n');

            // Get workspace folder for saving to instructions
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            let outputPath;
            
            if (workspaceFolder) {
                // Save to workspace instructions folder
                const instructionsPath = path.join(workspaceFolder.uri.fsPath, 'instructions');
                outputPath = path.join(instructionsPath, `Daily_Report_${new Date().toISOString().replace(/[:.]/g, '_').slice(0, 19)}.html`);
            } else {
                // Fallback to extension daily folder
                outputPath = path.join(__dirname, 'daily', `Daily_Report_${new Date().toISOString().replace(/[:.]/g, '_').slice(0, 19)}.html`);
            }

            // Generate the daily report
            const reportResult = await createDailyReport({
                title: 'Daily Report - LRP 25.4 Sprint 2',
                outputPath: outputPath
            });

            if (reportResult.success) {
                stream.markdown('✅ **Report generated successfully!**\n\n');
                
                // Create button to view the report
                stream.button({
                    command: 'aiSelfCheck.showDailyReport',
                    title: '📊 View Daily Report',
                    arguments: [reportResult.outputPath, reportResult.htmlContent]
                });

                stream.markdown('\n\n');
                stream.markdown(`📁 **Report saved to:** \`${reportResult.outputPath}\`\n`);
                stream.markdown(`📊 **File size:** ${(reportResult.fileSize / 1024).toFixed(2)} KB\n\n`);
                
                // Show quick summary
                stream.markdown('## 📈 Quick Summary\n\n');
                stream.markdown('- **Sprint Progress:** 67% complete (8/12 tasks)\n');
                stream.markdown('- **Status:** 8 completed, 3 in progress, 1 pending\n');
                stream.markdown('- **Focus:** Converting PowerShell to Node.js and adding webview integration\n\n');
                
                stream.markdown('💡 **Tip:** Click the button above to view the full interactive report in VS Code.\n');
            } else {
                stream.markdown('❌ **Failed to generate report**\n\n');
                stream.markdown(`**Error:** ${reportResult.error}\n\n`);
                
                // Offer alternative
                stream.button({
                    command: 'aiSelfCheck.showDailyReportTemplate',
                    title: '📋 Show Report Template',
                    arguments: []
                });
            }

        } catch (error) {
            console.error('❌ Daily Report participant error:', error);
            stream.markdown('❌ **Error generating daily report**\n\n');
            stream.markdown(`**Details:** ${error.message}\n\n`);
            stream.markdown('Please try again or check the extension logs for more details.\n');
        }
    });

    // Set up participant description and welcome message
    dailyReportParticipant.iconPath = vscode.Uri.file(path.join(__dirname, '..', 'icons', 'daily-report.svg'));
    
    console.log('✅ Daily Report participant registered successfully');

    return {
        dailyReportParticipant
    };
}

/**
 * Create webview panel to display daily report
 * @param {string} reportPath - Path to the HTML report file
 * @param {string} htmlContent - HTML content of the report
 * @returns {vscode.WebviewPanel} - Created webview panel
 */
function createDailyReportWebview(reportPath, htmlContent) {
    console.log('🌐 Creating daily report webview...');

    // Create webview panel
    const panel = vscode.window.createWebviewPanel(
        'dailyReport',
        '📊 Daily Report - LRP 25.4 Sprint 2',
        vscode.ViewColumn.One,
        {
            enableScripts: true,
            retainContextWhenHidden: true,
            localResourceRoots: []
        }
    );

    // Set webview HTML content
    panel.webview.html = getWebviewContent(htmlContent);

    // Handle messages from webview
    panel.webview.onDidReceiveMessage(
        message => {
            switch (message.command) {
                case 'refresh':
                    console.log('🔄 Refreshing daily report...');
                    // Regenerate report and update webview
                    createDailyReport().then(result => {
                        if (result.success) {
                            panel.webview.html = getWebviewContent(result.htmlContent);
                            vscode.window.showInformationMessage('Daily report refreshed!');
                        }
                    });
                    break;
                    
                case 'export':
                    console.log('💾 Exporting daily report...');
                    vscode.window.showSaveDialog({
                        defaultUri: vscode.Uri.file('Daily_Report.html'),
                        filters: {
                            'HTML files': ['html'],
                            'All files': ['*']
                        }
                    }).then(uri => {
                        if (uri) {
                            vscode.workspace.fs.writeFile(uri, Buffer.from(htmlContent, 'utf8'));
                            vscode.window.showInformationMessage(`Report exported to ${uri.fsPath}`);
                        }
                    });
                    break;
            }
        }
    );

    // Update panel when it becomes visible
    panel.onDidChangeViewState(e => {
        if (e.webviewPanel.visible) {
            console.log('👁️ Daily report webview became visible');
        }
    });

    console.log('✅ Daily report webview created successfully');
    return panel;
}

/**
 * Generate webview HTML content
 * @param {string} reportHtml - The report HTML content
 * @returns {string} - Complete webview HTML
 */
function getWebviewContent(reportHtml) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Daily Report</title>
    <style>
        body {
            margin: 0;
            padding: 0;
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        }
        .webview-controls {
            position: fixed;
            top: 10px;
            right: 10px;
            z-index: 1000;
            display: flex;
            gap: 10px;
        }
        .control-btn {
            background: #007acc;
            color: white;
            border: none;
            padding: 8px 16px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
        }
        .control-btn:hover {
            background: #005999;
        }
        .report-container {
            height: 100vh;
            overflow: auto;
        }
    </style>
</head>
<body>
    <div class="webview-controls">
        <button class="control-btn" onclick="refreshReport()">🔄 Refresh</button>
        <button class="control-btn" onclick="exportReport()">💾 Export</button>
    </div>
    
    <div class="report-container">
        ${reportHtml}
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        
        function refreshReport() {
            vscode.postMessage({ command: 'refresh' });
        }
        
        function exportReport() {
            vscode.postMessage({ command: 'export' });
        }
        
        // Auto-scroll to top when loaded
        window.addEventListener('load', () => {
            document.querySelector('.report-container').scrollTop = 0;
        });
    </script>
</body>
</html>`;
}

module.exports = {
    initializeDailyReport,
    createDailyReportWebview
};