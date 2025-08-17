import * as vscode from 'vscode';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';
import { ConversationMessage, ConversationSession, ConversationSummary, ConversationFilter } from './types';
import { sanitizePath } from '../security';
import { SummaryCacheManager } from './SummaryCache';

export class ConversationManager {
    private claudeDataPath: string;
    private fileWatcher: vscode.FileSystemWatcher | undefined;
    private onConversationsChangedEmitter = new vscode.EventEmitter<void>();
    public onConversationsChanged = this.onConversationsChangedEmitter.event;
    protected summaryCache = SummaryCacheManager.getInstance();

    constructor(private context: vscode.ExtensionContext) {
        console.log('[ConversationManager] 🚀 Constructor called');
        // Default Claude data path - can be overridden by configuration
        this.claudeDataPath = this.getDefaultClaudeDataPath();
        console.log('[ConversationManager] 📁 Data path:', this.claudeDataPath);
        this.setupFileWatcher();
        console.log('[ConversationManager] ✅ Constructor completed');
    }

    /**
     * Initialize the ConversationManager by loading conversations into cache
     * Returns Promise that resolves when cache is populated
     */
    async initialize(): Promise<void> {
        console.log('[ConversationManager] 🔄 Initialize called - populating cache');
        console.log(`[ConversationManager] 📁 Data path: ${this.claudeDataPath}`);
        console.log(`[ConversationManager] 📦 Cache state before init: ${this.summaryCache.getAll().length} items`);
        
        const startTime = Date.now();
        
        try {
            // Check if data path exists
            const pathExists = await fs.pathExists(this.claudeDataPath);
            console.log(`[ConversationManager] 📂 Data path exists: ${pathExists}`);
            
            if (!pathExists) {
                console.log('[ConversationManager] ⚠️ Claude data path does not exist, creating empty cache');
                return;
            }
            
            // Force load conversations to populate cache
            console.log('[ConversationManager] 🔍 Force loading conversations to populate cache...');
            const conversations = await this.getAvailableConversations(false);
            
            const loadTime = Date.now() - startTime;
            const cacheSize = this.summaryCache.getAll().length;
            
            console.log(`[ConversationManager] ✅ Initialize completed: ${conversations.length} conversations loaded in ${loadTime}ms`);
            console.log(`[ConversationManager] 📦 Cache state after init: ${cacheSize} items`);
            
            if (conversations.length === 0) {
                console.log('[ConversationManager] ⚠️ No conversations found - this may indicate missing data or permissions issue');
            }
            
            if (cacheSize !== conversations.length) {
                console.log(`[ConversationManager] ⚠️ Cache size mismatch: loaded ${conversations.length} but cache has ${cacheSize}`);
            }
            
        } catch (error) {
            const loadTime = Date.now() - startTime;
            console.error(`[ConversationManager] ❌ Initialize failed after ${loadTime}ms:`, error);
            console.error('[ConversationManager] 📋 Error details:', {
                dataPath: this.claudeDataPath,
                errorMessage: error instanceof Error ? error.message : String(error),
                errorStack: error instanceof Error ? error.stack : undefined
            });
            throw error;
        }
    }

    /**
     * Check if the cache is populated with conversations
     */
    isCachePopulated(): boolean {
        const cached = this.summaryCache.getAll();
        const isPopulated = cached.length > 0;
        console.log(`[ConversationManager] 📦 Cache populated check: ${isPopulated} (${cached.length} items)`);
        
        if (!isPopulated) {
            console.log('[ConversationManager] 🔍 Cache empty - debugging info:');
            console.log(`[ConversationManager] 📁 Data path configured: ${this.claudeDataPath}`);
            console.log('[ConversationManager] 💡 Possible causes: no conversations exist, path misconfigured, or initialization failed');
        } else {
            console.log('[ConversationManager] ✅ Cache has data, tree providers should display conversations');
            // Log first few conversations for debugging
            const firstFew = cached.slice(0, 3).map(c => ({
                project: c.projectName,
                messages: c.messageCount,
                startTime: c.startTime
            }));
            console.log('[ConversationManager] 📋 Sample conversations in cache:', firstFew);
        }
        
        return isPopulated;
    }

    /**
     * 🆕 Trigger conversation panel refresh (for cloud sync)
     */
    protected triggerRefresh(): void {
        console.log('[ConversationManager] 🔄 Triggering conversation panel refresh');
        this.onConversationsChangedEmitter.fire();
    }

