import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs-extra';
import { simpleGit, SimpleGit } from 'simple-git';
import { updateStatusBar } from './extension';

export class RepositoryManager {
    private git: SimpleGit | undefined;
    private repoPath: string;

    constructor(private context: vscode.ExtensionContext) {
        this.repoPath = path.join(context.globalStorageUri.fsPath, 'claude-configs');
        // Don't initialize git until we ensure the directory exists
    }

    private async getGit(): Promise<SimpleGit> {
        if (!this.git) {
            // Ensure the directory exists before creating git instance
            await fs.ensureDir(this.repoPath);
            this.git = simpleGit(this.repoPath);
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

            // Pull latest changes
            const git = await this.getGit();
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

            const git = await this.getGit();
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

            const git = await this.getGit();
            const isGitRepo = await git.checkIsRepo();
            if (!isGitRepo) {
                return false;
            }

            // Check if we have a configured repository URL
            const configuredUrl = vscode.workspace.getConfiguration('claude-config').get('repositoryUrl') as string;
            if (configuredUrl) {
                // Verify the remote origin matches the configured URL
                const remotes = await git.getRemotes(true);
                const origin = remotes.find(remote => remote.name === 'origin');
                if (origin && origin.refs.fetch) {
                    // Normalize URLs for comparison (handle .git suffix and protocol differences)
                    const normalizeUrl = (url: string) => {
                        return url.replace(/\.git$/, '').replace(/^git@github\.com:/, 'https://github.com/');
                    };
                    
                    const normalizedConfigured = normalizeUrl(configuredUrl);
                    const normalizedOrigin = normalizeUrl(origin.refs.fetch);
                    
                    return normalizedConfigured === normalizedOrigin;
                }
            }

            return true; // If no configured URL, assume it's initialized
        } catch {
            return false;
        }
    }

    getRepoPath(): string {
        return this.repoPath;
    }

    async autoDetectRepository(): Promise<boolean> {
        try {
            // Check if repository exists but might not be properly configured
            const repoExists = await fs.pathExists(this.repoPath);
            if (!repoExists) {
                return false;
            }

            const git = await this.getGit();
            const isGitRepo = await git.checkIsRepo();
            if (!isGitRepo) {
                return false;
            }

            // Get the remote origin URL
            const remotes = await git.getRemotes(true);
            const origin = remotes.find(remote => remote.name === 'origin');
            if (origin && origin.refs.fetch) {
                // Auto-configure the repository URL in settings
                await vscode.workspace.getConfiguration('claude-config').update(
                    'repositoryUrl', 
                    origin.refs.fetch, 
                    vscode.ConfigurationTarget.Global
                );
                
                console.log(`Auto-detected and configured repository: ${origin.refs.fetch}`);
                return true;
            }

            return false;
        } catch (error) {
            console.error('Failed to auto-detect repository:', error);
            return false;
        }
    }

    async getProjectConfigPath(projectName: string): Promise<string> {
        const projectDir = path.join(this.repoPath, projectName);
        await fs.ensureDir(projectDir);
        const configPath = path.join(projectDir, 'CLAUDE.md');
        return configPath;
    }
}