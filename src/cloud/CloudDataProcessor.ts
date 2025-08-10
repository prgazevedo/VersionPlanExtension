/**
 * Cloud Data Processor - Handles data transformation for cloud sync
 * Manages compression, encryption, and conversion between local/cloud formats
 */

import * as vscode from 'vscode';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as crypto from 'crypto';
import { ConversationSummary, ConversationMessage } from '../conversation/types';
import { WebDAVProvider } from './providers/WebDAVProvider';

export interface CloudSummaryFile {
    version: string;
    deviceId: string;
    projectId: string;
    summary: ConversationSummary;
    cloudSync: CloudSyncMetadata;
    createdAt: string;
    updatedAt: string;
}

export interface CloudSyncMetadata {
    syncId: string;
    lastSyncProvider: string;
    lastSyncTime: string;
    cloudPath: string;
    cloudVersion: string;
    localHash: string;
    syncState: 'pending' | 'synced' | 'conflict' | 'error';
    encrypted: boolean;
    compressed?: boolean;
}

export interface ProcessingOptions {
    compress?: boolean;
    encrypt?: boolean;
    encryptionPassword?: string;
    maxFileSize?: number;
}

/**
 * Processes conversation data for cloud sync operations
 */
export class CloudDataProcessor {
    private webdavProvider: WebDAVProvider;
    private deviceId: string;

    constructor(webdavProvider: WebDAVProvider) {
        this.webdavProvider = webdavProvider;
        this.deviceId = this.generateDeviceId();
    }

    /**
     * Create cloud summary from local JSONL file
     */
    async createCloudSummary(jsonlPath: string, options: ProcessingOptions = {}): Promise<CloudSummaryFile> {
        const summary = await this.generateSummaryFromJsonl(jsonlPath);
        const projectId = this.generateProjectId(summary.projectName, summary.sessionId);
        const syncId = summary.sessionId;
        
        const cloudSummary: CloudSummaryFile = {
            version: "1.0",
            deviceId: this.deviceId,
            projectId,
            summary,
            cloudSync: {
                syncId,
                lastSyncProvider: "webdav",
                lastSyncTime: new Date().toISOString(),
                cloudPath: this.generateCloudPath(projectId, syncId, 'summary'),
                cloudVersion: "",
                localHash: await this.calculateFileHash(jsonlPath),
                syncState: "pending",
                encrypted: options.encrypt || false,
                compressed: options.compress || false
            },
            createdAt: summary.startTime,
            updatedAt: new Date().toISOString()
        };

        return cloudSummary;
    }

    /**
     * Process data for upload (apply compression/encryption)
     */
    async processForUpload(data: Buffer, options: ProcessingOptions = {}): Promise<Buffer> {
        let processedData = data;

        // Apply compression if enabled
        if (options.compress) {
            processedData = await this.webdavProvider.compress(processedData);
        }

        // Apply encryption if enabled
        if (options.encrypt && options.encryptionPassword) {
            processedData = await this.webdavProvider.encrypt(processedData, options.encryptionPassword);
        }

        // Check file size limit
        if (options.maxFileSize && processedData.length > options.maxFileSize) {
            throw new Error(`Processed file size (${processedData.length} bytes) exceeds limit (${options.maxFileSize} bytes)`);
        }

        return processedData;
    }

    /**
     * Process data from download (apply decompression/decryption)
     */
    async processFromDownload(data: Buffer, metadata: CloudSyncMetadata, encryptionPassword?: string): Promise<Buffer> {
        let processedData = data;

        // Apply decryption if enabled
        if (metadata.encrypted && encryptionPassword) {
            processedData = await this.webdavProvider.decrypt(processedData, encryptionPassword);
        }

        // Apply decompression if enabled
        if (metadata.compressed) {
            processedData = await this.webdavProvider.decompress(processedData);
        }

        return processedData;
    }

