import * as vscode from 'vscode';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';
import { ConversationMessage } from './conversation/types';
import { sanitizePath } from './security';

export interface UsageStatistics {
    totalTokens: number;
    totalCost: number;
    operationCount: number;
    lastUpdated: string;
    totalInputTokens: number;
    totalOutputTokens: number;
    totalCacheCreationTokens: number;
    totalCacheReadTokens: number;
    dailyUsage: DailyUsage[];
    weeklyUsage: WeeklyUsage[];
    monthlyUsage: MonthlyUsage[];
}

export interface DailyUsage {
    date: string;
    tokens: number;
    cost: number;
    operations: number;
}

export interface WeeklyUsage {
    weekStart: string;
    weekEnd: string;
    tokens: number;
    cost: number;
    operations: number;
}

export interface MonthlyUsage {
    month: string;
    year: number;
    tokens: number;
    cost: number;
    operations: number;
}

export interface TokenUsageEvent {
    timestamp: string;
    operation: string;
    inputTokens: number;
    outputTokens: number;
    cacheCreationTokens: number;
    cacheReadTokens: number;
    totalTokens: number;
    totalCost: number;
    projectPath?: string;
    conversationId?: string;
    serviceTier?: string;
}

export interface ConversationUsageSummary {
    conversationId: string;
    totalTokens: number;
    totalCost: number;
    messageCount: number;
    inputTokens: number;
    outputTokens: number;
    cacheCreationTokens: number;
    cacheReadTokens: number;
    firstMessageTime: string;
    lastMessageTime: string;
}

export class TokenTracker {
    private static instance: TokenTracker;
    private usageFilePath: string;
    private statistics: UsageStatistics;
    private claudeDataPath: string;
    private fileWatcher: vscode.FileSystemWatcher | undefined;
    private conversationUsage: Map<string, ConversationUsageSummary> = new Map();
    
    // 2025 Claude pricing rates per million tokens
    private readonly pricing = {
        inputTokens: 15.0,      // $15 per million
        outputTokens: 75.0,     // $75 per million  
        cacheCreation: 18.75,   // $18.75 per million
        cacheRead: 1.50         // $1.50 per million
    };

    private constructor(private context: vscode.ExtensionContext) {
        this.usageFilePath = path.join(context.globalStorageUri.fsPath, 'claude-usage-stats.json');
        this.claudeDataPath = this.getClaudeDataPath();
        this.statistics = this.initializeStatistics();
        this.loadStatistics();
        this.setupFileWatcher();
        // Delay initial scan to avoid race condition with ConversationManager
        setTimeout(() => {
            this.scanExistingConversations();
        }, 2000);
    }

    public static getInstance(context?: vscode.ExtensionContext): TokenTracker {
        if (!TokenTracker.instance && context) {
            TokenTracker.instance = new TokenTracker(context);
        }
        
        if (!TokenTracker.instance) {
            throw new Error('TokenTracker not initialized. Call getInstance with context first.');
        }
        
        return TokenTracker.instance;
    }

    private getClaudeDataPath(): string {
        const config = vscode.workspace.getConfiguration('claude-config');
        const customPath = config.get<string>('conversationDataPath');
        
        if (customPath) {
            return sanitizePath(customPath);
        }

        return path.join(os.homedir(), '.claude', 'projects');
    }

    private setupFileWatcher() {
        try {
            const watchPattern = path.join(this.claudeDataPath, '**', '*.jsonl');
            this.fileWatcher = vscode.workspace.createFileSystemWatcher(watchPattern);
            
            this.fileWatcher.onDidChange(async (uri) => {
                await this.processConversationFile(uri.fsPath);
            });
            
            this.context.subscriptions.push(this.fileWatcher);
        } catch (error) {
            console.warn('Failed to setup file watcher for Claude conversations:', error);
        }
    }

    private async scanExistingConversations(): Promise<void> {
        try {
            console.log('TokenTracker: Scanning existing conversations at:', this.claudeDataPath);
            
            if (!await fs.pathExists(this.claudeDataPath)) {
                console.log('TokenTracker: Claude data path does not exist:', this.claudeDataPath);
                return;
            }

            const projectDirs = await fs.readdir(this.claudeDataPath);
            console.log('TokenTracker: Found project directories:', projectDirs);
            
            for (const projectDir of projectDirs) {
                const projectPath = path.join(this.claudeDataPath, projectDir);
                const stat = await fs.stat(projectPath);
                
                if (stat.isDirectory()) {
                    const sessionFiles = await fs.readdir(projectPath);
                    console.log(`TokenTracker: Project ${projectDir} has files:`, sessionFiles);
                    
                    for (const sessionFile of sessionFiles) {
                        if (sessionFile.endsWith('.jsonl')) {
                            const sessionPath = path.join(projectPath, sessionFile);
                            console.log(`TokenTracker: Processing conversation file: ${sessionPath}`);
                            await this.processConversationFile(sessionPath);
                        }
                    }
                }
            }
            
            console.log('TokenTracker: Finished scanning. Current stats:', this.statistics);
        } catch (error) {
            console.warn('Failed to scan existing conversations:', error);
        }
    }

