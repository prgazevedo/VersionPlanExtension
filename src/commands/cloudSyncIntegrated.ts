/**
 * Integrated cloud sync commands for tree view integration
 */

import * as vscode from 'vscode';

/**
 * Sync to Cloud command - integrates export and cloud sync functionality
 */
export async function syncToCloudCommand(context: vscode.ExtensionContext, conversationManager: any): Promise<void> {
    console.log('[CloudSync] syncToCloudCommand called - cloud sync functionality removed in v3.3.2');
    
    // Show info message that cloud sync was removed
    const choice = await vscode.window.showInformationMessage(
        'Cloud sync functionality has been removed in v3.3.2 to focus on core features. Use the export functionality instead.',
        'Export Conversations',
        'Cancel'
    );

    if (choice === 'Export Conversations') {
        // Redirect to export functionality
        const { exportAllConversationsCommand } = await import('./openConversations');
        await exportAllConversationsCommand(conversationManager);
    }
}

/**
 * Open Cloud Settings command - shows info about removed functionality
 */
export async function openCloudSettingsCommand(context: vscode.ExtensionContext): Promise<void> {
    console.log('[CloudSync] openCloudSettingsCommand called - cloud sync functionality removed in v3.3.2');
    
    vscode.window.showInformationMessage(
        'Cloud sync functionality has been removed in v3.3.2 to focus on core features. This includes WebDAV integration and cloud settings.'
    );
}