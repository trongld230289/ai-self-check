# 🚀 Azure DevOps PR Review Feature

## Overview
This feature allows you to review Azure DevOps Pull Requests directly in VS Code using AI analysis with the `@review-pr` command.

## 🔧 Setup Instructions

### Step 1: Create Personal Access Token (PAT)

1. **Go to Azure DevOps:**
   - Navigate to: `https://dev.azure.com/{your-organization}`
   - Click on **User Settings** (user icon in top right)
   - Select **Personal access tokens**

2. **Create New Token:**
   - Click **+ New Token**
   - **Name:** `VS Code AI Reviewer`
   - **Organization:** Select your organization
   - **Expiration:** Choose appropriate duration (recommended: 90 days)
   - **Scopes:** Select custom defined and choose:
     - ✅ **Code (read)** - to read repository content
     - ✅ **Pull Request (read)** - to read PR data and changes

3. **Copy Token:**
   - Click **Create**
   - **⚠️ IMPORTANT:** Copy the token immediately (it's only shown once)

### Step 2: Configure VS Code Settings

#### Option A: Through VS Code UI
```
1. Open VS Code
2. Press Ctrl/Cmd + , to open Settings
3. Search for "azure devops" 
4. Find "AI Code Reviewer: Azure DevOps Personal Access Token"
5. Paste your token
6. Optionally set default organization and project
```

#### Option B: Through settings.json
```json
{
    "aiCodeReviewer.azureDevOps.personalAccessToken": "your-pat-token-here",
    "aiCodeReviewer.azureDevOps.organization": "your-org-name",
    "aiCodeReviewer.azureDevOps.defaultProject": "your-project-name"
}
```

## 📖 Usage

### Basic Usage
```
@review-pr https://dev.azure.com/myorg/myproject/_git/myrepo/pullrequest/123
```

### Example URLs
```
https://dev.azure.com/contoso/MyProject/_git/WebApp/pullrequest/456
https://dev.azure.com/fabrikam/TeamProject/_git/BackendAPI/pullrequest/789
```

## 🎯 Features

### What the AI Review Includes:
- **PR Metadata Analysis:** Title, author, description, branches
- **Code Changes Review:** Line-by-line analysis of modifications
- **Security Assessment:** Potential security vulnerabilities
- **Performance Impact:** Performance implications of changes
- **Best Practices:** Coding standards and architectural recommendations
- **Testing Suggestions:** Unit test and integration test recommendations

### Supported Change Types:
- ✅ File additions
- ✅ File deletions  
- ✅ File modifications
- ✅ File renames
- ✅ Multiple file changes

## 🛠️ Troubleshooting

### Common Issues:

#### ❌ "Configuration Required"
**Solution:** Set up your Personal Access Token in VS Code settings

#### ❌ "Azure DevOps API error: 401 Unauthorized"
**Solutions:**
- Check if token is valid and not expired
- Ensure token has correct permissions (Code: Read, Pull Request: Read)
- Verify you have access to the organization/project

#### ❌ "Invalid Azure DevOps PR URL format"
**Solution:** Ensure URL matches format: `https://dev.azure.com/{org}/{project}/_git/{repo}/pullrequest/{id}`

#### ❌ "No changes found in this PR"
**Possible causes:**
- PR has no file changes
- Insufficient permissions to access changes
- PR is in draft status

#### ❌ Network/Connection Issues
**Solutions:**
- Check internet connectivity
- Verify corporate firewall/proxy settings
- Ensure dev.azure.com is accessible

## 🔒 Security Notes

- **Token Storage:** Tokens are stored securely in VS Code's encrypted settings
- **Minimal Permissions:** Only requires read access to code and PRs
- **Local Processing:** All analysis happens locally in VS Code
- **No Data Sharing:** PR content is only sent to your selected AI model

## 🎉 Example Output

When you run `@review-pr [URL]`, you'll get:

```
🔍 Azure DevOps PR Review
📂 Organization: myorg
📂 Project: myproject  
📂 Repository: myrepo
📂 PR ID: #123

✅ PR Data Retrieved Successfully
Title: Fix billing component pagination issue
Author: John Doe
Status: Active
Source Branch: feature/fix-billing-pagination
Target Branch: main
Created: 9/14/2025

✅ PR Changes Retrieved - Starting AI Analysis...

[Detailed AI analysis follows with code review, security assessment, and recommendations]
```

## 🆕 What's New

This feature integrates seamlessly with the existing AI Code Reviewer extension:
- Uses same AI models and fallback logic
- Applies same review templates (`instructions/review-changes.md`)
- Consistent header formatting and output style
- Professional markdown formatting for easy reading

## 📞 Support

If you encounter issues:
1. Check this documentation first
2. Verify your Azure DevOps permissions
3. Check VS Code Developer Tools Console for detailed error messages
4. Ensure you're using a supported PR URL format
