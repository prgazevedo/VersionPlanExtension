import * as vscode from 'vscode';
import { TokenTracker, UsageStatistics } from './tokenTracker';

function formatTokens(tokens: number): string {
    if (tokens >= 1000000) {
        const millions = Math.round(tokens / 1000);
        return `${millions.toLocaleString()}M`;
    }
    return tokens.toLocaleString();
}

export class UsageTreeProvider implements vscode.TreeDataProvider<UsageItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<UsageItem | undefined | null | void> = new vscode.EventEmitter<UsageItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<UsageItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private tokenTracker: TokenTracker | null = null;

    constructor() {
        // TokenTracker will be initialized lazily in getTokenTracker()
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: UsageItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: UsageItem): Thenable<UsageItem[]> {
        if (!element) {
            // Root level items
            return Promise.resolve(this.getRootItems());
        } else {
            // Child items based on parent
            return Promise.resolve(this.getChildItems(element));
        }
    }

    private getTokenTracker(): TokenTracker {
        if (!this.tokenTracker) {
            try {
                this.tokenTracker = TokenTracker.getInstance();
            } catch (error) {
                console.error('Failed to get TokenTracker instance:', error);
                throw error;
            }
        }
        return this.tokenTracker;
    }

    private getRootItems(): UsageItem[] {
        const stats = this.getTokenTracker().getStatistics();
        
        // Calculate meaningful period descriptions
        const dailyPeriod = stats.dailyUsage.length > 0 ? `${stats.dailyUsage.length} days` : 'No recent activity';
        const weeklyPeriod = stats.weeklyUsage.length > 0 ? `${stats.weeklyUsage.length} weeks` : 'No recent activity';
        const monthlyPeriod = stats.monthlyUsage.length > 0 ? `${stats.monthlyUsage.length} months` : 'No recent activity';
        const operationsText = stats.operationCount > 0 ? `${stats.operationCount} operations performed` : 'No operations recorded';
        
        return [
            new UsageItem(
                'Total Usage',
                `${formatTokens(stats.totalTokens)} tokens • $${stats.totalCost.toFixed(2)}`,
                vscode.TreeItemCollapsibleState.None,
                'total',
                new vscode.ThemeIcon('graph-line')
            ),
            new UsageItem(
                'Operations',
                operationsText,
                vscode.TreeItemCollapsibleState.None,
                'operations',
                new vscode.ThemeIcon('pulse')
            ),
            new UsageItem(
                'Token Breakdown',
                'Input, Output, Cache tokens',
                vscode.TreeItemCollapsibleState.Collapsed,
                'breakdown',
                new vscode.ThemeIcon('pie-chart')
            ),
            new UsageItem(
                'Daily Usage',
                dailyPeriod,
                vscode.TreeItemCollapsibleState.Collapsed,
                'daily',
                new vscode.ThemeIcon('calendar')
            ),
            new UsageItem(
                'Weekly Usage',
                weeklyPeriod,
                vscode.TreeItemCollapsibleState.Collapsed,
                'weekly',
                new vscode.ThemeIcon('calendar')
            ),
            new UsageItem(
                'Monthly Usage',
                monthlyPeriod,
                vscode.TreeItemCollapsibleState.Collapsed,
                'monthly',
                new vscode.ThemeIcon('calendar')
            ),
            new UsageItem(
                'Actions',
                'View details, reset statistics',
                vscode.TreeItemCollapsibleState.Collapsed,
                'actions',
                new vscode.ThemeIcon('gear')
            )
        ];
    }

    private getChildItems(element: UsageItem): UsageItem[] {
        const stats = this.getTokenTracker().getStatistics();

        switch (element.contextValue) {
            case 'breakdown':
                return [
                    new UsageItem(
                        'Input Tokens',
                        `${formatTokens(stats.totalInputTokens)} • $${((stats.totalInputTokens / 1000000) * 15).toFixed(2)}`,
                        vscode.TreeItemCollapsibleState.None,
                        'input-tokens',
                        new vscode.ThemeIcon('arrow-right')
                    ),
                    new UsageItem(
                        'Output Tokens',
                        `${formatTokens(stats.totalOutputTokens)} • $${((stats.totalOutputTokens / 1000000) * 75).toFixed(2)}`,
                        vscode.TreeItemCollapsibleState.None,
                        'output-tokens',
                        new vscode.ThemeIcon('arrow-left')
                    ),
                    new UsageItem(
                        'Cache Creation',
                        `${formatTokens(stats.totalCacheCreationTokens)} • $${((stats.totalCacheCreationTokens / 1000000) * 18.75).toFixed(2)}`,
                        vscode.TreeItemCollapsibleState.None,
                        'cache-creation-tokens',
                        new vscode.ThemeIcon('database')
                    ),
                    new UsageItem(
                        'Cache Read',
                        `${formatTokens(stats.totalCacheReadTokens)} • $${((stats.totalCacheReadTokens / 1000000) * 1.50).toFixed(2)}`,
                        vscode.TreeItemCollapsibleState.None,
                        'cache-read-tokens',
                        new vscode.ThemeIcon('search')
                    )
                ];

            case 'daily':
                if (stats.dailyUsage.length === 0) {
                    return [new UsageItem(
                        'No daily usage data',
                        'Start using Claude Code to see daily statistics',
                        vscode.TreeItemCollapsibleState.None,
                        'empty-daily',
                        new vscode.ThemeIcon('info')
                    )];
                }
                return stats.dailyUsage.slice(0, 10).map(day => 
                    new UsageItem(
                        day.date,
                        `${formatTokens(day.tokens)} tokens • $${day.cost.toFixed(2)} • ${day.operations} ops`,
                        vscode.TreeItemCollapsibleState.None,
                        'daily-item',
                        new vscode.ThemeIcon('calendar')
                    )
                );

            case 'weekly':
                if (stats.weeklyUsage.length === 0) {
                    return [new UsageItem(
                        'No weekly usage data',
                        'Start using Claude Code to see weekly statistics',
                        vscode.TreeItemCollapsibleState.None,
                        'empty-weekly',
                        new vscode.ThemeIcon('info')
                    )];
                }
                return stats.weeklyUsage.slice(0, 10).map(week => 
                    new UsageItem(
                        `${week.weekStart} - ${week.weekEnd}`,
                        `${formatTokens(week.tokens)} tokens • $${week.cost.toFixed(2)} • ${week.operations} ops`,
                        vscode.TreeItemCollapsibleState.None,
                        'weekly-item',
                        new vscode.ThemeIcon('calendar')
                    )
                );

            case 'monthly':
                if (stats.monthlyUsage.length === 0) {
                    return [new UsageItem(
                        'No monthly usage data',
                        'Start using Claude Code to see monthly statistics',
                        vscode.TreeItemCollapsibleState.None,
                        'empty-monthly',
                        new vscode.ThemeIcon('info')
                    )];
                }
                return stats.monthlyUsage.slice(0, 12).map(month => 
                    new UsageItem(
                        `${month.month} ${month.year}`,
                        `${formatTokens(month.tokens)} tokens • $${month.cost.toFixed(2)} • ${month.operations} ops`,
                        vscode.TreeItemCollapsibleState.None,
                        'monthly-item',
                        new vscode.ThemeIcon('calendar')
                    )
                );

            case 'actions':
                return [
                    new UsageItem(
                        'View Detailed Statistics',
                        'Open full usage report',
                        vscode.TreeItemCollapsibleState.None,
                        'view-stats',
                        new vscode.ThemeIcon('graph'),
                        {
                            command: 'claude-config.viewUsageStats',
                            title: 'View Detailed Statistics'
                        }
                    ),
                    new UsageItem(
                        'Quick Usage Summary',
                        'Show usage quick pick',
                        vscode.TreeItemCollapsibleState.None,
                        'quick-summary',
                        new vscode.ThemeIcon('list-selection'),
                        {
                            command: 'claude-config.showUsageQuickPick',
                            title: 'Quick Usage Summary'
                        }
                    ),
                    new UsageItem(
                        'Reset Statistics',
                        'Clear all usage data',
                        vscode.TreeItemCollapsibleState.None,
                        'reset-stats',
                        new vscode.ThemeIcon('trash'),
                        {
                            command: 'claude-config.resetUsageStats',
                            title: 'Reset Statistics'
                        }
                    ),
                    new UsageItem(
                        'Debug Token Tracker',
                        'Debug information',
                        vscode.TreeItemCollapsibleState.None,
                        'debug-tracker',
                        new vscode.ThemeIcon('bug'),
                        {
                            command: 'claude-config.debugTokenTracker',
                            title: 'Debug Token Tracker'
                        }
                    )
                ];

            default:
                return [];
        }
    }
}

class UsageItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly description: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly contextValue: string,
        public readonly iconPath?: vscode.ThemeIcon,
        public readonly command?: vscode.Command
    ) {
        super(label, collapsibleState);
        this.description = description;
        this.contextValue = contextValue;
        this.iconPath = iconPath;
        this.command = command;
    }
}