    private setupFileWatcher() {
        // 🆕 ENHANCED FILE WATCHING: Watch for both .jsonl and .summary.json files
        const jsonlPattern = path.join(this.claudeDataPath, '**', '*.jsonl');
        const summaryPattern = path.join(this.claudeDataPath, '**', '*.summary.json');
        
        // Create watchers for both file types
        this.fileWatcher = vscode.workspace.createFileSystemWatcher(`{${jsonlPattern},${summaryPattern}}`);
        
        this.fileWatcher.onDidCreate((uri) => {
            console.log('[ConversationManager] 🔄 File created - refreshing conversations');
            this.invalidateCacheForFile(uri.fsPath);
            this.onConversationsChangedEmitter.fire();
        });
        this.fileWatcher.onDidChange((uri) => {
            console.log('[ConversationManager] 🔄 File changed - refreshing conversations');
            this.invalidateCacheForFile(uri.fsPath);
            this.onConversationsChangedEmitter.fire();
        });
        this.fileWatcher.onDidDelete((uri) => {
            console.log('[ConversationManager] 🔄 File deleted - refreshing conversations');
            this.invalidateCacheForFile(uri.fsPath);
            this.onConversationsChangedEmitter.fire();
        });
        
        this.context.subscriptions.push(this.fileWatcher);
    }

    private getDefaultClaudeDataPath(): string {
        const config = vscode.workspace.getConfiguration('claude-config');
        const customPath = config.get<string>('conversationDataPath');
        
        if (customPath) {
            return sanitizePath(customPath);
        }

        // Default Claude Code data location
        return path.join(os.homedir(), '.claude', 'projects');
    }

    /**
     * Get available conversations with summary-first loading and caching
     * Returns cached summaries immediately if available, otherwise loads from files
     */
    async getAvailableConversations(useCache: boolean = true): Promise<ConversationSummary[]> {
        console.log(`[ConversationManager] 🔍 getAvailableConversations called, useCache: ${useCache}`);
        try {
            // Try to return cached summaries first for fast loading
            if (useCache) {
                const cached = this.summaryCache.getAll();
                console.log(`[ConversationManager] 📦 Cache check: ${cached.length} items found`);
                if (cached.length > 0) {
                    console.log(`[ConversationManager] ✅ Returning ${cached.length} cached summaries`);
                    return cached.sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
                }
                console.log('[ConversationManager] 📦 Cache empty, loading from disk');
            }

            const conversations: ConversationSummary[] = [];
            
            if (!await fs.pathExists(this.claudeDataPath)) {
                console.log('[ConversationManager] ❌ Claude data path does not exist:', this.claudeDataPath);
                return conversations;
            }

            const projectDirs = await fs.readdir(this.claudeDataPath);
            console.log(`[ConversationManager] 📂 Found ${projectDirs.length} project directories:`, projectDirs);
            
            for (const projectDir of projectDirs) {
                const projectPath = path.join(this.claudeDataPath, projectDir);
                const stat = await fs.stat(projectPath);
                
                if (stat.isDirectory()) {
                    const sessionFiles = await fs.readdir(projectPath);
                    console.log(`Project ${projectDir} has files:`, sessionFiles);
                    
                    for (const sessionFile of sessionFiles) {
                        // 🆕 DUAL FILE SUPPORT: Process both .jsonl files and .summary.json files
                        if (sessionFile.endsWith('.jsonl')) {
                            const sessionPath = path.join(projectPath, sessionFile);
                            console.log(`Processing LOCAL conversation file: ${sessionPath}`);
                            const summary = await this.getConversationSummary(sessionPath, projectDir);
                            if (summary) {
                                conversations.push(summary);
                                this.cacheSummary(summary, 'local'); // Cache the summary
                                console.log(`Added LOCAL conversation: ${summary.projectName} - ${summary.messageCount} messages`);
                            } else {
                                console.log(`Failed to parse local conversation: ${sessionPath}`);
                            }
                        } else if (sessionFile.endsWith('.summary.json')) {
                            // 📝 Process cloud-synced summary files
                            const summaryPath = path.join(projectPath, sessionFile);
                            console.log(`[ConversationManager] 📝 Processing CLOUD SUMMARY file: ${summaryPath}`);
                            try {
                                const summary = await this.getCloudSummary(summaryPath, projectDir);
                                if (summary) {
                                    // Only add if we don't already have the full conversation
                                    const sessionId = summary.sessionId;
                                    const hasFullConversation = conversations.some(c => c.sessionId === sessionId);
                                    if (!hasFullConversation) {
                                        conversations.push(summary);
                                        this.cacheSummary(summary, 'cloud'); // Cache the cloud summary
                                        console.log(`[ConversationManager] 📝 ✅ Added CLOUD SUMMARY: ${summary.projectName} - ${summary.messageCount} messages (from cloud)`);
                                    } else {
                                        console.log(`[ConversationManager] 📝 ⚠️ Skipping cloud summary for ${sessionId} - full conversation already loaded`);
                                    }
                                } else {
                                    console.warn(`[ConversationManager] 📝 ❌ Failed to parse cloud summary: ${summaryPath}`);
                                }
                            } catch (cloudSummaryError) {
                                console.error(`[ConversationManager] 📝 ❌ Error processing cloud summary ${summaryPath}:`, cloudSummaryError);
                            }
                        }
                    }
                }
            }

            // Sort by start time, newest first
            conversations.sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
            
            console.log(`Total conversations loaded: ${conversations.length}`);
            console.log('Conversation summaries:', conversations.map(c => `${c.projectName} (${c.messageCount} msgs)`));
            
            return conversations;
        } catch (error) {
            console.error('Error getting available conversations:', error);
            vscode.window.showErrorMessage(`Failed to load conversations: ${error}`);
            return [];
        }
    }

