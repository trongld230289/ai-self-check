// Test file for AI Code Reviewer Extension - Simple Prompt Conversion
// 
// This extension now works as a simple prompt converter:
// Input: @review-changes file-path
// Output: "review-changes file-path based on review-code.md"
//
// Input: @review-file file-path  
// Output: "review-file file-path based on review-code.md"

// ====================================
// USAGE EXAMPLES:
// ====================================

// Example 1: Review changes only
// Type this in VS Code Chat:
// @review-changes src\modules\admin\pages\admin-billing\admin-billing\billing-list\billing-list.component.ts
// 
// Extension will convert to:
// "review-changes src\modules\admin\pages\admin-billing\admin-billing\billing-list\billing-list.component.ts based on review-code.md"

// Example 2: Review entire file
// Type this in VS Code Chat:
// @review-file src\modules\admin\pages\admin-billing\admin-billing\billing-list\billing-list.component.ts
//
// Extension will convert to:
// "review-file src\modules\admin\pages\admin-billing\admin-billing\billing-list\billing-list.component.ts based on review-code.md"

// ====================================
// ADVANTAGES:
// ====================================
// ✅ No hard-coded analysis logic
// ✅ Easy to customize review-code.md template  
// ✅ Consistent results regardless of changes
// ✅ GitHub Copilot handles all the actual review analysis
// ✅ Extension only does prompt conversion

// ====================================
// TO CUSTOMIZE REVIEW TEMPLATE:
// ====================================
// Simply edit: instructions/review-code.md
// No need to modify extension code

console.log('AI Code Reviewer Extension - Simple Prompt Converter');
//    - Change analysis with line numbers
//    - Issue categorization (Critical/Warning/Info)
//    - Recommended fixes with code examples
//    - Unit test recommendations
//    - Security overview
//    - Summary and priority actions

// ====================================
// EXPECTED OUTPUT FORMAT (SAME FOR BOTH):
// ====================================
/*
# Code Review: filename

## 🔍 Code Changes Analysis

## Change 1: REMOVED - Data loading call
```typescript
174  changePage(paginator: PaginatorData) {
175    this.paramsData.pageIndex = paginator.pageIndex;
176    this.paramsData.pageSize = paginator.pageSize;
177-   this.getBillings(this.paramsData);
178  }
```

*** REVIEW COMMENT ***
- 🚨 **Issue Type**: Critical
- 📝 **Problem**: Removed getBillings() call breaks pagination functionality
- 💡 **Solution**: Restore the getBillings(this.paramsData) call
- 🎯 **Impact**: Users will see stale data

*** RECOMMENDED FIX ***
```typescript
changePage(paginator: PaginatorData) {
  this.paramsData.pageIndex = paginator.pageIndex;
  this.paramsData.pageSize = paginator.pageSize;
  this.getBillings(this.paramsData); // Restore this line
}
```

*** UNIT TEST RECOMMENDED ***
```typescript
it('should call getBillings when parameters change', () => {
  spyOn(component, 'getBillings');
  component.changePage({ pageIndex: 1, pageSize: 10 });
  expect(component.getBillings).toHaveBeenCalledWith(component.paramsData);
});
```

## 📊 Summary
- Total Issues Found: 3
- Critical: 2 | Warnings: 1
- Overall Code Quality: 4/10

## 🎯 Priority Actions
1. URGENT: Fix critical pagination issues
2. Address style warnings
3. Add comprehensive unit tests

## 🔒 SECURITY OVERVIEW
Security Risk Level: LOW
[Security analysis details...]
*/

// ====================================
// DIFFERENCES BETWEEN COMMANDS:
// ====================================
// @review-changes: Analyzes ONLY git diff changes (faster, focused)
// @review-file: Analyzes ENTIRE file content (comprehensive, slower)
// BOTH: Follow review-code.md template and produce identical format

console.log('AI Code Reviewer Extension - Ready for Testing');
console.log('Use   VS Code Chat');
