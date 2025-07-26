# Claude Config Manager

A comprehensive VSCode extension for Claude Code workflows, providing CLAUDE.md configuration management, conversation history browsing, and intelligent project planning with Git integration.

## Features

### 🔧 CLAUDE.md Management
- **Automatic Rule Injection**: Automatically adds PROJECT_PLAN integration instructions to CLAUDE.md when detected
- **Git Integration**: Sync CLAUDE.md files directly to your workspace's existing Git repository
- **Auto-Sync**: Automatically sync CLAUDE.md changes to Git with smart commit detection
- **File Watching**: Monitor CLAUDE.md files for changes and sync automatically
- **Status Tracking**: Status bar indicator showing sync status and progress

### 📚 Conversation History Browser
- **Rich Conversation Viewer**: Browse Claude Code conversation history with an intuitive webview interface
- **Project Organization**: Conversations grouped by project with expandable tree structure
- **Enhanced Search**: Sticky search bar at bottom with highlighting, navigation buttons, keyboard shortcuts, and automatic scrolling
- **Advanced Controls**: Expand All and Collapse All buttons for quick conversation management
- **Optimized Metadata Layout**: Asymmetrical two-section design with compact display for short values and dedicated space for longer content
- **Multiple Export Formats**: Export conversations to Markdown, JSON, or plain text
- **Security-First**: Automatic .gitignore rules to prevent private conversation data from being committed

### 🎯 PROJECT_PLAN Integration
- **Intelligent Planning**: Automatic PROJECT_PLAN.md creation with CLAUDE.md integration
- **Plan Mode Integration**: PROJECT_PLAN.md serves as the central repository for Claude Code plan mode sessions
- **Persistent Context**: Maintains project knowledge continuity across different Claude Code sessions
- **Template-Based**: Pre-structured project plan template covering architecture, setup, and workflows
- **Manual Override**: Manual command available if automatic rule addition is needed

## Installation

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

## Commands

### CLAUDE.md Management
- `Claude Config: Sync Configuration to Git` - Manually sync team-sharable Claude configuration to workspace Git repository
- `Claude Config: Edit CLAUDE.md` - Open CLAUDE.md in editor
- `Claude Config: Add PROJECT_PLAN Rule to CLAUDE.md` - Manually add PROJECT_PLAN integration rules to CLAUDE.md

### Conversation History
- `Claude Config: Browse Conversations` - Open conversation history browser with quick pick
- `Claude Config: View Conversation` - View specific conversation in rich webview
- `Claude Config: Export Conversation` - Export individual conversation to file
- `Claude Config: Export All Conversations` - Bulk export all conversations
- `Claude Config: Refresh Conversations` - Refresh conversation tree view

## Settings

### CLAUDE.md Configuration
- `claude-config.autoSync`: Enable automatic sync to Git (default: false)

### Conversation History
- `claude-config.conversationDataPath`: Custom path to Claude conversation data directory (default: ~/.claude/projects)

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

### CLAUDE.md Management
The extension works directly with your workspace's existing Git repository:
- Syncs team-sharable Claude configuration to your workspace Git repository
- No additional repository setup required
- Uses your existing Git configuration and remote repository
- Commits are made directly to your project's Git history
- Automatically excludes private conversation data via .gitignore rules

### Conversation History Browser
- Reads JSONL conversation files from Claude Code's local storage (`~/.claude/projects/`)
- Parses conversation metadata including timestamps, message counts, and project context
- Groups conversations by project for organized browsing
- Provides rich webview interface with VSCode theme integration
- Offers multiple export formats while preserving conversation structure

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
This extension operates entirely locally and does not collect, transmit, or store any personal data or telemetry. All operations are performed on your local machine and your own Git repositories.

**What the extension does:**
- Reads and writes CLAUDE.md files in your workspace
- Performs Git operations (add, commit, push) using your existing Git configuration
- Creates files from templates using locally provided information

**What the extension does NOT do:**
- Collect usage statistics or telemetry
- Send data to external servers (except standard Git operations to your configured repository)
- Access files outside your workspace
- Store credentials or personal information

### Security Features
- **Automatic .gitignore Protection**: Adds security rules to prevent private conversation data from being committed
- **Path Sanitization**: Input validation and sanitization to prevent path traversal attacks
- **Repository Validation**: Repository URL validation to prevent malicious Git operations
- **Secure Sync Operations**: Only team-sharable files (.claude/.plans/, .claude/settings.json, .claude/commands/) are synced to Git
- **Private File Detection**: Validates that no private files (.claude/.chats/, .claude/settings.local.json) are committed
- **Secure File Operations**: All operations within workspace boundaries with proper error handling
- **GitHub Push Protection**: Compliance with GitHub's push protection for secret detection

For security issues, please report them privately via GitHub's security advisory feature.

## Changelog

### v3.2.1 - Icon Visibility Fix
- **FIXED**: Extension icon now appears in activity bar even when no workspace is open
- **NEW**: Graceful no-workspace handling with helpful messages to open a folder
- **IMPROVED**: Conversation browser functionality works without requiring a workspace
- **UX**: Better user onboarding with clear prompts to open workspace for full features

### v3.2.0 - Enhanced Conversation Viewer UI
- **NEW**: Expand All and Collapse All buttons for quick conversation section management
- **NEW**: Asymmetrical metadata layout with dedicated sections for short and long values
- **IMPROVED**: Optimized metadata display with better space utilization and readability
- **IMPROVED**: Compact header design with reduced spacing while maintaining accessibility
- **IMPROVED**: Better text overflow handling for long paths and identifiers
- **UI**: Enhanced conversation viewer controls with intuitive expand/collapse functionality

### v3.1.0+ - PROJECT_PLAN Integration & Search Enhancement
- **NEW**: PROJECT_PLAN Integration - Automatic creation and maintenance of project plans
- **NEW**: Automatic CLAUDE.md Rule Injection - Automatically adds PROJECT_PLAN instructions to CLAUDE.md (main feature)
- **NEW**: Plan Mode Integration - PROJECT_PLAN.md serves as central repository for plan mode
- **NEW**: Enhanced Search - Sticky search bar with navigation buttons, highlighting, keyboard shortcuts, and automatic scrolling
- **NEW**: Manual Override Command - "Add PROJECT_PLAN Rule to CLAUDE.md" command for manual control
- **IMPROVED**: Enhanced security compliance with automatic .gitignore rules
- **FIXED**: Resolved extension crash issues during initialization
- **IMPROVED**: Better sync workflow with file validation and security checks
- **CLEANUP**: Removed unused template system for cleaner codebase

### v3.1.0 - Major Conversation History Features
- **NEW**: Conversation History Browser with rich webview interface
- **NEW**: Project-organized conversation tree view
- **NEW**: Multiple export formats (Markdown, JSON, Plain Text)
- **NEW**: Real-time conversation search functionality
- **SECURITY**: Enhanced security measures with path sanitization
- **SECURITY**: Automatic .gitignore rules for conversation data protection
- **IMPROVED**: GitHub push protection compliance

### v3.0.0 - Conversation Viewer Foundation
- **NEW**: Basic conversation history parsing and viewing
- **NEW**: JSONL conversation file support
- **IMPROVED**: Security enhancements and input validation

### v2.x - Core CLAUDE.md Management
- **FEATURE**: Git integration for CLAUDE.md synchronization
- **FEATURE**: Auto-sync functionality with file watching

## License

MIT License
