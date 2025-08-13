# Change Log

All notable changes to the "Claude Config Manager" extension will be documented in this file.

## [3.4.1] - 2025-01-11

### Security
- **Packaging Security**: Added `.vscodeignore` to properly exclude development files from distribution
- **Package Optimization**: Reduced package size from 2.42MB to 177KB

### Fixed
- Fixed VSIX packaging configuration
- Improved file exclusion patterns for cleaner distribution

## [3.4.0] - 2025-01-11

### Added
- **Smart Sync Logic**: Enhanced needsSync implementation with hash-based change detection to prevent unnecessary uploads
- **Batch Existence Checking**: Optimized PROPFIND operations to check multiple files efficiently, reducing server load
- **Resume Capability**: Failed upload sessions now resume from where they left off instead of re-uploading all files
- **Sync State Metadata**: Enhanced local sync metadata tracking with ETags and timestamps for accurate change detection

### Changed
- **Performance Improvements**: Reduced WebDAV server stress by implementing intelligent sync state tracking
- **Server Error Resilience**: Better handling of 500 Internal Server Errors with exponential backoff retry logic
- **WebDAV Provider Optimization**: Improved file existence checks and upload logic for better reliability

### Fixed
- Fixed WebDAV sync repeatedly uploading unchanged files
- Resolved server overload issues during large sync operations
- Fixed sync state persistence across extension restarts

## [3.3.4] - 2025-01-10

### Security
- **Security Fix**: Replaced MD5 with SHA256 in SummaryCache for cryptographic security compliance
- **Dependencies Updated**: Updated @eslint/js to 9.32.0 and 13 other development dependencies
- **CodeQL Compliance**: Resolved security alert for weak cryptographic algorithm usage
- **Enhanced Security**: All Dependabot security alerts resolved

## [3.3.3] - 2025-01-09

### Added
- **Improved Loading State**: Added immediate loading spinner with theme-aware animation for ccusage initialization
- **Progressive Feedback**: Shows "Initializing ccusage..." message that updates after 10 seconds to explain package download
- **Better Error Messages**: Clearer feedback when npx/npm is downloading ccusage package on first run
- **Enhanced UI**: Beautiful loading animation with VS Code theme integration and proper loading indicators

### Fixed
- **Bug Fix**: Resolved the "stuck loading" issue that occurred during cold starts when ccusage was being downloaded

### Changed
- **Improved Logging**: Switched to debug logger system for better troubleshooting without console spam
- **Smoother UX**: Users now understand the 20-30 second initial load is due to package download, not a freeze

## [3.3.2] - 2025-01-08

### Changed
- **Code Cleanup**: Removed experimental and incomplete features from codebase for better stability
- **ccusage Integration Maintained**: Preserved and stabilized ccusage CLI integration functionality
- **Release Preparation**: Cleaned up build artifacts, old packages, and unnecessary files
- **Architecture Refinement**: Focused on core stable features: CLAUDE.md management, conversation history, PROJECT_PLAN integration, and ccusage usage tracking
- **Documentation Updates**: Updated README.md, CLAUDE.md, and PROJECT_PLAN.md to reflect current stable feature set
- **Marketplace Ready**: Streamlined extension for marketplace distribution with clean, maintainable codebase

## [3.3.1] - 2025-01-07

### Added
- **ccusage CLI Integration**: Complete replacement of TokenTracker with ccusage for accurate Claude Code usage tracking
- **Smart Package Manager Detection**: Automatic fallback across bunx → npx → npm exec without requiring pre-installation
- **Real Usage Data**: Direct access to actual Claude Code token usage, costs, and model breakdowns
- **Installation Helper**: Built-in guidance for Bun, Node.js, and VS Code extension installation
- **CcusageService Architecture**: New service layer for CLI integration with 30-second caching

### Removed
- **Removed TokenTracker Dependency**: Eliminated complex percentage calculations and window-based tracking
- **Legacy Code Cleanup**: Removed problematic TokenTracker system showing incorrect usage percentages

### Changed
- **Clean Error Handling**: User-friendly guidance when ccusage is unavailable
- **Performance Optimized**: Cached CLI calls with automatic cleanup to minimize system impact
- **Documentation Updated**: README.md, CLAUDE.md updated with ccusage integration details

## [3.3.0] - 2025-01-06