    /**
     * Generate cloud summary from local JSONL file
     */
    private async generateSummaryFromJsonl(jsonlPath: string): Promise<ConversationSummary> {
        if (!await fs.pathExists(jsonlPath)) {
            throw new Error(`JSONL file not found: ${jsonlPath}`);
        }

        const content = await fs.readFile(jsonlPath, 'utf8');
        const lines = content.trim().split('\n').filter(line => line.trim());
        
        if (lines.length === 0) {
            throw new Error('JSONL file is empty');
        }

        // Parse messages
        const messages: ConversationMessage[] = [];
        for (const line of lines) {
            try {
                const message = JSON.parse(line) as ConversationMessage;
                messages.push(message);
            } catch (error) {
                console.warn(`Failed to parse message line: ${error}`);
            }
        }

        if (messages.length === 0) {
            throw new Error('No valid messages found in JSONL file');
        }

        const firstMessage = messages[0];
        const lastMessage = messages[messages.length - 1];
        
        // Extract session ID from filename
        const sessionId = path.basename(jsonlPath, '.jsonl');
        
        // Calculate chronological start and end times
        const validMessages = messages.filter(m => m.timestamp && !isNaN(new Date(m.timestamp).getTime()));
        const sortedByTime = validMessages.sort((a, b) => 
            new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );
        
        const startTime = sortedByTime.length > 0 ? sortedByTime[0].timestamp : firstMessage.timestamp || new Date().toISOString();
        const endTime = sortedByTime.length > 0 ? sortedByTime[sortedByTime.length - 1].timestamp : lastMessage.timestamp || startTime;
        
        // Extract project information
        const projectPath = firstMessage.cwd || path.dirname(jsonlPath);
        const projectName = this.extractProjectName(projectPath);
        
        // Calculate duration
        const duration = this.calculateDuration(startTime, endTime);

        return {
            sessionId,
            projectPath,
            projectName,
            startTime,
            endTime,
            messageCount: messages.length,
            duration,
            filePath: jsonlPath,
            firstMessage: this.extractMessageText(firstMessage),
            lastMessage: this.extractMessageText(lastMessage),
            isFromCloud: false
        };
    }

    /**
     * Extract readable text from conversation message
     */
    private extractMessageText(message: ConversationMessage): string {
        if (!message || !message.message || !message.message.content) {
            return 'No content available';
        }

        if (typeof message.message.content === 'string') {
            return message.message.content.substring(0, 100) + (message.message.content.length > 100 ? '...' : '');
        } else if (Array.isArray(message.message.content) && message.message.content.length > 0) {
            const textContent = message.message.content.find(item => item.type === 'text');
            if (textContent && textContent.text) {
                return textContent.text.substring(0, 100) + (textContent.text.length > 100 ? '...' : '');
            }
        }

        return 'No text content available';
    }

    /**
     * Extract project name from path
     */
    private extractProjectName(projectPath: string): string {
        const decoded = decodeURIComponent(projectPath.replace(/-/g, '/'));
        const segments = decoded.split('/');
        return segments[segments.length - 1] || 'Unknown Project';
    }

    /**
     * Calculate duration between timestamps
     */
    private calculateDuration(startTime: string, endTime: string): string {
        const start = new Date(startTime);
        const end = new Date(endTime);
        const diffMs = Math.abs(end.getTime() - start.getTime());
        
        const hours = Math.floor(diffMs / (1000 * 60 * 60));
        const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
        
        if (hours > 0) {
            return `${hours}h ${minutes}m`;
        } else {
            return `${minutes}m`;
        }
    }

    /**
     * Generate cloud path for file using session ID as the filename
     */
    private generateCloudPath(_projectId: string, sessionId: string, type: 'summary' | 'conversation'): string {
        const basePath = type === 'summary' ? 'summaries' : 'conversations';
        const extension = type === 'summary' ? '.summary.json' : '.jsonl';
        // Use session ID directly as the filename instead of nested project folders
        return `${basePath}/${sessionId}${extension}`;
    }