    private async processConversationFile(filePath: string): Promise<void> {
        try {
            const content = await fs.readFile(filePath, 'utf8');
            const lines = content.trim().split('\n').filter(line => line.trim());
            
            console.log(`TokenTracker: Processing ${lines.length} lines from ${path.basename(filePath)}`);
            
            let processedCount = 0;
            for (const line of lines) {
                try {
                    const message: ConversationMessage = JSON.parse(line);
                    const usage = this.extractUsageFromMessage(message);
                    
                    if (usage) {
                        await this.trackUsage(usage);
                        processedCount++;
                    }
                } catch (parseError) {
                    // Skip invalid JSON lines
                }
            }
            
            console.log(`TokenTracker: Processed ${processedCount} usage events from ${path.basename(filePath)}`);
        } catch (error) {
            console.warn(`Failed to process conversation file ${filePath}:`, error);
        }
    }

    private extractUsageFromMessage(message: ConversationMessage): TokenUsageEvent | null {
        // Check if message has usage data
        if (!message.message?.usage || !message.timestamp) {
            return null;
        }

        const usage = message.message.usage;
        const inputTokens = usage.input_tokens || 0;
        const outputTokens = usage.output_tokens || 0;
        const cacheCreationTokens = usage.cache_creation_input_tokens || 0;
        const cacheReadTokens = usage.cache_read_input_tokens || 0;
        const totalTokens = inputTokens + outputTokens + cacheCreationTokens + cacheReadTokens;
        
        if (totalTokens === 0) {
            return null; // Skip messages with no token usage
        }
        
        const totalCost = this.calculateDetailedCost(inputTokens, outputTokens, cacheCreationTokens, cacheReadTokens);
        
        console.log(`TokenTracker: Extracted usage - ${totalTokens} tokens ($${totalCost.toFixed(4)}) from message ${message.uuid}`);
        
        return {
            timestamp: message.timestamp,
            operation: 'claude_code_usage',
            inputTokens,
            outputTokens,
            cacheCreationTokens,
            cacheReadTokens,
            totalTokens,
            totalCost,
            projectPath: message.cwd,
            conversationId: path.basename(message.conversationId || '', '.jsonl'),
            serviceTier: usage.service_tier
        };
    }

    private calculateDetailedCost(inputTokens: number, outputTokens: number, cacheCreationTokens: number, cacheReadTokens: number): number {
        const inputCost = (inputTokens / 1000000) * this.pricing.inputTokens;
        const outputCost = (outputTokens / 1000000) * this.pricing.outputTokens;
        const cacheCreationCost = (cacheCreationTokens / 1000000) * this.pricing.cacheCreation;
        const cacheReadCost = (cacheReadTokens / 1000000) * this.pricing.cacheRead;
        
        return inputCost + outputCost + cacheCreationCost + cacheReadCost;
    }

    private initializeStatistics(): UsageStatistics {
        return {
            totalTokens: 0,
            totalCost: 0,
            operationCount: 0,
            lastUpdated: new Date().toISOString(),
            totalInputTokens: 0,
            totalOutputTokens: 0,
            totalCacheCreationTokens: 0,
            totalCacheReadTokens: 0,
            dailyUsage: [],
            weeklyUsage: [],
            monthlyUsage: []
        };
    }

    private async loadStatistics(): Promise<void> {
        try {
            await fs.ensureDir(path.dirname(this.usageFilePath));
            
            if (await fs.pathExists(this.usageFilePath)) {
                const data = await fs.readJSON(this.usageFilePath);
                this.statistics = { ...this.initializeStatistics(), ...data };
            }
        } catch (error) {
            console.warn('Failed to load usage statistics:', error);
            this.statistics = this.initializeStatistics();
        }
    }

    private async saveStatistics(): Promise<void> {
        try {
            await fs.ensureDir(path.dirname(this.usageFilePath));
            await fs.writeJSON(this.usageFilePath, this.statistics, { spaces: 2 });
        } catch (error) {
            console.error('Failed to save usage statistics:', error);
        }
    }

