/**
 * Cloud Sync Service - Orchestrates WebDAV sync operations
 * Manages upload/download sync with progress tracking and conflict resolution
 */

import * as vscode from 'vscode';
import * as fs from 'fs-extra';
import * as path from 'path';
import { ConversationManager } from '../conversation/ConversationManager';
import { ConversationSummary } from '../conversation/types';
import { WebDAVProvider, UploadTask, BatchUploadOptions } from './providers/WebDAVProvider';
import { CloudDataProcessor, CloudSummaryFile, CloudSyncMetadata, ProcessingOptions } from './CloudDataProcessor';
import { CloudAuthManager } from './CloudAuthManager';
import { loggers } from '../utils/Logger';

export interface SyncOptions {
    mode: 'summaries-only' | 'full-conversations' | 'smart-sync';
    direction: 'upload' | 'download' | 'bidirectional';
    forceSync?: boolean;
    selectedProjects?: string[];
}

export interface SyncResult {
    success: boolean;
    operation: string;
    sessionId: string;
    projectName: string;
    error?: string;
    skipped?: boolean;
    conflictResolved?: boolean;
}

export interface SyncProgress {
    phase: 'scanning' | 'uploading' | 'downloading' | 'processing' | 'complete';
    currentFile: string;
    filesProcessed: number;
    totalFiles: number;
    bytesTransferred: number;
    totalBytes: number;
    percentage: number;
    errors: string[];
}

/**
 * Manages WebDAV cloud synchronization operations
 */
export class CloudSyncService {
    private webdavProvider: WebDAVProvider;
    private dataProcessor: CloudDataProcessor;
    private conversationManager: ConversationManager;
    private authManager: CloudAuthManager;
    private onProgressCallback?: (progress: SyncProgress) => void;

    constructor(
        conversationManager: ConversationManager,
        authManager: CloudAuthManager
    ) {
        this.conversationManager = conversationManager;
        this.authManager = authManager;
        this.webdavProvider = new WebDAVProvider(authManager);
        this.dataProcessor = new CloudDataProcessor(this.webdavProvider);
    }

    /**
     * Initialize the sync service
     */
    async initialize(): Promise<void> {
        vscode.window.showInformationMessage('🔧 Initializing WebDAV connection...');
        
        // First, try to get credentials from SecretStorage
        let credentials = await this.authManager.getCredentials('webdav');
        
        // If no credentials in SecretStorage, try to migrate from VS Code settings
        if (!credentials) {
            loggers.cloudSync.info('No credentials in SecretStorage, checking VS Code settings...');
            const migrated = await this.migrateFromVSCodeSettings();
            if (migrated) {
                credentials = await this.authManager.getCredentials('webdav');
            }
        }
        
        if (!credentials) {
            const errorMsg = 'WebDAV credentials not found. Please configure cloud sync first.';
            vscode.window.showErrorMessage(`❌ ${errorMsg}`);
            throw new Error(errorMsg);
        }

        loggers.cloudSync.info('Initializing with credentials:', {
            provider: credentials.provider,
            isValid: credentials.isValid,
            createdAt: credentials.createdAt,
            hasServerUrl: !!credentials.credentials?.serverUrl,
            hasUsername: !!credentials.credentials?.username,
            hasPassword: !!credentials.credentials?.password,
            passwordLength: credentials.credentials?.password?.length,
            serverUrl: credentials.credentials?.serverUrl?.substring(0, 50) + '...',
            username: credentials.credentials?.username
        });

        try {
            await this.webdavProvider.initialize({
                type: 'webdav',
                enabled: true,
                config: credentials.credentials
            });
            vscode.window.showInformationMessage('✅ WebDAV connection initialized successfully');
        } catch (error: any) {
            const errorMsg = `Failed to initialize WebDAV connection: ${error.message}`;
            vscode.window.showErrorMessage(`❌ ${errorMsg}`);
            throw new Error(errorMsg);
        }
    }

