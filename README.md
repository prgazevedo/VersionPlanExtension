# Claude Config Manager

A VSCode extension that manages CLAUDE.md files across projects with automatic GitHub repository synchronization.

## Features

- **Repository Management**: Initialize and sync with a GitHub repository for centralized CLAUDE.md storage
- **Organized Structure**: Creates individual project folders (`ProjectName/CLAUDE.md`) for clean organization
- **Template System**: Create CLAUDE.md files from predefined templates (Basic, Web Development, Data Science)
- **Auto-Sync**: Automatically sync CLAUDE.md changes to the repository with auto-commit
- **File Watching**: Monitor CLAUDE.md files for changes and sync automatically
- **Status Tracking**: Status bar indicator showing sync status

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
2. **Open a workspace folder** in VSCode
3. **Initialize repository**: Press `Ctrl+Shift+P` (or `Cmd+Shift+P`) and run `Claude Config: Initialize Config Repository`
4. **Create your first CLAUDE.md**: Run `Claude Config: Create from Template` and choose a template
5. **Start coding**: The extension will automatically sync your CLAUDE.md changes to the repository

## Commands

- `Claude Config: Initialize Config Repository` - Setup GitHub repository for configs
- `Claude Config: Sync to Repository` - Manually sync to repository
- `Claude Config: Create from Template` - Create CLAUDE.md from predefined templates
- `Claude Config: Edit CLAUDE.md` - Open CLAUDE.md in editor

## Settings

- `claude-config.repositoryUrl`: GitHub repository URL (default: empty - user must configure)
- `claude-config.autoSync`: Enable automatic sync (default: true)
- `claude-config.autoCommit`: Enable automatic commits (default: true)
- `claude-config.defaultTemplate`: Default template to use (default: basic)

## Templates

### Basic Template
General purpose template with project information and basic structure.

### Web Development Template  
Tailored for web development projects with React/TypeScript focus.

### Data Science Template
Designed for data science projects with ML pipeline structure.

## Auto-Sync Behavior

When auto-sync is enabled:
- File changes are detected automatically
- Changes are committed with descriptive messages
- Commits are pushed to the remote repository
- Status bar shows sync progress

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

**Repository initialization fails:**
- Verify Git is installed and configured
- Check that you have access to the specified GitHub repository
- Ensure SSH keys are set up correctly (for git@github.com URLs)

**Auto-sync not working:**
- Check that auto-sync is enabled in settings
- Verify the repository URL is correctly configured
- Ensure the workspace has a valid CLAUDE.md file

**Template creation fails:**
- Make sure you're in a valid workspace folder
- Check that you have write permissions to the workspace directory

### Debug Information

To get debug information:
1. Open VSCode Developer Tools: `Help > Toggle Developer Tools`
2. Check the Console tab for extension logs
3. Look for messages prefixed with "Claude Config Manager"

## Repository Structure

The extension creates an organized folder structure in the configured repository:
- `ProjectName/CLAUDE.md` - Each project gets its own folder with CLAUDE.md inside
- `ProjectName/` - Folder named after your workspace/project
- Auto-generated commit messages: "Update {ProjectName}/CLAUDE.md"

Example repository structure:
```
your-claude-configs/
├── MyWebApp/
│   └── CLAUDE.md
├── DataAnalysis/
│   └── CLAUDE.md
├── MobileApp/
│   └── CLAUDE.md
└── ...
```

## License

MIT License