import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs-extra';
import { simpleGit, SimpleGit } from 'simple-git';
import { updateStatusBar } from './extension';

export class RepositoryManager {
    private git: SimpleGit;
    private repoPath: string;

    constructor(private context: vscode.ExtensionContext) {
        this.repoPath = path.join(context.globalStorageUri.fsPath, 'claude-configs');
        this.git = simpleGit(this.repoPath);
    }

    async initializeRepo(repoUrl: string): Promise<boolean> {
        try {
            updateStatusBar('Initializing repository...', false);
            
            // Ensure the parent directory exists
            await fs.ensureDir(path.dirname(this.repoPath));

            // Remove existing repo if it exists
            if (await fs.pathExists(this.repoPath)) {
                await fs.remove(this.repoPath);
            }

            // Clone the repository
            await simpleGit().clone(repoUrl, this.repoPath);
            
            // Update configuration
            await vscode.workspace.getConfiguration('claude-config').update(
                'repositoryUrl', 
                repoUrl, 
                vscode.ConfigurationTarget.Global
            );

            updateStatusBar('Repository initialized successfully!', false);
            vscode.window.showInformationMessage('Claude Config repository initialized successfully!');
            return true;
        } catch (error) {
            const errorMessage = `Failed to initialize repository: ${error}`;
            updateStatusBar('Repository initialization failed', true);
            vscode.window.showErrorMessage(errorMessage);
            console.error(errorMessage);
            return false;
        }
    }

    async syncChanges(): Promise<void> {
        try {
            if (!await this.isRepoInitialized()) {
                throw new Error('Repository not initialized. Please run "Initialize Config Repository" first.');
            }

            updateStatusBar('Syncing changes...', false);

            // Pull latest changes
            await this.git.pull();

            // Stage all changes
            await this.git.add('.');

            // Check if there are any changes to commit
            const status = await this.git.status();
            if (status.files.length > 0) {
                // Commit changes
                await this.git.commit('Sync CLAUDE.md configurations');

                // Push to remote
                await this.git.push();
                
                updateStatusBar('Sync completed successfully!', false);
            } else {
                updateStatusBar('No changes to sync', false);
            }
        } catch (error) {
            const errorMessage = `Failed to sync changes: ${error}`;
            updateStatusBar('Sync failed', true);
            vscode.window.showErrorMessage(errorMessage);
            console.error(errorMessage);
        }
    }

    async autoCommit(message: string): Promise<void> {
        try {
            if (!await this.isRepoInitialized()) {
                return;
            }

            const autoCommit = vscode.workspace.getConfiguration('claude-config').get('autoCommit');
            if (!autoCommit) {
                return;
            }

            await this.git.pull();
            await this.git.add('.');
            
            const status = await this.git.status();
            if (status.files.length > 0) {
                await this.git.commit(message);
                await this.git.push();
                updateStatusBar('Auto-committed changes', false);
            }
        } catch (error) {
            console.error(`Auto-commit failed: ${error}`);
            updateStatusBar('Auto-commit failed', true);
        }
    }

    async isRepoInitialized(): Promise<boolean> {
        try {
            const repoExists = await fs.pathExists(this.repoPath);
            if (!repoExists) {
                return false;
            }

            const isGitRepo = await this.git.checkIsRepo();
            return isGitRepo;
        } catch {
            return false;
        }
    }

    getRepoPath(): string {
        return this.repoPath;
    }

    async getProjectConfigPath(projectName: string): Promise<string> {
        const projectDir = path.join(this.repoPath, projectName);
        await fs.ensureDir(projectDir);
        const configPath = path.join(projectDir, 'CLAUDE.md');
        return configPath;
    }
}