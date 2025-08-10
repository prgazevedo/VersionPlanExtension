/**
 * Enhanced ConversationManager with WebDAV cloud sync capabilities
 * Provides real cloud synchronization for conversations and summaries
 */

import * as vscode from 'vscode';
import { ConversationManager } from '../conversation/ConversationManager';
import { CloudSyncService, SyncOptions, SyncResult, SyncProgress } from './CloudSyncService';
import { CloudAuthManager } from './CloudAuthManager';
import { loggers } from '../utils/Logger';

export interface CloudSyncResult {
    success: boolean;
    error?: string;
    metadata?: any;
}

export interface CloudProvider {
    providerType: string;
    displayName: string;
    isAuthenticated: boolean;
}

export interface SyncStatistics {
    totalConversations: number;
    syncedConversations: number;
    conflictedConversations: number;
    pendingConversations: number;
    lastSyncTime?: Date;
}

export interface SyncStatus {
    provider: string;
    status: string;
    totalConversations: number;
    syncedConversations: number;
}

/**
 * Enhanced ConversationManager with WebDAV cloud sync capabilities
 */
export class CloudConversationManager extends ConversationManager {
    private cloudSyncService: CloudSyncService;
    private authManager: CloudAuthManager;
    private syncInProgress = false;
    private lastSyncResults: SyncResult[] = [];
    private onSyncEventEmitter = new vscode.EventEmitter<SyncProgress>();
    public onSyncEvent = this.onSyncEventEmitter.event;

    constructor(context: vscode.ExtensionContext) {
        super(context);
        this.authManager = CloudAuthManager.getInstance(context);
        this.cloudSyncService = new CloudSyncService(this, this.authManager);
        
        // Set up progress tracking
        this.cloudSyncService.setProgressCallback((progress) => {
            this.onSyncEventEmitter.fire(progress);
        });
    }

    /**
     * Get WebDAV provider status
     */
    async getWebDAVProvider(): Promise<CloudProvider> {
        const hasCredentials = await this.authManager.hasCredentials('webdav');
        const isValid = hasCredentials ? await this.authManager.testCredentials('webdav') : false;
        
        return {
            providerType: 'webdav',
            displayName: 'WebDAV (Nextcloud, ownCloud)',
            isAuthenticated: isValid
        };
    }

    /**
     * Get all registered cloud providers
     */
    async getCloudProviders(): Promise<CloudProvider[]> {
        return [await this.getWebDAVProvider()];
    }

    /**
     * Get sync status for all providers
     */
    getSyncStatus(): SyncStatus[] {
        const webdavStatus: SyncStatus = {
            provider: 'webdav',
            status: this.syncInProgress ? 'syncing' : 'idle',
            totalConversations: this.lastSyncResults.length,
            syncedConversations: this.lastSyncResults.filter(r => r.success).length
        };

        return [webdavStatus];
    }

    /**
     * Get sync statistics
     */
    async getSyncStatistics(): Promise<SyncStatistics> {
        const conversations = await this.getAvailableConversations(false);
        const totalConversations = conversations.length;
        
        // Count conversations with cloud sync metadata
        const syncedConversations = conversations.filter(c => c.isFromCloud || c.cloudSyncMetadata).length;
        const conflictedConversations = this.lastSyncResults.filter(r => r.conflictResolved).length;
        const pendingConversations = totalConversations - syncedConversations;
        
        // Get last sync time from configuration
        const config = vscode.workspace.getConfiguration('claude-config.cloudSync');
        const lastSyncTime = config.get<string>('lastSyncTime');

        return {
            totalConversations,
            syncedConversations,
            conflictedConversations,
            pendingConversations,
            lastSyncTime: lastSyncTime ? new Date(lastSyncTime) : undefined
        };
    }

