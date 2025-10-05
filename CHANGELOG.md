# Change Log

All notable changes to the "Claude Config Manager" extension will be documented in this file.

## [3.10.1] - 2025-10-05

### 🧹 Simplification - Real Data Only

#### **Major Changes**
- **Removed all estimate-based features** (limits, burn rates, projections, percentages)
- **Simplified to show only actual ccusage data**:
  - Token usage (total tokens in window)
  - Cost (total cost in window)
  - Time window (start/end times)
  - Models used
  - API call count

#### **Why?**
ccusage v17.1.2 (and all versions) don't provide:
- `tokenLimitStatus` (always null)
- `burnRate` (always null)
- `projection` (always null)

These were aspirational features that never existed in ccusage CLI output.

#### **Technical Changes**
- Simplified `TokenWindowData` interface (6 fields vs 15+)
- Simplified `DisplayData` interface (6 fields vs 12+)
- Removed `parseSimpleData()`, `getSubscriptionInfo()`, `createProgressBar()`, `getStatusIcon()`
- Updated `UsageMonitorTreeProvider` to display real data only
- Cleaner, simpler codebase focused on what actually works

#### **User Benefits**
- ✅ Shows accurate token usage from ccusage
- ✅ No misleading percentages or projections
- ✅ Clear, simple display of actual data
- ✅ More reliable - no calculations that can go wrong

## [3.10.0] - 2025-10-05

### 🔄 Reverted to ccusage CLI Integration

#### **Why the Revert?**
The "native" JSONL parser (v3.8.0-3.9.1) was fundamentally flawed:
- ❌ Didn't understand 5-hour billing windows
- ❌ Couldn't track session vs weekly limits
- ❌ Miscalculated usage (showed 109.5M tokens vs actual ~75K)
- ❌ No subscription tier detection

#### **Back to ccusage v17.1.2**
- ✅ **Accurate 5-hour window tracking** - Matches Claude's billing model
- ✅ **Proper limit detection** - Session limits, weekly limits, tier-specific caps
- ✅ **Correct usage calculation** - Matches `/usage` command output
- ✅ **Subscription tier support** - Free, Pro, Max detection
- ✅ **Proven reliability** - Battle-tested CLI tool

#### **Technical Changes**
- **Restored**: `CcusageService.ts` now uses ccusage CLI v17.1.2
- **Restored**: `TokenWindowMonitor.ts` uses ccusage blocks command
- **Kept**: `UsageCalculator.ts` available for future conversation analysis
- **Updated**: All methods use ccusage execution with smart package manager fallback

#### **User Benefits**
- Usage stats now match what you see in Claude CLI's `/usage` command
- Accurate percentage tracking (not inflated 54000%)
- Proper window reset times
- Real subscription limits

## [3.9.1] - 2025-10-05

### 🐛 Bug Fix - Usage Calculation

#### **Fixed Token Counting**
- **Issue**: UsageCalculator was incorrectly adding cache tokens to totalTokens
  - Showed inflated numbers like 109.5M tokens when actual usage was much lower
  - Cache creation and cache read tokens were being added to the total
- **Fix**: Total tokens now only includes input + output tokens
  - Cache tokens are still tracked separately for cost calculation
  - Matches Claude API billing model
- **Files Changed**: `src/services/UsageCalculator.ts` (lines 341, 362)

### 📊 Correct Display
- ✅ Total tokens = input_tokens + output_tokens only
- ✅ Cache tokens tracked separately for accurate cost calculation
- ✅ Usage percentages now display correctly

## [3.9.0] - 2025-10-05

### 🧹 Code Cleanup - Fork Manager Removal

#### **Removed Fork Manager Feature**
- **Reason**: Claude Code now has native fork management built-in
- **Removed Components**:
  - Removed `claude-fork-manager` tree view
  - Removed all fork-related commands (15+ commands)
  - Removed Fork Manager source files (`src/conversation/fork/`)
  - Removed context menu items for fork operations
  - Simplified extension.ts by removing fork initialization code

#### **Benefits**
- ✅ **Reduced Complexity**: Removed duplicate functionality
- ✅ **Smaller Package**: Eliminated unnecessary code
- ✅ **Better UX**: Users can rely on Claude Code's native fork tools
- ✅ **Easier Maintenance**: Less code to maintain and debug

#### **Updated Components**
- **package.json**: Removed fork manager view and commands
- **extension.ts**: Removed fork tree provider and related code
- **ConversationViewer.ts**: Removed fork analysis (now shows fork count as 0)
- **Usage Monitor**: Renamed from "CCUsage Monitor" to "Usage Monitor"

### 📦 Package Updates
- Version: 3.8.0 → 3.9.0
- Extension size: 1.24MB (200 files) - further optimization pending

## [3.8.0] - 2025-10-05

### 🚀 Major Performance Release - Native Usage Tracker

#### **Replaced ccusage CLI with Native JSONL Parser**
- **🆕 Native UsageCalculator**: Direct JSONL parsing replaces external ccusage CLI tool
  - Zero external dependencies - no more bunx/npx/npm required
  - Instant performance - no process spawning overhead
  - Reads directly from `~/.claude/projects/` JSONL files
  - Built-in 30-second caching for optimal performance
  - Supports daily, monthly, session, and time-window queries

