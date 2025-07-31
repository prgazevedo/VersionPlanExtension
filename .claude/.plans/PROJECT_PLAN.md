# Claude Config Manager v3.2.2 - Project Plan

## Overview
Comprehensive VSCode extension for Claude Code workflows providing CLAUDE.md configuration management, conversation history browsing, and intelligent PROJECT_PLAN integration with Git. Now ready for VSCode marketplace publication.

## Current Status - PRODUCTION READY ✅
- ✅ **COMPLETED**: Core conversation history browser implementation
- ✅ **COMPLETED**: Enhanced UI with Expand/Collapse All controls
- ✅ **COMPLETED**: Asymmetrical metadata layout optimization
- ✅ **COMPLETED**: PROJECT_PLAN integration with auto-rule injection
- ✅ **COMPLETED**: Complete template system removal and cleanup
- ✅ **COMPLETED**: GitignoreManager utility for security compliance
- ✅ **COMPLETED**: v3.2.0 release from main branch
- ✅ **COMPLETED**: Documentation updates for marketplace readiness
- ✅ **COMPLETED**: v3.2.2 - Token tracker stability improvements and bug fixes
- ✅ **COMPLETED**: v3.2.2 - Claude Usage Percentage Tracker implementation with real-time 0-100% usage monitoring

## Key Features Implemented

### Claude Usage Percentage Tracker v3.2.2 🆕
- **Real-time Percentage Monitoring**: Shows 0-100% usage within Claude's weekly rolling windows
- **Automatic Service Tier Detection**: Detects Claude subscription tier (Free, Pro, Max-100, Max-200) from conversation metadata
- **Status Bar Integration**: Live updates with visual indicators: `📊 Claude: 45.2% (2d 14h)`
- **Weekly Rolling Windows**: Tracks 7-day usage cycles with precise reset time calculation
- **Visual Warning System**: Icons change based on thresholds (📊 normal, ⚠️ warning at 80%, 🚨 critical at 95%)
- **Tree View Integration**: Percentage indicators in Claude Config and Usage Statistics views
- **Safety Checks**: Comprehensive error handling for division by zero, NaN values, and negative time calculations
- **Configuration Options**: Custom limits, warning thresholds, and percentage display toggle

### Conversation History Browser v3.2.0
- **Rich webview interface** with collapsible request grouping
- **Enhanced Controls**: Expand All and Collapse All buttons for conversation management
- **Asymmetrical Metadata Layout**: Two-section design with compact short values and full-width long values
- **Optimized Header**: Improved space utilization with better text overflow handling
- **Terse format**: `23:54:07/19/25 - User Prompt [metadata]`
- **Clean collapsed sections** with no spacing artifacts
- **VSCode theme integration** with proper styling
- **Starts collapsed** by default for clean interface

### Export System
- **Export to MD, JSON, TXT** formats
- **Defaults to workspace/.claude/.chats/** folder
- **Auto-creates directory structure** on extension startup
- **User can choose different location** via save dialog

### Directory Structure
```
workspace/
├── .claude/
│   ├── .chats/          # Exported conversations
│   └── .plans/          # Project plans (this file)
└── CLAUDE.md            # Main configuration
```

### Security & Reliability
- **Path sanitization** prevents directory traversal
- **Safe directory creation** doesn't overwrite existing
- **Graceful error handling** for missing directories
- **Extension works** even if directory creation fails

## Technical Architecture

### Core Components
1. **ConversationManager** - JSONL parsing from ~/.claude/projects/
2. **ConversationTreeProvider** - VSCode tree view for browsing
3. **ConversationViewer** - Rich webview with collapsible interface
4. **Export System** - Multi-format conversation export
5. **Directory Management** - Workspace .claude structure
6. **TokenTracker v3.2.2** - Usage percentage calculation engine with service tier detection
7. **UsageTreeProvider v3.2.2** - Dedicated usage statistics tree view with percentage display

### Recent Major Fixes
- ✅ **Collapsible content properly hides** when collapsed (no phantom spacing)
- ✅ **Workspace-based exports** instead of home directory
- ✅ **Removed all debug styling** and box outline issues
- ✅ **Compact timestamp format** for maximum terseness
- ✅ **Auto-directory creation** on extension startup

## Configuration

### Extension Settings
```json
{
  "claude-config.autoSync": false,
  "claude-config.conversationDataPath": "~/.claude/projects"
}
```

### Available Commands
- `claude-config.sync` - Sync CLAUDE.md to Git
- `claude-config.edit` - Edit CLAUDE.md
- `claude-config.openConversations` - Browse conversations
- `claude-config.refreshConversations` - Refresh conversation list
- `claude-config.viewConversation` - Open conversation viewer
- `claude-config.exportConversation` - Export conversation
- **NEW v3.2.2**: `claude-config.viewUsageStats` - View detailed usage statistics with percentage breakdown
- **NEW v3.2.2**: `claude-config.showUsageQuickPick` - Quick usage summary with percentage display
- **NEW v3.2.2**: `claude-config.refreshUsage` - Refresh usage statistics and percentage calculations

## Development Commands

### Build & Test
```bash
npm run compile          # Compile TypeScript
npm run lint            # Run ESLint
vsce package            # Package extension
```

### Install & Test
```bash
code --uninstall-extension prgazevedo.claude-config-manager
code --install-extension claude-config-manager-*.vsix
```

## Success Criteria - Phase 1 ✅

- ✅ Extension installs without errors
- ✅ Activity bar shows single Claude Config icon
- ✅ Conversation tree view loads and displays conversations
- ✅ Conversation webview opens with clean collapsible interface
- ✅ Export functionality works for all formats (MD, JSON, TXT)
- ✅ No template functionality visible anywhere
- ✅ Workspace .claude directory structure working

## VSCode Marketplace Publication

### Publication Readiness ✅
- ✅ **Extension Package**: `claude-config-manager-3.2.0.vsix` ready
- ✅ **GitHub Release**: Published from main branch with proper assets
- ✅ **Documentation**: README.md and CLAUDE.md fully updated
- ✅ **Security Compliance**: All security features implemented
- ✅ **Version Consistency**: All files updated to v3.2.0

### Marketplace Submission Steps
To publish to VSCode marketplace, you need to:

1. **Create Publisher Account**:
   - Visit https://marketplace.visualstudio.com/manage/publishers
   - Create account with Microsoft/Azure credentials
   - Set up publisher profile for "prgazevedo"

2. **Generate Personal Access Token**:
   - Go to https://dev.azure.com/[your-org]/_usersSettings/tokens
   - Create token with "Marketplace (manage)" scope
   - Configure vsce: `vsce login prgazevedo`

3. **Publish Extension**:
   ```bash
   vsce publish
   # or manual upload the .vsix file via web interface
   ```

### Future Enhancements (Low Priority)
- [ ] Conversation search across projects
- [ ] Batch export functionality
- [ ] Keyboard shortcuts for actions
- [ ] Context menus in tree view
- [ ] Marketplace analytics integration

## File Organization

### Extension Files We Track
- **workspace/.claude/.chats/** - Exported conversations
- **workspace/.claude/.plans/** - Project plans and documentation
- **workspace/CLAUDE.md** - Main configuration file

### External Dependencies
- **~/.claude/projects/** - Claude Code conversation data (read-only)
- **workspace/.git/** - Git repository for CLAUDE.md sync

---

**Version**: 3.2.2  
**Status**: Ready for VSCode Marketplace Publication  
**Last Updated**: July 2025 - Release v3.2.2  
**Next Review**: Post-marketplace publication feedback