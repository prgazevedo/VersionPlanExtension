import * as vscode from 'vscode';
import { ConversationManager } from './ConversationManager';
import { ConversationSummary } from './types';
// TokenTracker removed - using ccusage integration
import { SummaryCacheManager } from './SummaryCache';

export class ConversationTreeProvider implements vscode.TreeDataProvider<ConversationItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<ConversationItem | undefined | null | void> = new vscode.EventEmitter<ConversationItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<ConversationItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private conversations: ConversationSummary[] = [];
    private summaryCache = SummaryCacheManager.getInstance();
    private searchFilter: string = '';
    private isLoading = false;

    constructor(private conversationManager: ConversationManager) {
        console.log('[ConversationTreeProvider] 🚀 Constructor called');
        // Don't call refresh() immediately - extension.ts ensures data is loaded before this constructor
        // Just load from cache since ConversationManager has already loaded the data
        this.conversations = this.summaryCache.getAll();
        console.log(`[ConversationTreeProvider] 📦 Constructor - loaded ${this.conversations.length} conversations from cache`);
        
        // Listen for conversation changes and auto-refresh
        this.conversationManager.onConversationsChanged(() => {
            console.log('[ConversationTreeProvider] 🔄 ConversationManager change event received, calling refresh');
            this.refresh();
        });
        console.log('[ConversationTreeProvider] ✅ Constructor completed, event listener registered');
    }

    refresh(): void {
        console.log('[ConversationTreeProvider] 🔄 Refresh called');
        this.loadConversations().then(() => {
            console.log(`[ConversationTreeProvider] ✅ Loaded ${this.conversations.length} conversations, firing tree data change`);
            this._onDidChangeTreeData.fire();
        }).catch(error => {
            console.error('[ConversationTreeProvider] ❌ Error during refresh:', error);
            this._onDidChangeTreeData.fire();
        });
    }

    /**
     * Fast refresh using cached summaries only
     */
    refreshFromCache(): void {
        this.conversations = this.summaryCache.getAll();
        this._onDidChangeTreeData.fire();
    }

    /**
     * Set search filter for conversations
     */
    setSearchFilter(filter: string): void {
        this.searchFilter = filter.toLowerCase();
        this._onDidChangeTreeData.fire();
    }

    /**
     * Clear search filter
     */
    clearSearchFilter(): void {
        this.searchFilter = '';
        this._onDidChangeTreeData.fire();
    }

    private async loadConversations(): Promise<void> {
        console.log('[ConversationTreeProvider] 📥 loadConversations started');
        try {
            this.isLoading = true;
            // Try cache first for immediate display
            const cached = this.summaryCache.getAll();
            console.log(`[ConversationTreeProvider] 📦 Cache check: ${cached.length} items`);
            if (cached.length > 0) {
                this.conversations = cached;
                console.log('[ConversationTreeProvider] 🔄 Showing cached data immediately');
                this._onDidChangeTreeData.fire(); // Show cached data immediately
            }
            
            // Load fresh data in background
            console.log('[ConversationTreeProvider] 📡 Calling conversationManager.getAvailableConversations()');
            this.conversations = await this.conversationManager.getAvailableConversations();
            console.log(`[ConversationTreeProvider] ✅ Fresh data loaded: ${this.conversations.length} conversations`);
            this.isLoading = false;
        } catch (error) {
            console.error('[ConversationTreeProvider] ❌ Error loading conversations for tree view:', error);
            this.conversations = [];
            this.isLoading = false;
        }
    }

    getTreeItem(element: ConversationItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: ConversationItem): Promise<ConversationItem[]> {
        if (!element) {
            // Show loading indicator if needed
            if (this.isLoading && this.conversations.length === 0) {
                return [new ConversationItem(
                    'Loading conversations...',
                    'Please wait',
                    vscode.TreeItemCollapsibleState.None,
                    'loading'
                )];
            }

            // Apply search filter if active
            const filteredConversations = this.searchFilter ? 
                this.conversations.filter(conv => this.matchesSearchFilter(conv)) : 
                this.conversations;

            // Root level - group conversations by project
            const projectGroups = this.groupConversationsByProject(filteredConversations);
            const projectItems = Object.keys(projectGroups).map(projectName => {
                const conversations = projectGroups[projectName];
                const totalMessages = conversations.reduce((sum, conv) => sum + conv.messageCount, 0);
                const description = this.searchFilter ? 
                    `${conversations.length}/${this.conversations.filter(c => c.projectName === projectName).length} conversations` :
                    `${conversations.length} conversation${conversations.length === 1 ? '' : 's'} • ${totalMessages} messages`;
                
                return new ConversationItem(
                    projectName,
                    description,
                    vscode.TreeItemCollapsibleState.Collapsed,
                    'project',
                    undefined,
                    conversations
                );
            });

            // Sort projects by most recent activity
            return projectItems.sort((a, b) => {
                const aLatest = Math.max(...(a.conversations || []).map(c => new Date(c.startTime).getTime()));
                const bLatest = Math.max(...(b.conversations || []).map(c => new Date(c.startTime).getTime()));
                return bLatest - aLatest;
            });
        } else if (element.type === 'project' && element.conversations) {
            // Project level - show conversations
            return element.conversations.map(conv => {
                const label = this.formatConversationLabel(conv);
                const description = this.formatConversationDescription(conv);
                const item = new ConversationItem(
                    label,
                    description,
                    vscode.TreeItemCollapsibleState.None,
                    'conversation',
                    conv
                );
                // Add context menu support for fork analysis
                item.contextValue = 'conversation';
                return item;
            });
        }

        return [];
    }

    private groupConversationsByProject(conversations?: ConversationSummary[]): { [projectName: string]: ConversationSummary[] } {
        const conversationsToGroup = conversations || this.conversations;
        const groups: { [projectName: string]: ConversationSummary[] } = {};
        
        for (const conversation of conversationsToGroup) {
            const projectName = conversation.projectName;
            if (!groups[projectName]) {
                groups[projectName] = [];
            }
            groups[projectName].push(conversation);
        }

        // Sort conversations within each project by start time (newest first)
        for (const projectName in groups) {
            groups[projectName].sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
        }

        return groups;
    }

    /**
     * Check if conversation matches current search filter
     */
    private matchesSearchFilter(conversation: ConversationSummary): boolean {
        if (!this.searchFilter) return true;
        
        const searchTerms = [
            conversation.projectName,
            conversation.firstMessage || '',
            conversation.lastMessage || '',
            conversation.duration || ''
        ].map(term => term.toLowerCase());
        
        return searchTerms.some(term => term.includes(this.searchFilter));
    }

    private formatConversationLabel(conversation: ConversationSummary): string {
        const date = new Date(conversation.startTime);
        
        // Check if date is valid
        if (isNaN(date.getTime())) {
            return `Invalid Date (${conversation.duration || '0m'})`;
        }
        
        const formattedDate = date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
        return `${formattedDate} (${conversation.duration || '0m'})`;
    }

    private formatConversationDescription(conversation: ConversationSummary): string {
        // TokenTracker removed - using basic description only
        
        return `${conversation.messageCount} messages`;
    }

    getConversationSummary(sessionId: string): ConversationSummary | undefined {
        return this.conversations.find(conv => conv.sessionId === sessionId);
    }
}

