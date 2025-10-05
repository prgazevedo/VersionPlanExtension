# Project Plan - Claude Config Manager Extension

## Overview

VS Code extension that enhances Claude Code workflow with comprehensive management for CLAUDE.md files, conversation history, PROJECT_PLAN integration, and usage tracking.

**Version**: 3.8.0
**Status**: Active Development - Native Usage Tracker Implemented

## Architecture

### Core Components

1. **CLAUDE.md Management** (`src/extension.ts`, `src/fileManager.ts`)
   - Auto-sync CLAUDE.md with Git repositories
   - PROJECT_PLAN integration with automatic rule injection
   - File watching for real-time updates

2. **Conversation History** (`src/conversation/`)
   - `ConversationManager.ts` - Reads JSONL files from `~/.claude/projects/`
   - `ConversationTreeProvider.ts` - Tree view for browsing conversations
   - `ConversationViewer.ts` - Webview for conversation details
   - `SummaryCache.ts` - Performance optimization for conversation metadata

3. **Usage Tracking** (`src/components/`, `src/services/`)
   - **CURRENT (v3.8.0)**: Native JSONL parser via `UsageCalculator.ts`
   - **IMPLEMENTED**: Direct JSONL parsing replaces external ccusage CLI
   - `CcusageService.ts` - Service wrapper (now uses native calculator)
   - `TokenWindowMonitor.ts` - Real-time 5-hour token window tracking
   - `UsageMonitorTreeProvider.ts` - Tree view for usage statistics

4. **WebDAV Cloud Sync** (`src/cloud/`)
   - Cross-device conversation and usage sync
   - Supports Nextcloud, ownCloud, generic WebDAV
   - Encrypted storage with conflict resolution

5. **Conversation Fork Analysis** (`src/conversation/fork/`)
   - Real-time fork detection and visualization
   - Token analysis for branches
   - Context window monitoring

## Development Setup

### Prerequisites
- Node.js 18+
- VS Code 1.70+
- Git

### Installation
```bash
npm install
npm run compile
npx vsce package
code --install-extension claude-config-manager-3.8.0.vsix
```

### Testing
```bash
npm test
npm run lint
# Press F5 in VS Code for Extension Development Host
```

## Key Files & Directories

### Source Code
- `src/extension.ts` - Main extension entry point, command registration
- `src/claudeTreeProvider.ts` - Left panel tree view provider
- `src/conversation/ConversationManager.ts` - **CRITICAL**: Already reads JSONL files from `~/.claude/projects/`
- `src/services/CcusageService.ts` - **DEPRECATED**: External ccusage CLI wrapper (to be replaced)
- `src/components/TokenWindowMonitor.ts` - Real-time token window tracking
- `src/components/UsageMonitor.ts` - Usage display logic

### Configuration
- `package.json` - Extension manifest, commands, configuration schema
- `.vscodeignore` - Files excluded from packaging
- `tsconfig.json` - TypeScript compiler configuration

### Documentation
- `CLAUDE.md` - Developer instructions for Claude Code (auto-generated rules)
- `PROJECT_PLAN.md` - This file
- `CHANGELOG.md` - Version history and release notes

## Development Workflow

### Making Changes
1. Edit TypeScript files in `src/`
2. Run `npm run compile` to build
3. Test in Extension Development Host (F5)
4. Package with `npx vsce package`
5. Install with `code --install-extension *.vsix --force`

### Release Process
1. Update version in `package.json`
2. Update `CHANGELOG.md` with release notes
3. Compile and package
4. Tag release in Git
5. Publish to VS Code Marketplace (when ready)

## Important Context

### Claude Code JSONL File Structure

**Location**: `~/.claude/projects/<project-hash>/<session-id>.jsonl`

**Format**: Each line is a JSON object representing a conversation message

