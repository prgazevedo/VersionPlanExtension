# Claude Config Manager v3.1.0 - Project Plan

## Overview
Complete transformation of Claude Config Manager from template-based CLAUDE.md management to comprehensive conversation history browser with Git integration.

## Current Status - MOSTLY COMPLETE ✅
- ✅ **COMPLETED**: Core conversation history browser implementation
- ✅ **COMPLETED**: Remove template functionality completely
- ✅ **COMPLETED**: Fix conversation viewer with collapsible interface
- ✅ **COMPLETED**: Clean conversation content formatting 
- ✅ **COMPLETED**: Workspace-based .claude directory structure
- ✅ **COMPLETED**: Export functionality to .claude/.chats folder
- ✅ **COMPLETED**: Terse timestamp format and compact headers
- ⏳ **PENDING**: Final documentation updates

## Key Features Implemented

### Conversation History Browser
- **Rich webview interface** with collapsible request grouping
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

## Remaining Tasks

### Documentation Updates
- [ ] Update README.md with v3.1 features
- [ ] Remove all template-related documentation
- [ ] Add conversation browser usage guide
- [ ] Document .claude directory structure

### Future Enhancements (Low Priority)
- [ ] Conversation search across projects
- [ ] Batch export functionality
- [ ] Keyboard shortcuts for actions
- [ ] Context menus in tree view

## File Organization

### Extension Files We Track
- **workspace/.claude/.chats/** - Exported conversations
- **workspace/.claude/.plans/** - Project plans and documentation
- **workspace/CLAUDE.md** - Main configuration file

### External Dependencies
- **~/.claude/projects/** - Claude Code conversation data (read-only)
- **workspace/.git/** - Git repository for CLAUDE.md sync

---

**Version**: 3.1.0  
**Status**: Production Ready  
**Last Updated**: Current Session  
**Next Review**: When adding new features