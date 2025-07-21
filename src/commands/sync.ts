import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs-extra';
import { simpleGit } from 'simple-git';
import { RepositoryManager } from '../repository';
import { ClaudeFileManager } from '../fileManager';
import { GitignoreManager } from '../utils/GitignoreManager';

export async function syncCommand(repositoryManager: RepositoryManager, fileManager: ClaudeFileManager): Promise<void> {
    try {
        // Check if we're in a workspace with PROJECT_PLAN.md
        if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
            vscode.window.showErrorMessage('No workspace folder found. Please open a project folder.');
            return;
        }

        const workspacePath = vscode.workspace.workspaceFolders[0].uri.fsPath;
        const claudeDir = path.join(workspacePath, '.claude');
        
        // Verify .gitignore compliance first
        const compliance = await GitignoreManager.checkGitignoreCompliance(workspacePath);
        if (!compliance.hasGitignore || compliance.missingRules.length > 0) {
            const message = 'Your .gitignore file is missing security rules to prevent private conversation data from being committed. Fix this first?';
            const selection = await vscode.window.showWarningMessage(message, 'Fix .gitignore', 'Continue Anyway');
            if (selection === 'Fix .gitignore') {
                await GitignoreManager.ensureGitignoreRules(workspacePath);
                vscode.window.showInformationMessage('Security rules added to .gitignore. Please run sync again.');
                return;
            }
        }
        
        // Check for team-sharable Claude configuration
        const safeFilesToSync = GitignoreManager.getSafeFilesToSync();
        const filesToCheck = [
            { path: path.join(claudeDir, '.plans'), name: '.claude/.plans/' },
            { path: path.join(claudeDir, 'settings.json'), name: '.claude/settings.json' },
            { path: path.join(claudeDir, 'commands'), name: '.claude/commands/' }
        ];
        
        const existingFiles: string[] = [];
        for (const file of filesToCheck) {
            if (await fs.pathExists(file.path)) {
                existingFiles.push(file.name);
            }
        }
        
        if (existingFiles.length === 0) {
            vscode.window.showWarningMessage('No team-sharable Claude configuration found to sync. Create PROJECT_PLAN.md, team settings, or commands first.');
            return;
        }

        // Show user what will be synced
        const filesToSyncMessage = `Files to sync to Git:\n• ${existingFiles.join('\n• ')}\n\n${GitignoreManager.getPrivateFilesDescription()}`;
        const proceedSelection = await vscode.window.showInformationMessage(
            'Ready to sync Claude configuration to Git?',
            { modal: true, detail: filesToSyncMessage },
            'Sync to Git',
            'Cancel'
        );
        
        if (proceedSelection !== 'Sync to Git') {
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
            title: 'Syncing team-sharable Claude configuration to Git',
            cancellable: false
        }, async (progress) => {
            progress.report({ increment: 0, message: 'Pulling latest changes...' });
            
            // Pull latest changes first
            try {
                await git.pull();
            } catch (error) {
                console.warn('Pull failed, continuing:', error);
            }
            
            progress.report({ increment: 25, message: 'Adding team-sharable files only...' });
            
            // Add only the safe files that exist
            const addPromises = [];
            for (const fileName of existingFiles) {
                addPromises.push(git.add(fileName));
            }
            await Promise.all(addPromises);
            
            progress.report({ increment: 50, message: 'Validating no private files are included...' });
            
            // Validate that no private files are being committed
            const status = await git.status();
            const stagedFiles = status.files.filter(file => file.index !== ' ').map(file => file.path);
            const privateFileViolations = await GitignoreManager.validateNoPrivateFiles(workspacePath, stagedFiles);
            
            if (privateFileViolations.length > 0) {
                await git.reset(['--soft', 'HEAD']);
                throw new Error(`Security violation: Attempted to sync private files: ${privateFileViolations.join(', ')}`);
            }
            
            progress.report({ increment: 60, message: 'Committing team-sharable changes...' });
            
            // Check for any valid .claude configuration changes
            const claudeDirChanged = status.files.some(file => 
                file.path.startsWith('.claude/.plans/') ||
                file.path === '.claude/settings.json' ||
                file.path.startsWith('.claude/commands/')
            );
            
            if (claudeDirChanged) {
                const syncedFilesList = existingFiles.join(', ');
                await git.commit(`Update Claude team configuration (${syncedFilesList})`);
                progress.report({ increment: 75, message: 'Pushing to remote...' });
                await git.push();
                
                // Get repository information
                const remotes = await git.getRemotes(true);
                const currentBranch = await git.revparse(['--abbrev-ref', 'HEAD']);
                const remoteName = remotes.length > 0 ? remotes[0].name : 'origin';
                const remoteUrl = remotes.length > 0 ? remotes[0].refs.push : 'unknown';
                
                progress.report({ increment: 100, message: 'Successfully synced!' });
                vscode.window.showInformationMessage(
                    `Team-sharable Claude configuration synced to ${remoteName}/${currentBranch}`,
                    'View Files'
                ).then(selection => {
                    if (selection === 'View Files') {
                        vscode.commands.executeCommand('workbench.files.action.showActiveFileInExplorer');
                    }
                });
            } else {
                progress.report({ increment: 100, message: 'No changes to sync' });
                vscode.window.showInformationMessage('Claude team configuration is already up to date');
            }
        });

    } catch (error) {
        vscode.window.showErrorMessage(`Failed to sync: ${error}`);
        console.error('Sync command error:', error);
    }
}