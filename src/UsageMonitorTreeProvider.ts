import * as vscode from 'vscode';
import { UsageMonitor } from './components/UsageMonitor';
import { TokenWindowMonitor, TokenWindowData } from './components/TokenWindowMonitor';

export class UsageMonitorTreeProvider implements vscode.TreeDataProvider<UsageMonitorItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<UsageMonitorItem | undefined | null | void> = new vscode.EventEmitter<UsageMonitorItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<UsageMonitorItem | undefined | null | void> = this._onDidChangeTreeData.event;
    
    private tokenWindowMonitor: TokenWindowMonitor;
    private currentWindowData: TokenWindowData | null = null;

    constructor() {
        this.tokenWindowMonitor = TokenWindowMonitor.getInstance();
        
        // Listen for token window updates
        this.tokenWindowMonitor.onDataUpdated((data) => {
            this.currentWindowData = data;
            this.refresh();
        });

        // Start monitoring
        this.tokenWindowMonitor.startMonitoring();
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: UsageMonitorItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: UsageMonitorItem): Promise<UsageMonitorItem[]> {
        if (!element) {
            const items: UsageMonitorItem[] = [];

            // Token Window Status - all items at root level
            if (this.currentWindowData) {
                const display = this.tokenWindowMonitor.formatForDisplay(this.currentWindowData);
                const subscriptionInfo = await this.tokenWindowMonitor.getSubscriptionInfo();
                
                // Current usage (main item)
                items.push(new UsageMonitorItem(
                    `${display.statusIcon} Current Usage`,
                    `${display.currentPercentageText} - ${display.currentUsageText}`,
                    vscode.TreeItemCollapsibleState.None,
                    'token-window',
                    new vscode.ThemeIcon('pulse'),
                    undefined
                ));

                // Current progress bar
                items.push(new UsageMonitorItem(
                    '📊 Current Progress',
                    display.currentProgressBar,
                    vscode.TreeItemCollapsibleState.None,
                    'token-window-current-progress',
                    new vscode.ThemeIcon('pulse'),
                    undefined
                ));
                
                // Time window information
                items.push(new UsageMonitorItem(
                    '⏰ Time Window',
                    display.windowTimeText,
                    vscode.TreeItemCollapsibleState.None,
                    'token-window-time-window',
                    new vscode.ThemeIcon('calendar'),
                    undefined
                ));
                
                items.push(new UsageMonitorItem(
                    '⏳ Time Remaining',
                    display.timeRemainingText,
                    vscode.TreeItemCollapsibleState.None,
                    'token-window-time-remaining',
                    new vscode.ThemeIcon('watch'),
                    undefined
                ));
                
                // Burn rate information
                items.push(new UsageMonitorItem(
                    '🔥 Burn Rate',
                    display.burnRateText,
                    vscode.TreeItemCollapsibleState.None,
                    'token-window-burn-rate',
                    new vscode.ThemeIcon('graph-line'),
                    undefined
                ));
                
                // Subscription tier
                items.push(new UsageMonitorItem(
                    '👤 Subscription',
                    `${subscriptionInfo.tier} (${subscriptionInfo.confidence} confidence)`,
                    vscode.TreeItemCollapsibleState.None,
                    'token-window-subscription-tier',
                    new vscode.ThemeIcon('account'),
                    undefined
                ));
                
                // Detailed projection
                items.push(new UsageMonitorItem(
                    '📈 Projection Details',
                    display.projectionText,
                    vscode.TreeItemCollapsibleState.None,
                    'token-window-projection-details',
                    new vscode.ThemeIcon('graph'),
                    undefined
                ));
            } else {
                items.push(new UsageMonitorItem(
                    '⚪ Token Window',
                    'Loading usage data...',
                    vscode.TreeItemCollapsibleState.None,
                    'token-window',
                    new vscode.ThemeIcon('loading~spin'),
                    {
                        command: 'claude-config.refreshTokenWindow',
                        title: 'Refresh Token Window'
                    }
                ));
            }

            // ccusage Integration Status
            items.push(new UsageMonitorItem(
                'ccusage Integration',
                'Real-time Claude Code usage tracking',
                vscode.TreeItemCollapsibleState.None,
                'ccusage-status',
                new vscode.ThemeIcon('graph'),
                {
                    command: 'claude-config.debugCcusage',
                    title: 'Test ccusage Integration'
                }
            ));

            // Additional actions
            items.push(new UsageMonitorItem(
                'View Usage Statistics',
                'Open detailed usage report',
                vscode.TreeItemCollapsibleState.None,
                'view-stats',
                new vscode.ThemeIcon('graph-line'),
                {
                    command: 'claude-config.viewUsageStats',
                    title: 'View Usage Statistics'
                }
            ));

            items.push(new UsageMonitorItem(
                'Install ccusage',
                'Get help installing ccusage',
                vscode.TreeItemCollapsibleState.None,
                'install-ccusage',
                new vscode.ThemeIcon('question'),
                {
                    command: 'claude-config.installCcusageHelp',
                    title: 'Install ccusage Help'
                }
            ));

            return items;
        }

        return [];
    }

    dispose() {
        this.tokenWindowMonitor.dispose();
        this._onDidChangeTreeData.dispose();
    }
}

class UsageMonitorItem extends vscode.TreeItem {
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
        // Set stable ID based on context value to prevent TreeView errors
        this.id = contextValue;
    }
}