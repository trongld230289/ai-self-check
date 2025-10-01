# Changelog

All notable changes to the "ai-self-check" extension will be documented in this file.

## [1.0.16] - 2025-09-30

### 🌐 Localization
- Updated all Vietnamese text to English throughout the extension for better international accessibility
- Improved user interface consistency with English-only messaging

### 📊 Enhanced Templates  
- Updated review templates with consistent strict mode approach
- Added line number traceability in code review templates for easier debugging
- Enhanced diff display with syntax highlighting and better formatting

### 🔧 Bug Fixes
- Fixed model detection issues in PR review functionality (@review-pr command)
- Corrected parameter passing in getUnifiedModel function calls
- Improved error handling and user feedback consistency

### 🧹 Code Cleanup
- Removed deprecated review-common.md template and related logic
- Simplified template generation process for better maintainability
- Enhanced template consistency across all review types

## [1.0.15] - 2025-09-26

### 🚀 Added
- Enhanced control over Summary of Changes, Final Diff, and Files Changed Summary sections
- Improved PR review flexibility with toggle controls for detailed diff information

### 🔧 Fixed
- Fine-tuned PR review output display with conditional section rendering
- Better control over diff content visibility in Azure DevOps PR reviews

### 📈 Improved
- PR review template customization with global toggle variables
- User control over detailed diff section display
- Streamlined review output for focused analysis

### 🎨 Changed
- Updated review-pr.js with configurable section display controls
- Enhanced PR review workflow with selective content visibility

## [1.0.14] - 2025-09-25

### 🚀 Added
- Enhanced Azure DevOps PR review functionality with smart diff parsing
- Real-time change statistics with semantic analysis (filters formatting noise)
- Improved PR review templates and comprehensive analysis
- Better connection handling and retry logic for Azure DevOps API
- Theme-appropriate PR review icons (light/dark variants)

### 🔧 Fixed
- Code change detection and line counting precision
- Extension stability improvements and error recovery
- Connection timeout issues with corporate networks

### 📈 Improved
- PR review response templates with detailed analysis
- Code quality assessment accuracy
- User experience with better error messages and fallbacks
- Performance optimizations for large diffs

### 🎨 Changed
- Updated PR review participant icon with theme support
- Enhanced diff display with filtered real changes
- Improved change summary calculations
- Better mock data fallback for demo purposes

## [1.0.13] - 2025-09-25

### Current Release
- 🎯 **Current Version**: Reverted to stable version 1.0.13
- 📋 **Template Enhancements**: Improved review template consistency and output formatting
- 🔧 **Bug Fixes**: Fixed recommendation formatting and template logic improvements
- � **Smart Recommendations**: Enhanced conditional logic for better recommendation accuracy
- 🛠️ **Maintainability**: Reduced code complexity by consolidating common AI execution logic
- ⚡ **Performance**: Streamlined fallback logic and error handling for better reliability

### Technical
- Unified AI execution reduces ~200 lines of duplicate code
- Consistent error handling and fallback logic across all functions
- Single source of truth for token counting and cost estimation

## [1.0.14] - 2025-09-24

### Added
- 📊 **Token Counting & Cost Estimation**: Real-time display of input/output token usage and estimated costs
- 💰 **Cost Transparency**: Shows estimated costs for different AI models (Claude, GPT-4, Gemini)
- 🎯 **Template Optimization**: Helps users optimize templates by showing token impact
- 📈 **Usage Analytics**: Detailed breakdown of token consumption for better cost management

### Improved
- 🔍 **Smart Cost Calculation**: Accurate pricing for Claude 3.5 Sonnet, GPT-4o, GPT-4o-mini, and Gemini models
- 📱 **User Experience**: Clear display of costs before and after AI requests
- 🏗️ **Performance Monitoring**: Real-time token tracking during streaming responses

## [1.0.13] - 2025-09-24

### Improved
- 📁 **Icon Organization**: Moved all extension icons to dedicated `icons/` folder for better organization
- 🔧 **Path Management**: Updated all icon references in package.json and extension.js to use new folder structure
- 🏗️ **Code Structure**: Improved extension file organization and maintainability

