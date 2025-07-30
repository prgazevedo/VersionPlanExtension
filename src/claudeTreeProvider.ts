import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs-extra';
import { TokenTracker } from './tokenTracker';

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
            return this.getUsageStatisticsChildren();
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
        const planFilePath = path.join(workspacePath, '.claude', '.plans', 'PROJECT_PLAN.md');
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

        // Export all conversations action
        items.push(new ClaudeTreeItem(
            'Export All Conversations',
            vscode.TreeItemCollapsibleState.None,
            {
                command: 'claude-config.exportAllConversations',
                title: 'Export All Conversations',
                arguments: []
            },
            'export'
        ));

        // Usage statistics section
        const tokenTracker = TokenTracker.getInstance();
        const stats = tokenTracker.getStatistics();
        
        items.push(new ClaudeTreeItem(
            'Usage Statistics',
            vscode.TreeItemCollapsibleState.Collapsed,
            undefined,
            'graph',
            'section'
        ));

        return items;
    }

    private getUsageStatisticsChildren(): ClaudeTreeItem[] {
        const tokenTracker = TokenTracker.getInstance();
        const stats = tokenTracker.getStatistics();
        const items: ClaudeTreeItem[] = [];

        // Total usage summary
        items.push(new ClaudeTreeItem(
            `Total: ${stats.totalTokens.toLocaleString()} tokens`,
            vscode.TreeItemCollapsibleState.None,
            {
                command: 'claude-config.viewUsageStats',
                title: 'View Detailed Statistics',
                arguments: []
            },
            'info',
            'stat'
        ));

        items.push(new ClaudeTreeItem(
            `Cost: $${stats.totalCost.toFixed(4)}`,
            vscode.TreeItemCollapsibleState.None,
            {
                command: 'claude-config.viewUsageStats',
                title: 'View Detailed Statistics',
                arguments: []
            },
            'credit-card',
            'stat'
        ));

        items.push(new ClaudeTreeItem(
            `Operations: ${stats.operationCount.toLocaleString()}`,
            vscode.TreeItemCollapsibleState.None,
            {
                command: 'claude-config.viewUsageStats',
                title: 'View Detailed Statistics',
                arguments: []
            },
            'pulse',
            'stat'
        ));

        // Quick actions
        items.push(new ClaudeTreeItem(
            'View Detailed Report',
            vscode.TreeItemCollapsibleState.None,
            {
                command: 'claude-config.viewUsageStats',
                title: 'View Detailed Statistics',
                arguments: []
            },
            'graph-line',
            'action'
        ));

        items.push(new ClaudeTreeItem(
            'Reset Statistics',
            vscode.TreeItemCollapsibleState.None,
            {
                command: 'claude-config.resetUsageStats',
                title: 'Reset Usage Statistics',
                arguments: []
            },
            'refresh',
            'action'
        ));

        return items;
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