**Key Fields for Usage Tracking**:
```json
{
  "message": {
    "model": "claude-sonnet-4-5-20250929",
    "usage": {
      "input_tokens": 4,
      "output_tokens": 42,
      "cache_creation_input_tokens": 17438,
      "cache_read_input_tokens": 5371,
      "service_tier": "standard"
    }
  },
  "timestamp": "2025-10-05T10:01:58.273Z",
  "sessionId": "67efb1da-6130-4e42-8a80-4cc3deab37aa",
  "uuid": "eeaec481-ddd9-4009-b9fc-83a4ddbdabb0"
}
```

### Current Usage Tracking Implementation (v3.8.0)

**✅ IMPLEMENTED**: Native JSONL parser via `UsageCalculator.ts`

- Direct reading from `~/.claude/projects/` JSONL files
- Zero external dependencies (no CLI spawning)
- Instant performance with 30-second caching
- Reads same files that `ConversationManager` uses
- Full model pricing and cost calculations built-in

### ~~Proposed Native Usage Tracker~~ - COMPLETED v3.8.0

**Opportunity**: We're already reading these JSONL files in `ConversationManager`!

**Benefits of Native Implementation**:
1. ✅ **Zero external dependencies** - No ccusage CLI needed
2. ✅ **Instant performance** - No process spawning, no 30-second cache needed
3. ✅ **Real-time updates** - Can update as conversations happen via file watching
4. ✅ **Better integration** - Full control over UI and features
5. ✅ **Smaller package** - Remove ccusage dependency entirely
6. ✅ **More reliable** - No package manager detection, no CLI errors

**Implementation Approach**:
```typescript
// Create new: src/services/UsageCalculator.ts
class UsageCalculator {
  // Read JSONL files (reuse ConversationManager logic)
  // Parse usage fields from each message
  // Calculate totals: input, output, cache creation, cache read
  // Calculate costs based on model pricing
  // Aggregate by date, session, model, time window
  // Return structured usage data
}
```

**Model Pricing** (as of 2025):
```typescript
const MODEL_PRICING = {
  'claude-sonnet-4-5-20250929': {
    input: 3.00 / 1_000_000,        // $3 per MTok
    output: 15.00 / 1_000_000,      // $15 per MTok
    cacheWrite: 3.75 / 1_000_000,   // $3.75 per MTok
    cacheRead: 0.30 / 1_000_000     // $0.30 per MTok
  },
  'claude-opus-4-20250514': {
    input: 15.00 / 1_000_000,
    output: 75.00 / 1_000_000,
    cacheWrite: 18.75 / 1_000_000,
    cacheRead: 1.50 / 1_000_000
  }
  // Add other models as needed
};
```

**Data Already Available** in ConversationManager:
- ✅ JSONL file reading
- ✅ File watching for real-time updates
- ✅ Summary caching for performance
- ✅ Project grouping
- ✅ Session tracking

**What Needs to be Added**:
- Usage field extraction from messages
- Token aggregation logic
- Cost calculation
- Time-based grouping (daily, monthly, session)
- 5-hour token window tracking (already partially implemented in TokenWindowMonitor)

### Context7 Integration - REMOVED

**Decision**: Removed in v3.7.0
**Reason**: Claude Code's built-in WebSearch is more versatile, Context7 MCP provides better integration
**Files Cleaned**: All Context7 auto-append functions and CLAUDE.md rules removed from extension.ts, claudeTreeProvider.ts

## TODO - Current Priorities

### ✅ COMPLETED: Native Usage Tracker (v3.8.0)

**Goal**: ~~Remove ccusage dependency and implement native JSONL usage parsing~~ ✅ DONE

**Completed Tasks**:

1. ✅ Created `src/services/UsageCalculator.ts`
   - Parses JSONL message usage fields
   - Aggregates tokens by type (input, output, cache creation, cache read)
   - Calculates costs based on model pricing
   - Supports time-based grouping (daily, monthly, session, 5-hour windows)

