import * as vscode from 'vscode';
import { RepositoryManager } from './repository';
import { ClaudeFileManager } from './fileManager';
import { TemplateManager } from './templates';
import { ClaudeTreeDataProvider } from './claudeTreeProvider';
import { syncCommand } from './commands/sync';
import { createCommand } from './commands/create';
import { editCommand } from './commands/edit';

let repositoryManager: RepositoryManager;
let fileManager: ClaudeFileManager;
let templateManager: TemplateManager;
let statusBarItem: vscode.StatusBarItem;

export function activate(context: vscode.ExtensionContext) {
    console.log('Claude Config Manager is now active!');

    // Initialize managers
    repositoryManager = new RepositoryManager(context);
    fileManager = new ClaudeFileManager(context, repositoryManager);
    templateManager = new TemplateManager(context);

    // Create tree data provider and register tree view
    const treeDataProvider = new ClaudeTreeDataProvider();
    vscode.window.createTreeView('claude-config', {
        treeDataProvider: treeDataProvider,
        showCollapseAll: false
    });

    // Create status bar item
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.text = "$(sync) Claude Config";
    statusBarItem.command = 'claude-config.sync';
    statusBarItem.show();
    context.subscriptions.push(statusBarItem);

    // Register commands
    const commands = [
        vscode.commands.registerCommand('claude-config.sync', () => syncCommand(repositoryManager, fileManager)),
        vscode.commands.registerCommand('claude-config.create', () => createCommand(templateManager, fileManager)),
        vscode.commands.registerCommand('claude-config.edit', () => editCommand(fileManager))
    ];

    commands.forEach(command => context.subscriptions.push(command));

    // Start file watching if auto-sync is enabled
    if (vscode.workspace.getConfiguration('claude-config').get('autoSync')) {
        fileManager.startWatching();
    }

    // Watch for CLAUDE.md file changes to refresh tree view
    const fileWatcher = vscode.workspace.createFileSystemWatcher('**/CLAUDE.md');
    fileWatcher.onDidCreate(() => treeDataProvider.refresh());
    fileWatcher.onDidDelete(() => treeDataProvider.refresh());
    fileWatcher.onDidChange(() => treeDataProvider.refresh());
    context.subscriptions.push(fileWatcher);

    // Listen for configuration changes
    vscode.workspace.onDidChangeConfiguration(event => {
        if (event.affectsConfiguration('claude-config.autoSync')) {
            const autoSync = vscode.workspace.getConfiguration('claude-config').get('autoSync');
            if (autoSync) {
                fileManager.startWatching();
            } else {
                fileManager.stopWatching();
            }
        }
    });
}

export function deactivate() {
    if (fileManager) {
        fileManager.stopWatching();
    }
}

export function updateStatusBar(message: string, isError: boolean = false) {
    if (statusBarItem) {
        statusBarItem.text = `$(${isError ? 'error' : 'sync'}) ${message}`;
        setTimeout(() => {
            statusBarItem.text = "$(sync) Claude Config";
        }, 3000);
    }
}