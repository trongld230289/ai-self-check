# Changelog

All notable changes to the "ai-self-check" extension will be documented in this file.

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