2. ✅ Updated `src/services/CcusageService.ts`
   - Removed external CLI execution
   - Uses UsageCalculator internally
   - Maintains same interface for backward compatibility

3. ✅ Updated `src/components/TokenWindowMonitor.ts`
   - Uses native UsageCalculator instead of ccusage blocks command
   - Removed CLI dependencies
   - Instant performance

4. ⏭️ Pending: Update `src/components/UsageMonitor.ts` (works as-is)
   - Loading states still functional
   - Can be optimized in future release

5. ⏭️ Pending: Update `src/UsageMonitorTreeProvider.ts` (works as-is)
   - Error handling still valid
   - Can be simplified in future release

6. ✅ Updated `package.json`:
   - Updated description: "native usage tracking"
   - Version bumped to 3.8.0

7. ✅ Updated documentation:
   - `CLAUDE.md` - Updated with native tracker info
   - `CHANGELOG.md` - v3.8.0 release documented
   - `PROJECT_PLAN.md` - Updated status and implementation notes

**Achieved Benefits**:

- ✅ 🚀 Instant usage display (no CLI spawning)
- ✅ 📦 Smaller extension package
- ✅ 🔄 Foundation for real-time updates
- ✅ 🛠️ Easier debugging and maintenance
- ✅ ✅ Zero external dependencies

### 📋 MEDIUM PRIORITY

- Improve PROJECT_PLAN template with better examples
- Add export functionality for usage statistics (CSV, JSON)
- Enhance WebDAV sync with better progress indicators

### 📌 LOW PRIORITY

- Bundle extension with webpack for smaller size
- Add more unit tests
- Improve error messages and logging

## Recent Changes (v3.8.0)

1. ✅ Implemented native JSONL usage tracker (`UsageCalculator.ts`)
2. ✅ Migrated CcusageService from CLI to native calculator
3. ✅ Updated TokenWindowMonitor for native integration
4. ✅ Removed all external ccusage CLI dependencies
5. ✅ Updated documentation across all files
6. ✅ Version bump to 3.8.0 - major performance release

## Previous Changes (v3.6.0)

1. ✅ Moved PROJECT_PLAN.md to workspace root
2. ✅ Updated ccusage to @latest (v17.1.2+) with HTTP transport
3. ✅ Removed Context7 status indicators from tree view
4. ✅ Fixed TokenWindowMonitor connection issues
5. ✅ Enhanced tree view status indicators

## Next Session Guidance

**For the next Claude Code instance working on this project**:

1. **Priority Task**: Implement native usage tracker to replace ccusage
   - Start with `src/services/UsageCalculator.ts`
   - Reference `ConversationManager.ts` for JSONL reading patterns
   - Use model pricing from this document
   - Test with existing JSONL files in `~/.claude/projects/`

2. **Context to Remember**:
   - We already read JSONL files - don't duplicate this logic
   - ConversationManager has file watching - extend it
   - SummaryCache pattern can be reused for usage caching
   - Keep same UI/commands - just swap backend implementation

3. **Files to Focus On**:
   - Read: `src/conversation/ConversationManager.ts` (JSONL parsing)
   - Read: `src/services/CcusageService.ts` (current interface)
   - Create: `src/services/UsageCalculator.ts` (new core logic)
   - Update: `src/components/TokenWindowMonitor.ts` (use new service)

4. **Testing Strategy**:
   - Use real JSONL files from `~/.claude/projects/`
   - Compare output with ccusage to verify accuracy
   - Test real-time updates by creating new conversations
   - Verify 5-hour token window calculations

5. **Success Criteria**:
   - Extension loads without ccusage dependency
   - Usage statistics match ccusage output
   - Real-time updates work as conversations happen
   - Performance is faster than current implementation

---

**Last Updated**: 2025-10-05
**Current Version**: 3.8.0
**Next Version Target**: 3.9.0 (TBD - Future Enhancements)
