import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs-extra';
import { simpleGit } from 'simple-git';
import { RepositoryManager } from '../repository';
import { ClaudeFileManager } from '../fileManager';

export async function syncCommand(repositoryManager: RepositoryManager, fileManager: ClaudeFileManager): Promise<void> {
    try {
        // Check if we're in a workspace with PROJECT_PLAN.md
        if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
            vscode.window.showErrorMessage('No workspace folder found. Please open a project folder.');
            return;
        }

        const workspacePath = vscode.workspace.workspaceFolders[0].uri.fsPath;
        const claudeDir = path.join(workspacePath, '.claude');
        
        // Check for any team-sharable Claude configuration
        const plansDir = path.join(claudeDir, '.plans');
        const settingsFile = path.join(claudeDir, 'settings.json');
        const commandsDir = path.join(claudeDir, 'commands');
        
        const hasPlans = await fs.pathExists(plansDir);
        const hasSettings = await fs.pathExists(settingsFile);
        const hasCommands = await fs.pathExists(commandsDir);
        
        if (!hasPlans && !hasSettings && !hasCommands) {
            vscode.window.showWarningMessage('No Claude configuration found to sync. Create PROJECT_PLAN.md, team settings, or commands first.');
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
            title: 'Syncing Claude configuration to git',
            cancellable: false
        }, async (progress) => {
            progress.report({ increment: 0, message: 'Pulling latest changes...' });
            
            // Pull latest changes first
            try {
                await git.pull();
            } catch (error) {
                console.warn('Pull failed, continuing:', error);
            }
            
            progress.report({ increment: 25, message: 'Adding Claude configuration...' });
            
            // Add each existing directory/file separately
            if (hasPlans) {
                await git.add('.claude/.plans/');
            }
            if (hasSettings) {
                await git.add('.claude/settings.json');
            }
            if (hasCommands) {
                await git.add('.claude/commands/');
            }
            
            progress.report({ increment: 50, message: 'Committing changes...' });
            
            // Check if there are changes to commit
            const status = await git.status();
            console.log('Git status:', status);
            
            // Check for any .claude configuration changes
            const claudeDirChanged = status.files.some(file => 
                file.path.startsWith('.claude/.plans/') ||
                file.path === '.claude/settings.json' ||
                file.path.startsWith('.claude/commands/')
            );
            
            if (claudeDirChanged) {
                await git.commit('Update Claude configuration');
                progress.report({ increment: 75, message: 'Pushing to remote...' });
                await git.push();
                
                // Get repository information
                const remotes = await git.getRemotes(true);
                const currentBranch = await git.revparse(['--abbrev-ref', 'HEAD']);
                const remoteName = remotes.length > 0 ? remotes[0].name : 'origin';
                const remoteUrl = remotes.length > 0 ? remotes[0].refs.push : 'unknown';
                
                progress.report({ increment: 100, message: 'Successfully synced!' });
                vscode.window.showInformationMessage(`Claude configuration synced to ${remoteName}/${currentBranch} (${remoteUrl})`);
            } else {
                progress.report({ increment: 100, message: 'No changes to sync' });
                vscode.window.showInformationMessage('Claude configuration is already up to date');
            }
        });

    } catch (error) {
        vscode.window.showErrorMessage(`Failed to sync: ${error}`);
        console.error('Sync command error:', error);
    }
}