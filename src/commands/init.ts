import * as vscode from 'vscode';
import { RepositoryManager } from '../repository';

export async function initCommand(repositoryManager: RepositoryManager): Promise<void> {
    try {
        // Check if repository is already initialized
        if (await repositoryManager.isRepoInitialized()) {
            const reinitialize = await vscode.window.showWarningMessage(
                'Repository is already initialized. Do you want to reinitialize?',
                'Yes',
                'No'
            );
            
            if (reinitialize !== 'Yes') {
                return;
            }
        }

        // Get repository URL from user or configuration
        let repoUrl = vscode.workspace.getConfiguration('claude-config').get<string>('repositoryUrl');
        
        if (!repoUrl) {
            repoUrl = await vscode.window.showInputBox({
                prompt: 'Enter GitHub repository URL for Claude configurations',
                placeHolder: 'https://github.com/username/claude-configs.git or git@github.com:username/claude-configs.git',
                validateInput: (value) => {
                    if (!value) {
                        return 'Repository URL is required';
                    }
                    // Basic URL validation
                    const urlPattern = /^https?:\/\/github\.com\/[\w-]+\/[\w-]+\.git$/;
                    const sshPattern = /^git@github\.com:[\w-]+\/[\w-]+\.git$/;
                    if (!urlPattern.test(value) && !sshPattern.test(value)) {
                        return 'Please enter a valid GitHub repository URL';
                    }
                    return null;
                }
            });
        }

        if (!repoUrl) {
            vscode.window.showInformationMessage('Repository initialization cancelled.');
            return;
        }

        // Show progress while initializing
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Initializing Claude Config Repository',
            cancellable: false
        }, async (progress) => {
            progress.report({ increment: 0, message: 'Cloning repository...' });
            
            const success = await repositoryManager.initializeRepo(repoUrl!);
            
            if (success) {
                progress.report({ increment: 100, message: 'Repository initialized successfully!' });
            } else {
                progress.report({ increment: 100, message: 'Repository initialization failed.' });
            }
        });

    } catch (error) {
        vscode.window.showErrorMessage(`Failed to initialize repository: ${error}`);
        console.error('Init command error:', error);
    }
}