### Added
- **WebDAV Cloud Sync**: Complete WebDAV synchronization architecture supporting Nextcloud, ownCloud, and generic WebDAV servers
- **Integrated Left Panel**: Replaced command palette commands with seamless left panel integration
- **Enhanced Export Functionality**: "Sync to Cloud" button with WebDAV sync options (conversations, usage stats, local export, bidirectional)
- **WebDAV Settings Integration**: Direct access to WebDAV server configuration through "Cloud Settings" button
- **Secure Authentication**: VSCode SecretStorage API integration for secure credential management
- **Optional Encryption**: AES-256-GCM encryption for sensitive conversation data
- **Conflict Resolution**: Smart merge strategies for concurrent modifications across devices
- **Cross-Device Usage**: Multi-device usage statistics aggregation and synchronization

### Changed
- **Tree View Enhancement**: WebDAV sync status integrated into usage statistics section
- **No Command Palette Clutter**: All WebDAV sync functionality accessible through intuitive UI elements
- **Architecture Simplification**: Removed multi-provider complexity in favor of focused, reliable WebDAV support
- **Enhanced Privacy**: Self-hosted storage eliminates dependency on third-party commercial cloud providers

## [3.2.5] - 2025-01-05

### Deprecated
- **Visual Usage Monitor**: Replaced with ccusage integration in v3.3.1
- **Semi-circular Gauge**: Historical feature, no longer used

## [3.2.4] - 2025-01-04

### Deprecated
- **Custom Usage Calculations**: Replaced with ccusage integration in v3.3.1
- **Manual Service Tier Configuration**: No longer needed with real usage data

## [3.2.3] - 2025-01-03

### Fixed
- **Usage Statistics Display**: Corrected zero values in total usage, operations count, and period displays
- **Cost Formatting**: All costs now rounded to cents (2 decimal places) for better readability
- **Better Empty State Handling**: Usage periods now show meaningful descriptions when no data is available
- **Improved Period Descriptions**: Daily/weekly/monthly usage shows actual counts or "No recent activity"

## [3.2.2] - 2025-01-02

### Added
- **Claude Usage Percentage Tracker**: Real-time 0-100% usage tracking with service tier detection
- **Status Bar Integration**: Live percentage display with visual indicators
- **Usage Window Tracking**: Tracks usage cycles with precise reset time calculation
- **Tree View Enhancements**: Usage percentage indicators in tree views
- **Configuration Settings**: New settings for custom limits and warning thresholds

### Fixed
- **TokenTracker Singleton Initialization**: Fixed singleton initialization and error handling
- **Extension Icon Visibility**: Improved extension icon visibility without workspace requirement
- **Publisher ID Compliance**: Updated publisher ID for VSCode marketplace compliance
- **Stability Improvements**: Fixed various initialization race conditions

## [3.2.1] - 2025-01-01

### Added
- **Token Usage Tracking**: Comprehensive token usage monitoring with cost estimation
- **Usage Statistics**: Daily, weekly, and monthly breakdowns
- **Token Tracker Component**: Core component for tracking usage
- **Usage Commands**: Added usage statistics viewing commands
- **Configuration Settings**: New settings for token tracking

## [3.2.0] - 2024-12-31

### Added
- **Expand/Collapse All Controls**: Quick conversation section management
- **Asymmetrical Metadata Layout**: Optimized display for different content lengths
- **Optimized Header Display**: Improved space utilization and readability
- **Enhanced UI Controls**: Better visual organization in conversation viewer

## [3.1.0] - 2024-12-30

### Added
- **PROJECT_PLAN Integration**: Automatic creation of `.claude/.plans/PROJECT_PLAN.md`
- **Plan Mode Integration**: PROJECT_PLAN.md as central repository for plan mode sessions
- **Enhanced Security Compliance**: Automatic .gitignore rules for conversation data
- **Conversation History Browser**: Rich HTML viewer with search and export
- **Multiple Export Formats**: Markdown, JSON, and Plain Text export options

### Fixed
- **Crash Fixes**: Resolved async initialization race conditions

### Security
- Added `.claude/.chats/` to .gitignore to prevent data leaks
- Implemented GitHub push protection compliance
- Enhanced input validation across all user inputs
- Secure file handling with proper error boundaries

## [3.0.0] - 2024-12-29

### Added
- Complete rewrite of extension architecture
- Custom activity bar icon with integrated sidebar
- Conversation history browser with webview interface
- Advanced search functionality across conversations
- Project-based conversation organization

## [2.0.0] - 2024-12-28

### Added
- Automatic CLAUDE.md rule injection
- Git sync to workspace repository
- Configuration management system

## [1.0.0] - 2024-12-27

### Added
- Initial release
- Basic CLAUDE.md file management
- Simple Git operations