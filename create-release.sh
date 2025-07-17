#!/bin/bash

# Claude Config Manager Extension - GitHub Release Creation Script
# This script helps create a GitHub release with the VSIX file

set -e

VERSION=$(node -p "require('./package.json').version")
EXTENSION_NAME="claude-config-manager"
VSIX_FILE="${EXTENSION_NAME}-${VERSION}.vsix"
TAG_NAME="v${VERSION}"
RELEASE_TITLE="Claude Config Manager v${VERSION}"

echo "🚀 Creating GitHub Release for ${RELEASE_TITLE}"
echo "=================================================="

# Check if VSIX file exists
if [ ! -f "${VSIX_FILE}" ]; then
    echo "❌ VSIX file not found: ${VSIX_FILE}"
    echo "💡 Run './package.sh' first to create the VSIX file"
    exit 1
fi

echo "✅ VSIX file found: ${VSIX_FILE}"

# Check if we're in a git repository
if [ ! -d ".git" ]; then
    echo "❌ Not in a git repository"
    exit 1
fi

# Check for uncommitted changes
if [ -n "$(git status --porcelain)" ]; then
    echo "⚠️  Warning: You have uncommitted changes"
    echo "📝 Consider committing them before creating a release"
fi

# Create release notes
RELEASE_NOTES=$(cat <<EOF
# Claude Config Manager v${VERSION}

A VSCode extension that manages CLAUDE.md files across projects with automatic GitHub repository synchronization.

## 🆕 Features

- **Repository Management**: Initialize and sync with GitHub repository for centralized CLAUDE.md storage
- **Organized Structure**: Creates individual project folders (\`ProjectName/CLAUDE.md\`) for clean organization  
- **Template System**: Create CLAUDE.md files from predefined templates (Basic, Web Development, Data Science)
- **Auto-Sync**: Automatically sync CLAUDE.md changes to repository with auto-commit
- **File Watching**: Monitor CLAUDE.md files for changes and sync automatically
- **Status Tracking**: Status bar indicator showing sync status

## 📦 Installation

### Option 1: Install from VSIX (Recommended)
1. Download \`${VSIX_FILE}\` from this release
2. Open VSCode
3. Go to Extensions view (\`Ctrl+Shift+X\` or \`Cmd+Shift+X\`)
4. Click the \`...\` menu → \`Install from VSIX...\`
5. Select the downloaded \`.vsix\` file

### Option 2: Command Line Installation
\`\`\`bash
code --install-extension ${VSIX_FILE}
\`\`\`

## 🔧 Quick Start

1. Install the extension
2. Open a workspace folder in VSCode
3. Press \`Ctrl+Shift+P\` and run \`Claude Config: Initialize Config Repository\`
4. Run \`Claude Config: Create from Template\` to create your first CLAUDE.md
5. Start coding - the extension will automatically sync changes!

## 📋 Commands

- \`Claude Config: Initialize Config Repository\` - Setup GitHub repository
- \`Claude Config: Sync to Repository\` - Manual sync to repository  
- \`Claude Config: Create from Template\` - Create from predefined templates
- \`Claude Config: Edit CLAUDE.md\` - Open CLAUDE.md in editor

## 🛠️ Technical Details

- **Package Size**: $(du -h "${VSIX_FILE}" | cut -f1)
- **VS Code Version**: 1.74.0+
- **Node.js**: 16.x+ (for development)
- **Git**: Required for repository operations

## 📞 Support

- **Issues**: [Report bugs](https://github.com/prgazevedo/VersionPlanExtension/issues)
- **Source**: [View source code](https://github.com/prgazevedo/VersionPlanExtension)
- **Documentation**: [README](https://github.com/prgazevedo/VersionPlanExtension/blob/main/README.md)
EOF
)

echo "📄 Release Notes:"
echo "${RELEASE_NOTES}"
echo ""
echo "🎯 Next Steps:"
echo "1. Push your changes: git push origin main"
echo "2. Go to: https://github.com/prgazevedo/VersionPlanExtension/releases/new"
echo "3. Fill in the release form:"
echo "   - Tag: ${TAG_NAME}"
echo "   - Title: ${RELEASE_TITLE}"
echo "   - Description: (copy the release notes above)"
echo "   - Upload: ${VSIX_FILE}"
echo "4. Click 'Publish release'"
echo ""
echo "💡 Or install GitHub CLI and use: gh release create ${TAG_NAME} ${VSIX_FILE} --title '${RELEASE_TITLE}' --notes-file <(echo '${RELEASE_NOTES}')"