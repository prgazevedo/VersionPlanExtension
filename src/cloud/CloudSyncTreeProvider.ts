/**
 * Cloud Sync Tree Provider for VS Code sidebar integration
 * Provides a dedicated sidebar view for cloud sync status and operations
 */

import * as vscode from 'vscode';

export interface CloudTreeItem {
    id: string;
    label: string;
    description?: string;
    iconPath?: vscode.ThemeIcon | vscode.Uri;
    contextValue?: string;
    collapsibleState?: vscode.TreeItemCollapsibleState;
    command?: vscode.Command;
    tooltip?: string;
    children?: CloudTreeItem[];
}

/**
 * Tree data provider for cloud sync management
 */
export class CloudSyncTreeProvider implements vscode.TreeDataProvider<CloudTreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<CloudTreeItem | undefined | null | void> = new vscode.EventEmitter<CloudTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<CloudTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

    constructor(
        private conversationManager: any,
        private tokenTracker: any,
        private authManager: any
    ) {
        // Listen for sync events to refresh the tree
        this.conversationManager.onSyncEvent(() => this.refresh());
        this.tokenTracker.onSyncEvent.event(() => this.refresh());
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: CloudTreeItem): vscode.TreeItem {
        const item = new vscode.TreeItem(element.label, element.collapsibleState);
        item.description = element.description;
        item.iconPath = element.iconPath;
        item.contextValue = element.contextValue;
        item.command = element.command;
        item.tooltip = element.tooltip;
        return item;
    }

    async getChildren(element?: CloudTreeItem): Promise<CloudTreeItem[]> {
        if (!element) {
            return this.getRootItems();
        }

        switch (element.contextValue) {
            case 'cloudProviders':
                return this.getCloudProviderItems();
            case 'conversationSync':
                return this.getConversationSyncItems();
            case 'usageSync':
                return this.getUsageSyncItems();
            case 'cloudProvider':
                return this.getProviderDetailItems(element.id);
            default:
                return element.children || [];
        }
    }

    private async getRootItems(): Promise<CloudTreeItem[]> {
        const items: CloudTreeItem[] = [];

        // Cloud Providers Section
        const providers = this.conversationManager.getCloudProviders();
        const providerCount = providers.length;
        const authenticatedCount = providers.filter((p: any) => p.isAuthenticated).length;

        items.push({
            id: 'cloudProviders',
            label: 'Cloud Providers',
            description: `${authenticatedCount}/${providerCount} authenticated`,
            iconPath: new vscode.ThemeIcon('cloud'),
            contextValue: 'cloudProviders',
            collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
            tooltip: 'Manage cloud storage providers'
        });

        // Conversation Sync Section
        const conversationStats = this.conversationManager.getSyncStatistics();
        items.push({
            id: 'conversationSync',
            label: 'Conversation Sync',
            description: `${conversationStats.syncedConversations}/${conversationStats.totalConversations} synced`,
            iconPath: new vscode.ThemeIcon('comment-discussion'),
            contextValue: 'conversationSync',
            collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
            tooltip: 'Conversation history cloud sync status'
        });

        // Usage Sync Section
        try {
            const usageStatus = await this.tokenTracker.getUsageCloudSyncStatus();
            items.push({
                id: 'usageSync',
                label: 'Usage Statistics Sync',
                description: usageStatus.enabled ? 
                    (usageStatus.ccusageAvailable ? 'ccusage active' : 'ccusage unavailable') : 
                    'Disabled',
                iconPath: new vscode.ThemeIcon('graph'),
                contextValue: 'usageSync',
                collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
                tooltip: 'Usage statistics cloud sync status'
            });
        } catch (error) {
            items.push({
                id: 'usageSync',
                label: 'Usage Statistics Sync',
                description: 'Error',
                iconPath: new vscode.ThemeIcon('error'),
                contextValue: 'usageSync',
                collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
                tooltip: 'Error getting usage sync status'
            });
        }

        return items;
    }

    private async getCloudProviderItems(): Promise<CloudTreeItem[]> {
        const items: CloudTreeItem[] = [];
        const providers = this.conversationManager.getCloudProviders();

        for (const provider of providers) {
            const isAuthenticated = provider.isAuthenticated;
            
            items.push({
                id: provider.providerType,
                label: provider.displayName,
                description: isAuthenticated ? 'Connected' : 'Not authenticated',
                iconPath: this.getProviderIcon(provider.providerType, isAuthenticated),
                contextValue: 'cloudProvider',
                collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
                tooltip: `${provider.displayName} - Click to manage`,
                command: {
                    command: 'claude-config.manageCloudProvider',
                    title: 'Manage Provider',
                    arguments: [provider.providerType]
                }
            });
        }

        // Add setup option if no providers
        if (providers.length === 0) {
            items.push({
                id: 'setupProvider',
                label: 'Add Cloud Provider',
                description: 'Set up cloud sync',
                iconPath: new vscode.ThemeIcon('add'),
                contextValue: 'setupProvider',
                command: {
                    command: 'claude-config.setupCloudSync',
                    title: 'Setup Cloud Sync'
                },
                tooltip: 'Add a cloud storage provider'
            });
        }

        return items;
    }

    private async getConversationSyncItems(): Promise<CloudTreeItem[]> {
        const items: CloudTreeItem[] = [];
        const stats = this.conversationManager.getSyncStatistics();
        const syncStatus = this.conversationManager.getSyncStatus();

        // Summary stats
        items.push({
            id: 'conversationStats',
            label: 'Total Conversations',
            description: stats.totalConversations.toString(),
            iconPath: new vscode.ThemeIcon('file-text'),
            contextValue: 'stat',
            tooltip: 'Total conversations tracked'
        });

        items.push({
            id: 'syncedConversations',
            label: 'Synced',
            description: stats.syncedConversations.toString(),
            iconPath: new vscode.ThemeIcon('check', new vscode.ThemeColor('charts.green')),
            contextValue: 'stat',
            tooltip: 'Successfully synced conversations'
        });

        if (stats.conflictedConversations > 0) {
            items.push({
                id: 'conflictedConversations',
                label: 'Conflicts',
                description: stats.conflictedConversations.toString(),
                iconPath: new vscode.ThemeIcon('warning', new vscode.ThemeColor('charts.orange')),
                contextValue: 'conflicts',
                command: {
                    command: 'claude-config.resolveConversationConflicts',
                    title: 'Resolve Conflicts'
                },
                tooltip: 'Conversations with sync conflicts - click to resolve'
            });
        }

        if (stats.pendingConversations > 0) {
            items.push({
                id: 'pendingConversations',
                label: 'Pending Sync',
                description: stats.pendingConversations.toString(),
                iconPath: new vscode.ThemeIcon('clock'),
                contextValue: 'pending',
                tooltip: 'Conversations waiting to be synced'
            });
        }

        // Last sync time
        if (stats.lastSyncTime) {
            items.push({
                id: 'lastSync',
                label: 'Last Sync',
                description: this.formatRelativeTime(stats.lastSyncTime),
                iconPath: new vscode.ThemeIcon('history'),
                contextValue: 'stat',
                tooltip: `Last successful sync: ${stats.lastSyncTime.toLocaleString()}`
            });
        }

        // Per-provider status
        for (const status of syncStatus) {
            const statusIcon = this.getSyncStatusIcon(status.status);
            items.push({
                id: `conv-${status.provider}`,
                label: status.provider,
                description: `${status.status} (${status.syncedConversations}/${status.totalConversations})`,
                iconPath: statusIcon,
                contextValue: 'providerStatus',
                tooltip: `${status.provider} sync status: ${status.status}`,
                command: status.status === 'error' ? {
                    command: 'claude-config.retrySync',
                    title: 'Retry Sync',
                    arguments: [status.provider, 'conversations']
                } : undefined
            });
        }

        return items;
    }

    private async getUsageSyncItems(): Promise<CloudTreeItem[]> {
        const items: CloudTreeItem[] = [];

        try {
            const status = await this.tokenTracker.getUsageCloudSyncStatus();

            items.push({
                id: 'usageEnabled',
                label: 'Cloud Sync',
                description: status.enabled ? 'Enabled' : 'Disabled',
                iconPath: new vscode.ThemeIcon(status.enabled ? 'check' : 'x'),
                contextValue: 'stat',
                tooltip: 'Usage statistics cloud synchronization status'
            });

            items.push({
                id: 'ccusageStatus',
                label: 'ccusage CLI',
                description: status.ccusageAvailable ? `v${status.ccusageVersion || 'unknown'}` : 'Not available',
                iconPath: new vscode.ThemeIcon(status.ccusageAvailable ? 'check' : 'x'),
                contextValue: 'stat',
                tooltip: status.ccusageAvailable ? 'ccusage CLI is available for real usage data' : 'ccusage CLI not found - install Bun or Node.js'
            });

            items.push({
                id: 'cloudProvider',
                label: 'Cloud Provider',
                description: status.cloudProviderConfigured ? 'Configured' : 'Not configured',
                iconPath: new vscode.ThemeIcon(status.cloudProviderConfigured ? 'cloud' : 'cloud-outline'),
                contextValue: 'stat',
                tooltip: 'WebDAV cloud provider configuration status'
            });

            if (status.lastSync) {
                items.push({
                    id: 'usageLastSync',
                    label: 'Last Sync',
                    description: this.formatRelativeTime(status.lastSync),
                    iconPath: new vscode.ThemeIcon('history'),
                    contextValue: 'stat',
                    tooltip: `Last usage sync: ${status.lastSync.toLocaleString()}`
                });
            }

            items.push({
                id: 'syncStatus',
                label: 'Status',
                description: status.message || status.status,
                iconPath: new vscode.ThemeIcon(
                    status.status === 'ready' ? 'check' : 
                    status.status === 'error' ? 'error' : 'info'
                ),
                contextValue: 'stat',
                tooltip: `Sync status: ${status.status}`
            });

        } catch (error) {
            items.push({
                id: 'usageError',
                label: 'Error',
                description: error instanceof Error ? error.message : 'Unknown error',
                iconPath: new vscode.ThemeIcon('error'),
                contextValue: 'stat',
                tooltip: 'Error getting usage sync status'
            });
        }

        return items;
    }

    private async getProviderDetailItems(providerType: string): Promise<CloudTreeItem[]> {
        const items: CloudTreeItem[] = [];
        const providers = this.conversationManager.getCloudProviders();
        const provider = providers.find((p: any) => p.providerType === providerType);

        if (!provider) return items;

        // Connection status
        items.push({
            id: `${providerType}-status`,
            label: 'Status',
            description: provider.isAuthenticated ? 'Connected' : 'Disconnected',
            iconPath: new vscode.ThemeIcon(provider.isAuthenticated ? 'check' : 'x'),
            contextValue: 'stat',
            tooltip: 'Provider connection status'
        });

        if (provider.isAuthenticated) {
            // Test connection
            items.push({
                id: `${providerType}-test`,
                label: 'Test Connection',
                iconPath: new vscode.ThemeIcon('pulse'),
                contextValue: 'action',
                command: {
                    command: 'claude-config.testCloudConnection',
                    title: 'Test Connection',
                    arguments: [providerType]
                },
                tooltip: 'Test connection to cloud provider'
            });

            // Quota info (if available)
            try {
                const quotaInfo = await provider.getQuotaInfo();
                const usedPercent = (quotaInfo.used / quotaInfo.total) * 100;

                items.push({
                    id: `${providerType}-quota`,
                    label: 'Storage Used',
                    description: `${usedPercent.toFixed(1)}%`,
                    iconPath: new vscode.ThemeIcon('database'),
                    contextValue: 'stat',
                    tooltip: `${this.formatBytes(quotaInfo.used)} of ${this.formatBytes(quotaInfo.total)} used`
                });
            } catch (error) {
                // Quota not available or error occurred
            }

            // Sync actions
            items.push({
                id: `${providerType}-sync-up`,
                label: 'Sync to Cloud',
                iconPath: new vscode.ThemeIcon('cloud-upload'),
                contextValue: 'action',
                command: {
                    command: 'claude-config.syncToCloud',
                    title: 'Sync to Cloud',
                    arguments: [providerType]
                },
                tooltip: 'Upload local data to cloud'
            });

            items.push({
                id: `${providerType}-sync-down`,
                label: 'Sync from Cloud',
                iconPath: new vscode.ThemeIcon('cloud-download'),
                contextValue: 'action',
                command: {
                    command: 'claude-config.syncFromCloud',
                    title: 'Sync from Cloud',
                    arguments: [providerType]
                },
                tooltip: 'Download data from cloud'
            });

        } else {
            // Authentication
            items.push({
                id: `${providerType}-auth`,
                label: 'Authenticate',
                iconPath: new vscode.ThemeIcon('key'),
                contextValue: 'action',
                command: {
                    command: 'claude-config.authenticateProvider',
                    title: 'Authenticate',
                    arguments: [providerType]
                },
                tooltip: 'Authenticate with cloud provider'
            });
        }

        return items;
    }

    private getProviderIcon(providerType: string, isAuthenticated: boolean): vscode.ThemeIcon {
        const color = isAuthenticated ? 
            new vscode.ThemeColor('charts.green') : 
            new vscode.ThemeColor('charts.red');

        switch (providerType) {
            case 'aws-s3':
                return new vscode.ThemeIcon('cloud', color);
            case 'google-drive':
                return new vscode.ThemeIcon('repo', color);
            case 'github-gists':
                return new vscode.ThemeIcon('mark-github', color);
            default:
                return new vscode.ThemeIcon('cloud', color);
        }
    }

    private getSyncStatusIcon(status: string): vscode.ThemeIcon {
        switch (status) {
            case 'idle':
                return new vscode.ThemeIcon('check', new vscode.ThemeColor('charts.green'));
            case 'syncing':
                return new vscode.ThemeIcon('loading~spin');
            case 'error':
                return new vscode.ThemeIcon('error', new vscode.ThemeColor('charts.red'));
            case 'conflict':
                return new vscode.ThemeIcon('warning', new vscode.ThemeColor('charts.orange'));
            default:
                return new vscode.ThemeIcon('circle-outline');
        }
    }

    private formatRelativeTime(date: Date | string | number): string {
        const now = Date.now();
        let timestamp: number;

        if (date instanceof Date) {
            timestamp = date.getTime();
        } else if (typeof date === 'string') {
            timestamp = new Date(date).getTime();
        } else if (typeof date === 'number') {
            timestamp = date;
        } else {
            return 'Unknown';
        }

        if (isNaN(timestamp)) {
            return 'Invalid date';
        }

        const diff = now - timestamp;
        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (days > 0) return `${days}d ago`;
        if (hours > 0) return `${hours}h ago`;
        if (minutes > 0) return `${minutes}m ago`;
        return 'Just now';
    }

    private formatBytes(bytes: number): string {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
}