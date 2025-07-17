#!/bin/bash

# Claude Config Manager Extension - Packaging Script
# This script automates the build and packaging process for the VSCode extension

set -e  # Exit on any error

echo "🔧 Claude Config Manager - Packaging Script"
echo "============================================="

# Get the current version from package.json
VERSION=$(node -p "require('./package.json').version")
EXTENSION_NAME="claude-config-manager"
VSIX_FILE="${EXTENSION_NAME}-${VERSION}.vsix"

echo "📦 Packaging version: ${VERSION}"

# Clean previous builds
echo "🧹 Cleaning previous builds..."
rm -rf out/
rm -f *.vsix

# Install dependencies
echo "📥 Installing dependencies..."
npm install

# Compile TypeScript
echo "🔨 Compiling TypeScript..."
npm run compile

# Run linter (non-blocking)
echo "🔍 Running linter..."
if npm run lint; then
    echo "✅ Linting passed"
else
    echo "⚠️  Linting warnings found (proceeding anyway)"
fi

# Package with VSCE
echo "📦 Packaging extension with VSCE..."
vsce package

# Verify package was created
if [ -f "${VSIX_FILE}" ]; then
    echo "✅ Package created successfully: ${VSIX_FILE}"
    echo "📊 Package size: $(du -h "${VSIX_FILE}" | cut -f1)"
    
    # Optional: Test local installation (uncomment if needed)
    # echo "🧪 Testing local installation..."
    # code --install-extension "./${VSIX_FILE}"
    
    # Optional: Commit to git repository (set COMMIT_VSIX=true to enable)
    if [ "${COMMIT_VSIX}" = "true" ]; then
        git add "${VSIX_FILE}"
        git commit -m "Package extension v${VERSION} - ${VSIX_FILE}"
        echo "✅ Committed to git repository"
    else
        echo "⏭️  Skipping git commit (set COMMIT_VSIX=true to enable)"
    fi
    
    echo ""
    echo "🎉 Packaging completed successfully!"
    echo "📁 Extension package: ${VSIX_FILE}"
    echo "📋 To install locally: code --install-extension ${VSIX_FILE}"
    echo "🔗 To distribute: Upload ${VSIX_FILE} to GitHub releases"
    
else
    echo "❌ Package creation failed"
    exit 1
fi