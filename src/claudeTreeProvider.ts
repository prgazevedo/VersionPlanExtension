import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs-extra';

export class ClaudeTreeDataProvider implements vscode.TreeDataProvider<ClaudeTreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<ClaudeTreeItem | undefined | null | void> = new vscode.EventEmitter<ClaudeTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<ClaudeTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

    constructor() {}

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: ClaudeTreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: ClaudeTreeItem): Promise<ClaudeTreeItem[]> {
        if (element && element.itemType === 'section' && element.label === 'Usage Statistics') {
            return await this.getUsageStatisticsChildren();
        }

        if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
            // When no workspace is open, show limited functionality
            const items: ClaudeTreeItem[] = [];
            
            items.push(new ClaudeTreeItem(
                'Open Folder to Enable',
                vscode.TreeItemCollapsibleState.None,
                {
                    command: 'vscode.openFolder',
                    title: 'Open Folder',
                    arguments: []
                },
                'folder-opened'
            ));
            
            return items;
        }

        const workspacePath = vscode.workspace.workspaceFolders[0].uri.fsPath;
        const claudeFilePath = path.join(workspacePath, 'CLAUDE.md');
        const planFilePath = path.join(workspacePath, 'PROJECT_PLAN.md');
        const claudeFileExists = await fs.pathExists(claudeFilePath);
        const planFileExists = await fs.pathExists(planFilePath);

        const items: ClaudeTreeItem[] = [];

        // File status section
        items.push(new ClaudeTreeItem(
            claudeFileExists ? 'CLAUDE.md ✓' : 'CLAUDE.md (not found)',
            claudeFileExists ? vscode.TreeItemCollapsibleState.None : vscode.TreeItemCollapsibleState.None,
            claudeFileExists ? {
                command: 'claude-config.edit',
                title: 'Edit CLAUDE.md',
                arguments: []
            } : undefined,
            claudeFileExists ? 'file' : 'file-missing'
        ));

        // Project plan section
        if (planFileExists) {
            items.push(new ClaudeTreeItem(
                'PROJECT_PLAN.md ✓',
                vscode.TreeItemCollapsibleState.None,
                {
                    command: 'vscode.open',
                    title: 'Open Project Plan',
                    arguments: [vscode.Uri.file(planFilePath)]
                },
                'book'
            ));
        }

        // Actions section - sync project plan if it exists
        if (planFileExists) {
            items.push(new ClaudeTreeItem(
                'Sync Project Plan to Git',
                vscode.TreeItemCollapsibleState.None,
                {
                    command: 'claude-config.sync',
                    title: 'Sync Project Plan to Git',
                    arguments: []
                },
                'sync'
            ));
        }

        // Cloud sync action (replaces export all conversations)
        items.push(new ClaudeTreeItem(
            'Sync to Cloud',
            vscode.TreeItemCollapsibleState.None,
            {
                command: 'claude-config.syncToCloud',
                title: 'Sync to Cloud',
                arguments: []
            },
            'cloud-upload'
        ));

        // Cloud settings action with status indicator
        items.push(await this.createCloudSettingsItem());

        // Usage statistics section
        items.push(new ClaudeTreeItem(
            'Usage Statistics',
            vscode.TreeItemCollapsibleState.Collapsed,
            undefined,
            'graph',
            'section'
        ));

        return items;
    }

    private async createCloudSettingsItem(): Promise<ClaudeTreeItem> {
        try {
            // Check if cloud sync is configured
            const config = vscode.workspace.getConfiguration('claude-config.cloudSync');
            const enabled = config.get<boolean>('enabled', false);
            const serverUrl = config.get<string>('webdav.serverUrl', '');
            const username = config.get<string>('webdav.username', '');
            
            // Check if we have basic configuration
            const hasBasicConfig = enabled && serverUrl && username;
            
            if (hasBasicConfig) {
                // Check if we have secure credentials
                try {
                    const { CloudAuthManager } = await import('./cloud/CloudAuthManager');
                    const authManager = CloudAuthManager.getInstance();
                    const hasCredentials = await authManager.hasCredentials('webdav');
                    
                    if (hasCredentials) {
                        return new ClaudeTreeItem(
                            'Cloud Settings ✓',
                            vscode.TreeItemCollapsibleState.None,
                            {
                                command: 'claude-config.openCloudSettings',
                                title: 'Open Cloud Settings',
                                arguments: []
                            },
                            'cloud'
                        );
                    } else {
                        return new ClaudeTreeItem(
                            'Cloud Settings ⚠',
                            vscode.TreeItemCollapsibleState.None,
                            {
                                command: 'claude-config.openCloudSettings',
                                title: 'Complete Cloud Setup',
                                arguments: []
                            },
                            'warning'
                        );
                    }
                } catch (error) {
                    // Fallback if CloudAuthManager is not available
                    return new ClaudeTreeItem(
                        'Cloud Settings ⚠',
                        vscode.TreeItemCollapsibleState.None,
                        {
                            command: 'claude-config.openCloudSettings',
                            title: 'Setup Cloud Sync',
                            arguments: []
                        },
                        'warning'
                    );
                }
            } else {
                return new ClaudeTreeItem(
                    'Cloud Settings',
                    vscode.TreeItemCollapsibleState.None,
                    {
                        command: 'claude-config.openCloudSettings',
                        title: 'Setup Cloud Sync',
                        arguments: []
                    },
                    'settings-gear'
                );
            }
        } catch (error) {
            // Fallback in case of any errors
            return new ClaudeTreeItem(
                'Cloud Settings',
                vscode.TreeItemCollapsibleState.None,
                {
                    command: 'claude-config.openCloudSettings',
                    title: 'Setup Cloud Sync',
                    arguments: []
                },
                'settings-gear'
            );
        }
    }

    private async getUsageStatisticsChildren(): Promise<ClaudeTreeItem[]> {
        const items: ClaudeTreeItem[] = [];
        
        // ccusage-powered usage statistics
        items.push(new ClaudeTreeItem(
            'ccusage Integration',
            vscode.TreeItemCollapsibleState.None,
            {
                command: 'claude-config.debugCcusage',
                title: 'Test ccusage Integration',
                arguments: []
            },
            'graph',
            'ccusage-status'
        ));

        // Quick actions
        items.push(new ClaudeTreeItem(
            'View Usage Report',
            vscode.TreeItemCollapsibleState.None,
            {
                command: 'claude-config.viewUsageStats',
                title: 'View ccusage Statistics',
                arguments: []
            },
            'graph-line',
            'action'
        ));

        items.push(new ClaudeTreeItem(
            'Quick Usage Summary',
            vscode.TreeItemCollapsibleState.None,
            {
                command: 'claude-config.showUsageQuickPick',
                title: 'Show Usage Summary',
                arguments: []
            },
            'list-selection',
            'action'
        ));

        items.push(new ClaudeTreeItem(
            'ccusage Setup Help',
            vscode.TreeItemCollapsibleState.None,
            {
                command: 'claude-config.installCcusageHelp',
                title: 'Install ccusage',
                arguments: []
            },
            'info',
            'action'
        ));

        // Add cloud sync status (simplified for tree view)
        items.push(await this.createUsageCloudSyncItem());

        return items;
    }

    private async createUsageCloudSyncItem(): Promise<ClaudeTreeItem> {
        try {
            const config = vscode.workspace.getConfiguration('claude-config.cloudSync');
            const enabled = config.get<boolean>('enabled', false);
            
            if (enabled) {
                try {
                    const { CloudAuthManager } = await import('./cloud/CloudAuthManager');
                    const authManager = CloudAuthManager.getInstance();
                    const hasCredentials = await authManager.hasCredentials('webdav');
                    const isValid = hasCredentials ? await authManager.testCredentials('webdav') : false;
                    
                    if (isValid) {
                        return new ClaudeTreeItem(
                            'Cloud Sync ✓',
                            vscode.TreeItemCollapsibleState.None,
                            {
                                command: 'claude-config.syncToCloud',
                                title: 'Sync to Cloud',
                                arguments: []
                            },
                            'cloud',
                            'cloud-status'
                        );
                    } else {
                        return new ClaudeTreeItem(
                            'Cloud Sync ⚠',
                            vscode.TreeItemCollapsibleState.None,
                            {
                                command: 'claude-config.openCloudSettings',
                                title: 'Fix Cloud Configuration',
                                arguments: []
                            },
                            'warning',
                            'cloud-status'
                        );
                    }
                } catch (error) {
                    return new ClaudeTreeItem(
                        'Cloud Sync ⚠',
                        vscode.TreeItemCollapsibleState.None,
                        {
                            command: 'claude-config.openCloudSettings',
                            title: 'Configure Cloud Sync',
                            arguments: []
                        },
                        'warning',
                        'cloud-status'
                    );
                }
            } else {
                return new ClaudeTreeItem(
                    'Cloud Sync',
                    vscode.TreeItemCollapsibleState.None,
                    {
                        command: 'claude-config.openCloudSettings',
                        title: 'Configure Cloud Sync',
                        arguments: []
                    },
                    'cloud-outline',
                    'cloud-status'
                );
            }
        } catch (error) {
            return new ClaudeTreeItem(
                'Cloud Sync',
                vscode.TreeItemCollapsibleState.None,
                {
                    command: 'claude-config.openCloudSettings',
                    title: 'Configure Cloud Sync',
                    arguments: []
                },
                'cloud-outline',
                'cloud-status'
            );
        }
    }
}

export class ClaudeTreeItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly command?: vscode.Command,
        public readonly iconName?: string,
        public readonly itemType?: string
    ) {
        super(label, collapsibleState);
        
        if (iconName) {
            this.iconPath = new vscode.ThemeIcon(iconName);
        }
        
        if (command) {
            this.command = command;
        }

        this.contextValue = itemType || iconName;
    }
}