// Daily Report Generator - Node.js version
// Generates HTML daily report from Azure DevOps project data

const fs = require('fs');
const path = require('path');
const { fetchAzureDevOpsData } = require('./azure-devops-data');

/**
 * Generate a daily report HTML with real Azure DevOps data
 * @param {Object} options - Configuration options
 * @returns {string} - Generated HTML content
 */
async function generateDailyReport(options = {}) {
    const {
        title = 'Daily Report - LRP 25.4 Sprint 2',
        date = new Date().toLocaleDateString('en-US', { 
            weekday: 'long', 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
        }),
        width = 1400,
        height = 1000
    } = options;

    console.log('🔄 Fetching Azure DevOps data for daily report...');
    
    // Fetch real Azure DevOps data
    const azureData = await fetchAzureDevOpsData();
    
    let stats, workItems, iterationName, projectInfo;
    
    if (azureData.success) {
        console.log('✅ Using real Azure DevOps data');
        stats = azureData.statistics;
        workItems = azureData.workItems;
        iterationName = azureData.iteration.name;
        projectInfo = `${azureData.organization}/${azureData.project}`;
    } else {
        console.log('⚠️ Using fallback data due to Azure DevOps error:', azureData.error);
        stats = azureData.fallbackData.statistics;
        workItems = azureData.fallbackData.workItems;
        iterationName = 'LRP 25.4 Sprint 2';
        projectInfo = 'Shippo-Web-2025';
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '_').slice(0, 19);

    const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            margin: 5px;
            background-color: #f5f5f5;
        }
        .container {
            max-width: ${width}px;
            margin: 0 auto;
            background-color: white;
            padding: 10px;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        .header {
            text-align: center;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 15px;
            border-radius: 8px;
            margin-bottom: 15px;
        }
        .header h1 {
            margin: 0;
            font-size: 28px;
        }
        .header .date {
            margin: 5px 0 0 0;
            font-size: 16px;
            opacity: 0.9;
        }
        .section {
            margin-bottom: 15px;
        }
        .section-title {
            background-color: #4a90e2;
            color: white;
            padding: 10px;
            border-radius: 5px;
            font-size: 18px;
            font-weight: bold;
            margin-bottom: 10px;
        }
        .task-list {
            list-style: none;
            padding: 0;
        }
        .task-item {
            padding: 8px 12px;
            margin: 5px 0;
            border-left: 4px solid #4a90e2;
            background-color: #f8f9fa;
            border-radius: 4px;
        }
        .task-completed {
            border-left-color: #28a745;
            background-color: #d4edda;
        }
        .task-in-progress {
            border-left-color: #ffc107;
            background-color: #fff3cd;
        }
        .task-pending {
            border-left-color: #dc3545;
            background-color: #f8d7da;
        }
        .status-icon {
            font-size: 14px;
            margin-right: 8px;
        }
        .progress-bar {
            background-color: #e9ecef;
            border-radius: 10px;
            height: 20px;
            margin: 10px 0;
            overflow: hidden;
        }
        .progress-fill {
            height: 100%;
            background: linear-gradient(90deg, #28a745 0%, #20c997 100%);
            transition: width 0.3s ease;
        }
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 15px;
            margin: 15px 0;
        }
        .stat-card {
            background-color: #f8f9fa;
            padding: 15px;
            border-radius: 8px;
            text-align: center;
            border: 1px solid #dee2e6;
        }
        .stat-number {
            font-size: 24px;
            font-weight: bold;
            color: #4a90e2;
        }
        .stat-label {
            font-size: 14px;
            color: #6c757d;
            margin-top: 5px;
        }
        .today-highlights {
            background-color: #e3f2fd;
            border: 1px solid #bbdefb;
            border-radius: 8px;
            padding: 15px;
            margin: 15px 0;
        }
        .highlight-item {
            margin: 10px 0;
            padding: 8px;
            background-color: white;
            border-radius: 4px;
            border-left: 3px solid #2196f3;
        }
        .footer {
            text-align: center;
            padding: 20px;
            color: #6c757d;
            border-top: 1px solid #dee2e6;
            margin-top: 30px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>${title}</h1>
            <div class="date">${date}</div>
        </div>

        <div class="section">
            <div class="section-title">📊 Sprint Progress Overview</div>
            <div class="stats-grid">
                <div class="stat-card">
                    <div class="stat-number">${stats.total}</div>
                    <div class="stat-label">Total Tasks</div>
                </div>
                <div class="stat-card">
                    <div class="stat-number">${stats.completed}</div>
                    <div class="stat-label">Completed</div>
                </div>
                <div class="stat-card">
                    <div class="stat-number">${stats.inProgress}</div>
                    <div class="stat-label">In Progress</div>
                </div>
                <div class="stat-card">
                    <div class="stat-number">${stats.pending}</div>
                    <div class="stat-label">Pending</div>
                </div>
            </div>
            <div class="progress-bar">
                <div class="progress-fill" style="width: ${stats.completionPercentage}%"></div>
            </div>
            <div style="text-align: center; margin-top: 10px; font-weight: bold; color: #28a745;">
                ${stats.completionPercentage}% Complete
            </div>
        </div>

        <div class="section">
            <div class="section-title">✅ Completed Tasks</div>
            <ul class="task-list">
                ${workItems.completed.map(item => `
                    <li class="task-item task-completed">
                        <span class="status-icon">✅</span>
                        ${item.title}
                        ${item.assignedTo && item.assignedTo !== 'Unassigned' ? `<span style="color: #6c757d; font-size: 12px;"> - ${item.assignedTo}</span>` : ''}
                    </li>
                `).join('')}
            </ul>
        </div>

        <div class="section">
            <div class="section-title">🔄 In Progress</div>
            <ul class="task-list">
                ${workItems.inProgress.map(item => `
                    <li class="task-item task-in-progress">
                        <span class="status-icon">🔄</span>
                        ${item.title}
                        ${item.assignedTo && item.assignedTo !== 'Unassigned' ? `<span style="color: #6c757d; font-size: 12px;"> - ${item.assignedTo}</span>` : ''}
                    </li>
                `).join('')}
            </ul>
        </div>

        <div class="section">
            <div class="section-title">⏳ Pending</div>
            <ul class="task-list">
                ${workItems.pending.map(item => `
                    <li class="task-item task-pending">
                        <span class="status-icon">⏳</span>
                        ${item.title}
                        ${item.assignedTo && item.assignedTo !== 'Unassigned' ? `<span style="color: #6c757d; font-size: 12px;"> - ${item.assignedTo}</span>` : ''}
                    </li>
                `).join('')}
            </ul>
        </div>

        <div class="section">
            <div class="section-title">🌟 Today's Highlights</div>
            <div class="today-highlights">
                <div class="highlight-item">
                    <strong>🎯 Sprint Progress:</strong> ${iterationName} is ${stats.completionPercentage}% complete with ${stats.completed} out of ${stats.total} tasks finished
                </div>
                <div class="highlight-item">
                    <strong>🔧 Active Development:</strong> ${stats.inProgress} tasks currently in progress across the team
                </div>
                <div class="highlight-item">
                    <strong>📈 Achievement Rate:</strong> ${stats.completed} tasks completed, ${stats.pending} tasks pending in backlog
                </div>
                <div class="highlight-item">
                    <strong>🚀 Next Focus:</strong> Complete in-progress items and address pending backlog items
                </div>
                ${azureData.success ? `
                <div class="highlight-item">
                    <strong>📊 Data Source:</strong> Live data from Azure DevOps - ${projectInfo}
                </div>
                ` : `
                <div class="highlight-item">
                    <strong>⚠️ Data Source:</strong> Using fallback data - Azure DevOps connection unavailable
                </div>
                `}
            </div>
        </div>

        <div class="section">
            <div class="section-title">📝 Technical Notes</div>
            <div style="background-color: #f8f9fa; padding: 15px; border-radius: 8px; border-left: 4px solid #007bff;">
                <h4>Implementation Details:</h4>
                <ul>
                    <li><strong>Data Integration:</strong> ${azureData.success ? 'Live Azure DevOps API integration' : 'Fallback data (check Azure DevOps configuration)'}</li>
                    <li><strong>Extension Framework:</strong> VS Code extension with chat participants</li>
                    <li><strong>Report Generation:</strong> Node.js with dynamic HTML template system</li>
                    <li><strong>Cross-platform Support:</strong> PowerShell → Node.js migration completed</li>
                    <li><strong>UI Integration:</strong> Command palette with webview display</li>
                    ${stats.totalStoryPoints ? `<li><strong>Story Points:</strong> ${stats.completedStoryPoints}/${stats.totalStoryPoints} completed (${stats.storyPointsPercentage}%)</li>` : ''}
                </ul>
            </div>
        </div>

        <div class="footer">
            <p>Generated on ${new Date().toLocaleString()} by AI Self Check Extension</p>
            <p>🔗 Project: ${projectInfo} | 📊 Sprint: ${iterationName}</p>
            ${azureData.success ? '<p>✅ Live data from Azure DevOps API</p>' : '<p>⚠️ Using fallback data - check Azure DevOps configuration</p>'}
        </div>
    </div>
</body>
</html>`;

    return htmlContent;
}

/**
 * Save HTML report to file
 * @param {string} htmlContent - HTML content to save
 * @param {string} outputPath - Output file path
 * @returns {Promise<string>} - Path to saved file
 */
async function saveHtmlReport(htmlContent, outputPath = null) {
    if (!outputPath) {
        // Try to save in workspace instructions folder
        let basePath;
        
        try {
            const vscode = require('vscode');
            if (vscode.workspace && vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
                basePath = path.join(vscode.workspace.workspaceFolders[0].uri.fsPath, 'instructions');
            } else {
                basePath = __dirname;
            }
        } catch (error) {
            // Fallback if vscode module is not available (CLI usage)
            basePath = path.join(__dirname, '..', '..', '..', '..', 'instructions');
            if (!fs.existsSync(basePath)) {
                basePath = __dirname;
            }
        }
        
        const timestamp = new Date().toISOString().replace(/[:.]/g, '_').slice(0, 19);
        outputPath = path.join(basePath, `Daily_Report_${timestamp}.html`);
    }

    // Ensure directory exists
    const dir = path.dirname(outputPath);
    try {
        await fs.promises.access(dir);
    } catch {
        await fs.promises.mkdir(dir, { recursive: true });
        console.log(`📁 Created directory: ${dir}`);
    }

    await fs.promises.writeFile(outputPath, htmlContent, 'utf8');
    return outputPath;
}

/**
 * Generate and save daily report
 * @param {Object} options - Configuration options
 * @returns {Promise<Object>} - Result with file path and HTML content
 */
async function createDailyReport(options = {}) {
    try {
        console.log('🎯 Generating daily report...');
        
        const htmlContent = await generateDailyReport(options);
        const outputPath = await saveHtmlReport(htmlContent, options.outputPath);
        
        console.log('✅ Daily report generated successfully!');
        console.log(`📁 File saved: ${outputPath}`);
        
        return {
            success: true,
            htmlContent,
            outputPath,
            fileSize: fs.statSync(outputPath).size
        };
    } catch (error) {
        console.error('❌ Error generating daily report:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

// Export functions for use in VS Code extension
module.exports = {
    generateDailyReport,
    saveHtmlReport,
    createDailyReport
};

// CLI usage if run directly
if (require.main === module) {
    const args = process.argv.slice(2);
    const options = {};
    
    // Parse command line arguments
    for (let i = 0; i < args.length; i += 2) {
        const key = args[i].replace('--', '');
        const value = args[i + 1];
        
        if (key === 'width' || key === 'height') {
            options[key] = parseInt(value);
        } else {
            options[key] = value;
        }
    }
    
    createDailyReport(options).then(result => {
        if (result.success) {
            console.log(`\n🎉 Success! Report saved to: ${result.outputPath}`);
            console.log(`📊 File size: ${(result.fileSize / 1024).toFixed(2)} KB`);
        } else {
            console.error(`\n❌ Failed: ${result.error}`);
            process.exit(1);
        }
    }).catch(error => {
        console.error(`\n❌ Unexpected error: ${error.message}`);
        process.exit(1);
    });
}