    private async getConversationSummary(filePath: string, projectDir: string): Promise<ConversationSummary | null> {
        try {
            let sessionId = path.basename(filePath, '.jsonl');
            const projectName = this.extractProjectName(projectDir);
            
            // Read first and last few lines to get summary info
            const content = await fs.readFile(filePath, 'utf8');
            const lines = content.trim().split('\n').filter(line => line.trim());
            
            if (lines.length === 0) {
                return null;
            }

            let firstMessage: ConversationMessage;
            let lastMessage: ConversationMessage;
            
            try {
                firstMessage = JSON.parse(lines[0]) as ConversationMessage;
                lastMessage = lines.length > 1 ? JSON.parse(lines[lines.length - 1]) as ConversationMessage : firstMessage;
                
                // Use actual session ID from message content, not filename
                if (firstMessage.sessionId) {
                    sessionId = firstMessage.sessionId;
                }
            } catch (parseError) {
                console.error(`Failed to parse message JSON in ${filePath}:`, parseError);
                return null;
            }
            
            // Find chronological start and end times  
            const allMessages = [];
            for (const line of lines) {
                try {
                    const msg = JSON.parse(line);
                    if (msg.timestamp && !isNaN(new Date(msg.timestamp).getTime())) {
                        allMessages.push(msg);
                    }
                } catch (e) {
                    // Skip invalid messages
                }
            }
            
            let startTime: string;
            let endTime: string;
            
            if (allMessages.length > 0) {
                const sortedByTime = allMessages.sort((a, b) => 
                    new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
                );
                startTime = sortedByTime[0].timestamp;
                endTime = sortedByTime[sortedByTime.length - 1].timestamp;
                
                // Ensure end >= start
                if (new Date(endTime) < new Date(startTime)) {
                    endTime = startTime;
                }
            } else {
                // Fallback
                startTime = firstMessage.timestamp || new Date().toISOString();
                endTime = startTime;
            }
            
            const duration = this.calculateDuration(startTime, endTime);
            
            console.log(`Conversation ${sessionId}:`, {
                file: path.basename(filePath),
                startTime,
                endTime,
                duration,
                messageCount: lines.length,
                validTimestamps: allMessages.length
            });
            
            return {
                sessionId,
                projectPath: projectDir,
                projectName,
                startTime,
                endTime,
                messageCount: lines.length,
                duration,
                filePath,
                firstMessage: this.extractMessageText(firstMessage),
                lastMessage: this.extractMessageText(lastMessage)
            };
        } catch (error) {
            console.error(`Error parsing conversation summary for ${filePath}:`, error);
            return null;
        }
    }

