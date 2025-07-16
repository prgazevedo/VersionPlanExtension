import * as vscode from 'vscode';
import { ClaudeFileManager } from '../fileManager';

export async function editCommand(fileManager: ClaudeFileManager): Promise<void> {
    try {
        // Check if workspace is open
        if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
            vscode.window.showErrorMessage('Please open a workspace folder first.');
            return;
        }

        // Open or create CLAUDE.md file
        await fileManager.editClaudeFile();

        vscode.window.showInformationMessage('CLAUDE.md opened for editing.');

    } catch (error) {
        vscode.window.showErrorMessage(`Failed to edit CLAUDE.md: ${error}`);
        console.error('Edit command error:', error);
    }
}