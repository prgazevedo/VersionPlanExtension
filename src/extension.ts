import * as vscode from 'vscode';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';
import { RepositoryManager } from './repository';
import { ClaudeFileManager } from './fileManager';
import { ClaudeTreeDataProvider } from './claudeTreeProvider';
import { ConversationManager } from './conversation/ConversationManager';
import { ConversationTreeProvider } from './conversation/ConversationTreeProvider';
import { ConversationViewer } from './conversation/ConversationViewer';
import { syncCommand } from './commands/sync';
import { editCommand } from './commands/edit';
import { openConversationsCommand, viewConversationCommand, exportConversationCommand, exportAllConversationsCommand } from './commands/openConversations';

let repositoryManager: RepositoryManager;
let fileManager: ClaudeFileManager;
let conversationManager: ConversationManager;
let conversationTreeProvider: ConversationTreeProvider;
let conversationViewer: ConversationViewer;
let statusBarItem: vscode.StatusBarItem;

async function ensureClaudeDirectoryStructure() {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        console.warn('No workspace folder available for Claude directory structure');
        return;
    }
    
    const claudeDir = path.join(workspaceFolder.uri.fsPath, '.claude');
    const chatsDir = path.join(claudeDir, '.chats');
    const plansDir = path.join(claudeDir, '.plans');
    
    try {
        // Check if .claude already exists in workspace
        const claudeExists = await fs.pathExists(claudeDir);
        
        // Safely create the subdirectories we need
        await fs.ensureDir(chatsDir);
        await fs.ensureDir(plansDir);
        
        console.log(`Claude workspace directory structure ensured:`, {
            claudeDir: claudeExists ? 'already existed' : 'created',
            chatsDir: 'ensured',
            plansDir: 'ensured',
            workspacePath: workspaceFolder.uri.fsPath
        });
    } catch (error) {
        console.warn('Failed to ensure Claude workspace directory structure:', error);
        // Don't throw - extension should still work even if directory creation fails
    }
}

export function activate(context: vscode.ExtensionContext) {
    console.log('Claude Config Manager is now active!');

    // Ensure .claude directory structure exists
    ensureClaudeDirectoryStructure().catch(err => {
        console.error('Failed to create Claude directory structure:', err);
    });

    // Initialize managers
    repositoryManager = new RepositoryManager(context);
    fileManager = new ClaudeFileManager(context, repositoryManager);
    conversationManager = new ConversationManager(context);
    conversationTreeProvider = new ConversationTreeProvider(conversationManager);
    conversationViewer = new ConversationViewer(context, conversationManager);

    // Create tree data providers and register tree views
    const treeDataProvider = new ClaudeTreeDataProvider();
    vscode.window.createTreeView('claude-config', {
        treeDataProvider: treeDataProvider,
        showCollapseAll: false
    });

    vscode.window.createTreeView('claude-conversations', {
        treeDataProvider: conversationTreeProvider,
        showCollapseAll: true
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
        vscode.commands.registerCommand('claude-config.edit', () => editCommand(fileManager)),
        vscode.commands.registerCommand('claude-config.openConversations', () => openConversationsCommand(conversationManager, conversationViewer)),
        vscode.commands.registerCommand('claude-config.refreshConversations', () => conversationTreeProvider.refresh()),
        vscode.commands.registerCommand('claude-config.viewConversation', (conversationSummary) => viewConversationCommand(conversationViewer, conversationSummary)),
        vscode.commands.registerCommand('claude-config.exportConversation', (conversationSummary) => exportConversationCommand(conversationManager, conversationSummary)),
        vscode.commands.registerCommand('claude-config.exportAllConversations', () => exportAllConversationsCommand(conversationManager))
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
        
        if (event.affectsConfiguration('claude-config.conversationDataPath')) {
            const newPath = vscode.workspace.getConfiguration('claude-config').get<string>('conversationDataPath');
            if (newPath) {
                conversationManager.updateDataPath(newPath);
                conversationTreeProvider.refresh();
            }
        }
    });
}

export function deactivate() {
    if (fileManager) {
        fileManager.stopWatching();
    }
    if (conversationViewer) {
        conversationViewer.dispose();
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