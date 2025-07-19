# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a VSCode extension called "Claude Config Manager" that helps developers manage CLAUDE.md files across projects with automatic GitHub repository synchronization. The extension creates a centralized system for storing and syncing CLAUDE.md configuration files organized by project name.

## Development Commands

### Build and Compilation
- `npm run compile` - Compile TypeScript to JavaScript
- `npm run watch` - Watch mode compilation for development

### Code Quality
- `npm run lint` - Run ESLint on TypeScript source files
- `npm run pretest` - Run compile and lint before testing

### Testing
- `npm run test` - Run extension tests (requires compilation first)

### Development Workflow
- Press `F5` in VSCode to launch Extension Development Host for debugging
- Package extension: `vsce package` (requires `npm install -g vsce`)

## Architecture

### Core Components

**Extension Entry Point** (`src/extension.ts`):
- Manages extension lifecycle (activate/deactivate)
- Registers all commands and initializes core managers
- Handles configuration changes and auto-sync toggle
- Manages status bar indicator

**RepositoryManager** (`src/repository.ts`):
- Handles Git operations using `simple-git` library
- Manages repository initialization, cloning, and syncing
- Implements auto-commit functionality with project-specific commit messages
- Stores repository in VSCode global storage path

**ClaudeFileManager** (`src/fileManager.ts`):
- Manages CLAUDE.md files in workspace and repository
- Implements file watching for auto-sync functionality
- Handles bidirectional sync between workspace and repository
- Creates project-specific folder structure (`ProjectName/CLAUDE.md`)

**TemplateManager** (`src/templates.ts`):
- Manages predefined templates (basic, web-dev, data-science)
- Loads templates from `/templates/` directory

### Command Structure

Commands are modularized in `/src/commands/`:

- `init.ts` - Repository initialization
- `sync.ts` - Manual sync operations
- `create.ts` - Template-based CLAUDE.md creation
- `edit.ts` - Open CLAUDE.md in editor

### Key Dependencies

- `simple-git` - Git operations
- `fs-extra` - Enhanced file system operations
- VSCode API for extension functionality

## Configuration Settings

The extension uses VSCode configuration with prefix `claude-config`:

- `repositoryUrl` - GitHub repository URL for centralized storage
- `autoSync` - Enable automatic sync on file changes
- `autoCommit` - Automatically commit and push changes
- `defaultTemplate` - Default template selection

## Repository Structure Pattern

The extension creates organized folder structure in the configured repository:

```text
your-claude-configs/
├── ProjectName1/
│   └── CLAUDE.md
├── ProjectName2/
│   └── CLAUDE.md
└── ...
```

Project names are derived from the workspace folder basename, and each project gets its own dedicated folder with auto-generated commit messages like "Update {ProjectName}/CLAUDE.md".
