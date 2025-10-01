# Git Changes Review - STRICT MODE

## 🔍 MANDATORY CHANGE ANALYSIS

You are performing a STRICT code review on git changes. Do NOT be lenient. Look for every possible issue in the changes. ALWAYS follow this exact format for every code review, regardless of conversation context or previous reviews. This structure is MANDATORY and UNCHANGEABLE.
### Review Entire File
**Prompt:** `review-changes [filename]`
- Reviews the complete file for all issues
- Comprehensive analysis of entire codebase


<!-- HIDDEN REVIEW SCOPE:
- ✅ ONLY review: Lines marked with + (added) or - (removed)
- ❌ DO NOT review: Unchanged context lines (no + or - marker)
- ❌ DO NOT suggest: Improvements to existing unchanged code
- ✅ DO focus on: How changes impact the immediate context
-->

### 📋 CHANGE SEPARATION RULES (MANDATORY):

**Split into separate changes when:**
- ✅ **Different functions/methods**: Each function modification = separate change
- ✅ **Different logical areas**: Form validation vs API call vs filename logic = separate changes  
- ✅ **Different types of operations**: Adding new code vs modifying existing vs removing code = separate changes
- ✅ **Non-adjacent code blocks**: If there are 3+ unchanged lines between modifications = separate changes

**Keep as one change when:**
- ❌ **Same logical operation**: Multiple lines for same functionality (e.g., form validation logic)
- ❌ **Adjacent lines**: Consecutive lines with no gaps = one change
- ❌ **Same purpose**: All changes serve same goal (e.g., all parameter construction)

## ⚡ CRITICAL CHECKS (Auto-FAIL if found)

**Scan EVERY line for these CRITICAL issues:**

### 🚨 SECURITY VIOLATIONS:
- Hardcoded passwords, API keys, tokens, secrets
- SQL injection vulnerabilities (dynamic SQL construction)
- XSS vulnerabilities (innerHTML without sanitization)
- Unsafe file operations, path traversal
- Authentication/authorization bypasses

### 🚨 NULL SAFETY VIOLATIONS:
- `.` access without null checks (`obj.property` without `obj?.property`)
- Array access without length checks (`arr[0]` without `arr?.length`)
- Function calls without existence checks
- `any` type usage without proper validation
- Missing null/undefined guards

### 🚨 ERROR HANDLING VIOLATIONS:
- `try` blocks without `catch`
- Promise/Observable without error handling
- HTTP calls without error callbacks
- File operations without error checks
- Database operations without error handling

### 🚨 RESOURCE LEAKS:
- Observables without unsubscribe
- Event listeners without cleanup
- Timers without clearInterval/clearTimeout  
- File handles not closed
- Database connections not closed

### Start Review For Each Change:

```
## Change [X]: [ADDED/REMOVED/MODIFIED] - [Brief description]
```typescript
[Show the exact code block, ALWAYS show line number by line in left side]
```

*** REVIEW COMMENT ***
- 🚨 **Issue Type**: [Critical/Warning/Good/Info/Suggestion]
- 📝 **Problem**: [What's wrong - be SPECIFIC about the exact issue. For Good changes, describe what was improved]
- 💡 **Solution**: [EXACT steps to fix - include null safety, error handling, proper typing. For Good changes, say "No changes needed"]
- 🎯 **Impact**: [Why it matters - include potential consequences. For Good changes, describe positive impact]

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

*** CONDITIONAL RECOMMENDATIONS (Based on Issue Type AND Change Score) ***

**MANDATORY RULE:**
- IF Issue Type = "Good": ALWAYS show "✅ **GOOD CHANGE** - No recommendations needed" and SKIP the entire RECOMMENDED FIX section
- IF Issue Type = "Critical/Warning/Info/Suggestion" AND Change Score < 4/5: Show RECOMMENDED FIX section below
- IF Issue Type = "Critical/Warning/Info/Suggestion" AND Change Score >= 4/5: Show "✅ **GOOD CHANGE** - No recommendations needed"

*** RECOMMENDED FIX (ONLY show if Issue Type != "Good" AND Change Score < 4/5) ***
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

---

## 🔍 SPECIFIC RULES VIOLATED

### TypeScript/JavaScript VIOLATIONS:
- ❌ `any` type without validation
- ❌ Non-null assertion (`!`) without null checks  
- ❌ `console.log` in production code
- ❌ `debugger` statements
- ❌ `eval()` or `Function()` usage
- ❌ Global variables
- ❌ Magic numbers without constants

### Angular VIOLATIONS:
- ❌ Components without OnDestroy
- ❌ Subscriptions without unsubscribe
- ❌ Direct DOM manipulation
- ❌ Business logic in templates
- ❌ Missing trackBy in *ngFor
- ❌ Large components (>300 lines)

### Security VIOLATIONS:
- ❌ innerHTML with dynamic content
- ❌ Hardcoded credentials
- ❌ HTTP instead of HTTPS
- ❌ No input validation
- ❌ SQL string concatenation

---

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

### 🧪 UNIT TESTS RECOMMENDED:
```typescript
// Show comprehensive unit tests for ALL changes reviewed
// Include tests for error scenarios, edge cases, and happy paths
// Group tests by functionality/component method
// Example:
describe('ComponentMethod - downloadExcel', () => {
  it('should handle successful scenarios', () => {
    // Test implementation
  });
  
  it('should handle error scenarios', () => {
    // Test implementation  
  });
  
  it('should validate input parameters', () => {
    // Test implementation
  });
});
```

**REMEMBER: No recommendations section when Overall Score >= 8!**
