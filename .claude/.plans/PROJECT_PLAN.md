# Claude Config Manager v3.3.2 - Project Plan

## Overview
Comprehensive VSCode extension for Claude Code workflows providing CLAUDE.md configuration management, conversation history browsing, intelligent PROJECT_PLAN integration with Git, ccusage-powered usage tracking, and core functionality focus. Ready for VSCode marketplace publication.

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
- ✅ **COMPLETED**: v3.2.4 - Fixed usage model from weekly to daily tracking
- ✅ **COMPLETED**: v3.2.5 - Visual Usage Monitor with gauge chart display
- ✅ **COMPLETED**: v3.3.0 - WebDAV Cloud Sync Implementation & Architecture Simplification
- ✅ **COMPLETED**: v3.3.1 - Legacy TokenTracker removal and ccusage CLI integration
- ✅ **COMPLETED**: v3.3.2 - Codebase Maintenance & Stability Release

## Key Features Implemented

### WebDAV Cloud Sync Architecture v3.3.0 🆕
- **WebDAV Server Support**: Compatible with Nextcloud, ownCloud, and any WebDAV server
- **Local-First Architecture**: Maintains current performance with optional cloud backup
- **Data Synchronization**:
  - Claude conversation history from `~/.claude/projects/`
  - Token usage statistics and analytics
  - Cross-device data aggregation and conflict resolution
- **Security Features**:
  - Optional AES-256-GCM encryption before upload
  - PBKDF2 key derivation from user passwords
  - Secure credential storage using VSCode SecretStorage API
  - SSL certificate validation with self-signed certificate support
- **UI Integration**:
  - Replaced "Export All Conversations" with "Sync to Cloud" in tree view
  - Added "Cloud Settings" entry for WebDAV configuration
  - No command palette clutter - fully integrated into left panel
- **Background Operations**: Automatic sync with manual trigger options
- **Conflict Resolution**: Smart merge strategies for concurrent modifications

### Visual Usage Monitor v3.2.5
- **Semi-circular Gauge Chart**: Canvas-based gauge showing 0-100% usage with gradient colors
- **Real-time Updates**: Live data refresh every 5 seconds without page reload
- **Visual Components**:
  - Large gauge display with percentage value
  - Current session tokens and daily cost
  - Daily limit and reset time countdown
  - Horizontal progress bar with 80% and 95% threshold markers
- **Color-coded Status**: Blue (normal), Yellow (warning >80%), Red (critical >95%)
- **Responsive Design**: Adapts to VS Code light/dark themes
- **WebView Integration**: Seamless integration above existing statistics panel