    /**
     * Migrate credentials from VS Code settings to SecretStorage
     */
    private async migrateFromVSCodeSettings(): Promise<boolean> {
        try {
            const config = vscode.workspace.getConfiguration('claude-config.cloudSync');
            const serverUrl = config.get<string>('webdav.serverUrl', '');
            const username = config.get<string>('webdav.username', '');
            
            // Check if we have basic config in settings
            if (!serverUrl || !username) {
                loggers.cloudSync.info('No complete WebDAV config found in VS Code settings');
                return false;
            }
            
            // We can't migrate password from settings as it should be in SecretStorage
            // Instead, prompt user to reconfigure
            loggers.cloudSync.info('Found WebDAV config in settings but no credentials in SecretStorage');
            vscode.window.showWarningMessage(
                'WebDAV configuration found but credentials are missing. Please reconfigure WebDAV sync.',
                'Configure Now'
            ).then(choice => {
                if (choice === 'Configure Now') {
                    vscode.commands.executeCommand('claude-config.cloudSettings');
                }
            });
            
            return false;
        } catch (error) {
            loggers.cloudSync.error('Failed to migrate from VS Code settings:', error);
            return false;
        }
    }

    /**
     * Set progress callback for sync operations
     */
    setProgressCallback(callback: (progress: SyncProgress) => void): void {
        this.onProgressCallback = callback;
        this.webdavProvider.setProgressCallback((uploadProgress) => {
            if (this.onProgressCallback) {
                this.onProgressCallback({
                    phase: 'uploading',
                    currentFile: uploadProgress.sessionId,
                    filesProcessed: 0, // Will be updated by sync operation
                    totalFiles: 0,     // Will be updated by sync operation
                    bytesTransferred: uploadProgress.bytesUploaded,
                    totalBytes: uploadProgress.totalBytes,
                    percentage: uploadProgress.percentage,
                    errors: []
                });
            }
        });
    }

    /**
     * Perform sync operation
     */
    async performSync(options: SyncOptions): Promise<SyncResult[]> {
        await this.initialize();
        
        const results: SyncResult[] = [];
        
        try {
            if (options.direction === 'upload' || options.direction === 'bidirectional') {
                const uploadResults = await this.performUploadSync(options);
                results.push(...uploadResults);
            }

            if (options.direction === 'download' || options.direction === 'bidirectional') {
                const downloadResults = await this.performDownloadSync(options);
                results.push(...downloadResults);
            }

        } catch (error: any) {
            loggers.cloudSync.error('Sync operation failed:', error);
            results.push({
                success: false,
                operation: 'sync',
                sessionId: 'unknown',
                projectName: 'unknown',
                error: error.message || 'Unknown sync error'
            });
        }

        return results;
    }

