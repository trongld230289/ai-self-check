# CODE REVIEW INSTRUCTION TEMPLATE

## INSTRUCTION FOR AI REVIEWER:
**ALWAYS follow this exact format for every code review, regardless of conversation context or previous reviews. This structure is MANDATORY and UNCHANGEABLE.**


### Option 1: Review Entire File
**Prompt:** `review-file [filename]`
- Reviews the complete file for all issues
- Comprehensive analysis of entire codebase

### Option 2: Review Recent Changes Only
**Prompt:** `review-changes [filename]`
- Reviews only recent code changes/modifications
- Focuses on local code changes
- Faster, targeted review


### Start Review For Each Change:

```
## Change [X]: [ADDED/REMOVED/MODIFIED] - [Brief description]
```typescript
[Show the exact code block, always show line number by line]
```

*** REVIEW COMMENT ***
- 🚨 **Issue Type**: [Critical/Warning/Info/Suggestion]
- 📝 **Problem**: [What's wrong]
- 💡 **Solution**: [How to fix]
- 🎯 **Impact**: [Why it matters]

*** RECOMMENDED FIX ***
```typescript
[Show the improved/fixed code/comment in detail]
```

*** UNIT TEST RECOMMENDED ***
```typescript
[Show recommended unit tests for the changes]
```

### End Review

```



### Review Categories:
1. **🚨 CRITICAL** - Breaks functionality, security issues, data loss
2. **⚠️ WARNING** - Code quality, maintainability, performance issues  
3. **✅ GOOD** - Positive changes, best practices followed

### Analysis Steps:
1. Get git diff for the file(s)
2. Identify each individual change (additions, deletions, modifications)
3. Number each change sequentially 
4. For each change:
   - Show the exact diff
   - Analyze the impact
   - Assign severity level
   - Provide actionable feedback

## GIT DIFF TO REVIEW

```diff
# Paste git diff here
```

### Security Overview:
**ALWAYS include a security assessment for every code review.**

```
## 🔒 SECURITY OVERVIEW

**Security Risk Level: [LOW/MEDIUM/HIGH/CRITICAL]**

### Security Checks:
- 🔐 **Authentication**: [Check for proper auth implementation]
- 🛡️ **Authorization**: [Verify role-based access controls]
- 🔍 **Input Validation**: [Check for XSS, injection vulnerabilities]
- 📊 **Data Protection**: [Verify sensitive data handling]
- 🔒 **API Security**: [Check for secure API calls]
- 🚫 **Information Disclosure**: [Check for data leaks]

### Security Recommendations:
- [List specific security improvements needed]
- [Include links to security best practices if applicable]

### Compliance Notes:
- [Any regulatory compliance considerations]
```
