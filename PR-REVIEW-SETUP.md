# PR Review Setup Guide

This extension now supports reviewing PRs from **any repository** (GitHub or Azure DevOps) without requiring a local workspace!

## 🚀 Features

- ✅ Review PRs from **GitHub** and **Azure DevOps**
- ✅ Works with **any repository** - no local clone needed
- ✅ Automatic repo type detection from URL
- ✅ Fetches diff directly via REST API
- ✅ Supports both public and private repos

## 📋 Configuration

### For Azure DevOps

1. Open VS Code Settings (`Ctrl+,` or `Cmd+,`)
2. Search for "AI Self Check"
3. Or manually add to `settings.json`:

```json
{
    "aiSelfCheck.azureDevOps.personalAccessToken": "YOUR_AZURE_TOKEN",
    "aiSelfCheck.azureDevOps.organization": "YourOrganization",
    "aiSelfCheck.azureDevOps.defaultProject": "YourProject"
}
```

**Create Azure DevOps Token:**
- Go to: `https://dev.azure.com/{YourOrg}/_usersSettings/tokens`
- Required permissions: `Code (Read)` + `Pull Request Threads (Read)`

### For GitHub

Add to `settings.json`:

```json
{
    "aiSelfCheck.github.personalAccessToken": "YOUR_GITHUB_TOKEN"
}
```

**Create GitHub Token:**
- Go to: https://github.com/settings/tokens
- Click "Generate new token (classic)"
- Required scopes:
  - `repo` (for private repos)
  - OR `public_repo` (for public repos only)

## 🎯 Usage Examples

### Chat Interface

Just paste the PR URL in the chat:

**GitHub:**
```
https://github.com/microsoft/vscode/pull/12345
```

**Azure DevOps:**
```
https://dev.azure.com/BusinessWebUS/Shippo/_git/Shippo-Web/pullrequest/1396
```

**Short form (Azure DevOps only):**
```
Review PR #123
```

### Command Palette

1. Press `Ctrl+Shift+P` (or `Cmd+Shift+P` on Mac)
2. Type: `AI Self Check: Review Pull Request`
3. Paste PR URL or ID

## 🔍 How It Works

### GitHub
1. Detects GitHub URL pattern: `github.com/{owner}/{repo}/pull/{number}`
2. Calls GitHub REST API to fetch:
   - PR metadata (title, description, author)
   - Changed files with diff patches
   - Commit history
   - Unified diff format via `application/vnd.github.v3.diff` header

### Azure DevOps
1. Detects Azure DevOps URL pattern: `dev.azure.com/{org}/{project}/_git/{repo}/pullrequest/{id}`
2. Calls Azure DevOps REST API to fetch:
   - PR details and iterations
   - File changes with content from base and target commits
3. **Generates unified diff using Myers Diff Algorithm**:
   - Fetches file content from both source and target commits
   - Computes **LCS (Longest Common Subsequence)** to identify actual changes
   - Groups changes into hunks with context lines (like `git diff`)
   - Produces proper unified diff format with `+` and `-` markers
4. All operations are **workspace-independent** - no local git required!

## 🧮 Technical Details: Myers Diff Algorithm

The extension implements a **simplified Myers diff algorithm** to generate accurate diffs from Azure DevOps:

### Algorithm Steps:
1. **LCS Computation**: Build a dynamic programming table to find the longest common subsequence between base and target files
2. **Backtracking**: Trace back through the table to identify insertions, deletions, and unchanged lines
3. **Hunk Generation**: Group consecutive changes with configurable context lines (default: 3 lines before/after)
4. **Unified Format**: Output in standard git diff format

### Why This Matters:
- ✅ Shows **actual line-by-line changes** (not just file replacements)
- ✅ Matches `git diff` output format exactly
- ✅ Works without any git executable or local repository
- ✅ Handles large files efficiently with O(n×m) complexity

### Example Output:
```diff
@@ -1,7 +1,6 @@
 import { Component } from '@angular/core';
-import { DISPOSITION, PAGE_CODE, SEARCH_PAGE } from '@shared/utilities';
+import { DISPOSITION, FormType, PAGE_CODE } from '@shared/utilities';
 import { TabView } from 'primeng/tabview';
-import { JOB_EQUIPMENT_LIST } from '../mock-data';
 import { Guid } from 'guid-typescript';
```

This ensures you see **exactly what changed**, just like reviewing on Azure DevOps web UI!

## 🌟 Benefits

- **No Local Clone Required**: Review any PR from any repo instantly
- **Cross-Repo Support**: Works with repos you don't have locally
- **Fast**: Direct API calls, no git operations
- **Secure**: Uses your personal tokens for authentication
- **Flexible**: Auto-detects repo type from URL

## 🔒 Security Notes

- Tokens are stored in VS Code user settings (encrypted by VS Code)
- Never commit tokens to version control
- Use tokens with minimal required permissions
- Tokens can be revoked anytime from GitHub/Azure DevOps settings

## 🐛 Troubleshooting

### "Azure DevOps Personal Access Token is required"
- Configure the token in settings as shown above
- Verify token has correct permissions

### "Failed to get PR details: HTTP 404"
- Check the PR URL is correct
- Verify you have access to the repository
- For private repos, ensure token is configured

### "Request timeout"
- Large PRs may take longer
- Try again or check your internet connection

## 📚 Examples

### Review Public GitHub PR
```
@review-pr https://github.com/facebook/react/pull/25000
```

### Review Private Azure DevOps PR
```
@review-pr https://dev.azure.com/MyOrg/MyProject/_git/MyRepo/pullrequest/456
```

### Review with Default Project (Azure DevOps)
```
@review-pr PR #123
```

---

**Enjoy reviewing PRs from anywhere! 🎉**
