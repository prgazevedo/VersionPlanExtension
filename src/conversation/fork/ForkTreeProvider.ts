import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs-extra';
import * as os from 'os';
import { ForkAnalyzer } from './ForkAnalyzer';
import { TokenCalculator } from './TokenCalculator';
import { ConversationTree, ConversationFork, ConversationBranch, ForkAnalysisResult } from './types';
import { ConversationMessage } from '../types';

export class ForkTreeItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly contextValue: string,
        public readonly tooltip?: string,
        public readonly command?: vscode.Command,
        public readonly iconPath?: vscode.ThemeIcon | string,
        public readonly description?: string,
        public readonly metadata?: any
    ) {
        super(label, collapsibleState);
        this.tooltip = tooltip;
        this.command = command;
        this.iconPath = iconPath;
        this.description = description;
    }
}

export class ForkTreeProvider implements vscode.TreeDataProvider<ForkTreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<ForkTreeItem | undefined | null | void> = new vscode.EventEmitter<ForkTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<ForkTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private analyzer: ForkAnalyzer;
    private currentAnalysis: ForkAnalysisResult | null = null;
    private currentConversationFile: string | null = null;

    constructor() {
        this.analyzer = new ForkAnalyzer();
    }

    /**
     * Setup with ConversationManager and auto-load recent conversation
     */
    async setupWithConversationManager(conversationManager: any): Promise<void> {
        // Listen to conversation changes
        conversationManager.onConversationsChanged(() => {
            this.refresh();
        });

        // Auto-load the most recent conversation
        await this.autoLoadRecentConversation();
    }

    /**
     * Automatically load the most recent conversation
     */
    async autoLoadRecentConversation(): Promise<void> {
        try {
            const config = vscode.workspace.getConfiguration('claude-config');
            const conversationPath = config.get<string>('conversationDataPath') || 
                path.join(os.homedir(), '.claude', 'projects');
            
            if (await fs.pathExists(conversationPath)) {
                const files = await fs.readdir(conversationPath);
                const jsonlFiles = files.filter((f: string) => f.endsWith('.jsonl'));
                
                if (jsonlFiles.length > 0) {
                    // Get the most recently modified file
                    const mostRecent = jsonlFiles
                        .map((f: string) => ({ 
                            name: f, 
                            path: path.join(conversationPath, f) 
                        }))
                        .sort((a, b) => {
                            try {
                                const statA = fs.statSync(a.path);
                                const statB = fs.statSync(b.path);
                                return statB.mtime.getTime() - statA.mtime.getTime();
                            } catch {
                                return 0;
                            }
                        })[0];
                    
                    if (mostRecent) {
                        console.log(`[ForkTreeProvider] Auto-loading recent conversation: ${mostRecent.name}`);
                        await this.loadConversationFile(mostRecent.path);
                    }
                }
            }
        } catch (error) {
            console.error('[ForkTreeProvider] Error auto-loading recent conversation:', error);
        }
    }

    /**
     * Refresh the tree view
     */
    refresh(): void {
        console.log('[ForkTreeProvider] Refresh called');
        this._onDidChangeTreeData.fire();
    }

    /**
     * Load and analyze a conversation file
     */
    async loadConversationFile(filePath: string): Promise<void> {
        try {
            this.currentConversationFile = filePath;
            this.currentAnalysis = await this.analyzer.analyzeConversationFile(filePath);
            this.refresh();
        } catch (error) {
            console.error('[ForkTreeProvider] Error loading conversation:', error);
            vscode.window.showErrorMessage(`Failed to load conversation: ${error}`);
        }
    }

    /**
     * Get tree item for display
     */
    getTreeItem(element: ForkTreeItem): vscode.TreeItem {
        return element;
    }

    /**
     * Get children for a tree item
     */
    async getChildren(element?: ForkTreeItem): Promise<ForkTreeItem[]> {
        if (!this.currentAnalysis) {
            return [this.createNoDataItem()];
        }

        if (!element) {
            // Root level - show conversation overview
            return this.getRootItems();
        }

        switch (element.contextValue) {
            case 'conversation':
                return this.getConversationChildren();
            case 'forks-section':
                return this.getForkItems();
            case 'fork':
                return this.getForkChildren(element);
            case 'branch':
                return this.getBranchChildren(element);
            case 'stats-section':
                return this.getStatsItems();
            default:
                return [];
        }
    }

    /**
     * Get root level items
     */
    private getRootItems(): ForkTreeItem[] {
        if (!this.currentAnalysis) return [];

        const items: ForkTreeItem[] = [];
        const analysis = this.currentAnalysis;

        // Conversation overview
        const conversationItem = new ForkTreeItem(
            `Conversation: ${analysis.tree.sessionId.substring(0, 8)}...`,
            vscode.TreeItemCollapsibleState.Expanded,
            'conversation',
            `Session: ${analysis.tree.sessionId}\nMessages: ${analysis.tree.allMessages.size}\nMax Depth: ${analysis.tree.maxDepth}`,
            undefined,
            new vscode.ThemeIcon('comment-discussion'),
            `${analysis.tree.allMessages.size} messages`
        );
        items.push(conversationItem);

        return items;
    }

    /**
     * Get conversation section children
     */
    private getConversationChildren(): ForkTreeItem[] {
        if (!this.currentAnalysis) return [];

        const items: ForkTreeItem[] = [];
        const analysis = this.currentAnalysis;

        // Forks section
        if (analysis.forkCount > 0) {
            const forksItem = new ForkTreeItem(
                'Conversation Forks',
                vscode.TreeItemCollapsibleState.Expanded,
                'forks-section',
                `${analysis.forkCount} fork points with ${analysis.branchCount} total branches`,
                undefined,
                new vscode.ThemeIcon('git-branch'),
                `${analysis.forkCount} forks`
            );
            items.push(forksItem);
        }

        // Statistics section
        const statsItem = new ForkTreeItem(
            'Token Statistics',
            vscode.TreeItemCollapsibleState.Collapsed,
            'stats-section',
            'Token usage breakdown and context analysis',
            undefined,
            new vscode.ThemeIcon('graph'),
            this.formatTokenCount(analysis.tree.totalTokens)
        );
        items.push(statsItem);

        return items;
    }

    /**
     * Get fork items
     */
    private getForkItems(): ForkTreeItem[] {
        if (!this.currentAnalysis) return [];

        return this.currentAnalysis.tree.forks.map((fork, index) => {
            const tokenUsage = this.getTokenUsageLevel(fork.totalTokens);
            const icon = this.getTokenUsageIcon(tokenUsage);
            
            return new ForkTreeItem(
                `Fork ${index + 1}`,
                vscode.TreeItemCollapsibleState.Expanded,
                'fork',
                `Parent: ${fork.parentUuid}\nBranches: ${fork.branches.length}\nDepth: ${fork.forkDepth}\nTokens: ${this.formatTokenCount(fork.totalTokens)}`,
                undefined,
                icon,
                `${fork.branches.length} branches • ${this.formatTokenCount(fork.totalTokens)}`,
                { fork, index }
            );
        });
    }

    /**
     * Get children for a specific fork
     */
    private getForkChildren(element: ForkTreeItem): ForkTreeItem[] {
        const fork = element.metadata?.fork as ConversationFork;
        if (!fork) return [];

        return fork.branches.map((branch, index) => {
            const tokenUsage = this.getTokenUsageLevel(branch.tokenCount);
            const icon = this.getBranchIcon(branch);
            const statusIcon = branch.isMainPath ? '🔗' : branch.isActive ? '🔀' : '💤';
            
            return new ForkTreeItem(
                `${statusIcon} Branch ${index + 1}`,
                vscode.TreeItemCollapsibleState.Collapsed,
                'branch',
                `Start: ${branch.startUuid}\nMessages: ${branch.messages.length}\nTokens: ${this.formatTokenCount(branch.tokenCount)}\nMain Path: ${branch.isMainPath}\nActive: ${branch.isActive}\nLast Activity: ${branch.lastActivity.toLocaleString()}`,
                {
                    command: 'claude-config.viewBranchDetails',
                    title: 'View Branch Details',
                    arguments: [branch]
                },
                icon,
                `${branch.messages.length} msgs • ${this.formatTokenCount(branch.tokenCount)}`,
                { branch, fork }
            );
        });
    }

    /**
     * Get children for a specific branch
     */
    private getBranchChildren(element: ForkTreeItem): ForkTreeItem[] {
        const branch = element.metadata?.branch as ConversationBranch;
        if (!branch) return [];

        // Show first few messages in the branch
        const maxMessages = 5;
        const messages = branch.messages.slice(0, maxMessages);
        
        const items = messages.map((message, index) => {
            const preview = this.getMessagePreview(message);
            const roleIcon = message.type === 'user' ? '👤' : '🤖';
            const tokens = TokenCalculator.calculateMessageTokens(message);
            
            return new ForkTreeItem(
                `${roleIcon} ${message.type} ${index + 1}`,
                vscode.TreeItemCollapsibleState.None,
                'message',
                `UUID: ${message.uuid}\nTimestamp: ${new Date(message.timestamp).toLocaleString()}\nTokens: ${tokens}\n\nPreview: ${preview}`,
                {
                    command: 'claude-config.viewMessageDetails',
                    title: 'View Message',
                    arguments: [message]
                },
                new vscode.ThemeIcon(message.type === 'user' ? 'person' : 'hubot'),
                this.formatTokenCount(tokens),
                { message, branch }
            );
        });

        // If there are more messages, add a "..." item
        if (branch.messages.length > maxMessages) {
            items.push(new ForkTreeItem(
                `... and ${branch.messages.length - maxMessages} more messages`,
                vscode.TreeItemCollapsibleState.None,
                'more-messages',
                `Total messages in branch: ${branch.messages.length}`,
                {
                    command: 'claude-config.viewFullBranch',
                    title: 'View Full Branch',
                    arguments: [branch]
                },
                new vscode.ThemeIcon('ellipsis'),
                undefined,
                { branch }
            ));
        }

        return items;
    }

    /**
     * Get statistics items
     */
    private getStatsItems(): ForkTreeItem[] {
        if (!this.currentAnalysis) return [];

        const items: ForkTreeItem[] = [];
        const analysis = this.currentAnalysis;
        const distribution = analysis.tokenDistribution;

        // Token distribution
        items.push(new ForkTreeItem(
            'Main Path Tokens',
            vscode.TreeItemCollapsibleState.None,
            'stat-item',
            'Tokens used in main conversation paths',
            undefined,
            new vscode.ThemeIcon('check', new vscode.ThemeColor('charts.green')),
            this.formatTokenCount(distribution.mainPath)
        ));

        items.push(new ForkTreeItem(
            'Alternative Branch Tokens',
            vscode.TreeItemCollapsibleState.None,
            'stat-item',
            'Tokens used in active alternative branches',
            undefined,
            new vscode.ThemeIcon('git-branch', new vscode.ThemeColor('charts.yellow')),
            this.formatTokenCount(distribution.alternativeBranches)
        ));

        items.push(new ForkTreeItem(
            'Abandoned Branch Tokens',
            vscode.TreeItemCollapsibleState.None,
            'stat-item',
            'Tokens that could be saved by pruning old branches',
            undefined,
            new vscode.ThemeIcon('trash', new vscode.ThemeColor('charts.red')),
            this.formatTokenCount(distribution.abandonedBranches)
        ));

        // Context window analysis
        const totalTokens = distribution.mainPath + distribution.alternativeBranches + distribution.abandonedBranches;
        const contextUsage = TokenCalculator.calculateContextUsage(totalTokens);
        const approaching = TokenCalculator.isApproachingLimit(totalTokens);

        items.push(new ForkTreeItem(
            'Context Window Usage',
            vscode.TreeItemCollapsibleState.None,
            'context-usage',
            `${contextUsage.toFixed(1)}% of context window used\n${approaching ? '⚠️ Approaching limit!' : '✅ Within safe range'}`,
            undefined,
            new vscode.ThemeIcon(approaching ? 'warning' : 'check', 
                new vscode.ThemeColor(approaching ? 'charts.red' : 'charts.green')),
            `${contextUsage.toFixed(1)}%`
        ));

        return items;
    }

    /**
     * Create no data item
     */
    private createNoDataItem(): ForkTreeItem {
        return new ForkTreeItem(
            'No conversation loaded',
            vscode.TreeItemCollapsibleState.None,
            'no-data',
            'Select a conversation to analyze its fork structure',
            {
                command: 'claude-config.openConversations',
                title: 'Browse Conversations',
                arguments: []
            },
            new vscode.ThemeIcon('folder-opened'),
            'Click to browse conversations'
        );
    }

    /**
     * Get message preview text
     */
    private getMessagePreview(message: ConversationMessage): string {
        const content = message.message?.content;
        let preview = '';

        if (typeof content === 'string') {
            preview = content;
        } else if (Array.isArray(content)) {
            const textItems = content.filter(item => item.type === 'text');
            preview = textItems.map(item => item.text).join(' ');
        }

        // Truncate and clean up
        return preview.substring(0, 100).replace(/\n/g, ' ').trim() + (preview.length > 100 ? '...' : '');
    }

    /**
     * Format token count for display
     */
    private formatTokenCount(tokens: number): string {
        if (tokens >= 1000000) {
            return `${(tokens / 1000000).toFixed(1)}M`;
        } else if (tokens >= 1000) {
            return `${(tokens / 1000).toFixed(1)}K`;
        } else {
            return tokens.toString();
        }
    }

    /**
     * Get token usage level for color coding
     */
    private getTokenUsageLevel(tokens: number): 'low' | 'medium' | 'high' {
        if (tokens < 10000) return 'low';
        if (tokens < 50000) return 'medium';
        return 'high';
    }

    /**
     * Get icon based on token usage
     */
    private getTokenUsageIcon(level: 'low' | 'medium' | 'high'): vscode.ThemeIcon {
        switch (level) {
            case 'low':
                return new vscode.ThemeIcon('circle', new vscode.ThemeColor('charts.green'));
            case 'medium':
                return new vscode.ThemeIcon('circle', new vscode.ThemeColor('charts.yellow'));
            case 'high':
                return new vscode.ThemeIcon('circle', new vscode.ThemeColor('charts.red'));
        }
    }

    /**
     * Get icon for branch based on its status
     */
    private getBranchIcon(branch: ConversationBranch): vscode.ThemeIcon {
        if (branch.isMainPath) {
            return new vscode.ThemeIcon('check', new vscode.ThemeColor('charts.green'));
        } else if (branch.isActive) {
            return new vscode.ThemeIcon('git-branch', new vscode.ThemeColor('charts.blue'));
        } else {
            return new vscode.ThemeIcon('history', new vscode.ThemeColor('charts.grey'));
        }
    }

    /**
     * Get current analysis result
     */
    getCurrentAnalysis(): ForkAnalysisResult | null {
        return this.currentAnalysis;
    }

    /**
     * Get current conversation file path
     */
    getCurrentConversationFile(): string | null {
        return this.currentConversationFile;
    }
}