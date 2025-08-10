/**
 * Integrated cloud sync commands for tree view integration
 */

import * as vscode from 'vscode';
import { CloudConversationManager } from '../cloud/CloudConversationManager';
import { CloudSyncService } from '../cloud/CloudSyncService';
import { CloudAuthManager } from '../cloud/CloudAuthManager';
import { loggers } from '../utils/Logger';

/**
 * Sync to Cloud command - integrates export and cloud sync functionality
 */
export async function syncToCloudCommand(context: vscode.ExtensionContext, conversationManager: any): Promise<void> {
    loggers.cloudSync.info('syncToCloudCommand called');
    
    try {
        // Check if WebDAV is configured
        const config = vscode.workspace.getConfiguration('claude-config.cloudSync');
        const cloudEnabled = config.get<boolean>('enabled', false);
        const serverUrl = config.get<string>('webdav.serverUrl', '');

        if (!cloudEnabled || !serverUrl) {
            const choice = await vscode.window.showInformationMessage(
                'WebDAV cloud sync is not configured. Would you like to configure it now?',
                'Configure WebDAV',
                'Cancel'
            );
            
            if (choice === 'Configure WebDAV') {
                await openCloudSettingsCommand(context);
            }
            return;
        }

        // Show sync options with mode selection
        const choice = await vscode.window.showQuickPick([
            {
                label: '$(cloud-upload) Upload Summaries Only',
                description: 'Fast sync - Upload conversation summaries to WebDAV',
                detail: 'Quick sync for cross-device conversation browsing',
                mode: 'summaries-only',
                direction: 'upload'
            },
            {
                label: '$(cloud-upload) Upload Full Conversations',
                description: 'Complete sync - Upload summaries and full conversations',
                detail: 'Full backup with complete conversation data',
                mode: 'full-conversations',
                direction: 'upload'
            },
            {
                label: '$(sync) Smart Upload Sync',
                description: 'Intelligent sync - Summaries + recent/important conversations',
                detail: 'Balanced approach: all summaries + selective full conversations',
                mode: 'smart-sync',
                direction: 'upload'
            },
            {
                label: '$(cloud-download) Download from Cloud',
                description: 'Download conversation summaries from WebDAV',
                detail: 'Sync cloud conversations to local device',
                mode: 'summaries-only',
                direction: 'download'
            },
            {
                label: '$(sync) Bidirectional Sync',
                description: 'Two-way sync - Download then upload changes',
                detail: 'Complete sync with conflict resolution',
                mode: 'summaries-only',
                direction: 'bidirectional'
            },
            {
                label: '$(export) Export Conversations Locally',
                description: 'Export conversations to local files without cloud sync',
                detail: 'Traditional file export',
                mode: 'local-export',
                direction: 'local'
            },
            {
                label: '$(graph) View Cloud Sync Stats',
                description: 'Show WebDAV sync statistics and status',
                detail: 'Current sync status and usage information',
                mode: 'stats',
                direction: 'stats'
            }
        ], {
            placeHolder: 'Select sync operation',
            title: 'WebDAV Cloud Sync'
        });

        if (!choice) {
            return;
        }

        // Handle different operations
        if (choice.mode === 'local-export') {
            const { exportAllConversationsCommand } = await import('./openConversations');
            await exportAllConversationsCommand(conversationManager);
        } else if (choice.mode === 'stats') {
            await showCloudStats(context);
        } else {
            await performCloudSync(context, conversationManager, choice.direction as any, choice.mode as any);
        }
        
    } catch (error: any) {
        loggers.cloudSync.error('Error in syncToCloudCommand:', error);
        vscode.window.showErrorMessage(`Cloud sync error: ${error.message || error}`);
    }
}

/**
 * Open Cloud Settings command - shows WebDAV configuration
 */
export async function openCloudSettingsCommand(context: vscode.ExtensionContext): Promise<void> {
    loggers.cloudSync.info('openCloudSettingsCommand called');
    
    try {
        // Check if cloud sync is configured
        const config = vscode.workspace.getConfiguration('claude-config.cloudSync');
        const cloudEnabled = config.get<boolean>('enabled', false);
        const serverUrl = config.get<string>('webdav.serverUrl', '');

        if (!cloudEnabled || !serverUrl) {
            // Show configuration wizard
            await showCloudSetupWizard(context);
        } else {
            // Show cloud management options
            await showCloudManagementOptions(context);
        }
    } catch (error: any) {
        loggers.cloudSync.error('Error in openCloudSettingsCommand:', error);
        vscode.window.showErrorMessage(`Cloud settings error: ${error.message || error}`);
    }
}

