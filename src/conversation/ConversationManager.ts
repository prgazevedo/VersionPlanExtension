import * as vscode from 'vscode';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';
import { ConversationMessage, ConversationSession, ConversationSummary, ConversationFilter } from './types';
import { sanitizePath } from '../security';

export class ConversationManager {
    private claudeDataPath: string;

    constructor(private context: vscode.ExtensionContext) {
        // Default Claude data path - can be overridden by configuration
        this.claudeDataPath = this.getDefaultClaudeDataPath();
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
                return conversations;
            }

            const projectDirs = await fs.readdir(this.claudeDataPath);
            
            for (const projectDir of projectDirs) {
                const projectPath = path.join(this.claudeDataPath, projectDir);
                const stat = await fs.stat(projectPath);
                
                if (stat.isDirectory()) {
                    const sessionFiles = await fs.readdir(projectPath);
                    
                    for (const sessionFile of sessionFiles) {
                        if (sessionFile.endsWith('.jsonl')) {
                            const sessionPath = path.join(projectPath, sessionFile);
                            const summary = await this.getConversationSummary(sessionPath, projectDir);
                            if (summary) {
                                conversations.push(summary);
                            }
                        }
                    }
                }
            }

            // Sort by start time, newest first
            conversations.sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
            
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

            const firstMessage = JSON.parse(lines[0]) as ConversationMessage;
            const lastMessage = lines.length > 1 ? JSON.parse(lines[lines.length - 1]) as ConversationMessage : firstMessage;
            
            const startTime = firstMessage.timestamp;
            const endTime = lastMessage.timestamp;
            const duration = this.calculateDuration(startTime, endTime);
            
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
            const fullPath = path.join(this.claudeDataPath, filePath);
            const content = await fs.readFile(fullPath, 'utf8');
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

            return {
                sessionId: firstMessage.sessionId,
                projectPath: firstMessage.cwd || '',
                startTime: firstMessage.timestamp,
                endTime: lastMessage.timestamp,
                messageCount: messages.length,
                filePath: fullPath,
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