    /**
     * 🆕 Get conversation summary from cloud-synced summary files
     * Processes .summary.json files created by cloud sync
     */
    private async getCloudSummary(summaryPath: string, projectDir: string): Promise<ConversationSummary | null> {
        try {
            console.log(`[ConversationManager] 📝 Processing cloud summary: ${summaryPath}`);
            
            // Read and parse the summary JSON file
            const content = await fs.readFile(summaryPath, 'utf8');
            const cloudSummary = JSON.parse(content);
            
            console.log(`[ConversationManager] 📝 Cloud summary data:`, {
                sessionId: cloudSummary.sessionId,
                messageCount: cloudSummary.messageCount,
                isFromCloud: cloudSummary.isFromCloud,
                syncedAt: cloudSummary.cloudMetadata?.syncedAt
            });
            
            // Validate required fields
            if (!cloudSummary.sessionId || !cloudSummary.startTime || cloudSummary.messageCount === undefined) {
                console.error(`[ConversationManager] 📝 ❌ Invalid cloud summary structure in ${summaryPath}`);
                return null;
            }
            
            // Convert cloud summary to ConversationSummary format
            const conversationSummary: ConversationSummary = {
                sessionId: cloudSummary.sessionId,
                projectPath: cloudSummary.projectPath || projectDir,
                projectName: cloudSummary.projectName || this.extractProjectName(projectDir),
                startTime: cloudSummary.startTime,
                endTime: cloudSummary.endTime || cloudSummary.startTime,
                messageCount: cloudSummary.messageCount,
                duration: cloudSummary.duration || this.calculateDuration(cloudSummary.startTime, cloudSummary.endTime || cloudSummary.startTime),
                filePath: cloudSummary.filePath || path.join(path.dirname(summaryPath), `${cloudSummary.sessionId}.jsonl`),
                firstMessage: cloudSummary.firstMessage,
                lastMessage: cloudSummary.lastMessage,
                // Add cloud-specific metadata
                isFromCloud: true,
                cloudSyncMetadata: cloudSummary.cloudMetadata
            };
            
            console.log(`[ConversationManager] 📝 ✅ Successfully parsed cloud summary for ${cloudSummary.sessionId}`);
            return conversationSummary;
            
        } catch (error) {
            console.error(`[ConversationManager] 📝 ❌ Error parsing cloud summary ${summaryPath}:`, error);
            return null;
        }
    }

    private extractProjectName(projectDir: string): string {
        // Convert encoded path back to readable name
        const decoded = decodeURIComponent(projectDir.replace(/-/g, '/'));
        const segments = decoded.split('/');
        return segments[segments.length - 1] || 'Unknown Project';
    }

    private extractMessageText(message: ConversationMessage): string {
        // Handle missing or invalid message structure
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
        return 'No text content';
    }

    private calculateDuration(startTime: string, endTime: string): string {
        const start = new Date(startTime);
        const end = new Date(endTime);
        const durationMs = end.getTime() - start.getTime();
        
        const minutes = Math.floor(durationMs / 60000);
        const hours = Math.floor(minutes / 60);
        
        if (hours > 0) {
            return `${hours}h ${minutes % 60}m`;
        } else {
            return `${minutes}m`;
        }
    }

    async loadConversation(filePath: string): Promise<ConversationSession | null> {
        try {
            // filePath is already the absolute path from getConversationSummary
            const content = await fs.readFile(filePath, 'utf8');
            const lines = content.trim().split('\n').filter(line => line.trim());
            
            if (lines.length === 0) {
                return null;
            }

            const messages: ConversationMessage[] = [];
            for (const line of lines) {
                try {
                    const message = JSON.parse(line) as ConversationMessage;
                    messages.push(message);
                } catch (parseError) {
                    console.warn('Failed to parse message line:', parseError);
                }
            }

            if (messages.length === 0) {
                return null;
            }

            const firstMessage = messages[0];
            const lastMessage = messages[messages.length - 1];

            // Extract session ID from message content, fallback to filename
            let sessionId = path.basename(filePath, '.jsonl');
            if (firstMessage.sessionId) {
                sessionId = firstMessage.sessionId;
            }
            
            // Find actual start and end times (chronologically)
            const validMessages = messages.filter(m => m.timestamp && !isNaN(new Date(m.timestamp).getTime()));
            
            if (validMessages.length === 0) {
                // Fallback if no valid timestamps
                const now = new Date().toISOString();
                return {
                    sessionId,
                    projectPath: firstMessage.cwd || '',
                    startTime: now,
                    endTime: now,
                    messageCount: messages.length,
                    filePath: filePath,
                    messages
                };
            }
            
            const sortedMessages = [...validMessages].sort((a, b) => 
                new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
            );
            
            const startTime = sortedMessages[0].timestamp;
            const endTime = sortedMessages[sortedMessages.length - 1].timestamp;
            
            // Ensure end time is not before start time (for ongoing conversations)
            const startDate = new Date(startTime);
            const endDate = new Date(endTime);
            
            const finalEndTime = endDate >= startDate ? endTime : startTime;

            return {
                sessionId,
                projectPath: firstMessage.cwd || '',
                startTime,
                endTime: finalEndTime,
                messageCount: messages.length,
                filePath: filePath,
                messages
            };
        } catch (error) {
            console.error(`Error loading conversation from ${filePath}:`, error);
            vscode.window.showErrorMessage(`Failed to load conversation: ${error}`);
            return null;
        }
    }

