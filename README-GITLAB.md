# GitLab Integration for AI Self Check Extension

This extension now supports GitLab Merge Request (MR) reviews in addition to GitHub Pull Requests and Azure DevOps Pull Requests.

## Setup

### 1. Configure GitLab Token

Add your GitLab Personal Access Token to VS Code settings:

1. Open VS Code Settings JSON: `Ctrl+Shift+P` → `Preferences: Open User Settings (JSON)`
2. Add the following configuration:

```json
{
    "aiSelfCheck.gitlab.personalAccessToken": "YOUR_GITLAB_TOKEN"
}
```

### 2. Create GitLab Token

1. Go to your GitLab instance: `https://gitlab.com/-/profile/personal_access_tokens` (or your custom GitLab URL)
2. Create a new token with the following scopes:
   - `read_api` (for public repositories)
   - `api` (for private repositories)

## Usage

### Supported GitLab URL Formats

The extension supports both GitLab.com and custom GitLab instances:

```
https://gitlab.com/owner/repo/-/merge_requests/123
https://custom-gitlab.domain.com/owner/repo/-/merge_requests/456
```

### How to Review GitLab MRs

1. **Using Chat Interface:**
   - Open VS Code Chat (`Ctrl+Shift+P` → `Chat: Focus on Chat View`)
   - Type: `@review-pr https://gitlab.com/owner/repo/-/merge_requests/123`

2. **Examples:**
   ```
   @review-pr https://gitlab.com/gitlab-org/gitlab/-/merge_requests/12345
   @review-pr https://my-company.gitlab.io/team/project/-/merge_requests/456
   ```

### Features

✅ **Supported GitLab Features:**
- Merge Request analysis
- File changes display
- Unified diff viewing
- Monaco Editor diff viewer
- Commit history
- Line-by-line diff review
- AI-powered code review
- Custom GitLab instances

✅ **Review Capabilities:**
- Security analysis
- Code quality checks
- Performance review
- Best practices validation
- Detailed file-by-file analysis

## Provider Detection

The extension automatically detects the provider based on URL patterns:

- **GitHub**: `https://github.com/owner/repo/pull/123`
- **GitLab**: `https://gitlab.com/owner/repo/-/merge_requests/123`
- **Azure DevOps**: `https://dev.azure.com/org/project/_git/repo/pullrequest/123`

## Troubleshooting

### Common Issues

1. **"GitLab API Error"**
   - Ensure your token is configured correctly
   - Check token permissions (needs `read_api` or `api` scope)
   - Verify the GitLab URL is accessible

2. **"MR not found"**
   - Check if the Merge Request ID exists
   - Ensure you have access to the repository
   - Verify the GitLab instance URL

3. **Rate Limiting**
   - GitLab has API rate limits
   - Wait a moment and try again
   - Consider using a project-specific token for higher limits

### Debug Information

The extension logs detailed information to the VS Code console:
- Open Developer Tools: `Help` → `Toggle Developer Tools`
- Check the Console tab for GitLab API calls and responses

## Example Workflow

1. **Open Chat**: `Ctrl+Shift+P` → `Chat: Focus on Chat View`
2. **Review MR**: `@review-pr https://gitlab.com/your-org/your-repo/-/merge_requests/123`
3. **View Results**: Click on file buttons to open Monaco diff viewer
4. **AI Analysis**: Get automatic code quality and security analysis

## Settings Reference

```json
{
    // GitLab Integration
    "aiSelfCheck.gitlab.personalAccessToken": "glpat-xxxxxxxxxxxxxxxxxxxx",
    
    // Other providers (optional)
    "aiSelfCheck.github.personalAccessToken": "ghp_xxxxxxxxxxxxxxxxxxxx",
    "aiSelfCheck.azureDevOps.personalAccessToken": "your-azure-token",
    "aiSelfCheck.azureDevOps.organization": "your-org",
    "aiSelfCheck.azureDevOps.defaultProject": "your-project"
}
```

## Architecture

The GitLab integration follows the same pattern as GitHub and Azure DevOps:

- **Function C**: `showGitLabDiffInWebview()` - Handles GitLab-specific diff display
- **API Layer**: `analyzeGitLabMergeRequest()` - GitLab REST API integration
- **Provider Detection**: Automatic URL pattern matching
- **Cache Management**: Efficient diff data caching for webview

## Supported GitLab Versions

- ✅ GitLab.com (SaaS)
- ✅ GitLab Enterprise Edition
- ✅ GitLab Community Edition
- ✅ Custom GitLab instances

Minimum GitLab version: 13.0+ (API v4)