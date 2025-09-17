# Extension Icon Requirements

## VS Code Extension Icon Specifications:
- **Format**: PNG only (SVG not supported for main extension icon)
- **Size**: 128x128 pixels (recommended)
- **File name**: Can be any name (e.g., `extension-icon.png`, `icon.png`)
- **Location**: In extension root folder

## Current Setup:
- Chat participant icons: `icon-new.svg` ✅ (SVG OK for chat)
- Extension main icon: **MISSING** ❌ (needs PNG)

## To Fix:
1. Convert existing SVG to PNG (128x128)
2. Add to package.json: `"icon": "extension-icon.png"`
3. Package and install

## Tools to Convert SVG to PNG:
- Online: svgtopng.com, convertio.co
- VS Code extension: SVG Viewer
- Command line: ImageMagick, Inkscape