### Claude Usage Percentage Tracker v3.2.4 (Updated)
- **Daily Usage Monitoring**: Corrected from weekly to daily tracking (aligned with Claude's session-based model)
- **Manual Service Tier Detection**: User-configurable tier setting (Free, Pro, Max-100, Max-200)
- **Status Bar Integration**: Live updates with visual indicators: `📊 Claude: 45.2% (8h 30m)`
- **Daily Reset Windows**: Tracks daily usage with midnight reset times
- **Visual Warning System**: Icons change based on thresholds (📊 normal, ⚠️ warning at 80%, 🚨 critical at 95%)
- **Tree View Integration**: "Daily Usage" percentage indicators in Claude Config and Usage Statistics views
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
6. **TokenTracker v3.2.4** - Usage percentage calculation engine with daily tracking
7. **UsageTreeProvider v3.2.4** - Dedicated usage statistics tree view with percentage display
8. **Visual Usage Monitor v3.2.5** - Real-time gauge display component (`src/components/UsageMonitor.ts`)
9. **Enhanced Usage Commands v3.2.5** - Updated `usage.ts` with visual monitor integration
10. **WebDAV Cloud Sync System v3.3.0** - WebDAV cloud synchronization architecture:
    - `CloudProviderInterface.ts` - WebDAV provider abstraction
    - `CloudDataSchema.ts` - Data structures and conflict resolution
    - `CloudAuthManager.ts` - WebDAV credential management
    - `CloudEncryption.ts` - Optional AES-256-GCM encryption
    - `WebDAVProvider.ts` - WebDAV implementation with self-hosted support
    - `CloudConversationManager.ts` - Extended conversation management
    - `CloudTokenTracker.ts` - Cross-device usage aggregation
    - `cloudSyncIntegrated.ts` - UI integration commands

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
  "claude-config.conversationDataPath": "~/.claude/projects",
  "claude-config.cloudSync.enabled": false,
  "claude-config.cloudSync.webdav.serverUrl": "https://your-domain.com/remote.php/dav/files/username/",
  "claude-config.cloudSync.webdav.username": "your-username",
  "claude-config.cloudSync.webdav.basePath": "/Claude-Config-Sync/",
  "claude-config.cloudSync.webdav.verifySSL": true,
  "claude-config.cloudSync.encryption": false,
  "claude-config.cloudSync.autoSync": false,
  "claude-config.cloudSync.syncInterval": 0,
  "claude-config.cloudSync.conflictResolution": "ask"
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
- **NEW v3.3.0**: `claude-config.syncToCloud` - Integrated WebDAV cloud sync with multiple options
- **NEW v3.3.0**: `claude-config.openCloudSettings` - Configure WebDAV server connection

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

## ccusage Cloud Sync Integration v3.3.2 🚧

### Overview
Integration of ccusage CLI data into WebDAV cloud synchronization system, enabling real usage statistics sync across devices instead of stub data.

### Phase 1: CloudTokenTracker ccusage Integration ✅
**Objective**: Replace stub data in CloudTokenTracker with real ccusage statistics

**Tasks**:
- ✅ Import CcusageService into CloudTokenTracker
- ✅ Replace getStatistics() stub method with ccusage data retrieval
- ✅ Update getUsageCloudSyncStatus() to reflect actual sync capability
- ✅ Add graceful error handling for ccusage unavailability (fallback to stubs)
- ✅ Test compilation and basic functionality

**Expected Outcome**: ✅ **COMPLETED** - CloudTokenTracker returns real usage data from ccusage instead of zeros

### Phase 2: Data Transformation & Aggregation ✅
**Objective**: Transform ccusage data format to match UsageStatistics interface

**Tasks**:
- ✅ Create ccusage-to-UsageStatistics mapping function
- ✅ Transform ccusage daily data to dailyUsage array format
- ✅ Calculate weekly usage aggregations from daily data
- ✅ Calculate monthly usage aggregations from daily data  
- ✅ Map token breakdowns (input, output, cache creation, cache read)
- ✅ Set accurate lastUpdated timestamp from ccusage data
- ✅ Fix async/Promise type mismatches in CloudSyncTreeProvider
- ✅ Update getCrossDeviceUsage() to handle async getStatistics()
- ✅ Successful compilation and packaging

**Expected Outcome**: ✅ **COMPLETED** - CloudTokenTracker.getStatistics() returns properly formatted UsageStatistics with real aggregations

### Phase 3: Enhanced Cloud Sync Operations 📋
**Objective**: Enable real usage data upload/download with WebDAV

**Tasks**:
- [ ] Update syncUsageToCloud() to upload real ccusage data
- [ ] Update syncUsageFromCloud() to download and merge usage data  
- [ ] Implement cross-device usage aggregation using ccusage data
- [ ] Add device identification for multi-device usage tracking
- [ ] Test WebDAV upload/download with real usage statistics

**Expected Outcome**: WebDAV cloud sync transfers real usage data instead of stub responses

### Phase 4: Advanced Cloud Sync Features 📋
**Objective**: Sophisticated multi-device usage management

**Tasks**:
- [ ] Usage data conflict resolution when syncing between devices
- [ ] Incremental sync - only sync new usage data since last sync
- [ ] Cross-device usage statistics dashboard
- [ ] Enhanced sync status indicators showing real data transfer
- [ ] Usage trend analysis across synchronized devices

**Expected Outcome**: Professional-grade multi-device usage synchronization and analytics

### Technical Architecture Changes

**Data Flow**:
```
ccusage CLI → CcusageService → CloudTokenTracker → WebDAV Provider → Cloud Storage
                                        ↓
                            UsageStatistics Interface
                                        ↓
                        WebDAV Sync Operations (upload/download)
```

**Key Components Modified**:
- `CloudTokenTracker.ts` - Real ccusage integration instead of stubs
- `CloudDataSchema.ts` - UsageStatistics interface (already compatible)
- `cloudSyncIntegrated.ts` - Enhanced sync operations with real data
- WebDAV providers maintain existing functionality

### Implementation Status
- **Phase 1**: ✅ **COMPLETED** - CloudTokenTracker ccusage integration
- **Phase 2**: ✅ **COMPLETED** - Data transformation and aggregation  
- **Phase 3**: 📋 Planned - Enhanced cloud sync operations  
- **Phase 4**: 📋 Planned - Advanced multi-device features

## v3.4.0 Features - Prompt Enhancement Suite (Next Release)

### Context7 Auto-Append Integration
- **Status**: 📋 Planned
- **Description**: Automatic "use context7" injection via CLAUDE.md for real-time documentation
- **Implementation**: 
  - Add `claude-config.autoUseContext7` setting to package.json
  - Create `ensureContext7RuleInClaudeMd()` function similar to PROJECT_PLAN integration
  - Detect `.vscode/mcp.json` for context7 installation
  - Offer installation guidance if missing
- **User Experience**: Toggle in settings, automatic rule injection, installation helper

### Context Building Support System
- **Status**: 📋 Planned
- **Description**: Support for "Prepare to Discuss" methodology with hybrid detection
- **Architecture**:
  - **ContextBuildingMonitor**: Hybrid detection with confidence scoring
    - 85%+ confidence: Auto-complete
    - 60-84% confidence: User confirmation
    - <60% confidence: Progress tracking
  - **ContextQualityMetrics**: Multi-signal analysis (tokens, structure, time, depth)
  - **PromptTemplateManager**: Pre-built templates for common scenarios
- **Detection Signals**:
  - Token usage (input/output counts)
  - Response structure (headers, code blocks)
  - Time investment (response duration)
  - Depth indicators (keywords, file references)
- **User Flow**: Template selection → Monitoring → Hybrid detection → Status update

### Improved Plan Mode Instructions
- **Status**: 📋 Planned
- **Description**: Clearer PROJECT_PLAN.md integration instructions
- **Changes to CLAUDE.md**:
  - "During plan mode": Include PROJECT_PLAN.md updates in proposed plan
  - "In your exit plan": MUST list sections to update
  - "After approval": Execute updates alongside code changes

## v4.0 Features - Claude Team Orchestrator (Major Release)

### Overview
Transform extension from configuration manager to full AI team orchestrator with specialized Claude instances working in parallel on different aspects of the project.

### Core Architecture: Hierarchical Context System

#### Directory Structure
```
project-root/
├── CLAUDE.md                         # 🏢 Company Handbook (shared standards)
├── PROJECT_PLAN.md                   # 📊 Team Dashboard (dynamic status)
├── .claude/
│   ├── .plans/                       # Planning documents
│   ├── .chats/                       # Exported conversations  
│   ├── .shared-artifacts/            # 📮 Team Mailbox (handoffs)
│   │   ├── auth-plan.md
│   │   ├── api-contracts.yaml
│   │   └── critique-log.md
│   ├── team-config.json              # Team member definitions
│   └── team/                         # Role-specific configurations
│       ├── planner/
│       │   └── CLAUDE.md             # Planner role instructions
│       ├── critic/
│       │   └── CLAUDE.md             # Critic role instructions
│       ├── auth-dev/
│       │   └── CLAUDE.md             # Auth Dev specialization
│       └── ui-dev/
│           └── CLAUDE.md             # UI Dev specialization
├── main/                             # Worktree: Planner/Critic code
├── auth-feature/                     # Worktree: Auth Dev code
└── ui-feature/                       # Worktree: UI Dev code
```

### Claude Team Features

#### Hierarchical CLAUDE.md Inheritance
- **Root CLAUDE.md**: "Company Handbook" - shared standards, conventions, architecture
- **Role CLAUDE.md** (in `.claude/team/[role]/`): "Job Description" - specialized instructions
- **PROJECT_PLAN.md**: "Status Dashboard" - real-time team coordination
- **Context Inheritance**: Each role reads: Root → Role-specific → PROJECT_PLAN → Artifacts

#### Team Member Roles
1. **🎯 Planner**: System architect, high-level design, creates plans
2. **🔍 Critic**: Code reviewer, security auditor, validates implementations
3. **🔐 Auth Dev**: Authentication specialist, security-focused development
4. **🎨 UI Dev**: Frontend expert, user experience, component design
5. **⚙️ API Dev**: Backend specialist, database, microservices

#### Enhanced UI Design
```
┌─ CLAUDE TEAM ORCHESTRATOR ─────────────────────┐
│ 📊 Team Status                                 │
│ ├─ 🎯 Planner (main)           [🧠 Thinking]  │
│ │  ├─ Context: ✅ Built (50K tokens, 7m)      │
│ │  └─ "Designing microservice boundaries..."   │
│ ├─ 🔍 Critic (main)            [✅ Complete]  │
│ │  ├─ Context: ♻️ Inherited from Planner      │
│ │  └─ "Found 3 security issues in auth"       │
│ ├─ 🔐 Auth Dev (auth-feature)  [⚡ Active]   │
│ │  ├─ Context: 🔄 Building (12K tokens, 2m)   │
│ │  └─ "Implementing JWT refresh rotation"     │
│ └─ 🎨 UI Dev (ui-feature)      [⏸️ Waiting]  │
│    ├─ Context: 📥 Ready to inherit            │
│    └─ "Blocked: Waiting for auth endpoints"   │
├─────────────────────────────────────────────────┤
│ 📁 Shared Artifacts (Team Mailbox)             │
│ ├─ 📋 auth-plan.md (Planner → All) [2m ago]   │
│ ├─ 🔴 critique-v1.md (Critic → Auth) [5m ago] │
│ └─ 📄 api-spec.yaml (Auth → UI) [pending]     │
├─────────────────────────────────────────────────┤
│ 🧬 Context Inheritance Map                     │
│ Planner: Built 50K tokens ─┬→ Critic (30K)    │
│                            └→ Auth Dev (20K)   │
└─────────────────────────────────────────────────┘
```

#### Smart Context Distribution
```typescript
interface ContextDistribution {
  planner: {
    reads: ['full-codebase', 'all-docs', 'all-plans'],
    writes: ['.claude/.shared-artifacts/plans/', 'PROJECT_PLAN.md'],
    focus: 'architecture, design patterns, system boundaries'
  },
  critic: {
    reads: ['implementations', 'tests', 'security-docs'],
    writes: ['.claude/.shared-artifacts/reviews/'],
    focus: 'code quality, security, performance, best practices'
  },
  authDev: {
    reads: ['auth/', 'middleware/', 'auth-plan.md'],
    writes: ['auth-feature/', '.claude/.shared-artifacts/api-specs/'],
    focus: 'OAuth2, JWT, session management, OWASP guidelines'
  },
  uiDev: {
    reads: ['components/', 'pages/', 'api-specs/'],
    writes: ['ui-feature/', '.claude/.shared-artifacts/ui-contracts/'],
    focus: 'React patterns, accessibility, responsive design'
  }
}
```

### Implementation Phases

#### Phase 1: Foundation (v3.4.0) - 2 weeks
- ✅ Context7 integration via CLAUDE.md
- ✅ Context Building support with hybrid detection
- ✅ Improved plan mode instructions
- ✅ Basic prompt templates

#### Phase 2: Team Infrastructure (v4.0.0) - 3 weeks
- Git worktree management commands
- `.claude/team/` structure with role configs
- `.claude/.shared-artifacts/` system
- Basic team UI in sidebar
- Role assignment commands

#### Phase 3: Intelligence Layer (v4.1.0) - 3 weeks
- Context inheritance system
- Automatic handoff detection
- Smart context distribution
- Living PROJECT_PLAN.md dashboard
- Team metrics tracking

#### Phase 4: Advanced Orchestration (v4.2.0) - 4 weeks
- AI-suggested role assignment
- Automatic conflict resolution
- Performance analytics dashboard
- Workflow optimization suggestions
- Team collaboration patterns

## Technical Architecture Updates

### v3.4.0 New Components
- `src/services/Context7Manager.ts` - Context7 MCP integration
- `src/services/ContextBuildingMonitor.ts` - Hybrid detection system
- `src/services/ContextQualityMetrics.ts` - Scoring system
- `src/services/PromptTemplateManager.ts` - Template management

### v4.0.0 Team Components
- `src/team/ClaudeTeamOrchestrator.ts` - Main orchestrator
- `src/team/ContextInheritance.ts` - Context layering system
- `src/team/TeamHandoffManager.ts` - Handoff detection
- `src/team/GitWorktreeManager.ts` - Worktree operations
- `src/team/SharedArtifactsManager.ts` - Team communication

## Configuration Schema Updates

### v3.4.0 Settings
```json
{
  "claude-config.autoUseContext7": false,
  "claude-config.contextBuilding.enabled": true,
  "claude-config.contextBuilding.autoDetection": true,
  "claude-config.contextBuilding.confidenceThreshold": 85,
  "claude-config.contextBuilding.showProgress": true,
  "claude-config.contextBuilding.templates": [
    "frontend-architecture",
    "api-layer",
    "database-schema",
    "component-patterns"
  ]
}
```

### v4.0.0 Team Settings
```json
{
  "claude-config.team.enabled": false,
  "claude-config.team.roles": [
    "planner",
    "critic", 
    "auth-dev",
    "ui-dev",
    "api-dev"
  ],
  "claude-config.team.autoHandoff": true,
  "claude-config.team.contextInheritance": true,
  "claude-config.team.sharedArtifactsPath": ".claude/.shared-artifacts/",
  "claude-config.team.roleConfigPath": ".claude/team/",
  "claude-config.team.dashboardUpdateInterval": 5000,
  "claude-config.team.worktreeAutoCreate": true
}
```

## Success Metrics

### v3.4.0 Success Criteria
- Context7 detection accuracy: >95%
- Context building detection accuracy: >80%
- User satisfaction with prompt templates: >4/5
- Plan mode instruction clarity improvement: measurable

### v4.0.0 Success Criteria
- Team initialization: <30 seconds
- Context inheritance token savings: >40%
- Handoff detection accuracy: >90%
- Dashboard real-time updates: <5 second delay
- Parallel development efficiency: 2-3x improvement

### Future Enhancements (Post v4.0)
- [ ] Conversation search across projects
- [ ] Batch export functionality
- [ ] Keyboard shortcuts for actions
- [ ] Context menus in tree view
- [ ] Marketplace analytics integration
- [x] WebDAV support for NextCloud and ownCloud
- [ ] Advanced conflict resolution UI
- [x] Cloud sync status indicators in tree view (via ccusage integration)
- [ ] Bandwidth usage monitoring for cloud operations

## File Organization

### Extension Files We Track
- **workspace/.claude/.chats/** - Exported conversations
- **workspace/.claude/.plans/** - Project plans and documentation
- **workspace/CLAUDE.md** - Main configuration file

### External Dependencies
- **~/.claude/projects/** - Claude Code conversation data (read-only)
- **workspace/.git/** - Git repository for CLAUDE.md sync

---

**Version**: 3.4.0 (Planned)  
**Status**: Major Feature Planning Phase  
**Last Updated**: August 2025 - Comprehensive v3.4.0 and v4.0.0 roadmap planning with Context7, Context Building, and Claude Team Orchestrator  
**Next Review**: Start v3.4.0 implementation phase