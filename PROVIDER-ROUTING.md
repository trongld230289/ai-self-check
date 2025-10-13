# PR Provider Routing - Clean Architecture

## Overview
The extension now has clean separation between GitHub and Azure DevOps PR handling with dedicated functions for each provider.

## Architecture

### Provider Detection
- **GitHub**: Detected by URL pattern `https://github.com/{owner}/{repo}/pull/{id}`
- **Azure DevOps**: Detected by URL pattern `https://dev.azure.com/{org}/{project}/_git/{repo}/pullrequest/{id}`
- **Fallback**: Simple PR ID (e.g., "PR #123") defaults to Azure DevOps

### Function Routing

#### Function A - Azure DevOps (`showAzureDevOpsDiffInWebview`)
- Located in: `scripts/review-pr.js`
- Handles: Azure DevOps PRs
- Cache prefix: `pr{id}_`
- Features:
  - Azure DevOps API integration
  - Diff caching for webview
  - File change buttons
  - Tabbed webview support

#### Function B - GitHub (`showGitHubDiffInWebview`)
- Located in: `scripts/review-pr.js`  
- Handles: GitHub PRs
- Cache prefix: `github_{id}_`
- Features:
  - GitHub REST API integration
  - Patch/unified diff parsing
  - File change buttons
  - Tabbed webview support

### Flow Diagram

```
User inputs PR URL
       ↓
Provider Detection (in handleReviewPr)
       ↓
┌─────────────┬─────────────┐
│   GitHub    │Azure DevOps │
│             │             │
│ Function B  │ Function A  │
│             │             │
│ GitHub API  │ Azure API   │
│             │             │
│Cache github_│Cache pr{id}_│
└─────────────┴─────────────┘
       ↓
Webview Display (shared)
```

## Usage Examples

### GitHub PR
```
@review-pr https://github.com/trongld230289/ng-custom-gantt-chart-v2/pull/6
```

### Azure DevOps PR  
```
@review-pr https://dev.azure.com/BusinessWebUS/Shippo/_git/Shippo-Web/pullrequest/1396
@review-pr PR #1396
```

## Benefits

1. **Clean Separation**: No mixed logic between providers
2. **Future-Proof**: Easy to add new providers (GitLab, Bitbucket, etc.)
3. **Maintainable**: Each provider has its own dedicated function
4. **Testable**: Provider-specific functions can be tested independently
5. **Extensible**: Provider detection can be extended with new URL patterns

## Adding New Providers

To add a new provider (e.g., GitLab):

1. Add URL pattern detection in `handleReviewPr`
2. Create `showGitLabDiffInWebview` function (Function C)
3. Add routing logic in `displayPrReviewResults`
4. Export the new function in module.exports

## Configuration

Each provider can have its own configuration section:

- `aiSelfCheck.github.personalAccessToken`
- `aiSelfCheck.azureDevOps.personalAccessToken`
- `aiSelfCheck.gitlab.personalAccessToken` (future)