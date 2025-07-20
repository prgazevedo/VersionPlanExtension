import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs-extra';
import { simpleGit } from 'simple-git';
import { RepositoryManager } from '../repository';
import { ClaudeFileManager } from '../fileManager';

export async function syncCommand(repositoryManager: RepositoryManager, fileManager: ClaudeFileManager): Promise<void> {
    try {
        // Check if we're in a workspace with CLAUDE.md
        if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
            vscode.window.showErrorMessage('No workspace folder found. Please open a project folder.');
            return;
        }

        const workspacePath = vscode.workspace.workspaceFolders[0].uri.fsPath;
        const claudeFilePath = path.join(workspacePath, 'CLAUDE.md');
        
        if (!await fs.pathExists(claudeFilePath)) {
            vscode.window.showWarningMessage('No CLAUDE.md file found in workspace. Create one first.');
            return;
        }

        // Check if workspace is a git repository
        const git = simpleGit(workspacePath);
        const isGitRepo = await git.checkIsRepo();
        
        if (!isGitRepo) {
            vscode.window.showErrorMessage('Workspace is not a git repository. Initialize git first.');
            return;
        }

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Syncing CLAUDE.md to git',
            cancellable: false
        }, async (progress) => {
            progress.report({ increment: 0, message: 'Pulling latest changes...' });
            
            // Pull latest changes first
            try {
                await git.pull();
            } catch (error) {
                console.warn('Pull failed, continuing:', error);
            }
            
            progress.report({ increment: 25, message: 'Adding CLAUDE.md...' });
            await git.add('CLAUDE.md');
            
            progress.report({ increment: 50, message: 'Committing changes...' });
            
            // Check if there are changes to commit
            const status = await git.status();
            if (status.files.length > 0) {
                await git.commit('Update CLAUDE.md configuration');
                progress.report({ increment: 75, message: 'Pushing to remote...' });
                await git.push();
                progress.report({ increment: 100, message: 'Successfully synced!' });
                vscode.window.showInformationMessage('CLAUDE.md synced to git repository!');
            } else {
                progress.report({ increment: 100, message: 'No changes to sync' });
                vscode.window.showInformationMessage('CLAUDE.md is already up to date');
            }
        });

    } catch (error) {
        vscode.window.showErrorMessage(`Failed to sync: ${error}`);
        console.error('Sync command error:', error);
    }
}