    /**
     * Perform upload sync with batch existence checking
     */
    private async performUploadSync(options: SyncOptions): Promise<SyncResult[]> {
        const results: SyncResult[] = [];
        
        this.reportProgress('scanning', 'Scanning local conversations...', 0, 0);
        vscode.window.showInformationMessage('🔍 Scanning local conversations for sync...');
        
        // Get local conversations
        const conversations = await this.conversationManager.getAvailableConversations(false);
        const filteredConversations = options.selectedProjects 
            ? conversations.filter(conv => options.selectedProjects!.includes(conv.projectName))
            : conversations;

        // Step 1: Batch check what already exists on server (if not forcing sync)
        let remoteFileInfoMap = new Map<string, import('./providers/WebDAVProvider').RemoteFileInfo>();
        
        if (!options.forceSync) {
            vscode.window.showInformationMessage('🔍 Checking which files already exist on server...');
            
            // Generate cloud paths for all conversations
            const cloudPaths = filteredConversations.map(conv => {
                const cloudSummary = this.dataProcessor.createSyncMetadata(
                    conv.filePath,
                    `summaries/${conv.sessionId}.summary.json`
                );
                return this.webdavProvider.buildUseCasePath(cloudSummary.cloudPath);
            });
            
            try {
                remoteFileInfoMap = await this.webdavProvider.checkRemoteFiles(cloudPaths);
                loggers.cloudSync.info(`Batch existence check completed for ${remoteFileInfoMap.size} files`);
            } catch (error) {
                loggers.cloudSync.warn('Batch existence check failed, proceeding without optimization:', error);
            }
        }

        // Step 2: Filter conversations that actually need syncing
        const conversationsToSync = [];
        for (const conversation of filteredConversations) {
            const cloudPath = this.webdavProvider.buildUseCasePath(`summaries/${conversation.sessionId}.summary.json`);
            const remoteFileInfo = remoteFileInfoMap.get(cloudPath);
            
            const needsSync = await this.needsSync(conversation, 'upload', remoteFileInfo);
            if (needsSync) {
                conversationsToSync.push(conversation);
            } else {
                // Add to results as skipped
                results.push({
                    success: true,
                    operation: 'upload',
                    sessionId: conversation.sessionId,
                    projectName: conversation.projectName,
                    skipped: true
                });
            }
        }

        const totalFiles = conversationsToSync.length;
        const skippedFiles = filteredConversations.length - totalFiles;
        let processedFiles = 0;

        if (skippedFiles > 0) {
            vscode.window.showInformationMessage(`🚀 Optimized sync: ${totalFiles} files to upload, ${skippedFiles} files skipped (already synced)`);
        }
        
        if (totalFiles === 0) {
            vscode.window.showInformationMessage('✅ All conversations are already synced - no uploads needed');
            return results;
        }

        vscode.window.showInformationMessage(`🚀 Starting optimized batch upload of ${totalFiles} conversations...`);
        this.reportProgress('uploading', 'Starting batch upload...', processedFiles, totalFiles);

        const processingOptions = this.dataProcessor.getProcessingOptions();
        const encryptionPassword = processingOptions.encrypt 
            ? await this.dataProcessor.getEncryptionPassword()
            : undefined;

        // Use batch upload for much faster performance
        await this.batchUploadConversations(conversationsToSync, options, processingOptions, encryptionPassword, results);
        
        // Update processed files count
        processedFiles = conversationsToSync.length;

        return results;
    }

    /**
     * Perform download sync
     */
    private async performDownloadSync(options: SyncOptions): Promise<SyncResult[]> {
        const results: SyncResult[] = [];
        
        this.reportProgress('downloading', 'Scanning cloud conversations...', 0, 0);
        
        try {
            // List remote summaries - use flat directory structure without nested project folders
            const summariesPath = 'summaries/';
            const fullSummariesPath = this.webdavProvider.buildUseCasePath(summariesPath);
            const files = await this.webdavProvider.propfind(fullSummariesPath);
            
            // Filter to only .summary.json files (no nested directories expected)
            const summaryFiles = files.filter(f => !f.isDirectory && f.name.endsWith('.summary.json'));
            const totalFiles = summaryFiles.length;
            
            let processedFiles = 0;
            this.reportProgress('downloading', 'Starting download...', processedFiles, totalFiles);

            const encryptionPassword = this.dataProcessor.getProcessingOptions().encrypt
                ? await this.dataProcessor.getEncryptionPassword()
                : undefined;

            for (const summary of summaryFiles) {
                try {
                    const result = await this.downloadConversation(
                        `${fullSummariesPath}${summary.name}`,
                        options,
                        encryptionPassword
                    );
                    results.push(result);
                    
                    processedFiles++;
                    this.reportProgress('downloading', summary.name, processedFiles, totalFiles);
                    
                } catch (error: any) {
                    console.error(`Failed to download conversation ${summary.name}:`, error);
                    results.push({
                        success: false,
                        operation: 'download',
                        sessionId: path.basename(summary.name, '.summary.json'),
                        projectName: 'unknown', // No project structure in flat layout
                        error: error.message || 'Download failed'
                    });
                    processedFiles++;
                }
            }
            
        } catch (error: any) {
            loggers.cloudSync.error('Download scan failed:', error);
            results.push({
                success: false,
                operation: 'download-scan',
                sessionId: 'unknown',
                projectName: 'unknown',
                error: error.message || 'Failed to scan cloud conversations'
            });
        }

        return results;
    }

