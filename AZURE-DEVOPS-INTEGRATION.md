# Azure DevOps Integration for Daily Reports

The `@daily-report` command can fetch real data from Azure DevOps to generate dynamic daily reports.

## 🔧 Setup Azure DevOps Integration

### 1. Get Personal Access Token (PAT)

1. Go to your Azure DevOps organization
2. Click on your profile → **Personal access tokens**
3. Create new token with these permissions:
   - **Work Items**: Read
   - **Project and team**: Read
   - **Code**: Read (optional, for repository data)

### 2. Configure VS Code Settings

Open VS Code settings (`Ctrl+,`) and add:

```json
{
    "aiSelfCheck.azureDevOps.personalAccessToken": "your-pat-token-here",
    "aiSelfCheck.azureDevOps.organization": "your-org-name",
    "aiSelfCheck.azureDevOps.defaultProject": "your-project-name"
}
```

Or use the command palette:
1. Press `Ctrl+Shift+P`
2. Run: **AI Self Check: Setup Azure DevOps Token**

### 3. Test the Integration

Type in VS Code chat:
```
@daily-report
```

If configured correctly, you'll see real data from your Azure DevOps project!

## 📊 What Data is Fetched

- **Current Sprint/Iteration**: Active iteration work items
- **Work Item Status**: New, Active, Resolved, Closed states
- **Team Statistics**: Total, completed, in-progress, pending counts
- **Story Points**: If configured in your work items
- **Assignees**: Who is working on what
- **Recent Updates**: Recently changed work items

## 🛠️ Supported Work Item Types

- User Stories
- Tasks
- Bugs
- Features
- Epics
- Custom work item types

## 🔍 Troubleshooting

### No Data Showing
1. Check your Azure DevOps configuration in VS Code settings
2. Verify your PAT has correct permissions
3. Ensure you're using the correct organization and project names
4. Check the VS Code output console for error messages

### Fallback Data
If Azure DevOps connection fails, the report will show sample data with a warning message.

### Authentication Issues
- PAT tokens expire - regenerate if needed
- Organization/project names are case-sensitive
- Ensure your PAT has access to the specified project

## 💡 Tips

- **Team-level Data**: The extension fetches data from the default team in your project
- **Current Iteration**: Only shows work items from the currently active iteration/sprint
- **Performance**: Large projects with many work items may take longer to load
- **Caching**: Data is fetched fresh each time you run `@daily-report`

## 🚀 Advanced Usage

### Custom Queries
The Azure DevOps integration uses WIQL (Work Item Query Language) to fetch data. You can modify the query in `azure-devops-data.js` for custom filtering.

### Multiple Projects
To switch between projects, update the `defaultProject` setting in VS Code configuration.

### Team-specific Reports
The current implementation uses the default team. For specific teams, the code can be modified to specify a team ID.

---

## 📝 Example Report Output

With Azure DevOps integration enabled:

```
📊 Daily Report Generator

✅ Report generated successfully!
📁 Report saved to: ./instructions/Daily_Report_2025-10-14T16_24_16.html
📊 File size: 12.45 KB

## 📈 Quick Summary
- Sprint Progress: 75% complete (15/20 tasks)
- Status: 15 completed, 4 in progress, 1 pending  
- Focus: Bug fixes and feature completion for Sprint 3.2

💡 Tip: Click the button above to view the full interactive report in VS Code.
✅ Live data from Azure DevOps API
```

The generated report will include:
- Real task titles and descriptions
- Actual team member assignments
- Current sprint name and dates
- Live progress statistics
- Recently updated work items