export class ConversationItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly description: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly type: 'project' | 'conversation' | 'loading',
        public readonly conversationSummary?: ConversationSummary,
        public readonly conversations?: ConversationSummary[]
    ) {
        super(label, collapsibleState);

        this.description = description;
        this.contextValue = type;

        if (type === 'conversation' && conversationSummary) {
            this.command = {
                command: 'claude-config.viewConversation',
                title: 'View Conversation',
                arguments: [conversationSummary]
            };
            // Enhanced icons based on conversation properties
            const messageCount = conversationSummary.messageCount;
            if (messageCount > 100) {
                this.iconPath = new vscode.ThemeIcon('comment-discussion', new vscode.ThemeColor('charts.red'));
            } else if (messageCount > 50) {
                this.iconPath = new vscode.ThemeIcon('comment-discussion', new vscode.ThemeColor('charts.orange'));
            } else if (messageCount > 20) {
                this.iconPath = new vscode.ThemeIcon('comment-discussion', new vscode.ThemeColor('charts.yellow'));
            } else {
                this.iconPath = new vscode.ThemeIcon('comment-discussion', new vscode.ThemeColor('charts.green'));
            }
            
            this.tooltip = this.createConversationTooltip(conversationSummary);
        } else if (type === 'project') {
            this.iconPath = new vscode.ThemeIcon('folder');
            const conversationCount = conversations?.length || 0;
            const totalMessages = conversations?.reduce((sum, conv) => sum + conv.messageCount, 0) || 0;
            this.tooltip = `Project: ${label}\n${conversationCount} conversations\n${totalMessages} total messages`;
        } else if (type === 'loading') {
            this.iconPath = new vscode.ThemeIcon('loading~spin');
            this.tooltip = 'Loading conversations from cache and files...';
        }
    }

    private createConversationTooltip(conversation: ConversationSummary): string {
        const startTime = new Date(conversation.startTime).toLocaleString();
        const endTime = conversation.endTime ? new Date(conversation.endTime).toLocaleString() : 'Ongoing';
        
        let tooltip = `Session: ${conversation.sessionId}
Project: ${conversation.projectName}
Started: ${startTime}
Ended: ${endTime}
Duration: ${conversation.duration || 'Unknown'}
Messages: ${conversation.messageCount}`;

        // TokenTracker removed - usage information now provided by ccusage integration

        tooltip += `\n\nFirst message: ${conversation.firstMessage || 'No content'}`;
        
        return tooltip;
    }
}