    public async trackUsage(event: TokenUsageEvent): Promise<void> {
        if (!this.isTrackingEnabled()) {
            return;
        }

        // Check if we've already processed this usage event
        const eventKey = `${event.conversationId}-${event.timestamp}`;
        if (this.hasProcessedEvent(eventKey)) {
            return;
        }
        this.markEventProcessed(eventKey);

        // Update totals
        this.statistics.totalTokens += event.totalTokens;
        this.statistics.totalCost += event.totalCost;
        this.statistics.operationCount += 1;
        this.statistics.lastUpdated = event.timestamp;
        this.statistics.totalInputTokens += event.inputTokens;
        this.statistics.totalOutputTokens += event.outputTokens;
        this.statistics.totalCacheCreationTokens += event.cacheCreationTokens;
        this.statistics.totalCacheReadTokens += event.cacheReadTokens;

        // Update daily usage
        this.updateDailyUsage(event);
        
        // Update weekly usage
        this.updateWeeklyUsage(event);
        
        // Update monthly usage
        this.updateMonthlyUsage(event);

        // Update conversation-specific usage
        if (event.conversationId) {
            this.updateConversationUsage(event);
        }

        await this.saveStatistics();

        // Show notification if enabled and it's a new usage event
        if (this.isNotificationEnabled() && event.operation === 'claude_code_usage') {
            this.showUsageNotification(event);
        }
    }

    private processedEvents = new Set<string>();
    
    private hasProcessedEvent(eventKey: string): boolean {
        return this.processedEvents.has(eventKey);
    }

    private updateConversationUsage(event: TokenUsageEvent): void {
        const conversationId = event.conversationId!;
        let conversationSummary = this.conversationUsage.get(conversationId);
        
        if (!conversationSummary) {
            conversationSummary = {
                conversationId,
                totalTokens: 0,
                totalCost: 0,
                messageCount: 0,
                inputTokens: 0,
                outputTokens: 0,
                cacheCreationTokens: 0,
                cacheReadTokens: 0,
                firstMessageTime: event.timestamp,
                lastMessageTime: event.timestamp
            };
            this.conversationUsage.set(conversationId, conversationSummary);
        }
        
        // Update usage totals
        conversationSummary.totalTokens += event.totalTokens;
        conversationSummary.totalCost += event.totalCost;
        conversationSummary.messageCount += 1;
        conversationSummary.inputTokens += event.inputTokens;
        conversationSummary.outputTokens += event.outputTokens;
        conversationSummary.cacheCreationTokens += event.cacheCreationTokens;
        conversationSummary.cacheReadTokens += event.cacheReadTokens;
        
        // Update time range
        if (new Date(event.timestamp) < new Date(conversationSummary.firstMessageTime)) {
            conversationSummary.firstMessageTime = event.timestamp;
        }
        if (new Date(event.timestamp) > new Date(conversationSummary.lastMessageTime)) {
            conversationSummary.lastMessageTime = event.timestamp;
        }
    }
    
    private markEventProcessed(eventKey: string): void {
        this.processedEvents.add(eventKey);
        // Keep only recent events to prevent memory bloat
        if (this.processedEvents.size > 10000) {
            const eventsArray = Array.from(this.processedEvents);
            this.processedEvents.clear();
            eventsArray.slice(-5000).forEach(key => this.processedEvents.add(key));
        }
    }

    private updateDailyUsage(event: TokenUsageEvent): void {
        const date = new Date(event.timestamp).toISOString().split('T')[0];
        let dailyEntry = this.statistics.dailyUsage.find(d => d.date === date);
        
        if (!dailyEntry) {
            dailyEntry = { date, tokens: 0, cost: 0, operations: 0 };
            this.statistics.dailyUsage.push(dailyEntry);
        }
        
        dailyEntry.tokens += event.totalTokens;
        dailyEntry.cost += event.totalCost;
        dailyEntry.operations += 1;

        // Keep only last 30 days
        this.statistics.dailyUsage = this.statistics.dailyUsage
            .sort((a, b) => b.date.localeCompare(a.date))
            .slice(0, 30);
    }

    private updateWeeklyUsage(event: TokenUsageEvent): void {
        const eventDate = new Date(event.timestamp);
        const weekStart = this.getWeekStart(eventDate);
        const weekEnd = this.getWeekEnd(weekStart);
        
        const weekStartStr = weekStart.toISOString().split('T')[0];
        const weekEndStr = weekEnd.toISOString().split('T')[0];
        
        let weeklyEntry = this.statistics.weeklyUsage.find(w => w.weekStart === weekStartStr);
        
        if (!weeklyEntry) {
            weeklyEntry = { 
                weekStart: weekStartStr, 
                weekEnd: weekEndStr, 
                tokens: 0, 
                cost: 0, 
                operations: 0 
            };
            this.statistics.weeklyUsage.push(weeklyEntry);
        }
        
        weeklyEntry.tokens += event.totalTokens;
        weeklyEntry.cost += event.totalCost;
        weeklyEntry.operations += 1;

        // Keep only last 12 weeks
        this.statistics.weeklyUsage = this.statistics.weeklyUsage
            .sort((a, b) => b.weekStart.localeCompare(a.weekStart))
            .slice(0, 12);
    }