    /**
     * Batch upload conversations with parallel processing for speed
     */
    private async batchUploadConversations(
        conversations: ConversationSummary[],
        options: SyncOptions,
        processingOptions: ProcessingOptions,
        encryptionPassword: string | undefined,
        results: SyncResult[]
    ): Promise<void> {
        const totalFiles = conversations.length;
        let processedFiles = 0;
        
        // Prepare all upload tasks
        const uploadTasks: UploadTask[] = [];
        const conversationMetadata: Map<string, { conversation: ConversationSummary, cloudSummary: any }> = new Map();
        
        for (const conversation of conversations) {
            try {
                // Create cloud summary
                const cloudSummary = await this.dataProcessor.createCloudSummary(
                    conversation.filePath,
                    { ...processingOptions, encryptionPassword }
                );
                
                conversationMetadata.set(conversation.sessionId, { conversation, cloudSummary });
                
                // Prepare summary upload
                const summaryData = Buffer.from(JSON.stringify(cloudSummary, null, 2));
                const processedSummaryData = await this.dataProcessor.processForUpload(summaryData, {
                    compress: processingOptions.compress,
                    encrypt: processingOptions.encrypt,
                    encryptionPassword
                });
                
                const fullCloudPath = this.webdavProvider.buildUseCasePath(cloudSummary.cloudSync.cloudPath);
                
                uploadTasks.push({
                    path: fullCloudPath,
                    data: processedSummaryData,
                    sessionId: conversation.sessionId
                });
                
                // Prepare full conversation upload if required
                if (options.mode === 'full-conversations' || 
                   (options.mode === 'smart-sync' && this.shouldIncludeFullConversation(conversation))) {
                    
                    const conversationData = await fs.readFile(conversation.filePath);
                    const processedConversationData = await this.dataProcessor.processForUpload(conversationData, {
                        compress: processingOptions.compress,
                        encrypt: processingOptions.encrypt,
                        encryptionPassword
                    });
                    
                    const conversationCloudPath = cloudSummary.cloudSync.cloudPath
                        .replace('summaries/', 'conversations/')
                        .replace('.summary.json', '.jsonl');
                    
                    const fullConversationPath = this.webdavProvider.buildUseCasePath(conversationCloudPath);
                    
                    uploadTasks.push({
                        path: fullConversationPath,
                        data: processedConversationData,
                        sessionId: `${conversation.sessionId}-conversation`
                    });
                }
                
            } catch (error: any) {
                loggers.cloudSync.error(`Failed to prepare upload for ${conversation.sessionId}:`, error);
                results.push({
                    success: false,
                    operation: 'upload',
                    sessionId: conversation.sessionId,
                    projectName: conversation.projectName,
                    error: `Preparation failed: ${error.message}`
                });
            }
        }
        
        if (uploadTasks.length === 0) {
            return;
        }
        
        // Configure batch upload with optimized settings for speed
        const batchOptions: BatchUploadOptions = {
            maxConcurrency: 10, // Increased for speed
            chunkSize: 5 * 1024 * 1024, // 5MB chunks
            retryAttempts: 1, // Fast retry
            progressCallback: (progress) => {
                if (this.onProgressCallback) {
                    this.onProgressCallback({
                        phase: 'uploading',
                        currentFile: progress.sessionId,
                        filesProcessed: Math.floor((progress.percentage / 100) * totalFiles),
                        totalFiles,
                        bytesTransferred: progress.bytesUploaded,
                        totalBytes: progress.totalBytes,
                        percentage: progress.percentage,
                        errors: []
                    });
                }
            }
        };
        
        try {
            vscode.window.showInformationMessage(`🚀 Starting batch upload of ${uploadTasks.length} files with ${batchOptions.maxConcurrency} parallel connections...`);
            
            // Perform batch upload
            await this.webdavProvider.batchUpload(uploadTasks, batchOptions);
            
            // Update local summary files and results
            for (const [sessionId, { conversation, cloudSummary }] of conversationMetadata) {
                try {
                    await this.updateLocalSummary(conversation, cloudSummary.cloudSync);
                    results.push({
                        success: true,
                        operation: 'upload',
                        sessionId: conversation.sessionId,
                        projectName: conversation.projectName
                    });
                    processedFiles++;
                    
                    // Progress updates
                    if (processedFiles % 10 === 0 || processedFiles === totalFiles || processedFiles === 1) {
                        vscode.window.showInformationMessage(`📤 Completed ${processedFiles}/${totalFiles} conversations...`);
                    }
                    
                } catch (error: any) {
                    loggers.cloudSync.error(`Failed to update local summary for ${sessionId}:`, error);
                    results.push({
                        success: false,
                        operation: 'upload',
                        sessionId: conversation.sessionId,
                        projectName: conversation.projectName,
                        error: `Local update failed: ${error.message}`
                    });
                }
            }
            
            vscode.window.showInformationMessage(`✅ Batch upload completed: ${processedFiles}/${totalFiles} conversations uploaded successfully`);
            
        } catch (error: any) {
            loggers.cloudSync.error('Batch upload failed:', error);
            
            // Mark all remaining as failed
            for (const [sessionId, { conversation }] of conversationMetadata) {
                results.push({
                    success: false,
                    operation: 'upload',
                    sessionId: conversation.sessionId,
                    projectName: conversation.projectName,
                    error: `Batch upload failed: ${error.message}`
                });
            }
            
            // Get WebDAV configuration for detailed error reporting
            const credentials = await this.authManager.getCredentials('webdav');
            const serverInfo = credentials ? 
                `Server: ${credentials.credentials.serverUrl}, User: ${credentials.credentials.username}` : 
                'Server info unavailable';
            
            vscode.window.showErrorMessage(`❌ Batch upload failed\n${serverInfo}\nError: ${error.message}`);
        }
    }

