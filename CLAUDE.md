# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a VSCode extension called "Claude Config Manager" that provides comprehensive management for Claude Code workflows. The extension offers two main features:

1. **CLAUDE.md Management**: Automatic PROJECT_PLAN rule injection and sync of CLAUDE.md configuration files directly to the workspace's existing Git repository
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
- Provides rich HTML interface with enhanced search functionality and navigation
- Features asymmetrical metadata layout optimized for different content lengths
- Includes Expand All/Collapse All controls for conversation section management
- Handles conversation export to multiple formats (Markdown, JSON, Text)

**Token Tracker** (`src/tokenTracker.ts`):
- Monitors token usage and provides cost estimation and statistics
- Tracks usage across different conversations and operations
- Provides comprehensive reporting with daily, weekly, and monthly breakdowns
- **UPDATED v3.2.4**: Daily usage tracking aligned with Claude's session-based model (5-hour windows)
- **UPDATED v3.2.4**: Manual service tier configuration for accurate usage calculations
- **UPDATED v3.2.4**: Fixed percentage calculation issues that showed false 100% readings

### Command Structure

Commands are modularized in `/src/commands/`:

**CLAUDE.md Commands:**

- `sync.ts` - Git sync operations (pull, add, commit, push)
- `edit.ts` - Open CLAUDE.md in editor
- Extension automatically adds PROJECT_PLAN integration rules to CLAUDE.md
- Manual command available: "Add PROJECT_PLAN Rule to CLAUDE.md"

**Conversation Commands:**

- `openConversations.ts` - Browse and manage conversation history
  - `openConversationsCommand` - Quick pick conversation selector
  - `viewConversationCommand` - Open conversation in webview
  - `exportConversationCommand` - Export conversations to files

**Usage Commands:**

- `usage.ts` - View usage statistics and token tracking information

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

**Usage Tracking Settings:**

- `tokenTrackingEnabled` - Enable/disable token usage tracking (default: true)
- `showUsageNotifications` - Show usage notifications after operations (default: false)
- `usageTracking.showPercentage` - Show usage percentage in status bar and tree views (default: true)
- `usageTracking.customLimits` - Custom usage limits override (e.g., {"daily": 2000000})
- `usageTracking.warningThresholds` - Usage percentage thresholds for warnings (warning: 80%, critical: 95%)
- **NEW v3.2.4**: `serviceTier` - Your Claude subscription tier (free, pro, max-100, max-200) for accurate usage calculations

## How It Works

### CLAUDE.md Management

The extension syncs CLAUDE.md files directly to the workspace's existing Git repository:

- Works with any Git repository (no additional setup required)
- Syncs `CLAUDE.md` in the workspace root
- Uses workspace's existing Git configuration and remote
- Commits directly to project's Git history with message "Update CLAUDE.md configuration"

### PROJECT_PLAN Integration

When CLAUDE.md is detected in the workspace:

- Extension automatically adds PROJECT_PLAN integration rules to CLAUDE.md
- Creates `.claude/.plans/PROJECT_PLAN.md` template when requested
- Instructions tell Claude Code to read and maintain the project plan
- Plan mode sessions use PROJECT_PLAN.md as the central repository
- Manual command available if automatic rule addition is needed

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
- Conversation files (`.claude/.chats/`) are excluded from Git tracking to prevent accidental secret exposure
- GitHub push protection integration to block commits containing sensitive data

### Usage Tracking & Statistics

The extension provides comprehensive token usage monitoring and cost estimation:

**Token Usage Tracking:**

- Monitors and tracks estimated token usage with cost estimation for each operation
- Tracks usage across different conversations and Claude Code interactions
- Provides real-time usage notifications after operations (configurable)

**UPDATED v3.2.4 - Claude Usage Tracking:**