    /**
     * Generate project ID from project name and session ID
     */
    private generateProjectId(projectName: string, sessionId: string): string {
        // Clean project name for use in paths (remove special characters)
        let cleanName = (projectName || 'unknown').replace(/[^a-zA-Z0-9-_]/g, '_').substring(0, 30);
        
        // Ensure the name doesn't start with special characters or be empty
        if (!cleanName || cleanName.startsWith('_') || cleanName.startsWith('-')) {
            cleanName = 'project' + cleanName.replace(/^[_-]+/, '');
        }
        
        // If still empty or too short, use a default
        if (!cleanName || cleanName.length < 2) {
            cleanName = 'project';
        }
        
        // Use first 8 characters of session ID as the unique identifier
        const shortSessionId = sessionId ? sessionId.substring(0, 8) : crypto.randomBytes(4).toString('hex');
        
        return `${cleanName}_${shortSessionId}`;
    }

    /**
     * Generate device ID (persistent per device)
     */
    private generateDeviceId(): string {
        const config = vscode.workspace.getConfiguration('claude-config');
        let deviceId = config.get<string>('cloudSync.deviceId');
        
        if (!deviceId) {
            deviceId = crypto.randomBytes(8).toString('hex');
            config.update('cloudSync.deviceId', deviceId, vscode.ConfigurationTarget.Global);
        }
        
        return deviceId;
    }

    /**
     * Calculate SHA256 hash of file
     */
    async calculateFileHash(filePath: string): Promise<string> {
        if (!await fs.pathExists(filePath)) {
            return '';
        }

        const content = await fs.readFile(filePath);
        return crypto.createHash('sha256').update(content).digest('hex');
    }

    /**
     * Calculate SHA256 hash of data
     */
    calculateDataHash(data: Buffer): string {
        return crypto.createHash('sha256').update(data).digest('hex');
    }

    /**
     * Create sync metadata for local file
     */
    createSyncMetadata(localPath: string, cloudPath: string, encrypted: boolean = false, compressed: boolean = false): CloudSyncMetadata {
        return {
            syncId: path.basename(localPath, path.extname(localPath)),
            lastSyncProvider: "webdav",
            lastSyncTime: new Date().toISOString(),
            cloudPath,
            cloudVersion: "",
            localHash: "", // Will be calculated separately
            syncState: "pending",
            encrypted,
            compressed
        };
    }

    /**
     * Compare two cloud summaries for conflict detection
     */
    detectConflict(local: CloudSummaryFile, remote: CloudSummaryFile): boolean {
        // Check if both have been modified after last sync
        const localModified = new Date(local.updatedAt) > new Date(local.cloudSync.lastSyncTime);
        const remoteModified = new Date(remote.updatedAt) > new Date(remote.cloudSync.lastSyncTime);
        
        return localModified && remoteModified && local.cloudSync.localHash !== remote.cloudSync.localHash;
    }

    /**
     * Get processing options from VS Code configuration
     */
    getProcessingOptions(): ProcessingOptions {
        const config = vscode.workspace.getConfiguration('claude-config.cloudSync');
        
        return {
            compress: config.get<boolean>('compression', true),
            encrypt: config.get<boolean>('encryption', false),
            maxFileSize: config.get<number>('maxFileSize', 52428800) // 50MB default
        };
    }

    /**
     * Get encryption password from secure storage
     */
    async getEncryptionPassword(): Promise<string | undefined> {
        const config = vscode.workspace.getConfiguration('claude-config.cloudSync');
        const encryptionEnabled = config.get<boolean>('encryption', false);
        
        if (!encryptionEnabled) {
            return undefined;
        }

        // For now, prompt user for password
        // In production, you might want to store this more securely
        const password = await vscode.window.showInputBox({
            prompt: 'Enter encryption password for cloud sync',
            password: true,
            placeHolder: 'Encryption password'
        });

        return password;
    }
}