/**
 * Perform cloud sync operation
 */
async function performCloudSync(
    context: vscode.ExtensionContext, 
    conversationManager: any, 
    direction: 'upload' | 'download' | 'bidirectional',
    mode: 'summaries-only' | 'full-conversations' | 'smart-sync'
): Promise<void> {
    
    // Create cloud conversation manager
    const cloudManager = new CloudConversationManager(context);
    
    // Test connection first
    const connectionOk = await cloudManager.testConnection();
    if (!connectionOk) {
        const choice = await vscode.window.showErrorMessage(
            'Cannot connect to WebDAV server. Check your configuration and try again.',
            'Check Settings',
            'Retry',
            'Cancel'
        );
        
        if (choice === 'Check Settings') {
            await openCloudSettingsCommand(context);
        } else if (choice === 'Retry') {
            await performCloudSync(context, conversationManager, direction, mode);
        }
        return;
    }

    // Show progress with real sync operations
    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: getSyncProgressTitle(direction, mode),
        cancellable: false
    }, async (progress, token) => {
        try {
            let results: any[] = [];
            
            // Set up progress tracking
            cloudManager.onSyncEvent((syncProgress) => {
                const increment = syncProgress.percentage - (progress as any).lastReported || 0;
                progress.report({ 
                    increment,
                    message: `${syncProgress.currentFile} (${syncProgress.filesProcessed}/${syncProgress.totalFiles})`
                });
                (progress as any).lastReported = syncProgress.percentage;
            });

            progress.report({ increment: 0, message: 'Initializing sync...' });

            // Perform the actual sync operation
            if (direction === 'upload') {
                results = await cloudManager.syncToCloud({ mode });
            } else if (direction === 'download') {
                results = await cloudManager.syncFromCloud({ mode });
            } else if (direction === 'bidirectional') {
                results = await cloudManager.bidirectionalSync({ mode });
            }

            // Show results
            const successful = results.filter(r => r.success).length;
            const failed = results.filter(r => !r.success).length;
            const skipped = results.filter(r => r.metadata?.skipped).length;
            const conflicts = results.filter(r => r.metadata?.conflictResolved).length;

            if (successful > 0 || skipped > 0) {
                let message = `Sync completed successfully!\n`;
                if (successful > 0) message += `• ${successful} conversations synced\n`;
                if (skipped > 0) message += `• ${skipped} conversations skipped (up to date)\n`;
                if (conflicts > 0) message += `• ${conflicts} conflicts resolved\n`;
                if (failed > 0) message += `• ${failed} conversations failed`;

                vscode.window.showInformationMessage(message);
            } else if (failed > 0) {
                vscode.window.showErrorMessage(`Sync failed for ${failed} conversations. Check the output for details.`);
            } else {
                vscode.window.showInformationMessage('No conversations needed syncing.');
            }

        } catch (error: any) {
            loggers.cloudSync.error('Sync operation failed:', error);
            vscode.window.showErrorMessage(`Sync failed: ${error.message || error}`);
        }
    });
}

/**
 * Get progress title based on operation
 */
function getSyncProgressTitle(direction: string, mode: string): string {
    const modeText = {
        'summaries-only': 'summaries',
        'full-conversations': 'full conversations', 
        'smart-sync': 'smart sync'
    }[mode] || mode;

    switch (direction) {
        case 'upload': return `Uploading ${modeText} to WebDAV...`;
        case 'download': return `Downloading ${modeText} from WebDAV...`;
        case 'bidirectional': return `Synchronizing ${modeText} with WebDAV...`;
        default: return `Syncing ${modeText}...`;
    }
}

/**
 * Show cloud setup wizard
 */
async function showCloudSetupWizard(context: vscode.ExtensionContext): Promise<void> {
    const choice = await vscode.window.showQuickPick([
        {
            label: '$(cloud) WebDAV Server Setup',
            description: 'Configure Nextcloud, ownCloud, or generic WebDAV',
            detail: 'Set up WebDAV server connection for cloud sync'
        },
        {
            label: '$(settings-gear) Open VS Code Settings',
            description: 'Configure cloud sync in VS Code settings',
            detail: 'Direct access to claude-config cloudSync settings'
        }
    ], {
        placeHolder: 'Choose setup method',
        title: 'WebDAV Cloud Sync Setup'
    });

    if (choice?.label === '$(cloud) WebDAV Server Setup') {
        await configureWebDAVServer(context);
    } else if (choice?.label === '$(settings-gear) Open VS Code Settings') {
        vscode.commands.executeCommand('workbench.action.openSettings', 'claude-config.cloudSync');
    }
}

