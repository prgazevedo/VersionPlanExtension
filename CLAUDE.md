# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a VSCode extension called "Claude Config Manager" that provides comprehensive management for Claude Code workflows. The extension offers three main features:

1. **CLAUDE.md Management**: Automatic PROJECT_PLAN rule injection and sync of CLAUDE.md configuration files directly to the workspace's existing Git repository
2. **Conversation History Browser**: Browse, view, and export Claude Code conversation history with a rich webview interface  
3. **WebDAV Cloud Sync Integration**: WebDAV cloud synchronization for conversations and usage statistics across devices

The extension includes a custom activity bar icon with integrated sidebar views for configuration management, conversation browsing, and cloud sync operations.

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
- Legacy token tracking component (maintained for extension infrastructure)
- Provides extension activation and configuration management
- Used for status bar updates and basic usage metadata
- **Note**: Primary usage tracking now handled by ccusage integration

**CcusageService** (`src/services/CcusageService.ts`):
- **NEW v3.3.1**: Core service wrapper for ccusage CLI integration
- Smart package manager detection with automatic fallback (bunx → npx → npm exec)
- 30-second caching system to minimize CLI calls while providing real-time updates
- Handles ccusage command execution with proper error handling and timeout management
- Provides methods for daily, session, monthly, and live usage data retrieval
- Data path configuration support for custom Claude conversation directories

**ccusage-Powered Usage Monitor** (`src/components/UsageMonitor.ts`):
- **UPDATED v3.3.1**: Real-time usage display powered by ccusage CLI integration
- Clean card-based interface showing today's tokens, costs, and breakdowns
- Displays input, output, cache creation, and cache read token statistics
- Model detection and usage breakdown by Claude model types
- Graceful error handling with helpful installation guidance
- Automatic fallback across package managers when ccusage is unavailable

### WebDAV Cloud Sync Architecture

**CloudProviderInterface** (`src/cloud/CloudProviderInterface.ts`):
- Unified abstraction layer for WebDAV cloud storage
- Standardized operations: upload, download, list, delete, authentication
- Support for Nextcloud, ownCloud, and other WebDAV-compatible servers
- WebDAV-specific configuration and quota management

**CloudAuthManager** (`src/cloud/CloudAuthManager.ts`):
- Secure credential management using VSCode SecretStorage API
- WebDAV username/password authentication
- Credential validation and testing capabilities
- SSL certificate handling for self-hosted servers

**CloudDataSchema** (`src/cloud/CloudDataSchema.ts`):
- Extensible data structures for cloud storage
- Metadata tracking for sync state and conflict resolution
- Data serialization with compression and encryption support
- Version compatibility and migration handling

**CloudConversationManager** (`src/cloud/CloudConversationManager.ts`):
- Extends ConversationManager with cloud sync capabilities
- Bidirectional sync with conflict detection and resolution
- Delta sync for efficient data transfer
- Multi-device conversation aggregation

**CloudTokenTracker** (`src/cloud/CloudTokenTracker.ts`):
- Extends TokenTracker with cloud backup functionality
- Cross-device usage statistics aggregation
- Device identification and sync coordination
- Cloud-enabled usage percentage calculations

**CloudEncryption** (`src/cloud/CloudEncryption.ts`):
- AES-256-GCM encryption for sensitive data protection
- PBKDF2 key derivation with secure salt generation
- Optional encryption with user-controlled passwords
- Secure key caching and management

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

- `usage.ts` - ccusage-powered usage statistics and tracking
  - **UPDATED v3.3.1**: Complete ccusage CLI integration with smart package manager detection
  - Real-time statistics from actual Claude Code usage data
  - Installation helper commands for Bun, Node.js, and VS Code extensions
  - Debug commands for testing ccusage availability and data retrieval
  - Clean error states with actionable guidance when ccusage is unavailable

**Cloud Sync Commands:**

- `cloudSyncIntegrated.ts` - Integrated WebDAV cloud sync functionality
  - `syncToCloudCommand` - Enhanced export with WebDAV sync options
  - `openCloudSettingsCommand` - WebDAV provider configuration and management
  - WebDAV support for Nextcloud, ownCloud, and other WebDAV servers
  - Bidirectional sync capabilities with conflict resolution

### Key Dependencies

- `simple-git` - Git operations
- `fs-extra` - Enhanced file system operations
- `sharp` - SVG to PNG icon conversion (development only)
- `child_process` - CLI execution for ccusage integration
- VSCode API for extension functionality

### Asset Management

- **Icon**: Custom PNG icon (`assets/claude-icon.png`) converted from SVG using Sharp

## Configuration Settings

The extension uses VSCode configuration with prefix `claude-config`:

**CLAUDE.md Settings:**

- `autoSync` - Enable automatic sync on file changes (default: false)

**Conversation Settings:**

- `conversationDataPath` - Custom path to Claude conversation data directory (default: ~/.claude/projects)

**ccusage Integration Settings:**

