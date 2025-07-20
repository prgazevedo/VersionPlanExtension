# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a VSCode extension called "Claude Config Manager" that helps developers manage CLAUDE.md files for Claude Code with Git repository synchronization. The extension syncs CLAUDE.md files directly to the workspace's existing Git repository and includes a custom activity bar icon with sidebar integration.

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
- Implements lazy Git initialization for better performance
- Manages workspace Git operations (not centralized repository)

**ClaudeFileManager** (`src/fileManager.ts`):
- Manages CLAUDE.md files in workspace
- Implements file watching for auto-sync functionality
- Handles sync between workspace and its Git repository

**ClaudeTreeDataProvider** (`src/claudeTreeProvider.ts`):
- Implements VSCode TreeDataProvider for sidebar view
- Shows CLAUDE.md status and provides action buttons
- Integrates with activity bar custom icon

**TemplateManager** (`src/templates.ts`):
- Manages predefined templates (basic, web-dev, data-science)
- Loads templates from `/templates/` directory

### Command Structure

Commands are modularized in `/src/commands/`:

- `sync.ts` - Git sync operations (pull, add, commit, push)
- `create.ts` - Template-based CLAUDE.md creation
- `edit.ts` - Open CLAUDE.md in editor

### Key Dependencies

- `simple-git` - Git operations
- `fs-extra` - Enhanced file system operations
- `sharp` - SVG to PNG icon conversion (development only)
- VSCode API for extension functionality

### Asset Management

- **Icon**: Custom PNG icon (`assets/claude-icon.png`) converted from SVG using Sharp
- **Templates**: Predefined CLAUDE.md templates in `templates/` directory

## Configuration Settings

The extension uses VSCode configuration with prefix `claude-config`:

- `autoSync` - Enable automatic sync on file changes (default: false)
- `defaultTemplate` - Default template selection (basic, web-dev, data-science)

## How It Works

The extension syncs CLAUDE.md files directly to the workspace's existing Git repository:

- Works with any Git repository (no additional setup required)
- Syncs `CLAUDE.md` in the workspace root
- Uses workspace's existing Git configuration and remote
- Commits directly to project's Git history with message "Update CLAUDE.md configuration"
