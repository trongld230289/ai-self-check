# 🤖 AI Self Check - VS Code Extension

[![Version](https://img.shields.io/badge/version-1.0.14-blue.svg)](https://github.com/trongld230289/ai-self-check)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![VS Code](https://img.shields.io/badge/VS%20Code-1.90.0+-purple.svg)](https://code.visualstudio.com/)

AI-powered code review extension with intelligent chat participants for automated code analysis and git change reviews.

## ✨ Features

### 🔍 **Intelligent Code Review**
- **📄 File Review**: Comprehensive analysis of entire code files
- **🔄 Git Changes Review**: Smart diff analysis for modified files
- **🤖 AI-Powered Analysis**: Advanced code quality, security, and performance insights

### 💬 **Chat Participants**
- **@review-file**: 📄 Review current opening file or 🔗 specify file path
- **@review-changes**: 🔄 Review changes for current opening file or 🔗 specify file path
- **@review-pr**: 🚀 Review Azure DevOps Pull Requests by URL or PR number

### 🛠️ **Context Menu Integration**
- Right-click any supported file → **Review File**
- Right-click any supported file → **Review Changes**

## 🚀 Quick Start

### Installation
1. Open VS Code
2. Go to Extensions (Ctrl+Shift+X)
3. Search for "AI Self Check"
4. Click Install

> **📝 First Run**: Templates will be automatically generated in `.vscode/extensions/ai-self-check/templates/` folder for customization.

### Usage

#### **Method 1: Chat Participants (Recommended)**
1. Open any code file
2. Open VS Code Chat (Ctrl+Shift+I)
3. Type `@review-file` + Enter → Reviews entire file automatically
4. Type `@review-changes` + Enter → Reviews git changes automatically
5. Type `@review-pr https://dev.azure.com/org/project/_git/repo/pullrequest/123` → Reviews Azure DevOps PR

#### **Azure DevOps PR Review Setup**
1. Open Command Palette (Ctrl+Shift+P)
2. Run "AI Self Check: Setup Azure DevOps Settings" 
3. Enter your Azure DevOps Personal Access Token
4. Configure organization, project, and repository
5. Use `@review-pr` with PR URL or PR number

#### **Method 2: Context Menu**
1. Right-click on any code file
2. Select "Review File" or "Review Changes"

#### **Method 3: Command Palette**
1. Open Command Palette (Ctrl+Shift+P)
2. Type "AI Self Check: Review File" or "AI Self Check: Review Changes"

## 📋 Supported File Types

- **TypeScript/JavaScript**: `.ts`, `.js`, `.tsx`, `.jsx`
- **Python**: `.py`
- **Java**: `.java`
- **C#**: `.cs`
- **C/C++**: `.cpp`, `.c`
- **PHP**: `.php`
- **Ruby**: `.rb`
- **Go**: `.go`
- **Rust**: `.rs`
- **Kotlin**: `.kt`
- **Swift**: `.swift`

## 🔧 Configuration

### 🎨 Template Customization
When you run the extension for the first time, it automatically generates default templates in:
- `.vscode/extensions/ai-self-check/templates/`

**Available Templates:**
- `review-file.md` - Controls file review output format
- `review-changes.md` - Controls git changes review output format

**After generation, you can:**
- ✏️ Edit templates to match your team's standards
- 🎯 Customize review criteria and scoring
- 🎨 Modify output formatting and structure
- 📝 Add company-specific guidelines

**Template Variables:**
- `{fileName}` - Current file name
- `{fileContent}` - File content
- `{gitDiff}` - Git changes diff
- Custom scoring logic and conditional recommendations

## 📊 What You Get

### 🔍 **File Review Analysis**
- **Code Quality**: Best practices, code smells, maintainability
- **Performance**: Optimization suggestions, bottleneck detection
- **Security**: Vulnerability scanning, security best practices
- **Architecture**: Design patterns, structure analysis
- **Testing**: Test coverage suggestions, unit test recommendations

### 🔄 **Git Changes Review**
- **Change Impact**: Analysis of modifications and their effects
- **Risk Assessment**: Potential issues with changes
- **Security Review**: Security implications of modifications
- **Performance Impact**: Performance considerations
- **Rollback Suggestions**: Safe rollback strategies

### 📈 **Scoring System**
- **Overall Score**: 1-10 rating with detailed breakdown
- **Category Ratings**: Individual scores for different aspects
- **Actionable Recommendations**: Specific improvement suggestions

## 🎯 Example Output

```markdown
# 🔍 Code Review: app.component.ts

## 📋 Analysis Summary
- **Code Quality**: ⭐⭐⭐⭐⭐ (5/5)
- **Security**: ⭐⭐⭐⭐ (4/5)
- **Performance**: ⭐⭐⭐⭐⭐ (5/5)
- **Overall Score**: 9.2/10

## 🚨 Issues Found
1. **Warning**: Unused import detected
2. **Info**: Consider adding error handling

## 💡 Recommendations
- Remove unused imports to reduce bundle size
- Add try-catch blocks for async operations
```

## 🔄 Version History

### v1.0.14 (Current)
- 🚀 **Enhanced Azure DevOps PR Review**: Smart diff parsing that filters formatting/whitespace noise
- 🎨 **Theme-Appropriate Icons**: PR review participant now has light/dark theme icons
- 📊 **Real Change Statistics**: Accurate line counting with semantic analysis (shows real vs total changes)
- 🔧 **Improved Connectivity**: Better error handling and retry logic for Azure DevOps API
- 📋 **Enhanced Templates**: Updated PR review templates with structured analysis
- 🛠️ **Better Fallbacks**: Improved mock data and error recovery for demo purposes

### v1.0.13
- 🔄 **Template System Refactoring**: Unified template loading with combined common + specific templates
- 🎯 **Enhanced Model Fallback**: Improved quota limit detection and automatic model switching
- 🛠️ **Code Modularization**: Extracted review-PR functionality to external scripts for better maintainability
- ⚡ **Performance**: Reduced main extension size and eliminated duplicate template loading code
- 🔧 **Error Handling**: Better messaging when AI models hit quota limits or become unavailable

### v1.0.11
- 🌍 **Internationalization**: Fixed Vietnamese text with full English support
- 🚀 **Azure DevOps PR Review**: Added @review-pr chat participant for Pull Request analysis
- 📁 **File Detection**: Fixed issue showing folders instead of actual changed files
- 🔧 **API Optimization**: Simplified Azure DevOps integration for better reliability
- ✅ **Real Data**: Successfully fetching real Azure DevOps PR data instead of mock data
- 🎯 **Accuracy**: Now correctly shows actual changed files from PRs
- 📊 **Performance**: Streamlined API calls for faster operation

### v1.0.10
- Code cleanup and optimization - 44% file size reduction
- Template-driven instruction system for better maintainability
- Consolidated review instructions into template files
- Improved user customization capabilities
- Better separation of concerns between code and templates

### v1.0.9
- Enhanced template formatting and conditional recommendations
- Improved visual highlighting for approval status
- Optimized AI review output formatting
- Better error handling and user feedback mechanisms
- Fixed template rendering issues for review comment sections

### v1.0.8
- Updated command naming from `aiCodeReviewer.*` to `aiSelfCheck.*`
- Fixed right-click context menu functionality
- Improved extension consistency and branding
- ✨ Enhanced chat participant descriptions with icons
- 🔧 Improved auto-detection for current files
- 📄 Updated documentation and README
- 🐛 Bug fixes and performance improvements

### v1.0.3
- 🆕 Added sticky chat participants
- 🔄 Improved git changes detection
- 🎨 Enhanced UI/UX

### v1.0.2
- 🔧 Added Azure DevOps integration
- 📊 Enhanced scoring system
- 🛡️ Improved security analysis

### v1.0.1
- 🐛 Initial bug fixes
- 📝 Documentation improvements

### v1.0.0
- 🎉 Initial release
- 🔍 Basic file and changes review
- 💬 Chat participants implementation

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/trongld230289/ai-self-check/issues)
- **Email**: trongld232@gmail.com
- **Repository**: [GitHub](https://github.com/trongld230289/ai-self-check)

## 📜 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- VS Code Extension API
- AI/ML integration for intelligent code analysis
- Community feedback and contributions

---

Made with ❤️ by [Trong Le](https://github.com/trongld230289)

**Keywords**: AI, Code Review, VS Code Extension, Chat Participants, Git Analysis, TypeScript, JavaScript, Security Analysis, Performance Review
