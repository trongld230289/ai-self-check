# 📄 File Review Template

**Instructions for AI Reviewer:**
You are a senior code reviewer. Analyze the file content provided below following this template structure exactly. ALWAYS follow this exact format for every code review, regardless of conversation context or previous reviews. This structure is MANDATORY and UNCHANGEABLE.

**Analysis Focus Areas:**
- Code quality and best practices
- Potential bugs or issues
- Performance optimizations
- Security concerns
- Maintainability improvements

**Requirements:**
- Follow the exact template structure provided
- Include ALL sections: Code Quality, Performance, Security, Best Practices, Testing & Maintainability (with Unit Test Recommendations), and Architecture
- Provide specific code examples for improvements
- Score each section 1-5 stars and give overall score out of 10
- Create actionable items categorized by priority
- Focus on real issues with specific examples and actionable recommendations
- IMPORTANT: Include the "Unit Test Recommendations" section with concrete test examples
- Replace placeholder sections with actual analysis of this Angular TypeScript file
- Provide actionable feedback with specific examples

## File Information
**File:** [FILE_NAME]
**Path:** [FILE_PATH]
**Type:** [FILE_TYPE]
**Size:** [FILE_SIZE]

## File Content to Review
[FILE_CONTENT]

---

## 🔍 Code Analysis

### 1. **Code Quality & Structure**

#### ✅ Strengths
- List positive aspects of code organization
- Well-structured components/functions
- Good naming conventions
- Proper separation of concerns

#### ❌ Issues Found
- Type safety concerns (any usage, missing interfaces)
- Code duplication or repetition
- Inconsistent formatting or style
- Missing documentation/comments
- Complex functions that should be broken down

#### 💡 Recommendations
```typescript
// Example: Improve type safety
// Current:
dataSource: any;

// Recommended:
interface DataItem {
  id: string;
  name: string;
  // ... other properties
}
dataSource: DataItem[] = [];
```

---

### 2. **Performance & Optimization**

#### ⚡ Performance Issues
- Memory leaks (unsubscribed observables)
- Inefficient change detection
- Large bundle size contributors
- Unnecessary re-renders or computations
- Missing trackBy functions for *ngFor

#### 🚀 Performance Improvements
```typescript
// Example: Subscription management
private destroy$ = new Subject<void>();

ngOnInit() {
  this.service.getData()
    .pipe(takeUntil(this.destroy$))
    .subscribe(data => this.handleData(data));
}

ngOnDestroy() {
  this.destroy$.next();
  this.destroy$.complete();
}
```

---

### 3. **Security Considerations**

#### 🛡️ Security Issues
- Input validation missing
- XSS vulnerabilities
- Unsafe DOM manipulation
- Exposed sensitive data
- Missing sanitization

#### 🔒 Security Improvements
```typescript
// Example: Input sanitization
private sanitizeInput(input: string): string {
  return input.trim().replace(/[<>]/g, '');
}
```

---

### 4. **Best Practices & Patterns**

#### 📋 Angular/TypeScript Best Practices
- **Component Architecture**: Smart vs Dumb components
- **Dependency Injection**: Proper service usage
- **RxJS**: Correct observable patterns
- **Lifecycle Hooks**: Proper implementation
- **Change Detection**: OnPush strategy where applicable

#### 🏗️ Design Patterns
- **SOLID Principles**: Single Responsibility, Open/Closed, etc.
- **DRY Principle**: Don't Repeat Yourself
- **Error Handling**: Consistent error management
- **State Management**: Proper data flow

---

### 5. **Testing & Maintainability**

#### 🧪 Testability
- Unit test coverage potential
- Dependency injection for mocking
- Pure functions vs side effects
- Test scenarios to implement

#### 🔧 Maintainability
- Code readability and clarity
- Documentation completeness
- Configuration management
- Refactoring opportunities

