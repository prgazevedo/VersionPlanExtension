import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs-extra';
import { RepositoryManager } from './repository';
import { updateStatusBar } from './extension';

export class ClaudeFileManager {
    private watcher: vscode.FileSystemWatcher | undefined;
    private workspaceClaudeFile: string | undefined;

    constructor(
        private context: vscode.ExtensionContext,
        private repositoryManager: RepositoryManager
    ) {
        this.updateWorkspaceClaudeFile();
    }

    private updateWorkspaceClaudeFile() {
        if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
            this.workspaceClaudeFile = path.join(
                vscode.workspace.workspaceFolders[0].uri.fsPath,
                'CLAUDE.md'
            );
        }
    }

    async syncToRepo(): Promise<void> {
        try {
            if (!this.workspaceClaudeFile || !await fs.pathExists(this.workspaceClaudeFile)) {
                return;
            }

            if (!await this.repositoryManager.isRepoInitialized()) {
                vscode.window.showWarningMessage('Repository not initialized. Please run "Initialize Config Repository" first.');
                return;
            }

            const projectName = this.getProjectName();
            const repoConfigPath = await this.repositoryManager.getProjectConfigPath(projectName);

            // Copy workspace CLAUDE.md to repository
            await fs.copy(this.workspaceClaudeFile, repoConfigPath);

            // Auto-commit if enabled
            const commitMessage = `Update ${projectName}/CLAUDE.md`;
            await this.repositoryManager.autoCommit(commitMessage);

            updateStatusBar('CLAUDE.md synced to repository', false);
        } catch (error) {
            const errorMessage = `Failed to sync to repository: ${error}`;
            updateStatusBar('Sync to repository failed', true);
            vscode.window.showErrorMessage(errorMessage);
            console.error(errorMessage);
        }
    }

    async syncFromRepo(): Promise<void> {
        try {
            if (!this.workspaceClaudeFile) {
                return;
            }

            if (!await this.repositoryManager.isRepoInitialized()) {
                vscode.window.showWarningMessage('Repository not initialized. Please run "Initialize Config Repository" first.');
                return;
            }

            const projectName = this.getProjectName();
            const repoConfigPath = await this.repositoryManager.getProjectConfigPath(projectName);

            if (await fs.pathExists(repoConfigPath)) {
                // Check if workspace file is newer
                const workspaceStats = await fs.stat(this.workspaceClaudeFile).catch(() => null);
                const repoStats = await fs.stat(repoConfigPath);

                if (!workspaceStats || repoStats.mtime > workspaceStats.mtime) {
                    await fs.copy(repoConfigPath, this.workspaceClaudeFile);
                    updateStatusBar('CLAUDE.md synced from repository', false);
                } else {
                    updateStatusBar('Local CLAUDE.md is up to date', false);
                }
            }
        } catch (error) {
            const errorMessage = `Failed to sync from repository: ${error}`;
            updateStatusBar('Sync from repository failed', true);
            vscode.window.showErrorMessage(errorMessage);
            console.error(errorMessage);
        }
    }

    async createClaudeFile(content: string): Promise<void> {
        try {
            if (!this.workspaceClaudeFile) {
                vscode.window.showWarningMessage('No workspace folder found. Please open a folder first.');
                return;
            }

            await fs.writeFile(this.workspaceClaudeFile, content);
            
            // Open the file in the editor
            const document = await vscode.workspace.openTextDocument(this.workspaceClaudeFile);
            await vscode.window.showTextDocument(document);

            updateStatusBar('CLAUDE.md created successfully', false);
        } catch (error) {
            const errorMessage = `Failed to create CLAUDE.md: ${error}`;
            updateStatusBar('Create CLAUDE.md failed', true);
            vscode.window.showErrorMessage(errorMessage);
            console.error(errorMessage);
        }
    }

    async editClaudeFile(): Promise<void> {
        try {
            if (!this.workspaceClaudeFile) {
                vscode.window.showWarningMessage('No workspace folder found. Please open a folder first.');
                return;
            }

            // Create file if it doesn't exist
            if (!await fs.pathExists(this.workspaceClaudeFile)) {
                await fs.writeFile(this.workspaceClaudeFile, '# CLAUDE.md Configuration\n\n');
            }

            // Open the file in the editor
            const document = await vscode.workspace.openTextDocument(this.workspaceClaudeFile);
            await vscode.window.showTextDocument(document);
        } catch (error) {
            const errorMessage = `Failed to edit CLAUDE.md: ${error}`;
            updateStatusBar('Edit CLAUDE.md failed', true);
            vscode.window.showErrorMessage(errorMessage);
            console.error(errorMessage);
        }
    }

    startWatching(): void {
        if (!this.workspaceClaudeFile) {
            return;
        }

        this.stopWatching();

        this.watcher = vscode.workspace.createFileSystemWatcher(
            new vscode.RelativePattern(vscode.workspace.workspaceFolders![0], 'CLAUDE.md')
        );

        this.watcher.onDidChange(() => {
            this.syncToRepo();
        });

        this.watcher.onDidCreate(() => {
            this.syncToRepo();
        });

        this.context.subscriptions.push(this.watcher);
    }

    stopWatching(): void {
        if (this.watcher) {
            this.watcher.dispose();
            this.watcher = undefined;
        }
    }

    private getProjectName(): string {
        if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
            return path.basename(vscode.workspace.workspaceFolders[0].uri.fsPath);
        }
        return 'default';
    }
}