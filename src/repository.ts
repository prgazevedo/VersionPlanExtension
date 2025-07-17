import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs-extra';
import { simpleGit, SimpleGit } from 'simple-git';
import { updateStatusBar } from './extension';

export class RepositoryManager {
    private git: SimpleGit | null = null;
    private repoPath: string;

    constructor(private context: vscode.ExtensionContext) {
        this.repoPath = path.join(context.globalStorageUri.fsPath, 'claude-configs');
        // Don't initialize git in constructor - let it be lazy-loaded
    }

    private async initializeGit(): Promise<void> {
        try {
            // Only initialize git if the directory exists and is a valid git repository
            if (await fs.pathExists(this.repoPath)) {
                const gitDir = path.join(this.repoPath, '.git');
                if (await fs.pathExists(gitDir)) {
                    this.git = simpleGit(this.repoPath);
                }
            }
        } catch (error) {
            console.error('Failed to initialize git:', error);
            this.git = null;
        }
    }

    private async ensureGitInitialized(): Promise<SimpleGit> {
        if (!this.git) {
            await this.initializeGit();
        }
        
        if (!this.git) {
            throw new Error('Git not initialized. Repository may not exist.');
        }
        
        return this.git;
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
            
            // Initialize git instance for this repository
            this.git = simpleGit(this.repoPath);
            
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

            const git = await this.ensureGitInitialized();

            // Pull latest changes
            await git.pull();

            // Stage all changes
            await git.add('.');

            // Check if there are any changes to commit
            const status = await git.status();
            if (status.files.length > 0) {
                // Commit changes
                await git.commit('Sync CLAUDE.md configurations');

                // Push to remote
                await git.push();
                
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

            const git = await this.ensureGitInitialized();

            await git.pull();
            await git.add('.');
            
            const status = await git.status();
            if (status.files.length > 0) {
                await git.commit(message);
                await git.push();
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

            const git = await this.ensureGitInitialized();
            const isGitRepo = await git.checkIsRepo();
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