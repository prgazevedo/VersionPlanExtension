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
        if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
            return [];
        }

        const workspacePath = vscode.workspace.workspaceFolders[0].uri.fsPath;
        const claudeFilePath = path.join(workspacePath, 'CLAUDE.md');
        const claudeFileExists = await fs.pathExists(claudeFilePath);

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

        // Actions section
        if (claudeFileExists) {
            items.push(new ClaudeTreeItem(
                'Sync to Git',
                vscode.TreeItemCollapsibleState.None,
                {
                    command: 'claude-config.sync',
                    title: 'Sync to Git',
                    arguments: []
                },
                'sync'
            ));
        }


        return items;
    }
}

export class ClaudeTreeItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly command?: vscode.Command,
        public readonly iconName?: string
    ) {
        super(label, collapsibleState);
        
        if (iconName) {
            this.iconPath = new vscode.ThemeIcon(iconName);
        }
        
        if (command) {
            this.command = command;
        }

        this.contextValue = iconName;
    }
}