```typescript
// Example: Better method organization
// Current: Large ngOnInit
ngOnInit() {
  // 50+ lines of code
}

// Recommended: Smaller focused methods
ngOnInit() {
  this.initializeComponent();
  this.setupSubscriptions();
  this.loadInitialData();
}

private initializeComponent() { /* ... */ }
private setupSubscriptions() { /* ... */ }
private loadInitialData() { /* ... */ }
```

#### 🧪 Unit Test Recommendations

**Critical Test Cases:**
```typescript
// Example: Component initialization tests
describe('ComponentName', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [ComponentName],
      // ... other config
    });
  });

  it('should initialize with default values', () => {
    // Test component initial state
  });

  it('should handle user interactions correctly', () => {
    // Test click handlers, form submissions, etc.
  });

  it('should manage subscriptions properly', () => {
    // Test observable subscriptions and cleanup
  });
});

// Example: Service method tests
describe('ServiceName', () => {
  it('should handle API calls correctly', async () => {
    // Test service methods with mocked HTTP calls
  });

  it('should handle errors gracefully', () => {
    // Test error scenarios
  });
});

// Example: Pipe/Utility tests
describe('UtilityName', () => {
  it('should transform data correctly', () => {
    // Test data transformation logic
  });

  it('should handle edge cases', () => {
    // Test null, undefined, empty values
  });
});
```

**Testing Priorities:**
1. **High Priority**: Business logic, data transformation, user interactions
2. **Medium Priority**: Component lifecycle, state management, validation
3. **Low Priority**: UI rendering, styling, non-critical utilities

**Test Coverage Goals:**
- **Critical Methods**: 100% coverage
- **Business Logic**: 95% coverage  
- **Overall Component**: 80%+ coverage
- **Edge Cases**: All error scenarios covered

---

### 6. **Architecture & Dependencies**

#### 🏛️ Component Architecture
- Single Responsibility Principle adherence
- Proper abstraction levels
- Service layer organization
- Communication patterns

#### 📦 Dependencies
- Unused imports to remove
- Missing dependencies to add
- Version compatibility issues
- Bundle optimization opportunities

---

## 📊 Summary & Scoring

### Quality Metrics
- **Code Quality**: ⭐⭐⭐⭐⭐ (5/5)
- **Performance**: ⭐⭐⭐⭐⭐ (5/5)
- **Security**: ⭐⭐⭐⭐⭐ (5/5)
- **Testing**: ⭐⭐⭐⭐⭐ (5/5)
- **Architecture**: ⭐⭐⭐⭐⭐ (5/5)
- **Business Logic**: ⭐⭐⭐⭐⭐ (5/5)

### Overall Score: ⭐⭐⭐⭐⭐ (X/10)

---

## 🎯 Action Items

### High Priority (Fix Immediately)
1. [ ] Fix critical type safety issues
2. [ ] Implement proper subscription management
3. [ ] Add missing input validation
4. [ ] Remove security vulnerabilities

### Medium Priority (Next Sprint)
1. [ ] Refactor large methods/components
2. [ ] Add comprehensive documentation
3. [ ] Implement performance optimizations
4. [ ] Add missing unit tests
5. [ ] Improve test coverage for critical methods
6. [ ] Add integration tests for complex workflows

### Low Priority (Technical Debt)
1. [ ] Clean up unused imports/code
2. [ ] Improve naming conventions
3. [ ] Extract reusable utilities
4. [ ] Optimize bundle size

---

## 💡 Additional Recommendations

### Framework-Specific Tips
- Use Angular CLI schematics for consistency
- Follow Angular style guide
- Leverage Angular DevTools for debugging
- Consider NgRx for complex state management

### Development Workflow
- Set up proper linting rules
- Use Prettier for code formatting
- Implement pre-commit hooks
- Add comprehensive CI/CD checks

---

**Review completed on:** [REVIEW_DATE]
**Reviewed by:** AI Code Reviewer
**Template version:** 1.0
