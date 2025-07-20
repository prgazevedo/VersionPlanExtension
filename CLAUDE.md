# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a VSCode extension called "Claude Config Manager" that provides comprehensive management for Claude Code workflows. The extension offers two main features:

1. **CLAUDE.md Management**: Sync CLAUDE.md configuration files directly to the workspace's existing Git repository
2. **Conversation History Browser**: Browse, view, and export Claude Code conversation history with a rich webview interface

The extension includes a custom activity bar icon with dual sidebar views for both configuration management and conversation browsing.

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
- Implements VSCode TreeDataProvider for CLAUDE.md sidebar view
- Shows CLAUDE.md status and provides action buttons
- Integrates with activity bar custom icon

**ConversationManager** (`src/conversation/ConversationManager.ts`):
- Parses JSONL conversation files from Claude Code local storage
- Manages conversation metadata and filtering
- Handles conversation data path configuration and file watching

**ConversationTreeProvider** (`src/conversation/ConversationTreeProvider.ts`):
- Implements TreeDataProvider for conversation history sidebar
- Groups conversations by project with expandable tree structure
- Shows conversation summaries with timestamps and message counts

**ConversationViewer** (`src/conversation/ConversationViewer.ts`):
- Creates webview panels for displaying full conversations
- Provides rich HTML interface with search functionality
- Handles conversation export to multiple formats (Markdown, JSON, Text)


### Command Structure

Commands are modularized in `/src/commands/`:

**CLAUDE.md Commands:**
- `sync.ts` - Git sync operations (pull, add, commit, push)
- `create.ts` - CLAUDE.md creation with template support
- `edit.ts` - Open CLAUDE.md in editor

**Conversation Commands:**
- `openConversations.ts` - Browse and manage conversation history
  - `openConversationsCommand` - Quick pick conversation selector
  - `viewConversationCommand` - Open conversation in webview
  - `exportConversationCommand` - Export conversations to files

### Key Dependencies

- `simple-git` - Git operations
- `fs-extra` - Enhanced file system operations
- `sharp` - SVG to PNG icon conversion (development only)
- VSCode API for extension functionality

### Asset Management

- **Icon**: Custom PNG icon (`assets/claude-icon.png`) converted from SVG using Sharp

## Configuration Settings

The extension uses VSCode configuration with prefix `claude-config`:

**CLAUDE.md Settings:**
- `autoSync` - Enable automatic sync on file changes (default: false)

**Conversation Settings:**
- `conversationDataPath` - Custom path to Claude conversation data directory (default: ~/.claude/projects)
- `backupEnabled` - Enable backup of conversations to Git repository (default: false)
- `backupRepository` - Git repository URL for conversation backups
- `autoBackup` - Automatically backup conversations after each session (default: false)
- `backupRetentionDays` - Number of days to retain conversation backups (default: 30)

## How It Works

### CLAUDE.md Management
The extension syncs CLAUDE.md files directly to the workspace's existing Git repository:

- Works with any Git repository (no additional setup required)
- Syncs `CLAUDE.md` in the workspace root
- Uses workspace's existing Git configuration and remote
- Commits directly to project's Git history with message "Update CLAUDE.md configuration"

### Conversation History Browser
The extension provides comprehensive conversation history management:

**Data Source:**
- Reads JSONL files from Claude Code's local storage (default: `~/.claude/projects/`)
- Parses conversation metadata including timestamps, message counts, and project context
- Groups conversations by project for organized browsing

**Webview Interface:**
- Rich HTML conversation viewer with VSCode theme integration
- Real-time search functionality across conversation content
- Message-by-message display with proper formatting for user/assistant exchanges
- Tool usage display with syntax highlighting for tool calls and parameters

**Export Capabilities:**
- Export conversations to Markdown for documentation
- Export to JSON for programmatic processing
- Export to plain text for simple sharing
- Preserves conversation structure and metadata in all formats

**Security Features:**
- Path sanitization prevents directory traversal attacks
- Input validation on all user-provided paths and Git URLs
- Safe parsing of JSONL files with error handling
