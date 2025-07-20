import * as vscode from 'vscode';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';
import { ConversationMessage, ConversationSession, ConversationSummary, ConversationFilter } from './types';
import { sanitizePath } from '../security';

export class ConversationManager {
    private claudeDataPath: string;
    private fileWatcher: vscode.FileSystemWatcher | undefined;
    private onConversationsChangedEmitter = new vscode.EventEmitter<void>();
    public onConversationsChanged = this.onConversationsChangedEmitter.event;

    constructor(private context: vscode.ExtensionContext) {
        // Default Claude data path - can be overridden by configuration
        this.claudeDataPath = this.getDefaultClaudeDataPath();
        this.setupFileWatcher();
    }

    private setupFileWatcher() {
        // Watch for changes in the Claude conversations directory
        const watchPattern = path.join(this.claudeDataPath, '**', '*.jsonl');
        this.fileWatcher = vscode.workspace.createFileSystemWatcher(watchPattern);
        
        this.fileWatcher.onDidCreate(() => this.onConversationsChangedEmitter.fire());
        this.fileWatcher.onDidChange(() => this.onConversationsChangedEmitter.fire());
        this.fileWatcher.onDidDelete(() => this.onConversationsChangedEmitter.fire());
        
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

    async getAvailableConversations(): Promise<ConversationSummary[]> {
        try {
            const conversations: ConversationSummary[] = [];
            
            if (!await fs.pathExists(this.claudeDataPath)) {
                console.log('Claude data path does not exist:', this.claudeDataPath);
                return conversations;
            }

            const projectDirs = await fs.readdir(this.claudeDataPath);
            console.log('Found project directories:', projectDirs);
            
            for (const projectDir of projectDirs) {
                const projectPath = path.join(this.claudeDataPath, projectDir);
                const stat = await fs.stat(projectPath);
                
                if (stat.isDirectory()) {
                    const sessionFiles = await fs.readdir(projectPath);
                    console.log(`Project ${projectDir} has files:`, sessionFiles);
                    
                    for (const sessionFile of sessionFiles) {
                        if (sessionFile.endsWith('.jsonl')) {
                            const sessionPath = path.join(projectPath, sessionFile);
                            console.log(`Processing conversation file: ${sessionPath}`);
                            const summary = await this.getConversationSummary(sessionPath, projectDir);
                            if (summary) {
                                conversations.push(summary);
                                console.log(`Added conversation: ${summary.projectName} - ${summary.messageCount} messages`);
                            } else {
                                console.log(`Failed to parse conversation: ${sessionPath}`);
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
            const sessionId = path.basename(filePath, '.jsonl');
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

            // Extract session ID from filename
            const sessionId = path.basename(filePath, '.jsonl');
            
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
    }
}