- **Daily Usage Tracking**: Shows usage percentage based on daily estimates (aligned with Claude's session-based model)
- **Status Bar Integration**: Live updates with visual indicators: `📊 Claude: 15.2% (8h 30m)` showing current percentage and reset time
- **Manual Service Tier Configuration**: Set your actual Claude subscription tier for accurate percentage calculations
- **Session-Based Model**: Tracks usage aligned with Claude's 5-hour session windows and daily patterns
- **Visual Warnings**: Status icons change based on usage thresholds (📊 normal, ⚠️ warning at 80%, 🚨 critical at 95%)
- **Tree View Integration**: Percentage indicators displayed in both Claude Config and Usage Statistics sidebar views
- **Fixed False 100% Readings**: Resolved issues where usage showed 100% when Claude was still accessible

**Usage Statistics:**

- Comprehensive reporting with daily, weekly, and monthly breakdowns
- Cost estimation and usage analytics to help manage Claude usage
- Integration with conversation history for detailed usage insights

## Recent Updates

### v3.2.4 - Usage Tracking Model Corrections & Accuracy Improvements

- **🔧 Fixed Usage Model**: Corrected from weekly to daily-based tracking to align with Claude's actual session-based usage model (5-hour windows)
- **🔧 Manual Service Tier Configuration**: Added `serviceTier` setting to replace unreliable automatic detection that caused false 100% readings
- **🔧 Accurate Percentage Calculations**: Fixed usage percentage calculations using realistic daily limits based on 2025 Claude subscription tiers
- **🔧 Updated Service Tier Limits**: Revised limits to reflect Claude's actual usage patterns:
  - Free: ~250K tokens/day (~50 messages)
  - Pro: ~2M tokens/day (session-based limits)
  - Max-100: ~8M tokens/day
  - Max-200: ~12M tokens/day
- **🔧 Status Bar Updates**: Changed display from "weekly limit" to "daily estimate" for accuracy
- **🔧 Notification Text Updates**: Updated all user-facing text to reflect daily tracking model
- **🔧 Code Cleanup**: Removed unused async methods and fixed diagnostic issues

### v3.2.2 - Claude Usage Percentage Tracker & Statistics Integration

- **🆕 Claude Usage Percentage Tracker**: Real-time 0-100% usage tracking with service tier detection (Free, Pro, Max-100, Max-200)
- **🆕 Status Bar Integration**: Live percentage display with visual indicators showing current usage and reset time
- **🆕 Usage Window Tracking**: Tracks usage cycles with precise reset time calculation and percentage-based notifications
- **🆕 Tree View Enhancements**: Usage percentage indicators in both Claude Config and Usage Statistics tree views with warning/critical status icons
- **🆕 Configuration Settings**: New settings for custom limits, warning thresholds, and percentage display toggle
- **TokenTracker Singleton Initialization**: Fixed singleton initialization and error handling for more stable token tracking
- **Extension Icon Visibility**: Improved extension icon visibility without workspace requirement  
- **Publisher ID Compliance**: Updated publisher ID for VSCode marketplace compliance
- **Improved Error Handling**: Enhanced error handling in token tracking components with comprehensive safety checks
- **Stability Improvements**: Fixed various initialization race conditions and edge cases

### v3.2.3 - Usage Statistics Display Improvements

- **Fixed Usage Statistics Display**: Corrected zero values in total usage, operations count, and period displays
- **Cost Formatting**: All costs now rounded to cents (2 decimal places) for better readability
- **Better Empty State Handling**: Usage periods now show meaningful descriptions when no data is available
- **Improved Period Descriptions**: Daily/weekly/monthly usage shows actual counts or "No recent activity"

### v3.2.1 - Usage Tracking & Statistics Integration (Previous Release)

- **Token Usage Tracking**: Added comprehensive token usage monitoring with cost estimation
- **Usage Statistics**: Comprehensive reporting with daily, weekly, and monthly breakdowns  
- **Token Tracker Component**: New core component for tracking usage across conversations and operations
- **Usage Commands**: Added usage statistics viewing and management commands
- **Configuration Settings**: New settings for token tracking and usage notifications

### v3.2.0 - Enhanced Conversation Viewer UI

- **Expand/Collapse All Controls**: Added dedicated buttons for quick conversation section management
- **Asymmetrical Metadata Layout**: Two-section design with compact display for short values and dedicated space for longer content
- **Optimized Header Display**: Improved space utilization and readability with better text overflow handling
- **Enhanced UI Controls**: Better visual organization and user experience in conversation viewer

### v3.1.0+ - PROJECT_PLAN Integration & Search Enhancement

- **PROJECT_PLAN Integration**: Automatic creation of `.claude/.plans/PROJECT_PLAN.md` with CLAUDE.md integration
- **Plan Mode Integration**: PROJECT_PLAN.md serves as the central repository for plan mode sessions
- **Enhanced Security Compliance**: Automatic .gitignore rules addition for conversation data protection
- **Crash Fixes**: Resolved async initialization race conditions for stable extension loading

### Conversation History Browser v3.1.0

- **Enhanced Security**: Implemented robust security measures including path sanitization and secret detection
- **Improved UI**: Rich conversation viewer with VSCode theme integration and real-time search
- **Export Features**: Multiple export formats (Markdown, JSON, Plain Text) with metadata preservation
- **Project Organization**: Conversations grouped by project with expandable tree structure
- **Performance**: Optimized JSONL parsing and file watching for better responsiveness

### Security Improvements

- Added `.claude/.chats/` to .gitignore to prevent conversation data from being committed
- Implemented GitHub push protection compliance
- Enhanced input validation across all user-facing inputs
- Secure file handling with proper error boundaries
- Automatic security rule enforcement in workspace .gitignore files

## PROJECT_PLAN Integration

### Added by Claude Config Manager Extension

When working on this project, always refer to and maintain the project plan located at `.claude/.plans/PROJECT_PLAN.md`.

**Instructions for Claude Code:**

1. **Read the project plan first** - Always check `.claude/.plans/PROJECT_PLAN.md` when starting work to understand the project context, architecture, and current priorities.
2. **Update the project plan regularly** - When making significant changes, discoveries, or completing major features, update the relevant sections in PROJECT_PLAN.md to keep it current.
3. **Use it for context** - Reference the project plan when making architectural decisions, understanding dependencies, or explaining code to ensure consistency with project goals.

**Plan Mode Integration:**

- **When entering plan mode**: Read the current PROJECT_PLAN.md to understand existing context and priorities
- **During plan mode**: Build upon and refine the existing project plan structure
- **When exiting plan mode**: ALWAYS update PROJECT_PLAN.md with your new plan details, replacing or enhancing the relevant sections (Architecture, TODO, Development Workflow, etc.)
- **Plan persistence**: The PROJECT_PLAN.md serves as the permanent repository for all planning work - plan mode should treat it as the single source of truth

This ensures better code quality and maintains project knowledge continuity across different Claude Code sessions and plan mode iterations.