/**
 * Configure WebDAV server using CloudAuthManager
 */
async function configureWebDAVServer(context: vscode.ExtensionContext): Promise<void> {
    try {
        const { CloudAuthManager } = await import('../cloud/CloudAuthManager');
        const authManager = CloudAuthManager.getInstance(context);
        
        // Use the CloudAuthManager's built-in setup wizard
        await authManager.setupAuthenticationWizard();
        
        // After successful setup, enable cloud sync in settings
        const config = vscode.workspace.getConfiguration('claude-config.cloudSync');
        await config.update('enabled', true, vscode.ConfigurationTarget.Global);
        
    } catch (error: any) {
        loggers.cloudSync.error('WebDAV configuration failed:', error);
        vscode.window.showErrorMessage(`Failed to configure WebDAV: ${error.message || error}`);
    }
}

/**
 * Show cloud management options
 */
async function showCloudManagementOptions(context: vscode.ExtensionContext): Promise<void> {
    try {
        const cloudManager = new CloudConversationManager(context);
        const providers = await cloudManager.getCloudProviders();
        const webdavProvider = providers.find(p => p.providerType === 'webdav');
        const stats = await cloudManager.getSyncStatistics();

        const config = vscode.workspace.getConfiguration('claude-config.cloudSync');
        const serverUrl = config.get<string>('webdav.serverUrl', '');
        const enabled = config.get<boolean>('enabled', false);

        const choice = await vscode.window.showQuickPick([
            {
                label: '$(info) Current Configuration',
                description: `Server: ${serverUrl}`,
                detail: `Status: ${enabled ? (webdavProvider?.isAuthenticated ? 'Connected' : 'Authentication Failed') : 'Disabled'}`
            },
            {
                label: '$(sync) Test Connection',
                description: 'Test WebDAV server connection',
                detail: 'Verify credentials and server accessibility'
            },
            {
                label: '$(graph) View Sync Statistics',
                description: 'Show detailed sync statistics',
                detail: `${stats.totalConversations} total, ${stats.syncedConversations} synced`
            },
            {
                label: '$(gear) Modify Settings',
                description: 'Change cloud sync configuration',
                detail: 'Update server URL, credentials, or options'
            },
            {
                label: '$(x) Disable Cloud Sync',
                description: 'Turn off cloud synchronization',
                detail: 'Keep local data, disable cloud features'
            }
        ], {
            placeHolder: 'Choose action',
            title: 'WebDAV Cloud Sync Management'
        });

        switch (choice?.label) {
            case '$(sync) Test Connection':
                await testCloudConnection(context);
                break;
            case '$(graph) View Sync Statistics':
                await showDetailedCloudStats(context, stats);
                break;
            case '$(gear) Modify Settings':
                vscode.commands.executeCommand('workbench.action.openSettings', 'claude-config.cloudSync');
                break;
            case '$(x) Disable Cloud Sync':
                await config.update('enabled', false, vscode.ConfigurationTarget.Global);
                vscode.window.showInformationMessage('WebDAV cloud sync disabled');
                break;
        }
    } catch (error: any) {
        loggers.cloudSync.error('Management options error:', error);
        vscode.window.showErrorMessage(`Error loading cloud sync options: ${error.message || error}`);
    }
}

/**
 * Test cloud connection using real CloudConversationManager
 */
async function testCloudConnection(context: vscode.ExtensionContext): Promise<void> {
    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'Testing WebDAV connection...',
        cancellable: false
    }, async () => {
        try {
            const cloudManager = new CloudConversationManager(context);
            const success = await cloudManager.testConnection();
            
            if (success) {
                vscode.window.showInformationMessage('✅ WebDAV connection test successful!');
            } else {
                vscode.window.showErrorMessage('❌ WebDAV connection test failed. Check your configuration.');
            }
        } catch (error: any) {
            loggers.cloudSync.error('Connection test failed:', error);
            vscode.window.showErrorMessage(`❌ WebDAV connection test failed: ${error.message || error}`);
        }
    });
}

/**
 * Show detailed cloud statistics
 */