    /**
     * Upload a single conversation (legacy method for compatibility)
     */
    private async uploadConversation(
        conversation: ConversationSummary,
        options: SyncOptions,
        processingOptions: ProcessingOptions,
        encryptionPassword?: string
    ): Promise<SyncResult> {
        // Use batch upload for single conversation for consistency
        const results: SyncResult[] = [];
        await this.batchUploadConversations([conversation], options, processingOptions, encryptionPassword, results);
        return results[0] || {
            success: false,
            operation: 'upload',
            sessionId: conversation.sessionId,
            projectName: conversation.projectName,
            error: 'No result from batch upload'
        };
    }

    /**
     * Download a single conversation
     */
    private async downloadConversation(
        cloudPath: string,
        options: SyncOptions,
        encryptionPassword?: string
    ): Promise<SyncResult> {
        // Download cloud summary
        const summaryData = await this.webdavProvider.get(cloudPath);
        const cloudSummary = JSON.parse(summaryData.toString()) as CloudSummaryFile;

        // Check for conflicts
        const localSummaryPath = this.getLocalSummaryPath(cloudSummary);
        const hasConflict = await this.checkConflict(cloudSummary, localSummaryPath);
        
        if (hasConflict && !options.forceSync) {
            const resolution = await this.resolveConflict(cloudSummary, localSummaryPath);
            if (resolution === 'skip') {
                return {
                    success: true,
                    operation: 'download',
                    sessionId: cloudSummary.summary.sessionId,
                    projectName: cloudSummary.summary.projectName,
                    skipped: true
                };
            }
        }

        // Process downloaded data
        const processedSummaryData = await this.dataProcessor.processFromDownload(
            summaryData,
            cloudSummary.cloudSync,
            encryptionPassword
        );

        // Create local summary file
        await fs.ensureDir(path.dirname(localSummaryPath));
        await fs.writeFile(localSummaryPath, processedSummaryData);

        return {
            success: true,
            operation: 'download',
            sessionId: cloudSummary.summary.sessionId,
            projectName: cloudSummary.summary.projectName,
            conflictResolved: hasConflict
        };
    }

