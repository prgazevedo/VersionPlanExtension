# Claude Config Manager

A VSCode extension that manages CLAUDE.md files for Claude Code with Git repository synchronization and custom activity bar icon.

## Features

- **Git Integration**: Sync CLAUDE.md files directly to your workspace's existing Git repository
- **Activity Bar Integration**: Custom stylized "C" icon in the activity bar with dedicated sidebar view
- **Template System**: Create CLAUDE.md files from predefined templates (Basic, Web Development, Data Science)
- **Auto-Sync**: Automatically sync CLAUDE.md changes to Git with smart commit detection
- **File Watching**: Monitor CLAUDE.md files for changes and sync automatically
- **Status Tracking**: Status bar indicator showing sync status and progress

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

1. **Install the extension** (see installation instructions above)
2. **Open a workspace folder** in VSCode (must be a Git repository)
3. **Click the "C" icon** in the activity bar or use the sidebar view
4. **Create your first CLAUDE.md**: Run `Claude Config: Create from Template` and choose a template
5. **Sync to Git**: Use the sync button or enable auto-sync to commit changes to your repository

## Commands

- `Claude Config: Sync to Git` - Manually sync CLAUDE.md to workspace Git repository
- `Claude Config: Create from Template` - Create CLAUDE.md from predefined templates
- `Claude Config: Edit CLAUDE.md` - Open CLAUDE.md in editor

## Settings

- `claude-config.autoSync`: Enable automatic sync to Git (default: false)
- `claude-config.defaultTemplate`: Default template to use (default: basic)

## Templates

### Basic Template
General purpose template with project information and basic structure.

### Web Development Template  
Tailored for web development projects with React/TypeScript focus.

### Data Science Template
Designed for data science projects with ML pipeline structure.

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

**Sync fails:**
- Verify Git is installed and configured
- Check that your workspace is a Git repository
- Ensure you have push access to the remote repository
- Make sure Git credentials are properly configured

**Auto-sync not working:**
- Check that auto-sync is enabled in settings
- Ensure the workspace has a valid CLAUDE.md file
- Verify the workspace is a Git repository

**Template creation fails:**
- Make sure you're in a valid workspace folder
- Check that you have write permissions to the workspace directory

### Debug Information

To get debug information:
1. Open VSCode Developer Tools: `Help > Toggle Developer Tools`
2. Check the Console tab for extension logs
3. Look for messages prefixed with "Claude Config Manager"

## How It Works

The extension works directly with your workspace's existing Git repository:
- Syncs `CLAUDE.md` files in the root of your workspace
- No additional repository setup required
- Uses your existing Git configuration and remote repository
- Commits are made directly to your project's Git history

Example workflow:
```
your-project/
├── src/
├── package.json
├── CLAUDE.md          <- Managed by this extension
└── README.md
```

## License

MIT License