## [1.0.12] - 2025-09-22

### Added
- 🔄 **Template System Refactoring**: Unified template loading with combined common + specific templates
- 🎯 **Enhanced Model Fallback**: Improved quota limit detection and automatic model switching with clear messaging
- 🛠️ **Code Modularization**: Extracted review-PR functionality to external scripts (scripts/review-pr.js)
- ⚡ **Performance Optimization**: Reduced main extension.js from 2729 to ~1900 lines

### Improved
- 🔧 **Error Handling**: Better user messaging when AI models hit quota limits or become unavailable
- 📝 **Template Management**: Templates now auto-combine common requirements with specific templates
- 🏗️ **Architecture**: Cleaner separation of concerns with modular script organization
- 🚀 **Maintainability**: Eliminated duplicate template loading code using DRY principles

## [1.0.11] - 2025-09-17

### Fixed
- 🌍 **Internationalization**: Replaced Vietnamese text with English in diff display
- 🚀 **Azure DevOps PR Review**: Simplified and stabilized PR analysis approach
- 📁 **File Detection**: Fixed issue where folders were shown instead of actual changed files
- 🔧 **API Optimization**: Reverted to simple Azure DevOps Iterations API for better reliability

### Enhanced
- ✅ **Real Data**: Successfully fetching real Azure DevOps PR data instead of mock data
- 🎯 **Accuracy**: Now correctly shows 4 actual changed files instead of 17 directories
- 🌐 **Consistency**: Full English language support throughout the extension
- 📊 **Performance**: Removed complex fallback approaches for faster and more reliable operation

## [1.0.10] - 2025-09-16

### Optimized
- Code cleanup and file size reduction by 44% (145KB → 81KB)
- Template-driven instruction system for better maintainability
- Consolidated review instructions from hardcoded text to template files
- Improved separation of concerns between extension logic and review templates

### Enhanced
- Better user customization through centralized template instructions
- Simplified codebase with template references instead of inline text
- More maintainable architecture for future updates

## [1.0.9] - 2025-09-16

### Enhanced
- Improved template formatting with better visual highlighting for approval status
- Enhanced conditional recommendations based on internal scoring
- Optimized review output formatting with stronger visual cues
- Better error handling and user feedback mechanisms

### Fixed
- Template rendering issues for review comment sections
- Improved consistency in AI review output formatting

## [1.0.8] - 2025-09-16

### Changed
- Updated command naming from `aiCodeReviewer.*` to `aiSelfCheck.*` for consistency
- Fixed right-click context menu functionality in editor and explorer
- Improved extension branding and command registration
- Updated all documentation to reflect version 1.0.8

### Fixed
- Right-click "Review File" and "Review Changes" commands now work properly
- Extension version display consistency across VS Code UI

## [1.0.2] - 2025-09-15

### Changed
- Updated package version for marketplace compatibility
- Improved extension metadata and publishing configuration

## [1.0.1] - 2025-09-15

### Added
- Initial release of AI Self Check extension
- `@review-file` chat participant for comprehensive file analysis
- `@review-changes` chat participant for git diff reviews
- Multiple AI model support (Claude, GPT-4) with intelligent fallback
- Real-time streaming responses with markdown formatting
- Template-based review system for consistent output
- Language-specific analysis for TypeScript, JavaScript, Python, and more
- Azure DevOps integration (disabled by default)
- Smart error handling and model selection
- Comprehensive documentation and examples

### Features
- Chat-based interface integrated with VS Code
- Support for 11+ programming languages
- Git integration for change detection
- Configurable settings through VS Code preferences
- Professional markdown output with structured analysis
- Template system for customizable review guidelines

### Technical
- Built on VS Code Extension API
- Uses VS Code Language Model API
- Streaming response support
- Robust error handling and fallback mechanisms
- Clean separation of concerns with modular functions

## [Unreleased]

### Planned
- Additional language support
- Custom template editor
- Integration with more AI providers
- Team review templates
- Advanced diff analysis
- Performance optimizations