- `tokenTrackingEnabled` - Enable/disable token usage tracking (default: true)
- `showUsageNotifications` - Show usage notifications after operations (default: false)
- `usageTracking.showPercentage` - Show usage information in status bar and tree views (default: true)
- **NOTE**: Custom limits, warning thresholds, and service tier settings are no longer needed with ccusage integration as it provides actual usage data directly from Claude Code

**WebDAV Cloud Sync Settings:**

- `cloudSync.enabled` - Enable WebDAV cloud synchronization (default: false)
- `cloudSync.webdav.serverUrl` - WebDAV server URL (e.g., https://your-domain.com/remote.php/dav/files/username/)
- `cloudSync.webdav.username` - WebDAV username
- `cloudSync.webdav.basePath` - Base path for Claude data on WebDAV server (default: /Claude-Config-Sync/)
- `cloudSync.webdav.verifySSL` - Verify SSL certificates (default: true, disable only for self-signed certificates)
- `cloudSync.autoSync` - Enable automatic background sync (default: false)
- `cloudSync.syncInterval` - Sync interval in minutes (0 for manual only)
- `cloudSync.compression` - Enable data compression (default: true)
- `cloudSync.encryption` - Enable data encryption (default: false)
- `cloudSync.maxFileSize` - Maximum file size for sync in bytes (default: 50MB)
- `cloudSync.conflictResolution` - Default strategy: 'local', 'remote', 'ask'

**✨ Settings Panel Integration**
WebDAV configuration is now available directly in VS Code settings! Open Settings (Ctrl/Cmd+,) and search for "claude-config cloudSync" to easily configure your WebDAV server without using the command palette.

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

### ccusage-Powered Usage Tracking

The extension provides accurate token usage monitoring powered by the ccusage CLI tool:

**ccusage Integration:**

- **Real Usage Data**: Direct integration with ccusage CLI for accurate Claude Code usage statistics
- **Automatic Package Manager Detection**: Smart fallback across bunx → npx → npm exec for seamless setup
- **No Installation Required**: Uses existing package managers without requiring ccusage pre-installation
- **Cached Performance**: 30-second caching to minimize CLI calls while providing real-time updates

**ccusage-Powered Features:**

- **Today's Usage Display**: Real-time tokens, costs, and model usage from actual Claude Code data
- **Token Breakdown**: Detailed breakdown of input, output, cache creation, and cache read tokens
- **Model Detection**: Automatic detection and display of Claude models used (Opus, Sonnet, etc.)
- **Daily, Monthly, Session Views**: Multiple time perspectives of usage data
- **Cost Accuracy**: Real cost calculations based on actual token usage, not estimates
- **Clean Error Handling**: Helpful guidance when ccusage is unavailable, with installation instructions

**Technical Architecture:**

- **CcusageService** (`src/services/CcusageService.ts`): Core service wrapper for ccusage CLI integration
- **Smart Execution**: Tries bunx first (fastest), falls back to npx, then npm exec
- **Data Path Detection**: Uses configured conversation data path or defaults to ~/.claude/projects
- **Error Recovery**: Graceful handling of missing package managers with clear user guidance

### WebDAV Cloud Sync Integration

The extension provides comprehensive WebDAV cloud synchronization capabilities:

**WebDAV Server Support:**

- **Nextcloud**: Self-hosted cloud storage with full WebDAV compatibility
- **ownCloud**: Open-source file sharing platform with WebDAV support
- **Generic WebDAV**: Any WebDAV-compatible server for maximum flexibility

**Sync Capabilities:**

- **Conversation History Sync**: Upload and download conversation JSONL files across devices
- **Usage Statistics Sync**: Cross-device usage aggregation and statistics consolidation
- **Bidirectional Sync**: Smart merge of local and remote data with conflict resolution
- **Delta Sync**: Efficient transfer of only changed data to minimize bandwidth

**Security Features:**

- **Optional Encryption**: AES-256-GCM encryption for sensitive conversation data
- **Secure Credential Storage**: VSCode SecretStorage API for provider authentication
- **Conflict Resolution**: Intelligent merge strategies for concurrent modifications
- **Data Validation**: Input sanitization and path validation for security

**Integration Points:**

- **Tree View Integration**: "Sync to Cloud" and "Cloud Settings" buttons in left panel
- **Enhanced Export**: Export functionality extended with cloud sync options
- **Usage Statistics**: Cloud sync status displayed in usage statistics section
- **Settings Integration**: Cloud configuration accessible through VS Code settings panel

## Recent Updates

### v3.3.4 - Security Fix & Dependency Updates

- **🔒 Security Fix**: Replaced MD5 with SHA256 in SummaryCache for cryptographic security compliance
- **📦 Dependencies Updated**: Updated @eslint/js to 9.32.0 and 13 other development dependencies
- **✅ CodeQL Compliance**: Resolved security alert for weak cryptographic algorithm usage
- **🛡️ Enhanced Security**: All Dependabot security alerts resolved

### v3.3.3 - ccusage Loading Experience Improvements

- **🚀 Improved Loading State**: Added immediate loading spinner with theme-aware animation for ccusage initialization
- **📊 Progressive Feedback**: Shows "Initializing ccusage..." message that updates after 10 seconds to explain package download
- **🔧 Better Error Messages**: Clearer feedback when npx/npm is downloading ccusage package on first run
- **✨ Smoother UX**: Users now understand the 20-30 second initial load is due to package download, not a freeze
- **🎨 Enhanced UI**: Beautiful loading animation with VS Code theme integration and proper loading indicators
- **📝 Improved Logging**: Switched to debug logger system for better troubleshooting without console spam
- **🐛 Bug Fix**: Resolved the "stuck loading" issue that occurred during cold starts when ccusage was being downloaded

### v3.3.2 - Codebase Maintenance & Stability Release

- **🧹 Code Cleanup**: Removed experimental and incomplete features from codebase for better stability
- **🔧 ccusage Integration Maintained**: Preserved and stabilized ccusage CLI integration functionality
- **📦 Release Preparation**: Cleaned up build artifacts, old packages, and unnecessary files
- **🛠️ Architecture Refinement**: Focused on core stable features: CLAUDE.md management, conversation history, PROJECT_PLAN integration, and ccusage usage tracking
- **📋 Documentation Updates**: Updated README.md, CLAUDE.md, and PROJECT_PLAN.md to reflect current stable feature set
- **🚀 Marketplace Ready**: Streamlined extension for marketplace distribution with clean, maintainable codebase

### v3.3.1 - ccusage Integration & Accurate Usage Tracking (Major Update)

- **🆕 ccusage CLI Integration**: Complete replacement of TokenTracker with ccusage for accurate Claude Code usage tracking
- **🆕 Smart Package Manager Detection**: Automatic fallback across bunx → npx → npm exec without requiring pre-installation
- **🆕 Real Usage Data**: Direct access to actual Claude Code token usage, costs, and model breakdowns
- **🆕 Installation Helper**: Built-in guidance for Bun, Node.js, and VS Code extension installation
- **🆕 CcusageService Architecture**: New service layer for CLI integration with 30-second caching
- **🔧 Removed TokenTracker Dependency**: Eliminated complex percentage calculations and window-based tracking
- **🔧 Clean Error Handling**: User-friendly guidance when ccusage is unavailable
- **🔧 Performance Optimized**: Cached CLI calls with automatic cleanup to minimize system impact
- **📋 Documentation Updated**: README.md, CLAUDE.md updated with ccusage integration details
- **🧹 Code Cleanup**: Removed legacy tracking code and simplified usage display logic

**Technical Details**: Replaced the problematic TokenTracker system (which showed 91.9M tokens/918.9% usage) with direct ccusage CLI integration. The new CcusageService provides real Claude Code usage data through smart package manager detection, eliminating the need for complex usage calculations.

### v3.3.0 - WebDAV Cloud Sync Integration & Architecture Simplification (Major Release)

- **🆕 WebDAV Cloud Sync**: Complete WebDAV synchronization architecture supporting Nextcloud, ownCloud, and generic WebDAV servers
- **🆕 Integrated Left Panel**: Replaced command palette commands with seamless left panel integration
- **🆕 Enhanced Export Functionality**: "Sync to Cloud" button with WebDAV sync options (conversations, usage stats, local export, bidirectional)
- **🆕 WebDAV Settings Integration**: Direct access to WebDAV server configuration through "Cloud Settings" button
- **🆕 Secure Authentication**: VSCode SecretStorage API integration for secure credential management
- **🆕 Optional Encryption**: AES-256-GCM encryption for sensitive conversation data
- **🆕 Conflict Resolution**: Smart merge strategies for concurrent modifications across devices
- **🆕 Cross-Device Usage**: Multi-device usage statistics aggregation and synchronization
- **🔧 Tree View Enhancement**: WebDAV sync status integrated into usage statistics section
- **🔧 No Command Palette Clutter**: All WebDAV sync functionality accessible through intuitive UI elements
- **🔧 Architecture Simplification**: Removed multi-provider complexity in favor of focused, reliable WebDAV support
- **🔧 Enhanced Privacy**: Self-hosted storage eliminates dependency on third-party commercial cloud providers

### v3.2.5 - Legacy Visual Usage Monitor (Replaced in v3.3.1)

- **⚠️ REPLACED**: Visual Usage Monitor functionality replaced with ccusage integration in v3.3.1
- **🔧 Historical**: Semi-circular gauge chart and percentage tracking are no longer used
- **📋 Migration**: Real-time usage tracking now powered by ccusage CLI for accuracy

### v3.2.4 - Legacy Usage Tracking (Replaced in v3.3.1)

- **⚠️ REPLACED**: Custom usage percentage calculations replaced with ccusage integration in v3.3.1
- **🔧 Historical**: Manual service tier configuration and window-based tracking no longer needed
- **📋 Migration**: Usage tracking now uses actual Claude Code data instead of estimates

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
