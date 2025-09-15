# AI Code Reviewer Extension - Simple Prompt Converter

## Overview
This extension provides a simple way to convert custom chat commands into standardized review prompts for GitHub Copilot.

## How It Works
- **Input**: Custom chat commands (`@review-file` or `@review-changes`)
- **Output**: Standardized prompts that reference your `review-code.md` template
- **Analysis**: GitHub Copilot handles all the actual code review using your template

## Commands

### @review-file
Reviews the entire file based on your review guidelines.

**Usage:**
```
@review-file src/path/to/your/file.ts
```

**Output:**
```
review-file src/path/to/your/file.ts based on review-code.md
```

### @review-changes  
Reviews only git changes in the specified file.

**Usage:**
```
@review-changes src/path/to/your/file.ts
```

**Output:**
```
review-changes src/path/to/your/file.ts based on review-code.md
```

## Benefits

✅ **No Hard-Coding**: Extension doesn't contain any analysis logic  
✅ **Fully Customizable**: Edit `instructions/review-code.md` to customize reviews  
✅ **Consistent Results**: Both commands follow the same template format  
✅ **Simple**: Just converts commands to prompts, Copilot does the work  

## Setup

1. Edit `instructions/review-code.md` with your review guidelines
2. Use `@review-file` or `@review-changes` in VS Code Chat
3. Copy the generated prompt to a new chat for detailed review

## Example Workflow

1. Type: `@review-changes src/billing-list.component.ts`
2. Extension shows: `review-changes src/billing-list.component.ts based on review-code.md`
3. Copy prompt to new chat
4. Get consistent review results based on your template

## Customization

To customize reviews, simply edit:
- `instructions/review-code.md` - Your review template and guidelines

No need to modify extension code!