async function showDetailedCloudStats(context: vscode.ExtensionContext, stats: any): Promise<void> {
    const lastSyncText = stats.lastSyncTime 
        ? new Date(stats.lastSyncTime).toLocaleString()
        : 'Never';

    const message = `WebDAV Cloud Sync Statistics:

🌐 Provider: WebDAV (Nextcloud, ownCloud)
📊 Status: ${stats.syncedConversations > 0 ? 'Active' : 'Not synced yet'}
📁 Total Conversations: ${stats.totalConversations}
✅ Synced Conversations: ${stats.syncedConversations}
⏳ Pending Sync: ${stats.pendingConversations}
⚠️  Conflicts Resolved: ${stats.conflictedConversations}
⏰ Last Sync: ${lastSyncText}

Use "Sync to Cloud" to upload conversations to your WebDAV server.`;

    const choice = await vscode.window.showInformationMessage(
        message,
        'Sync Now',
        'Settings',
        'OK'
    );

    if (choice === 'Sync Now') {
        await syncToCloudCommand(context, null);
    } else if (choice === 'Settings') {
        vscode.commands.executeCommand('workbench.action.openSettings', 'claude-config.cloudSync');
    }
}

/**
 * Show cloud statistics (simplified version for stats option)
 */
async function showCloudStats(context: vscode.ExtensionContext): Promise<void> {
    try {
        const cloudManager = new CloudConversationManager(context);
        const stats = await cloudManager.getSyncStatistics();
        await showDetailedCloudStats(context, stats);
    } catch (error: any) {
        loggers.cloudSync.error('Stats error:', error);
        vscode.window.showErrorMessage(`Error loading sync statistics: ${error.message || error}`);
    }
}

/**
 * Set WebDAV Password command - secure password entry from settings page
 */
export async function setWebDAVPasswordCommand(context: vscode.ExtensionContext): Promise<void> {
    loggers.cloudSync.info('setWebDAVPasswordCommand called');
    
    try {
        // Get current WebDAV configuration
        const config = vscode.workspace.getConfiguration('claude-config.cloudSync');
        const serverUrl = config.get<string>('webdav.serverUrl', '');
        const username = config.get<string>('webdav.username', '');
        const basePath = config.get<string>('webdav.basePath', '/Claude-Config-Sync/');
        const verifySSL = config.get<boolean>('webdav.verifySSL', true);

        // Validate required settings
        if (!serverUrl) {
            vscode.window.showErrorMessage('Please set the WebDAV Server URL first in the settings above.');
            return;
        }
        if (!username) {
            vscode.window.showErrorMessage('Please set the WebDAV Username first in the settings above.');
            return;
        }

        // Prompt for password securely
        const password = await vscode.window.showInputBox({
            prompt: 'Enter your WebDAV password or app token',
            placeHolder: 'Use app-specific password for better security',
            password: true,
            validateInput: (value) => {
                if (!value) return 'Password is required';
                return undefined;
            }
        });

        if (!password) {
            return; // User cancelled
        }

        // Store credentials securely using CloudAuthManager
        const { CloudAuthManager } = await import('../cloud/CloudAuthManager');
        const authManager = CloudAuthManager.getInstance(context);

        // Show progress while testing and saving
        const result = await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Testing WebDAV connection and saving credentials...',
            cancellable: false
        }, async () => {
            return await authManager.authenticateWebDAV({
                serverUrl,
                username,
                password,
                basePath,
                acceptInvalidCerts: !verifySSL
            });
        });

        if (result.success) {
            // Update the button text to show success
            await config.update(
                'webdav.passwordButton', 
                '✅ Password saved securely - Ready to sync!', 
                vscode.ConfigurationTarget.Global
            );
            
            // Enable cloud sync automatically
            await config.update('enabled', true, vscode.ConfigurationTarget.Global);
            
            vscode.window.showInformationMessage('✅ WebDAV password saved securely and connection verified!');
        } else {
            vscode.window.showErrorMessage(`❌ WebDAV authentication failed: ${result.error}`);
        }

    } catch (error: any) {
        loggers.cloudSync.error('Error in setWebDAVPasswordCommand:', error);
        vscode.window.showErrorMessage(`Failed to save WebDAV password: ${error.message || error}`);
    }
}

/**
 * Debug WebDAV credentials command - helps troubleshoot authentication issues
 */