    /**
     * Check if conversation needs sync with hash-based change detection
     */
    private async needsSync(conversation: ConversationSummary, direction: 'upload' | 'download', remoteFileInfo?: import('./providers/WebDAVProvider').RemoteFileInfo): Promise<boolean> {
        try {
            // Check if local .summary.json exists with sync metadata
            const summaryPath = conversation.filePath.replace('.jsonl', '.summary.json');
            
            if (await fs.pathExists(summaryPath)) {
                const localSummary = JSON.parse(await fs.readFile(summaryPath, 'utf8')) as CloudSummaryFile;
                
                // If sync state is 'synced', check if local file changed since last sync
                if (localSummary.cloudSync.syncState === 'synced') {
                    const currentHash = await this.dataProcessor.calculateFileHash(conversation.filePath);
                    
                    // If local file hasn't changed, check remote file status
                    if (currentHash === localSummary.cloudSync.localHash) {
                        
                        // For upload direction, if remote file doesn't exist, we need to sync
                        if (direction === 'upload' && remoteFileInfo && !remoteFileInfo.exists) {
                            loggers.cloudSync.info(`File needs sync: ${conversation.sessionId} - remote file doesn't exist`);
                            return true;
                        }
                        
                        // For upload direction, if remote file exists and local hasn't changed, no sync needed
                        if (direction === 'upload' && remoteFileInfo && remoteFileInfo.exists) {
                            loggers.cloudSync.info(`File skip sync: ${conversation.sessionId} - already synced and no changes`);
                            return false;
                        }
                        
                        // For download direction, check if remote file is newer
                        if (direction === 'download' && remoteFileInfo && remoteFileInfo.lastModified) {
                            const localSyncTime = new Date(localSummary.cloudSync.lastSyncTime);
                            if (remoteFileInfo.lastModified <= localSyncTime) {
                                loggers.cloudSync.info(`File skip sync: ${conversation.sessionId} - remote not newer than local sync`);
                                return false;
                            }
                        }
                    } else {
                        loggers.cloudSync.info(`File needs sync: ${conversation.sessionId} - local file changed (hash mismatch)`);
                        return true;
                    }
                }
            } else {
                loggers.cloudSync.info(`File needs sync: ${conversation.sessionId} - no sync metadata found`);
                return true;
            }
            
            loggers.cloudSync.info(`File needs sync: ${conversation.sessionId} - default to sync`);
            return true;
            
        } catch (error) {
            loggers.cloudSync.warn(`Error checking sync status for ${conversation.sessionId}, defaulting to sync:`, error);
            return true; // Default to sync if we can't determine status
        }
    }

    /**
     * Check if full conversation should be included in smart sync
     */
    private shouldIncludeFullConversation(conversation: ConversationSummary): boolean {
        const config = vscode.workspace.getConfiguration('claude-config.cloudSync');
        const smartSyncDays = config.get<number>('smartSyncRecentDays', 7);
        const smartSyncMinMessages = config.get<number>('smartSyncMinMessages', 10);
        
        // Include if recent
        const daysOld = (Date.now() - new Date(conversation.startTime).getTime()) / (1000 * 60 * 60 * 24);
        if (daysOld <= smartSyncDays) {
            return true;
        }
        
        // Include if has many messages
        if (conversation.messageCount >= smartSyncMinMessages) {
            return true;
        }
        
        return false;
    }

    /**
     * Update local summary file with cloud sync metadata
     */
    private async updateLocalSummary(conversation: ConversationSummary, cloudSync: CloudSyncMetadata): Promise<void> {
        const summaryPath = conversation.filePath.replace('.jsonl', '.summary.json');
        
        const config = vscode.workspace.getConfiguration('claude-config.cloudSync');
        let deviceId = config.get<string>('deviceId');
        if (!deviceId) {
            deviceId = require('crypto').randomBytes(8).toString('hex');
            await config.update('deviceId', deviceId, vscode.ConfigurationTarget.Global);
        }

        // Generate project ID from path
        const projectId = Buffer.from(conversation.projectPath).toString('base64').replace(/[+/=]/g, (char) => {
            switch (char) {
                case '+': return '-';
                case '/': return '_';
                case '=': return '';
                default: return char;
            }
        });

        const localCloudSummary: CloudSummaryFile = {
            version: "1.0",
            deviceId: deviceId!,
            projectId,
            summary: conversation,
            cloudSync: { ...cloudSync, syncState: 'synced' },
            createdAt: conversation.startTime,
            updatedAt: new Date().toISOString()
        };

        await fs.ensureDir(path.dirname(summaryPath));
        await fs.writeFile(summaryPath, JSON.stringify(localCloudSummary, null, 2));
    }

