# Claude Config Manager

A comprehensive VSCode extension for Claude Code workflows, featuring CLAUDE.md configuration management, conversation history browsing, intelligent project planning with Git integration, ccusage-powered usage tracking, and WebDAV cloud synchronization.

## Features

### 📊 ccusage-Powered Usage Tracking
- Real-time token usage and costs powered by [ccusage](https://github.com/ryoppippi/ccusage)
- Detailed breakdown: input, output, cache creation, and cache read tokens
- Automatic model detection (Opus, Sonnet, Haiku)
- Smart package manager fallback (bunx → npx → npm exec)

### ☁️ Conversation Sync (WebDAV) - v3.4.0 Enhanced!
- Sync conversations to your own Nextcloud, ownCloud, or WebDAV server
- **Smart sync with hash-based change detection** (prevents unnecessary uploads)
- **Resume capability** for interrupted sync sessions
- **Optimized batch operations** for reduced server load
- Optional AES-256-GCM encryption for sensitive data
- Cross-device usage statistics aggregation
- Full control over your data location

### 📚 Conversation History Browser
- Browse and search Claude Code conversation history
- Project-organized tree view with rich webview interface
- Export to Markdown, JSON, or plain text
- Advanced search with highlighting and keyboard shortcuts

### 🔧 CLAUDE.md & PROJECT_PLAN Management
- Automatic PROJECT_PLAN.md integration with CLAUDE.md
- Git sync for team-sharable configuration
- Auto-sync with file watching
- Plan mode session persistence

## Overview

Claude Config Manager is a comprehensive workflow extension for Claude Code users. It provides accurate usage tracking through ccusage integration, enables secure conversation synchronization to your own cloud storage, offers a powerful conversation history browser, and manages CLAUDE.md configuration files with automatic Git integration. All features work together to create a seamless Claude Code development experience while maintaining full privacy and control over your data.

## Installation

### Prerequisites

For full usage tracking functionality, install one of:
- **Bun** (recommended): `curl -fsSL https://bun.sh/install | bash` 
- **Node.js**: Download from [nodejs.org](https://nodejs.org)
- **Bun VS Code Extension**: Search for "Bun for Visual Studio Code" in Extensions

### Option 1: Install from VSIX (Recommended)

1. Download the latest `claude-config-manager-X.X.X.vsix` file from the [releases page](https://github.com/prgazevedo/VersionPlanExtension/releases)
2. Open VSCode
3. Go to Extensions view (`Ctrl+Shift+X` or `Cmd+Shift+X`)
4. Click the `...` menu → `Install from VSIX...`
5. Select the downloaded `.vsix` file

### Option 2: Install from Source

1. Clone the repository:
   ```bash
   git clone https://github.com/prgazevedo/VersionPlanExtension.git
   cd VersionPlanExtension
   ```

2. Install dependencies and compile:
   ```bash
   npm install
   npm run compile
   ```

3. Package the extension:
   ```bash
   npm install -g vsce
   vsce package
   ```

4. Install the generated `.vsix` file:
   ```bash
   code --install-extension claude-config-manager-X.X.X.vsix
   ```

## Quick Start

### Basic Setup
1. **Install the extension** (see installation instructions above)
2. **Click the "C" icon** in the activity bar to access dual sidebar views
3. **Open a workspace folder** for full CLAUDE.md management features (Git repository recommended)

### CLAUDE.md Workflow
1. **Create your CLAUDE.md**: Create your CLAUDE.md file in the workspace root
2. **Enable PROJECT_PLAN**: If CLAUDE.md is detected, accept the prompt to create PROJECT_PLAN.md
3. **Sync to Git**: Use the sync button or enable auto-sync to commit team-sharable configuration

### Conversation History
1. **Browse conversations**: Click on the "Conversations" tree view in the sidebar (works without a workspace!)
2. **View conversations**: Double-click any conversation to open in rich webview
3. **Export conversations**: Right-click conversations for export options
4. **Search conversations**: Use the built-in search functionality in conversation viewer

### WebDAV Cloud Sync
1. **Configure WebDAV**: Click "Cloud Settings" in the sidebar to configure your WebDAV server
2. **Server Setup**: Enter your Nextcloud/ownCloud/WebDAV server URL and credentials
3. **Test Connection**: Verify your WebDAV configuration works correctly
4. **Sync Data**: Use "Sync to Cloud" to upload conversations and usage statistics
5. **Cross-Device**: Access your data from multiple devices with the same WebDAV configuration

## Commands

### CLAUDE.md Management
- `Claude Config: Sync Configuration to Git` - Manually sync team-sharable Claude configuration to workspace Git repository
- `Claude Config: Edit CLAUDE.md` - Open CLAUDE.md in editor
- `Claude Config: Add PROJECT_PLAN Rule to CLAUDE.md` - Manually add PROJECT_PLAN integration rules to CLAUDE.md

### Conversation History
- `Claude Config: Browse Conversations` - Open conversation history browser with quick pick
- `Claude Config: View Conversation` - View specific conversation in rich webview
- `Claude Config: Export Conversation` - Export individual conversation to file
- `Claude Config: Refresh Conversations` - Refresh conversation tree view

### WebDAV Cloud Sync
- `Claude Config: Sync to Cloud` - Sync conversations and usage data to WebDAV server
- `Claude Config: Cloud Settings` - Configure WebDAV server connection and credentials
- `Claude Config: Test Cloud Connection` - Verify WebDAV server connectivity

## Settings

### CLAUDE.md Configuration
- `claude-config.autoSync`: Enable automatic sync to Git (default: false)

### Conversation History
- `claude-config.conversationDataPath`: Custom path to Claude conversation data directory (default: ~/.claude/projects)

### WebDAV Cloud Sync
- `claude-config.cloudSync.enabled`: Enable WebDAV cloud synchronization (default: false)
- `claude-config.cloudSync.webdav.serverUrl`: WebDAV server URL (e.g., https://your-domain.com/remote.php/dav/files/username/)
- `claude-config.cloudSync.webdav.username`: WebDAV username
- `claude-config.cloudSync.webdav.basePath`: Base path for Claude data on WebDAV server (default: /Claude-Config-Sync/)
- `claude-config.cloudSync.webdav.verifySSL`: Verify SSL certificates (default: true)
- `claude-config.cloudSync.autoSync`: Enable automatic background sync (default: false)
- `claude-config.cloudSync.syncInterval`: Sync interval in minutes (0 for manual only)
- `claude-config.cloudSync.encryption`: Enable data encryption (default: false)
- `claude-config.cloudSync.conflictResolution`: Default conflict resolution strategy (local, remote, ask)

## Sync Behavior

When syncing CLAUDE.md files:
- Changes are detected in the workspace Git repository
- Only commits if there are actual changes to CLAUDE.md
- Uses descriptive commit messages: "Update CLAUDE.md configuration"
- Automatically pushes to remote repository
- Status bar shows sync progress with notifications

## Development

### Building and Testing

To build and test the extension:

```bash
npm install
npm run compile
```

### Debugging

1. Open the project in VSCode
2. Press `F5` to start debugging in a new Extension Development Host
3. In the new window, open a workspace folder
4. Test the extension commands via `Ctrl+Shift+P`

### Packaging

To create a VSIX package:

```bash
npm install -g vsce
vsce package
```

## Requirements

- **Git**: Must be installed and configured with your GitHub credentials
- **GitHub Access**: SSH access to GitHub repository (for git@github.com URLs) or HTTPS with tokens
- **VSCode**: Version 1.74.0 or higher
- **Node.js**: Version 16.x or higher (for development)

## Troubleshooting

### Common Issues

**Extension not appearing in VSCode:**
- Ensure VSCode is restarted after installation
- Check that the extension is enabled in the Extensions view
- Extension icon should appear in activity bar even without a workspace (v3.2.1+)

**Sync fails:**
- Verify Git is installed and configured
- Check that your workspace is a Git repository
- Ensure you have push access to the remote repository
- Make sure Git credentials are properly configured

**Auto-sync not working:**
- Check that auto-sync is enabled in settings
- Ensure the workspace has a valid CLAUDE.md file
- Verify the workspace is a Git repository


### Debug Information

To get debug information:
1. Open VSCode Developer Tools: `Help > Toggle Developer Tools`
2. Check the Console tab for extension logs
3. Look for messages prefixed with "Claude Config Manager"

## How It Works

### ccusage-Powered Usage Tracking
The extension integrates with the ccusage CLI tool for accurate Claude Code usage monitoring:
- **Smart Installation**: Automatically tries bunx (fastest), falls back to npx, then npm exec
- **Real-Time Data**: Displays today's tokens, costs, and model usage with 30-second caching
- **Detailed Breakdown**: Shows input/output tokens, cache creation/read statistics
- **Model Detection**: Identifies which Claude models were used (Opus, Sonnet, Haiku)
- **No Pre-Installation**: Works without requiring ccusage to be pre-installed
- **Clean Error Handling**: Provides helpful installation guidance when package managers are unavailable

### WebDAV Cloud Sync
Secure conversation and usage data synchronization to your own cloud storage:
- **Server Compatibility**: Works with Nextcloud, ownCloud, and any WebDAV-compatible server
- **Security Features**: Optional AES-256-GCM encryption, secure credential storage via VSCode API
- **Bidirectional Sync**: Smart merge of local and remote data with conflict resolution
- **Cross-Device Stats**: Aggregates usage statistics across multiple devices
- **Privacy-First**: All data stays on your infrastructure - no third-party services involved
- **Flexible Configuration**: Supports self-signed certificates and custom WebDAV paths

### Conversation History Browser
Rich conversation management with advanced features:
- **Data Source**: Reads JSONL files from Claude Code's local storage (`~/.claude/projects/`)
- **Project Organization**: Groups conversations by project with expandable tree structure
- **Rich Viewer**: Webview interface with VSCode theme integration and syntax highlighting
- **Advanced Search**: Sticky search bar with highlighting, navigation buttons, and keyboard shortcuts
- **Enhanced Controls**: Expand All/Collapse All buttons for quick conversation management
- **Export Options**: Multiple formats (Markdown, JSON, plain text) while preserving structure
- **Security**: Automatic .gitignore rules prevent private conversation data from being committed

### CLAUDE.md Management
The extension works directly with your workspace's existing Git repository:
- **Auto-Sync**: Monitor CLAUDE.md files for changes and sync automatically to Git
- **Git Integration**: Uses your existing Git configuration and remote repository
- **Team-Sharable Only**: Syncs only appropriate files (.claude/.plans/, CLAUDE.md)
- **Security Validation**: Blocks commits if private files are accidentally staged
- **Status Tracking**: Status bar indicator showing sync status and progress

### PROJECT_PLAN Integration
When CLAUDE.md is detected in your workspace:
1. Extension offers to create `.claude/.plans/PROJECT_PLAN.md`
2. Automatically adds PROJECT_PLAN integration rules to CLAUDE.md
3. Claude Code is instructed to read and maintain the project plan
4. Plan mode sessions use PROJECT_PLAN.md as the central repository

Example project structure:
```
your-project/
├── src/
├── package.json
├── CLAUDE.md                    <- Managed by this extension
├── .claude/
│   ├── .plans/
│   │   └── PROJECT_PLAN.md      <- Created by this extension
│   └── settings.json
├── .gitignore                   <- Updated with security rules
└── README.md
```

## Privacy & Security

### Privacy Statement
This extension primarily operates locally and does not collect or transmit any telemetry or analytics data. The extension offers optional cloud synchronization features that you can choose to enable.

**Local Operations (Default):**
- Reads and writes CLAUDE.md files in your workspace
- Parses conversation history from local Claude Code storage
- Performs Git operations using your existing Git configuration
- All data processing happens on your local machine

**Optional Cloud Features (User-Configured):**
- **WebDAV Sync**: If enabled, can sync conversations and usage data to your own WebDAV server (Nextcloud, ownCloud, etc.)
- **Your Control**: Cloud sync is disabled by default and requires explicit configuration
- **Your Infrastructure**: Uses only the WebDAV server you specify - no third-party services
- **Encrypted Option**: Supports optional AES-256-GCM encryption for sensitive data

**What the extension does NOT do:**
- Collect usage statistics or telemetry for the developer
- Send data to any servers we control
- Share your data with third parties
- Use cloud services without your explicit configuration
- Store credentials in plain text (uses VSCode SecretStorage API)

### Security Features
- **Automatic .gitignore Protection**: Automatically adds rules to prevent conversation data (.claude/.chats/) from being committed
- **Path Sanitization**: Input validation to prevent path traversal attacks when handling file paths
- **Repository Validation**: Validates Git URLs to block malicious repositories and private IPs
- **Secure Sync Operations**: Only syncs team-sharable files (.claude/.plans/, CLAUDE.md) to Git
- **Private File Detection**: Blocks commits if private files (.claude/.chats/, settings.local.json) are staged
- **Secure Credential Storage**: WebDAV credentials stored using VSCode's SecretStorage API
- **Error Message Sanitization**: Removes sensitive information from error messages before display

For security issues, please report them privately via GitHub's security advisory feature.

## Changelog

For detailed release notes and version history, see [CHANGELOG.md](./CHANGELOG.md).

**Latest Release**: v3.4.1 - Security & Packaging Update
- Improved packaging security with proper file exclusions
- Optimized package size (reduced by 93% to 177KB)
- WebDAV sync optimizations from v3.4.0
- Smart sync with hash-based change detection

## License

MIT License
