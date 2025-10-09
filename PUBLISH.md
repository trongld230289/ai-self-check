# AI Self Check Extension - Package & Publish Guide

## 📦 Packaging Steps

### 1. Install VSCE (VS Code Extension Manager)
```bash
npm install -g @vscode/vsce
```

### 2. Package the Extension
```bash
cd "d:\Project\FREELANCER\Shippo-Web-2025\.vscode\extensions\ai-self-check"
vsce package
```

### 3. Publish to VS Code Marketplace
```bash
vsce publish
```

## 🔑 Prerequisites

### Personal Access Token (PAT)
1. Go to https://dev.azure.com/
2. Click on "User settings" → "Personal access tokens"
3. Create new token with these scopes:
   - **Marketplace: Manage**
   - **Marketplace: Publish**

### Login to VSCE
```bash
vsce login trongld232
```
Enter your PAT when prompted.

## 📋 Pre-publish Checklist

- ✅ Version updated to 1.0.20
- ✅ README.md created with comprehensive documentation
- ✅ Chat participants configured with icons
- ✅ Package.json properly configured
- ✅ Extension.js implementation ready
- ✅ All features tested

## 🚀 Quick Commands

```bash
# Navigate to extension directory
cd "d:\Project\FREELANCER\Shippo-Web-2025\.vscode\extensions\ai-self-check"

# Package
vsce package

# Publish
vsce publish

# Or package and publish in one step
vsce publish --packagePath ./ai-self-check-1.0.20.vsix
```

## 📊 Post-publish

After publishing, your extension will be available at:
- **Marketplace**: https://marketplace.visualstudio.com/items?itemName=trongld232.ai-self-check
- **Install Command**: `ext install trongld232.ai-self-check`

## 🔄 Version Management

For future updates:
```bash
# Patch version (1.0.20 → 1.0.21)
vsce publish patch

# Minor version (1.0.20 → 1.1.0)
vsce publish minor

# Major version (1.0.20 → 2.0.0)  
vsce publish major
```

---

**Ready to publish! 🎉**