    /**
     * Sync conversations to cloud (upload)
     */
    async syncToCloud(options: any = {}): Promise<CloudSyncResult[]> {
        if (this.syncInProgress) {
            return [{
                success: false,
                error: 'Sync already in progress'
            }];
        }

        this.syncInProgress = true;
        const results: CloudSyncResult[] = [];

        try {
            const syncOptions: SyncOptions = {
                mode: options.mode || 'summaries-only',
                direction: 'upload',
                forceSync: options.forceSync || false,
                selectedProjects: options.selectedProjects
            };

            const syncResults = await this.cloudSyncService.performSync(syncOptions);
            this.lastSyncResults = syncResults;
            
            // Convert sync results to cloud sync results
            for (const result of syncResults) {
                results.push({
                    success: result.success,
                    error: result.error,
                    metadata: {
                        sessionId: result.sessionId,
                        projectName: result.projectName,
                        operation: result.operation,
                        skipped: result.skipped,
                        conflictResolved: result.conflictResolved
                    }
                });
            }

            // Update last sync time and show results
            const successCount = results.filter(r => r.success).length;
            const totalCount = results.length;
            
            if (successCount > 0) {
                const config = vscode.workspace.getConfiguration('claude-config.cloudSync');
                await config.update('lastSyncTime', new Date().toISOString(), vscode.ConfigurationTarget.Global);
                vscode.window.showInformationMessage(`✅ Successfully synced ${successCount}/${totalCount} conversations to cloud`);
            } else if (totalCount > 0) {
                vscode.window.showErrorMessage(`❌ Failed to sync all ${totalCount} conversations. Check the output for details.`);
            } else {
                vscode.window.showInformationMessage('ℹ️ No conversations found to sync');
            }

            // Trigger conversation refresh to show updated summaries
            this.triggerRefresh();

        } catch (error: any) {
            loggers.cloudSync.error('Upload sync failed:', error);
            results.push({
                success: false,
                error: error.message || 'Upload sync failed'
            });
        } finally {
            this.syncInProgress = false;
        }

        return results;
    }

    /**
     * Sync conversations from cloud (download)
     */
    async syncFromCloud(options: any = {}): Promise<CloudSyncResult[]> {
        if (this.syncInProgress) {
            return [{
                success: false,
                error: 'Sync already in progress'
            }];
        }

        this.syncInProgress = true;
        const results: CloudSyncResult[] = [];

        try {
            const syncOptions: SyncOptions = {
                mode: options.mode || 'summaries-only',
                direction: 'download',
                forceSync: options.forceSync || false,
                selectedProjects: options.selectedProjects
            };

            const syncResults = await this.cloudSyncService.performSync(syncOptions);
            this.lastSyncResults = syncResults;
            
            // Convert sync results to cloud sync results
            for (const result of syncResults) {
                results.push({
                    success: result.success,
                    error: result.error,
                    metadata: {
                        sessionId: result.sessionId,
                        projectName: result.projectName,
                        operation: result.operation,
                        skipped: result.skipped,
                        conflictResolved: result.conflictResolved
                    }
                });
            }

            // Update last sync time
            if (results.some(r => r.success)) {
                const config = vscode.workspace.getConfiguration('claude-config.cloudSync');
                await config.update('lastSyncTime', new Date().toISOString(), vscode.ConfigurationTarget.Global);
            }

            // Trigger conversation refresh to show new summaries
            this.triggerRefresh();

        } catch (error: any) {
            loggers.cloudSync.error('Download sync failed:', error);
            results.push({
                success: false,
                error: error.message || 'Download sync failed'
            });
        } finally {
            this.syncInProgress = false;
        }

        return results;
    }

    /**
     * Perform bidirectional sync (download then upload)
     */
    async bidirectionalSync(options: any = {}): Promise<CloudSyncResult[]> {
        if (this.syncInProgress) {
            return [{
                success: false,
                error: 'Sync already in progress'
            }];
        }

        const downloadResults = await this.syncFromCloud(options);
        const uploadResults = await this.syncToCloud(options);
        
        return [...downloadResults, ...uploadResults];
    }

    /**
     * Test cloud connection
     */
    async testConnection(): Promise<boolean> {
        try {
            return await this.cloudSyncService.testConnection();
        } catch (error) {
            loggers.cloudSync.error('Connection test failed:', error);
            return false;
        }
    }

    /**
     * Get sync progress information
     */
    isSyncInProgress(): boolean {
        return this.syncInProgress;
    }

    /**
     * Get last sync results
     */
    getLastSyncResults(): SyncResult[] {
        return this.lastSyncResults;
    }

    /**
     * Clear sync history
     */
    clearSyncHistory(): void {
        this.lastSyncResults = [];
    }
}