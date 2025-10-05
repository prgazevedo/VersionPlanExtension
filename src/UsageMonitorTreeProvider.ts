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
        console.log('[UsageMonitorTreeProvider] Refresh called');
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: UsageMonitorItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: UsageMonitorItem): Promise<UsageMonitorItem[]> {
        if (!element) {
            const items: UsageMonitorItem[] = [];

            // Token Window Status - Subscription-focused view
            if (this.currentWindowData) {
                const display = this.tokenWindowMonitor.formatForDisplay(this.currentWindowData);

                // === SUBSCRIPTION INFO (most important for subscribed users) ===
                items.push(new UsageMonitorItem(
                    '👤 Subscription',
                    'Claude Pro (Unlimited)',
                    vscode.TreeItemCollapsibleState.None,
                    'subscription-tier',
                    new vscode.ThemeIcon('organization'),
                    undefined
                ));

                // === 5-HOUR WINDOW USAGE ===
                items.push(new UsageMonitorItem(
                    '📊 Window Usage',
                    display.totalTokensText,
                    vscode.TreeItemCollapsibleState.None,
                    'token-window-total',
                    new vscode.ThemeIcon('pulse'),
                    undefined
                ));

                if (display.projectionText) {
                    items.push(new UsageMonitorItem(
                        '🎯 Projected at Window End',
                        display.projectionText,
                        vscode.TreeItemCollapsibleState.None,
                        'token-window-projection',
                        new vscode.ThemeIcon('target'),
                        undefined
                    ));
                }

                // === BURN RATE ===
                if (display.burnRateText) {
                    items.push(new UsageMonitorItem(
                        '🔥 Burn Rate',
                        display.burnRateText,
                        vscode.TreeItemCollapsibleState.None,
                        'token-window-burn-rate',
                        new vscode.ThemeIcon('flame'),
                        undefined
                    ));
                }

                // === TIME INFO ===
                items.push(new UsageMonitorItem(
                    '⏳ Time Remaining',
                    display.timeRemainingText,
                    vscode.TreeItemCollapsibleState.None,
                    'token-window-time-remaining',
                    new vscode.ThemeIcon('watch'),
                    undefined
                ));

                items.push(new UsageMonitorItem(
                    '⏰ Window Period',
                    display.windowTimeText,
                    vscode.TreeItemCollapsibleState.None,
                    'token-window-time-window',
                    new vscode.ThemeIcon('calendar'),
                    undefined
                ));

                // === DETAILS ===
                items.push(new UsageMonitorItem(
                    '🤖 Model',
                    display.modelsText,
                    vscode.TreeItemCollapsibleState.None,
                    'token-window-models',
                    new vscode.ThemeIcon('code'),
                    undefined
                ));

                items.push(new UsageMonitorItem(
                    '🔄 API Calls',
                    display.entriesText,
                    vscode.TreeItemCollapsibleState.None,
                    'token-window-entries',
                    new vscode.ThemeIcon('symbol-number'),
                    undefined
                ));
            } else {
                // Token Window disabled - show helpful message
                items.push(new UsageMonitorItem(
                    'ℹ️ Token Window',
                    'Advanced token window tracking (coming soon)',
                    vscode.TreeItemCollapsibleState.None,
                    'token-window',
                    new vscode.ThemeIcon('info'),
                    undefined
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