    async filterConversations(conversations: ConversationSummary[], filter: ConversationFilter): Promise<ConversationSummary[]> {
        return conversations.filter(conv => {
            // Filter by project path
            if (filter.projectPath && !conv.projectPath.includes(filter.projectPath)) {
                return false;
            }

            // Filter by date range
            if (filter.dateFrom && new Date(conv.startTime) < filter.dateFrom) {
                return false;
            }
            if (filter.dateTo && new Date(conv.startTime) > filter.dateTo) {
                return false;
            }

            // Filter by search text
            if (filter.searchText) {
                const searchLower = filter.searchText.toLowerCase();
                return conv.projectName.toLowerCase().includes(searchLower) ||
                       conv.firstMessage?.toLowerCase().includes(searchLower) ||
                       conv.lastMessage?.toLowerCase().includes(searchLower);
            }

            return true;
        });
    }

    updateDataPath(newPath: string): void {
        this.claudeDataPath = sanitizePath(newPath);
        // Clear cache when data path changes
        this.summaryCache.clear();
    }

    /**
     * Get conversations from cache only (fast tree view loading)
     */
    getCachedConversations(): ConversationSummary[] {
        return this.summaryCache.getAll();
    }

    /**
     * Load conversation with progressive enhancement
     * Returns cached summary immediately, loads full conversation in background
     */
    async loadConversationProgressive(sessionId: string): Promise<{
        summary: ConversationSummary | null;
        fullConversation: Promise<ConversationSession | null>;
    }> {
        // Get summary from cache first
        const summary = this.summaryCache.get(sessionId);
        
        // Start loading full conversation in background
        const fullConversation = this.loadConversationById(sessionId);
        
        return {
            summary,
            fullConversation
        };
    }

    /**
     * Load full conversation by session ID
     */
    private async loadConversationById(sessionId: string): Promise<ConversationSession | null> {
        // Find the conversation file
        const summary = this.summaryCache.get(sessionId);
        if (summary && summary.filePath) {
            return this.loadConversation(summary.filePath);
        }

        // If not in cache, search through all project directories
        try {
            const projectDirs = await fs.readdir(this.claudeDataPath);
            
            for (const projectDir of projectDirs) {
                const projectPath = path.join(this.claudeDataPath, projectDir);
                const stat = await fs.stat(projectPath);
                
                if (stat.isDirectory()) {
                    const jsonlPath = path.join(projectPath, `${sessionId}.jsonl`);
                    if (await fs.pathExists(jsonlPath)) {
                        return this.loadConversation(jsonlPath);
                    }
                }
            }
        } catch (error) {
            console.error(`Error searching for conversation ${sessionId}:`, error);
        }

        return null;
    }

    /**
     * Invalidate cache for a specific file
     */
    private invalidateCacheForFile(filePath: string): void {
        const fileName = path.basename(filePath);
        
        if (fileName.endsWith('.jsonl')) {
            // Extract session ID from .jsonl file
            const sessionId = path.basename(fileName, '.jsonl');
            this.summaryCache.delete(sessionId);
            console.log(`[ConversationManager] 🗑️ Invalidated cache for session: ${sessionId}`);
        } else if (fileName.endsWith('.summary.json')) {
            // Extract session ID from .summary.json file
            const sessionId = path.basename(fileName, '.summary.json');
            this.summaryCache.delete(sessionId);
            console.log(`[ConversationManager] 🗑️ Invalidated cache for summary: ${sessionId}`);
        }
    }

    /**
     * Cache a conversation summary (called after loading from files)
     */
    protected cacheSummary(summary: ConversationSummary, source: 'local' | 'cloud' = 'local'): void {
        this.summaryCache.set(summary.sessionId, summary, source);
    }

    /**
     * Get cache statistics for monitoring
     */
    getCacheStats() {
        return this.summaryCache.getStats();
    }

    /**
     * Force refresh of all conversations (bypass cache)
     */
    async refreshAllConversations(): Promise<ConversationSummary[]> {
        this.summaryCache.clear();
        return this.getAvailableConversations(false);
    }
}