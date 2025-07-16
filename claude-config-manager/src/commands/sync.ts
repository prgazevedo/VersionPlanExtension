import * as vscode from 'vscode';
import { RepositoryManager } from '../repository';
import { ClaudeFileManager } from '../fileManager';

export async function syncCommand(repositoryManager: RepositoryManager, fileManager: ClaudeFileManager): Promise<void> {
    try {
        // Check if repository is initialized
        if (!await repositoryManager.isRepoInitialized()) {
            const initialize = await vscode.window.showWarningMessage(
                'Repository not initialized. Would you like to initialize it now?',
                'Yes',
                'No'
            );
            
            if (initialize === 'Yes') {
                // Redirect to init command
                await vscode.commands.executeCommand('claude-config.init');
                
                if (!await repositoryManager.isRepoInitialized()) {
                    return;
                }
            } else {
                return;
            }
        }

        // Show progress while syncing
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Syncing Claude Configuration',
            cancellable: false
        }, async (progress) => {
            progress.report({ increment: 0, message: 'Syncing from repository...' });
            
            // First sync from repository to get latest changes
            await fileManager.syncFromRepo();
            
            progress.report({ increment: 50, message: 'Syncing to repository...' });
            
            // Then sync to repository with local changes
            await fileManager.syncToRepo();
            
            progress.report({ increment: 75, message: 'Pushing changes...' });
            
            // Sync repository changes (pull, commit, push)
            await repositoryManager.syncChanges();
            
            progress.report({ increment: 100, message: 'Sync completed successfully!' });
        });

        vscode.window.showInformationMessage('Claude configuration synced successfully!');

    } catch (error) {
        vscode.window.showErrorMessage(`Failed to sync: ${error}`);
        console.error('Sync command error:', error);
    }
}