export async function debugWebDAVCredentialsCommand(context: vscode.ExtensionContext): Promise<void> {
    loggers.cloudSync.info('debugWebDAVCredentialsCommand called');
    loggers.cloudSync.info('Output logging is now working correctly!');
    
    try {
        const conversationManager = new (require('../conversation/ConversationManager')).ConversationManager(context);
        const authManager = CloudAuthManager.getInstance(context);
        const cloudSyncService = new CloudSyncService(conversationManager, authManager);
        
        const debugInfo = await cloudSyncService.debugCredentialStatus();
        
        // Show debug information in a webview or output channel
        const outputChannel = vscode.window.createOutputChannel('WebDAV Debug');
        outputChannel.clear();
        outputChannel.appendLine('=== WebDAV Credential Debug Information ===');
        outputChannel.appendLine('');
        outputChannel.appendLine('VS Code Settings:');
        outputChannel.appendLine(`  Enabled: ${debugInfo.vsCodeSettings?.enabled}`);
        outputChannel.appendLine(`  Has Server URL: ${debugInfo.vsCodeSettings?.hasServerUrl}`);
        outputChannel.appendLine(`  Server URL: ${debugInfo.vsCodeSettings?.serverUrl}`);
        outputChannel.appendLine(`  Has Username: ${debugInfo.vsCodeSettings?.hasUsername}`);
        outputChannel.appendLine(`  Username: ${debugInfo.vsCodeSettings?.username}`);
        outputChannel.appendLine('');
        outputChannel.appendLine('Secret Storage:');
        outputChannel.appendLine(`  Has Credentials: ${debugInfo.secretStorage?.hasCredentials}`);
        outputChannel.appendLine(`  Is Valid: ${debugInfo.secretStorage?.isValid}`);
        outputChannel.appendLine(`  Provider: ${debugInfo.secretStorage?.provider}`);
        outputChannel.appendLine(`  Created At: ${debugInfo.secretStorage?.createdAt}`);
        
        if (debugInfo.secretStorage?.credentialsStructure) {
            const creds = debugInfo.secretStorage.credentialsStructure;
            outputChannel.appendLine('');
            outputChannel.appendLine('Stored Credentials:');
            outputChannel.appendLine(`  Has Server URL: ${creds.hasServerUrl}`);
            outputChannel.appendLine(`  Server URL: ${creds.serverUrl}`);
            outputChannel.appendLine(`  Has Username: ${creds.hasUsername}`);
            outputChannel.appendLine(`  Username: ${creds.username}`);
            outputChannel.appendLine(`  Has Password: ${creds.hasPassword}`);
            outputChannel.appendLine(`  Has Base Path: ${creds.hasBasePath}`);
            outputChannel.appendLine(`  Base Path: ${creds.basePath}`);
            outputChannel.appendLine(`  Accept Invalid Certs: ${creds.acceptInvalidCerts}`);
        }
        
        if (debugInfo.error) {
            outputChannel.appendLine('');
            outputChannel.appendLine('ERROR:');
            outputChannel.appendLine(`  ${debugInfo.error}`);
        }
        
        outputChannel.show();
        
        // Also show a quick summary in a dialog
        const hasSettings = debugInfo.vsCodeSettings?.hasServerUrl && debugInfo.vsCodeSettings?.hasUsername;
        const hasCredentials = debugInfo.secretStorage?.hasCredentials;
        const isValid = debugInfo.secretStorage?.isValid;
        
        let message = '🔍 WebDAV Debug Results:\n\n';
        message += `VS Code Settings: ${hasSettings ? '✅ Configured' : '❌ Missing'}\n`;
        message += `Secret Storage: ${hasCredentials ? '✅ Found' : '❌ Missing'}\n`;
        message += `Credentials Valid: ${isValid ? '✅ Yes' : '❌ No'}\n\n`;
        
        if (!hasCredentials) {
            message += 'Problem: No credentials in SecretStorage. Please reconfigure WebDAV.';
        } else if (!isValid) {
            message += 'Problem: Invalid credentials. Please check your server URL, username, and password.';
        } else {
            message += 'Credentials look good. Check the output channel for detailed information.';
        }
        
        vscode.window.showInformationMessage(message, 'View Details').then(choice => {
            if (choice === 'View Details') {
                outputChannel.show();
            }
        });
        
    } catch (error: any) {
        loggers.cloudSync.error('Error in debugWebDAVCredentialsCommand:', error);
        vscode.window.showErrorMessage(`Debug command failed: ${error.message || error}`);
    }
}