import * as vscode from 'vscode';
import { ConversationManager } from './ConversationManager';
import { ConversationSummary } from './types';
import { TokenTracker } from '../tokenTracker';

export class ConversationTreeProvider implements vscode.TreeDataProvider<ConversationItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<ConversationItem | undefined | null | void> = new vscode.EventEmitter<ConversationItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<ConversationItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private conversations: ConversationSummary[] = [];

    constructor(private conversationManager: ConversationManager) {
        this.refresh();
        
        // Listen for conversation changes and auto-refresh
        this.conversationManager.onConversationsChanged(() => {
            this.refresh();
        });
    }

    refresh(): void {
        this.loadConversations().then(() => {
            this._onDidChangeTreeData.fire();
        });
    }

    private async loadConversations(): Promise<void> {
        try {
            this.conversations = await this.conversationManager.getAvailableConversations();
        } catch (error) {
            console.error('Error loading conversations for tree view:', error);
            this.conversations = [];
        }
    }

    getTreeItem(element: ConversationItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: ConversationItem): Promise<ConversationItem[]> {
        if (!element) {
            // Root level - group conversations by project
            const projectGroups = this.groupConversationsByProject();
            return Object.keys(projectGroups).map(projectName => {
                const conversations = projectGroups[projectName];
                return new ConversationItem(
                    projectName,
                    `${conversations.length} conversation${conversations.length === 1 ? '' : 's'}`,
                    vscode.TreeItemCollapsibleState.Collapsed,
                    'project',
                    undefined,
                    conversations
                );
            });
        } else if (element.type === 'project' && element.conversations) {
            // Project level - show conversations
            return element.conversations.map(conv => {
                const label = this.formatConversationLabel(conv);
                const description = this.formatConversationDescription(conv);
                return new ConversationItem(
                    label,
                    description,
                    vscode.TreeItemCollapsibleState.None,
                    'conversation',
                    conv
                );
            });
        }

        return [];
    }

    private groupConversationsByProject(): { [projectName: string]: ConversationSummary[] } {
        const groups: { [projectName: string]: ConversationSummary[] } = {};
        
        for (const conversation of this.conversations) {
            const projectName = conversation.projectName;
            if (!groups[projectName]) {
                groups[projectName] = [];
            }
            groups[projectName].push(conversation);
        }

        return groups;
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
        try {
            const tokenTracker = TokenTracker.getInstance();
            const usage = tokenTracker.getConversationUsage(conversation.sessionId);
            
            if (usage && usage.totalTokens > 0) {
                return `${conversation.messageCount} messages • ${usage.totalTokens.toLocaleString()} tokens • $${usage.totalCost.toFixed(2)}`;
            }
        } catch (error) {
            // TokenTracker not available, fall back to basic description
        }
        
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
        public readonly type: 'project' | 'conversation',
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
            this.iconPath = new vscode.ThemeIcon('comment-discussion');
            this.tooltip = this.createConversationTooltip(conversationSummary);
        } else if (type === 'project') {
            this.iconPath = new vscode.ThemeIcon('folder');
            this.tooltip = `Project: ${label}`;
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

        try {
            const tokenTracker = TokenTracker.getInstance();
            const usage = tokenTracker.getConversationUsage(conversation.sessionId);
        
            if (usage && usage.totalTokens > 0) {
            tooltip += `

Token Usage:
• Total: ${usage.totalTokens.toLocaleString()} tokens
• Cost: $${usage.totalCost.toFixed(2)}
• Input: ${usage.inputTokens.toLocaleString()}
• Output: ${usage.outputTokens.toLocaleString()}`;
            
            if (usage.cacheCreationTokens > 0) {
                tooltip += `\n• Cache Creation: ${usage.cacheCreationTokens.toLocaleString()}`;
            }
            if (usage.cacheReadTokens > 0) {
                tooltip += `\n• Cache Read: ${usage.cacheReadTokens.toLocaleString()}`;
            }
            }
        } catch (error) {
            // TokenTracker not available, skip usage information
        }

        tooltip += `\n\nFirst message: ${conversation.firstMessage || 'No content'}`;
        
        return tooltip;
    }
}