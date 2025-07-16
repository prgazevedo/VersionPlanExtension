# Claude Config Manager

A VSCode extension that manages CLAUDE.md files across projects with automatic GitHub repository synchronization.

## Features

- **Repository Management**: Initialize and sync with a GitHub repository for centralized CLAUDE.md storage
- **Template System**: Create CLAUDE.md files from predefined templates (Basic, Web Development, Data Science)
- **Auto-Sync**: Automatically sync CLAUDE.md changes to the repository with auto-commit
- **File Watching**: Monitor CLAUDE.md files for changes and sync automatically
- **Status Tracking**: Status bar indicator showing sync status

## Quick Start

1. Install the extension
2. Open a workspace folder
3. Run command: `Claude Config: Initialize Config Repository`
4. Choose a template and create your CLAUDE.md file with: `Claude Config: Create from Template`

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

To build and test the extension:

```bash
cd claude-config-manager
npm install
npm run compile
```

Press F5 to start debugging in a new Extension Development Host.

## Requirements

- Git must be installed and configured
- SSH access to GitHub repository (for git@github.com URLs)
- VSCode 1.74.0 or higher

## Repository Structure

The extension creates a project-specific CLAUDE.md file in the configured repository:
- `project-name.md` - Configuration for each project
- Auto-generated commit messages: "Update CLAUDE.md for {projectName}"

## License

MIT License