    private updateMonthlyUsage(event: TokenUsageEvent): void {
        const eventDate = new Date(event.timestamp);
        const month = eventDate.toLocaleString('default', { month: 'long' });
        const year = eventDate.getFullYear();
        
        let monthlyEntry = this.statistics.monthlyUsage.find(m => 
            m.month === month && m.year === year
        );
        
        if (!monthlyEntry) {
            monthlyEntry = { month, year, tokens: 0, cost: 0, operations: 0 };
            this.statistics.monthlyUsage.push(monthlyEntry);
        }
        
        monthlyEntry.tokens += event.totalTokens;
        monthlyEntry.cost += event.totalCost;
        monthlyEntry.operations += 1;

        // Keep only last 12 months
        this.statistics.monthlyUsage = this.statistics.monthlyUsage
            .sort((a, b) => {
                if (a.year !== b.year) return b.year - a.year;
                return new Date(`${b.month} 1, ${b.year}`).getTime() - 
                       new Date(`${a.month} 1, ${a.year}`).getTime();
            })
            .slice(0, 12);
    }

    private getWeekStart(date: Date): Date {
        const d = new Date(date);
        const day = d.getDay();
        const diff = d.getDate() - day;
        return new Date(d.setDate(diff));
    }

    private getWeekEnd(weekStart: Date): Date {
        const d = new Date(weekStart);
        d.setDate(d.getDate() + 6);
        return d;
    }

    public dispose(): void {
        if (this.fileWatcher) {
            this.fileWatcher.dispose();
        }
    }

    private showUsageNotification(event: TokenUsageEvent): void {
        const tokenBreakdown = [];
        if (event.inputTokens > 0) tokenBreakdown.push(`${event.inputTokens} input`);
        if (event.outputTokens > 0) tokenBreakdown.push(`${event.outputTokens} output`);
        if (event.cacheCreationTokens > 0) tokenBreakdown.push(`${event.cacheCreationTokens} cache`);
        if (event.cacheReadTokens > 0) tokenBreakdown.push(`${event.cacheReadTokens} read`);
        
        const message = `Claude Usage: ${event.totalTokens} tokens (${tokenBreakdown.join(', ')}) | Cost: $${event.totalCost.toFixed(4)}`;
        vscode.window.showInformationMessage(message, 'View Stats').then(selection => {
            if (selection === 'View Stats') {
                vscode.commands.executeCommand('claude-config.viewUsageStats');
            }
        });
    }

    public getStatistics(): UsageStatistics {
        return { ...this.statistics };
    }

    public async resetStatistics(): Promise<void> {
        this.statistics = this.initializeStatistics();
        this.processedEvents.clear();
        this.conversationUsage.clear();
        await this.saveStatistics();
        vscode.window.showInformationMessage('Usage statistics have been reset.');
    }

    public getConversationUsage(conversationId: string): ConversationUsageSummary | undefined {
        return this.conversationUsage.get(conversationId);
    }

    public getAllConversationUsage(): ConversationUsageSummary[] {
        return Array.from(this.conversationUsage.values());
    }

    private isTrackingEnabled(): boolean {
        const config = vscode.workspace.getConfiguration('claude-config');
        return config.get<boolean>('tokenTrackingEnabled', true);
    }

    private isNotificationEnabled(): boolean {
        const config = vscode.workspace.getConfiguration('claude-config');
        return config.get<boolean>('showUsageNotifications', true);
    }

    // Legacy methods for backward compatibility - now just log the operations
    public async trackConversationView(conversationId: string, messageCount: number): Promise<void> {
        // Real usage tracking happens automatically via file watching
        console.log(`Conversation viewed: ${conversationId} (${messageCount} messages)`);
    }

    public async trackConversationExport(conversationId: string, messageCount: number, format: string): Promise<void> {
        // Real usage tracking happens automatically via file watching
        console.log(`Conversation exported: ${conversationId} (${messageCount} messages, ${format} format)`);
    }

    public async trackSyncOperation(projectPath?: string): Promise<void> {
        // Real usage tracking happens automatically via file watching
        console.log(`Sync operation: ${projectPath || 'unknown project'}`);
    }

    public async trackClaudeMdEdit(projectPath?: string): Promise<void> {
        // Real usage tracking happens automatically via file watching
        console.log(`CLAUDE.md edited: ${projectPath || 'unknown project'}`);
    }
}