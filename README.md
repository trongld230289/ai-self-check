# AI Self Check

[![Version](https://img.shields.io/badge/version-1.0.1-blue.svg)](https://github.com/trongld230289/ai-self-check)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![VS Code](https://img.shields.io/badge/VS%20Code-1.90.0+-green.svg)](https://code.visualstudio.com/)

AI-powered code review extension for VS Code with intelligent chat participants and multiple AI model support.

## ✨ Features

- 🤖 **@review-file**: Comprehensive AI analysis of current file
- 📝 **@review-changes**: Smart review of git changes with detailed feedback  
- 🧠 **Multiple AI Models**: Supports Claude, GPT-4, and intelligent fallback
- 📊 **Smart Analysis**: Language-specific code analysis (TypeScript, JavaScript, Python, etc.)
- ⚡ **Real-time Streaming**: Live AI responses with markdown formatting
- 🎯 **Template-based**: Consistent review format with best practices

## 🚀 Quick Start

### Installation

1. **From VS Code Marketplace** (Recommended)
   - Open VS Code Extensions (`Ctrl+Shift+X`)
   - Search for "AI Self Check"
   - Click "Install"

2. **From VSIX Package**
   ```bash
   code --install-extension ai-self-check-1.0.1.vsix
   ```

3. **From Source**
   ```bash
   git clone https://github.com/trongld230289/ai-self-check.git
   cd ai-self-check
   npm install
   code --install-extension .
   ```

## 📖 Usage

### Review Current File
Open VS Code Chat (`Ctrl+Shift+I`) and type:
```
@review-file
```

### Review Git Changes
```
@review-changes
```

## 🎯 Example Output

### File Review
```markdown
# 📄 Code Review Analysis

## 📊 Overview
- **File:** src/components/UserProfile.tsx
- **Type:** TypeScript React Component
- **Lines:** 156

## ✅ Strengths
- Clean component structure
- Proper TypeScript types
- Good error handling

## ⚠️ Improvements
- Consider memoization for expensive calculations
- Add prop validation
- Extract custom hooks

## 🎯 Recommendations
- Use React.memo() for performance
- Add comprehensive unit tests
```
```
## 🔧 Configuration

Open VS Code Settings (`Ctrl+,`) and search for "AI Self Check":

- **Azure DevOps Token**: Personal access token for PR reviews
- **Organization**: Default Azure DevOps organization  
- **Default Project**: Default project name

## 🎨 Supported Languages

- TypeScript/JavaScript (`.ts`, `.js`, `.tsx`, `.jsx`)
- Python (`.py`)
- Java (`.java`)
- C# (`.cs`)
- C/C++ (`.c`, `.cpp`)
- PHP (`.php`)
- Ruby (`.rb`)
- Go (`.go`)
- Rust (`.rs`)
- Kotlin (`.kt`)
- Swift (`.swift`)

## 🛠️ Development

### Building from Source
```bash
# Clone repository
git clone https://github.com/trongld230289/ai-self-check.git
cd ai-self-check

# Install dependencies
npm install

# Package extension
npx @vscode/vsce package

# Install locally
code --install-extension ai-self-check-1.0.1.vsix
```

### Testing
```bash
npm test
```

## 📋 Requirements

- **VS Code**: Version 1.90.0 or higher
- **AI Models**: Claude, GPT-4, or compatible models available in VS Code
- **Git**: For change detection and diff analysis

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 👨‍💻 Author

**Trong Le**
- GitHub: [@trongld230289](https://github.com/trongld230289)
- Email: trongld232@gmail.com

## 🙏 Acknowledgments

- VS Code team for the excellent extension API
- OpenAI and Anthropic for AI model capabilities
- The open source community for inspiration

## 📊 Stats

![GitHub stars](https://img.shields.io/github/stars/trongld230289/ai-self-check?style=social)
![GitHub forks](https://img.shields.io/github/forks/trongld230289/ai-self-check?style=social)
![GitHub issues](https://img.shields.io/github/issues/trongld230289/ai-self-check)

---

⭐ **Star this repo if you find it helpful!** ⭐
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
