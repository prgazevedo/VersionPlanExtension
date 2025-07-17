import * as vscode from 'vscode';
import { RepositoryManager } from './repository';
import { ClaudeFileManager } from './fileManager';
import { TemplateManager } from './templates';
import { initCommand } from './commands/init';
import { syncCommand } from './commands/sync';
import { createCommand } from './commands/create';
import { editCommand } from './commands/edit';

let repositoryManager: RepositoryManager;
let fileManager: ClaudeFileManager;
let templateManager: TemplateManager;
let statusBarItem: vscode.StatusBarItem;

export function activate(context: vscode.ExtensionContext) {
    console.log('Claude Config Manager is now active!');

    try {
        // Initialize managers with individual error handling
        console.log('Initializing RepositoryManager...');
        try {
            repositoryManager = new RepositoryManager(context);
            console.log('RepositoryManager initialized successfully');
        } catch (error) {
            console.error('Failed to initialize RepositoryManager:', error);
            throw error;
        }
        
        console.log('Initializing ClaudeFileManager...');
        try {
            fileManager = new ClaudeFileManager(context, repositoryManager);
            console.log('ClaudeFileManager initialized successfully');
        } catch (error) {
            console.error('Failed to initialize ClaudeFileManager:', error);
            throw error;
        }
        
        console.log('Initializing TemplateManager...');
        try {
            templateManager = new TemplateManager(context);
            console.log('TemplateManager initialized successfully');
        } catch (error) {
            console.error('Failed to initialize TemplateManager:', error);
            throw error;
        }

        // Create status bar item
        statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
        statusBarItem.text = "$(sync) Claude Config";
        statusBarItem.tooltip = "Click to sync CLAUDE.md files to repository";
        statusBarItem.command = 'claude-config.sync';
        statusBarItem.show();
        context.subscriptions.push(statusBarItem);

        // Register commands
        console.log('Registering commands...');
        const commands = [
            vscode.commands.registerCommand('claude-config.init', () => initCommand(repositoryManager)),
            vscode.commands.registerCommand('claude-config.sync', () => syncCommand(repositoryManager, fileManager)),
            vscode.commands.registerCommand('claude-config.create', () => createCommand(templateManager, fileManager)),
            vscode.commands.registerCommand('claude-config.edit', () => editCommand(fileManager))
        ];

        commands.forEach(command => context.subscriptions.push(command));
        console.log('Commands registered successfully:', commands.length);

        // Start file watching if auto-sync is enabled
        if (vscode.workspace.getConfiguration('claude-config').get('autoSync')) {
            fileManager.startWatching();
        }

        // Listen for configuration changes
        const configChangeListener = vscode.workspace.onDidChangeConfiguration(event => {
            if (event.affectsConfiguration('claude-config.autoSync')) {
                const autoSync = vscode.workspace.getConfiguration('claude-config').get('autoSync');
                if (autoSync) {
                    fileManager.startWatching();
                    updateStatusBar('Auto-sync enabled');
                } else {
                    fileManager.stopWatching();
                    updateStatusBar('Auto-sync disabled');
                }
            }
        });
        context.subscriptions.push(configChangeListener);

        // Listen for workspace folder changes
        const workspaceChangeListener = vscode.workspace.onDidChangeWorkspaceFolders(() => {
            // Restart file watching when workspace folders change
            if (vscode.workspace.getConfiguration('claude-config').get('autoSync')) {
                fileManager.stopWatching();
                fileManager.startWatching();
                updateStatusBar('Workspace updated');
            }
        });
        context.subscriptions.push(workspaceChangeListener);

        // Show activation success message
        vscode.window.showInformationMessage('Claude Config Manager activated successfully!');
        updateStatusBar('Ready');

    } catch (error) {
        console.error('Failed to activate Claude Config Manager:', error);
        vscode.window.showErrorMessage(`Failed to activate Claude Config Manager: ${error instanceof Error ? error.message : 'Unknown error'}`);
        updateStatusBar('Activation failed', true);
    }
}

export function deactivate() {
    if (fileManager) {
        fileManager.stopWatching();
    }
}

export function updateStatusBar(message: string, isError: boolean = false) {
    if (statusBarItem) {
        statusBarItem.text = `$(${isError ? 'error' : 'sync'}) ${message}`;
        statusBarItem.tooltip = isError ? 
            `Claude Config Error: ${message}. Click to retry sync.` : 
            `Claude Config: ${message}. Click to sync manually.`;
        
        setTimeout(() => {
            statusBarItem.text = "$(sync) Claude Config";
            statusBarItem.tooltip = "Click to sync CLAUDE.md files to repository";
        }, 3000);
    }
}