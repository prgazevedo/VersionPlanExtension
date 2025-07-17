# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview
This is a VSCode extension called "Claude Config Manager" that manages CLAUDE.md files across projects with automatic GitHub repository synchronization. It provides a centralized system for storing and syncing CLAUDE.md configurations using a folder-based repository structure.

## Build Commands
- `npm install` - Install dependencies
- `npm run compile` - Compile TypeScript to JavaScript
- `npm run watch` - Watch for changes and compile automatically
- `npm run lint` - Run ESLint on TypeScript files
- `npm run test` - Run tests (requires compilation first)
- `npm run vscode:prepublish` - Prepare for publishing (runs compile)

## Package and Installation
- `npm install -g vsce` - Install VS Code Extension Manager globally
- `vsce package` - Create .vsix package file
- `code --install-extension claude-config-manager-X.X.X.vsix` - Install from .vsix

## Architecture

### Core Components
1. **Extension Entry Point** (`src/extension.ts`): Main activation logic, command registration, and status bar management
2. **Repository Manager** (`src/repository.ts`): Handles Git operations, cloning, syncing, and auto-commits
3. **File Manager** (`src/fileManager.ts`): Manages CLAUDE.md files, file watching, and sync operations
4. **Template Manager** (`src/templates.ts`): Handles template processing with variable substitution

### Commands Structure
- `src/commands/init.ts` - Initialize repository command
- `src/commands/sync.ts` - Manual sync command
- `src/commands/create.ts` - Create from template command
- `src/commands/edit.ts` - Edit CLAUDE.md command

### Template System
- Templates in `templates/` directory with variable substitution using `{{variable}}` syntax
- Three built-in templates: basic.md, web-dev.md, data-science.md
- Variables: projectName, description, techStack, author, date

## Key Features
- **Auto-sync**: Watches CLAUDE.md files for changes and automatically syncs to repository
- **Project-based organization**: Each project gets its own folder in the repository (`ProjectName/CLAUDE.md`)
- **Template system**: Create CLAUDE.md files from predefined templates with variable substitution
- **Git integration**: Full Git workflow with pull, commit, and push operations
- **Status bar integration**: Shows sync status and provides quick access to sync command

## Configuration Settings
- `claude-config.repositoryUrl` - GitHub repository URL for configs
- `claude-config.autoSync` - Enable/disable automatic syncing
- `claude-config.autoCommit` - Enable/disable automatic commits
- `claude-config.defaultTemplate` - Default template for new files

## Development Notes
- Uses `simple-git` library for Git operations
- File watching implemented with VSCode's FileSystemWatcher
- Global storage used for repository location (`context.globalStorageUri`)
- Error handling with status bar updates and user notifications
- Repository structure: `ProjectName/CLAUDE.md` for organization

## Dependencies
- `simple-git` - Git operations
- `fs-extra` - Enhanced file system operations
- `vscode` - VS Code API
- `typescript` - Development dependency
- `eslint` - Code linting