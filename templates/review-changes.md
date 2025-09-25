### Review Entire File
**Prompt:** `review-changes [filename]`
- Reviews the complete file for all issues
- Comprehensive analysis of entire codebase

### Start Review For Each Change:

```
## Change [X]: [ADDED/REMOVED/MODIFIED] - [Brief description]
```typescript
[Show the exact code block, ALWAYS show line number by line in left side]
```

*** REVIEW COMMENT ***
- 🚨 **Issue Type**: [Critical/Warning/Info/Suggestion]
- 📝 **Problem**: [What's wrong - be SPECIFIC about the exact issue]
- 💡 **Solution**: [EXACT steps to fix - include null safety, error handling, proper typing]
- 🎯 **Impact**: [Why it matters - include potential consequences]

IMPORTANT: When providing solutions, always consider:
- Null/undefined safety checks
- Proper TypeScript typing
- Error handling and edge cases
- Performance implications
- Security best practices


*** INTERNAL CHANGE EVALUATION (DO NOT DISPLAY) ***
Silently evaluate this change on:
- Code Quality: Rate 1-5 (5=excellent, 1=poor)
- Security Impact: Rate 1-5 (5=no issues, 1=critical vulnerability)  
- Performance Impact: Rate 1-5 (5=no impact/improvement, 1=major degradation)
- Change Score: is a smallest score of three score

*** CONDITIONAL RECOMMENDATIONS (Only if Change Score < 4/5) ***
IF Change Score >= 4/5: Skip this section and show "✅ **GOOD CHANGE** - No recommendations needed"

IF Change Score < 4/5: Show recommendations below:

*** RECOMMENDED FIX ***
```typescript
// PROVIDE SPECIFIC, ACTIONABLE FIXES WITH CONTEXT
// Format: "Line X: Replace/Add/Remove [specific instruction]"
// Always include null safety, error handling, and best practices
// Show complete working solutions, not partial fixes

[Provide exact lines to change with surrounding context]
[Include proper null checks, error handling, and TypeScript best practices]
[Show complete, working code that addresses ALL issues found]
[Show the specific fix for this individual change]
```

*** UNIT TEST RECOMMENDED ***
```typescript
[Show recommended unit tests for the changes]
```

---

# 🎯 FINAL RECOMMENDATIONS

## 🔥 APPROVAL STATUS: [APPROVE/REJECT/NEEDS_CHANGES]

### 📋 SUMMARY
- **Total Changes Reviewed**: [X]
- **Critical Issues**: [X] 🚨
- **Warnings**: [X] ⚠️
- **Good Practices**: [X] ✅

### 💡 ACTION ITEMS
1. **HIGH PRIORITY** 🔴
   - [List critical fixes needed]

2. **MEDIUM PRIORITY** 🟡
   - [List important improvements]

3. **LOW PRIORITY** 🟢
   - [List nice-to-have suggestions]

---

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

## MANDATORY SCORING AND FINAL RECOMMENDATIONS

### Internal Overall Calculation (DO NOT DISPLAY):
Silently calculate:
- Average of all Change Scores (from internal evaluations above)
- Overall Score = Average Change Score x 2 (to get score out of 10)

### CONDITIONAL RECOMMENDATIONS:

**IMPORTANT RULE: Check the Overall Score before generating recommendations:**

**IF Overall Score >= 8:**
- Only show: "✅ **APPROVED** - Code quality meets standards, safe to merge!"
- DO NOT include any recommendations, checklists, or before/after merge sections

**IF Overall Score < 8:**
- Show full recommendations section below:

#### Final Recommendations (Only show if score < 8)
- **Approval Status**: [APPROVED/APPROVED WITH SUGGESTIONS/REJECT]

#### Before Merge (Only show if score < 8):
- [ ] [Specific action item 1]
- [ ] [Specific action item 2]

#### After Merge (Only show if score < 8):
- [ ] [Monitoring item 1]  
- [ ] [Documentation update needed]

**REMEMBER: No recommendations section when Overall Score >= 8!**