    /**
     * Get local summary path for cloud summary
     */
    private getLocalSummaryPath(cloudSummary: CloudSummaryFile): string {
        // Access conversation data path properly
        const config = vscode.workspace.getConfiguration('claude-config');
        const customPath = config.get<string>('conversationDataPath');
        const claudeDataPath = customPath || path.join(require('os').homedir(), '.claude', 'projects');
        
        return path.join(
            claudeDataPath,
            cloudSummary.summary.projectPath,
            `${cloudSummary.summary.sessionId}.summary.json`
        );
    }

    /**
     * Check for conflicts between cloud and local summaries
     */
    private async checkConflict(cloudSummary: CloudSummaryFile, localSummaryPath: string): Promise<boolean> {
        if (!await fs.pathExists(localSummaryPath)) {
            return false; // No local file, no conflict
        }

        try {
            const localContent = await fs.readFile(localSummaryPath, 'utf8');
            const localSummary = JSON.parse(localContent) as CloudSummaryFile;
            
            return this.dataProcessor.detectConflict(localSummary, cloudSummary);
        } catch (error) {
            // If we can't parse local file, treat as no conflict
            return false;
        }
    }

    /**
     * Resolve conflict between cloud and local summaries
     */
    private async resolveConflict(cloudSummary: CloudSummaryFile, _localSummaryPath: string): Promise<'local' | 'remote' | 'skip'> {
        const config = vscode.workspace.getConfiguration('claude-config.cloudSync');
        const strategy = config.get<string>('conflictResolution', 'ask');

        switch (strategy) {
            case 'local':
                return 'local';
            case 'remote':
                return 'remote';
            case 'ask':
            default:
                const choice = await vscode.window.showWarningMessage(
                    `Conflict detected for conversation ${cloudSummary.summary.sessionId}. Both local and cloud versions have been modified.`,
                    'Use Local Version',
                    'Use Cloud Version',
                    'Skip This File'
                );

                switch (choice) {
                    case 'Use Local Version': return 'local';
                    case 'Use Cloud Version': return 'remote';
                    default: return 'skip';
                }
        }
    }

    /**
     * Report progress to callback
     */
    private reportProgress(phase: SyncProgress['phase'], currentFile: string, processed: number, total: number): void {
        if (this.onProgressCallback) {
            this.onProgressCallback({
                phase,
                currentFile,
                filesProcessed: processed,
                totalFiles: total,
                bytesTransferred: 0,
                totalBytes: 0,
                percentage: total > 0 ? (processed / total) * 100 : 0,
                errors: []
            });
        }
    }

    /**
     * Test cloud connection
     */
    async testConnection(): Promise<boolean> {
        try {
            await this.initialize();
            return await this.webdavProvider.testConnection();
        } catch (error) {
            loggers.cloudSync.error('Connection test failed:', error);
            return false;
        }
    }

    /**
     * Debug method to check credential and configuration status
     */
    async debugCredentialStatus(): Promise<any> {
        try {
            const config = vscode.workspace.getConfiguration('claude-config.cloudSync');
            const credentials = await this.authManager.getCredentials('webdav');
            
            return {
                vsCodeSettings: {
                    enabled: config.get<boolean>('enabled', false),
                    serverUrl: config.get<string>('webdav.serverUrl', ''),
                    username: config.get<string>('webdav.username', ''),
                    hasServerUrl: !!config.get<string>('webdav.serverUrl', ''),
                    hasUsername: !!config.get<string>('webdav.username', '')
                },
                secretStorage: {
                    hasCredentials: !!credentials,
                    isValid: credentials?.isValid || false,
                    provider: credentials?.provider || 'none',
                    createdAt: credentials?.createdAt?.toISOString() || 'none',
                    credentialsStructure: credentials ? {
                        hasServerUrl: !!credentials.credentials?.serverUrl,
                        hasUsername: !!credentials.credentials?.username,
                        hasPassword: !!credentials.credentials?.password,
                        hasBasePath: !!credentials.credentials?.basePath,
                        serverUrl: credentials.credentials?.serverUrl?.substring(0, 50) + '...',
                        username: credentials.credentials?.username,
                        basePath: credentials.credentials?.basePath,
                        acceptInvalidCerts: credentials.credentials?.acceptInvalidCerts
                    } : null
                }
            };
        } catch (error: any) {
            return {
                error: error.message,
                stack: error.stack
            };
        }
    }
}