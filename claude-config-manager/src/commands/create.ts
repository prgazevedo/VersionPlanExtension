import * as vscode from 'vscode';
import { TemplateManager } from '../templates';
import { ClaudeFileManager } from '../fileManager';

export async function createCommand(templateManager: TemplateManager, fileManager: ClaudeFileManager): Promise<void> {
    try {
        // Check if workspace is open
        if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
            vscode.window.showErrorMessage('Please open a workspace folder first.');
            return;
        }

        // Get available templates
        const availableTemplates = await templateManager.getAvailableTemplates();
        
        // Let user select template
        const selectedTemplate = await vscode.window.showQuickPick(availableTemplates, {
            placeHolder: 'Select a template for CLAUDE.md',
            ignoreFocusOut: true
        });

        if (!selectedTemplate) {
            vscode.window.showInformationMessage('Template selection cancelled.');
            return;
        }

        // Collect variables for template
        const variables = await templateManager.collectVariables();
        if (!variables) {
            vscode.window.showInformationMessage('Template creation cancelled.');
            return;
        }

        // Show progress while creating
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Creating CLAUDE.md from template',
            cancellable: false
        }, async (progress) => {
            progress.report({ increment: 0, message: 'Processing template...' });
            
            // Process template with variables
            const content = await templateManager.processTemplate(selectedTemplate, variables);
            
            progress.report({ increment: 50, message: 'Creating file...' });
            
            // Create the CLAUDE.md file
            await fileManager.createClaudeFile(content);
            
            progress.report({ increment: 75, message: 'Syncing to repository...' });
            
            // Auto-sync to repository if enabled
            const autoSync = vscode.workspace.getConfiguration('claude-config').get('autoSync');
            if (autoSync) {
                await fileManager.syncToRepo();
            }
            
            progress.report({ increment: 100, message: 'CLAUDE.md created successfully!' });
        });

        vscode.window.showInformationMessage(`CLAUDE.md created successfully using ${selectedTemplate} template!`);

    } catch (error) {
        vscode.window.showErrorMessage(`Failed to create CLAUDE.md: ${error}`);
        console.error('Create command error:', error);
    }
}