#### **Technical Improvements**
- **New File**: `src/services/UsageCalculator.ts` - Core native JSONL parser
  - Parses Claude Code message format with usage fields
  - Calculates tokens by type (input, output, cache creation, cache read)
  - Accurate cost calculations based on model pricing
  - Time-range filtering and aggregation
  - Model breakdown and conversation tracking

- **Refactored**: `src/services/CcusageService.ts` - Migrated to native backend
  - Removed all CLI execution code (exec, package manager detection)
  - Uses UsageCalculator internally for all operations
  - Maintains backward-compatible API (no breaking changes)
  - Converted legacy format handling for seamless migration

- **Updated**: `src/components/TokenWindowMonitor.ts` - Native 5-hour window tracking
  - Removed ccusage CLI dependency
  - Direct integration with UsageCalculator
  - Faster real-time token window updates

#### **Performance Benefits**
- ⚡ **Instant Response**: No CLI process spawning delays
- 📦 **Smaller Package**: Eliminated ccusage-related code
- 🔄 **Real-time Ready**: Foundation for live file watching integration
- 🛠️ **Easier Debugging**: Pure TypeScript, no external dependencies
- ✅ **Zero Setup**: No package manager or CLI tool required

#### **Backward Compatibility**
- All existing usage tracking features work unchanged
- Same API for components consuming usage data
- Seamless migration from ccusage CLI
- Test availability now returns "Native v3.8.0"

### 📦 Package Updates
- Description updated: "ccusage-powered" → "native usage tracking"
- Extension size: 1.24MB (200 files)

## [3.7.0] - 2025-10-05

### 🧹 Removed Features

#### **Context7 Auto-Append Functionality**
- **Removed Context7 toggle button** from tree view (command still exists for backward compatibility)
- **Removed automatic CLAUDE.md rule injection** for Context7 auto-append
- **Cleaned up extension code** from Context7 integration logic in extension.ts and claudeTreeProvider.ts
- **Reason for Removal**: Context7 MCP server provides better integration directly with Claude Code
  - MCP integration is more reliable and feature-rich
  - No need for CLAUDE.md rule injection when using MCP
  - Reduces extension complexity and maintenance burden
  - Users can install Context7 MCP for superior documentation access

### 📚 Documentation Updates

- Updated PROJECT_PLAN.md to reflect Context7 removal and v3.7.0 status
- Updated CLAUDE.md to remove Context7 auto-append instructions
- Clarified that Context7 MCP is the preferred integration method

### 🔧 Technical Changes

- Removed `toggleContext7` and `installContext7Help` command implementations
- Removed Context7 status checking from ClaudeTreeDataProvider
- Simplified tree view by removing Context7 section
- Commands remain registered for backward compatibility but show deprecation notice

### ⬆️ Version Updates

- Extension version: 3.6.0 → 3.7.0
- Updated all documentation references

## [3.6.0] - 2025-10-05

### 🎯 Major Improvements

#### **PROJECT_PLAN Location Change (Breaking Change)**
- **Moved PROJECT_PLAN.md to workspace root** (from `.claude/.plans/PROJECT_PLAN.md`)
  - Better discoverability in file explorer
  - More visible to Claude Code
  - Standard location for project documentation
  - Easier to reference and maintain
  - **Migration**: Existing users should move their PROJECT_PLAN.md to workspace root

#### **ccusage Version Update**
- **Updated to ccusage@latest (v17.1.2+)** (from pinned v15.9.7)
  - Latest features and bug fixes
  - Improved performance and reliability
  - Better error handling
  - Full compatibility verified

#### **Enhanced Context7 Integration**
- **Added Context7 status indicator in tree view**
  - Shows "Context7 ✓ (Active)" when enabled and configured
  - Shows "Context7 ⚠ (Enabled but no rule)" if misconfigured
  - Shows "Context7 (Disabled)" when not active
  - Click to toggle Context7 on/off
- **Improved Context7 setup experience**
  - Better detection of Context7 MCP installation
  - Clearer setup instructions
  - Visual feedback in sidebar

### 🔧 Technical Changes

- Updated all PROJECT_PLAN path references in `extension.ts`
- Updated CLAUDE.md integration rules to point to root location
- Enhanced `ClaudeTreeDataProvider` with Context7 status checking
- **Improved Context7 installation**: Added automatic installation via Smithery or NPM with one-click MCP configuration
- **Fixed TokenWindowMonitor**: Added comprehensive logging and error handling for real-time token tracking
- Updated documentation in CLAUDE.md

### 📚 Documentation Updates

- Updated CLAUDE.md with new PROJECT_PLAN location
- Added ccusage version information
- Enhanced Context7 documentation
- Updated setup instructions

### ⬆️ Dependencies

- ccusage: 15.9.7 → latest (17.1.2+)

### 🐛 Bug Fixes

- Fixed PROJECT_PLAN path inconsistencies
- Improved Context7 rule detection

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