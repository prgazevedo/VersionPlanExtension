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

export interface UsageWindow {
    windowType: 'daily' | 'weekly' | 'rolling';
    startTime: string;
    endTime: string;
    usedTokens: number;
    estimatedLimit: number;
    percentageUsed: number;
    serviceTier: string;
    resetTime: string;
}

export interface UsageThresholds {
    warning: number; // 80%
    critical: number; // 95%
}

export interface ServiceTierLimits {
    tier: string;
    dailyLimit?: number;
    weeklyLimit?: number;
    description: string;
}

export interface UsageWindowStatistics {
    currentWeeklyWindow: UsageWindow;
    currentDailyWindow: UsageWindow;
    detectedServiceTier: string;
    customLimits?: {
        daily?: number;
        weekly?: number;
    };
    thresholds: UsageThresholds;
}

export class TokenTracker {
    private static instance: TokenTracker;
    private usageFilePath: string;
    private statistics: UsageStatistics;
    private claudeDataPath: string;
    private fileWatcher: vscode.FileSystemWatcher | undefined;
    private conversationUsage: Map<string, ConversationUsageSummary> = new Map();
    private usageWindowStats: UsageWindowStatistics | undefined;
    private detectedServiceTier: string = 'unknown';
    private serviceTierHistory: Map<string, number> = new Map(); // Track service tiers with timestamps
    private lastNotificationLevel: 'none' | 'warning' | 'critical' = 'none';
    private lastNotificationTime: number = 0;
    
    // 2025 Claude pricing rates per million tokens
    private readonly pricing = {
        inputTokens: 15.0,      // $15 per million
        outputTokens: 75.0,     // $75 per million  
        cacheCreation: 18.75,   // $18.75 per million
        cacheRead: 1.50         // $1.50 per million
    };

    // Service tier limits based on 2025 Claude usage model
    // NOTE: Claude uses session-based limits (5-hour windows), not strict weekly limits
    // Weekly limits are estimates for heavy users only
    private readonly serviceTierLimits: ServiceTierLimits[] = [
        { tier: 'free', dailyLimit: 250000, description: 'Free tier - ~50 messages/day' },
        { tier: 'pro', dailyLimit: 2000000, description: 'Pro ($20) - Session-based, ~45 messages/5h' },
        { tier: 'max-100', dailyLimit: 8000000, description: 'Max ($100) - Higher session limits' },
        { tier: 'max-200', dailyLimit: 12000000, description: 'Max ($200) - Highest session limits' },
        { tier: 'max-5x', dailyLimit: 50000000, description: 'Max 5X - Highest available limits' }
    ];

    // Default usage thresholds
    private readonly defaultThresholds: UsageThresholds = {
        warning: 80,
        critical: 95
    };

    // Helper function to ensure consistent cost rounding to 2 decimal places
    private roundCost(cost: number): number {
        return Math.round(cost * 100) / 100;
    }

    private constructor(private context: vscode.ExtensionContext) {
        this.usageFilePath = path.join(context.globalStorageUri.fsPath, 'claude-usage-stats.json');
        this.claudeDataPath = this.getClaudeDataPath();
        this.statistics = this.initializeStatistics();
        // Load statistics synchronously first, then setup async operations
        this.loadStatisticsSync();
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
        
        console.log(`TokenTracker: Extracted usage - ${totalTokens} tokens ($${totalCost.toFixed(2)}) from message ${message.uuid}`);
        
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
        
        const totalCost = inputCost + outputCost + cacheCreationCost + cacheReadCost;
        // Round to 2 decimal places to prevent floating-point precision issues
        return this.roundCost(totalCost);
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

    private loadStatisticsSync(): void {
        try {
            fs.ensureDirSync(path.dirname(this.usageFilePath));
            
            if (fs.pathExistsSync(this.usageFilePath)) {
                const data = fs.readJSONSync(this.usageFilePath);
                // Ensure loaded data has valid numbers, fallback to 0 for invalid values
                const sanitizedData = {
                    ...data,
                    totalTokens: Number(data.totalTokens) || 0,
                    totalCost: Number(data.totalCost) || 0,
                    operationCount: Number(data.operationCount) || 0,
                    totalInputTokens: Number(data.totalInputTokens) || 0,
                    totalOutputTokens: Number(data.totalOutputTokens) || 0,
                    totalCacheCreationTokens: Number(data.totalCacheCreationTokens) || 0,
                    totalCacheReadTokens: Number(data.totalCacheReadTokens) || 0,
                    dailyUsage: Array.isArray(data.dailyUsage) ? data.dailyUsage : [],
                    weeklyUsage: Array.isArray(data.weeklyUsage) ? data.weeklyUsage : [],
                    monthlyUsage: Array.isArray(data.monthlyUsage) ? data.monthlyUsage : []
                };
                this.statistics = { ...this.initializeStatistics(), ...sanitizedData };
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
        this.statistics.totalCost = this.roundCost(this.statistics.totalCost + event.totalCost);
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

        // Track service tier information
        if (event.serviceTier) {
            this.updateServiceTierHistory(event.serviceTier, event.timestamp);
        }

        // Check usage thresholds and show notifications if needed
        this.checkUsageThresholds();

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
        conversationSummary.totalCost = this.roundCost(conversationSummary.totalCost + event.totalCost);
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
        dailyEntry.cost = this.roundCost(dailyEntry.cost + event.totalCost);
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
        weeklyEntry.cost = this.roundCost(weeklyEntry.cost + event.totalCost);
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
        monthlyEntry.cost = this.roundCost(monthlyEntry.cost + event.totalCost);
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
        
        const message = `Claude Usage: ${event.totalTokens} tokens (${tokenBreakdown.join(', ')}) | Cost: $${event.totalCost.toFixed(2)}`;
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

    // ===============================
    // Usage Window Percentage Tracking
    // ===============================

    /**
     * Updates service tier history with timestamp
     */
    private updateServiceTierHistory(serviceTier: string, timestamp: string): void {
        const timestampMs = new Date(timestamp).getTime();
        this.serviceTierHistory.set(serviceTier, timestampMs);
        
        // Keep only recent entries (last 30 days)
        const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
        for (const [tier, time] of this.serviceTierHistory) {
            if (time < thirtyDaysAgo) {
                this.serviceTierHistory.delete(tier);
            }
        }
    }

    /**
     * Detects service tier - now relies on user configuration since automatic detection is unreliable
     */
    public detectServiceTier(): string {
        // Check user configuration first
        const config = vscode.workspace.getConfiguration('claude-config');
        const userSpecifiedTier = config.get<string>('serviceTier');
        
        if (userSpecifiedTier && ['free', 'pro', 'max-100', 'max-200', 'max-5x'].includes(userSpecifiedTier)) {
            this.detectedServiceTier = userSpecifiedTier;
            return userSpecifiedTier;
        }

        // Try to use actual service tier data from recent usage if available
        if (this.serviceTierHistory.size > 0) {
            let mostRecentTier = '';
            let mostRecentTime = 0;
            
            for (const [tier, timestamp] of this.serviceTierHistory) {
                if (timestamp > mostRecentTime) {
                    mostRecentTime = timestamp;
                    mostRecentTier = tier;
                }
            }
            
            if (mostRecentTier) {
                const normalizedTier = this.normalizeServiceTier(mostRecentTier);
                this.detectedServiceTier = normalizedTier;
                return normalizedTier;
            }
        }

        // Default to 'max-5x' as per user configuration
        // This avoids the 100% usage bug from wrong tier detection
        this.detectedServiceTier = 'max-5x';
        return 'max-5x';
    }
    
    /**
     * Normalizes Claude's internal service tier names to our standardized format
     */
    private normalizeServiceTier(claudeServiceTier: string): string {
        const tier = claudeServiceTier.toLowerCase();
        
        // Map Claude's service tier values to our standardized tiers
        if (tier.includes('free') || tier.includes('basic')) {
            return 'free';
        } else if (tier.includes('pro') || tier.includes('standard')) {
            return 'pro';
        } else if (tier.includes('max') || tier.includes('premium')) {
            // Try to detect which Max tier based on other signals
            // This is an area where we might need user feedback for accuracy
            const weeklyUsage = this.calculateWeeklyUsage(this.getWeekStart(new Date()).toISOString().split('T')[0]);
            if (weeklyUsage > 20000000) return 'max-5x';
            if (weeklyUsage > 4000000) return 'max-200';
            return 'max-100';
        }
        
        // Default to pro if unknown
        return 'pro';
    }


    /**
     * Gets the estimated limits for a service tier
     */
    public getServiceTierLimits(tier: string): ServiceTierLimits | undefined {
        return this.serviceTierLimits.find(limit => limit.tier === tier);
    }

    /**
     * Calculates current daily usage window (Claude uses session-based limits, but daily tracking is more practical)
     */
    public getCurrentWeeklyWindow(): UsageWindow {
        const now = new Date();
        const dayStart = new Date(now);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(now);
        dayEnd.setHours(23, 59, 59, 999);

        // Calculate tokens used today (Claude's limits are session-based, not weekly)
        const dayStartStr = dayStart.toISOString().split('T')[0];
        const dailyUsage = this.statistics.dailyUsage.find(day => day.date === dayStartStr);
        const usedTokens = dailyUsage?.tokens || 0;

        // Get tier limits - use daily limits since Claude doesn't really have weekly limits
        const tier = this.detectedServiceTier || this.detectServiceTier();
        const tierLimits = this.getServiceTierLimits(tier);
        const estimatedLimit = tierLimits?.dailyLimit || 2000000; // Default to Pro tier daily estimate

        // Calculate percentage - be more conservative to avoid false 100% readings
        const percentageUsed = estimatedLimit > 0 ? Math.min(100, (usedTokens / estimatedLimit) * 100) : 0;

        // Reset time is tomorrow at midnight (daily reset)
        const resetTime = new Date(dayEnd);
        resetTime.setDate(resetTime.getDate() + 1);
        resetTime.setHours(0, 0, 0, 0);

        return {
            windowType: 'rolling', // Changed from 'weekly' to reflect actual nature
            startTime: dayStart.toISOString(),
            endTime: dayEnd.toISOString(),
            usedTokens,
            estimatedLimit,
            percentageUsed: Math.max(0, Math.min(100, Math.round(percentageUsed * 100) / 100)),
            serviceTier: tier,
            resetTime: resetTime.toISOString()
        };
    }

    /**
     * Calculates current daily usage window
     */
    public getCurrentDailyWindow(): UsageWindow {
        const now = new Date();
        const dayStart = new Date(now);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(now);
        dayEnd.setHours(23, 59, 59, 999);

        // Calculate tokens used today
        const dayStartStr = dayStart.toISOString().split('T')[0];
        const dailyUsage = this.statistics.dailyUsage.find(day => day.date === dayStartStr);
        const usedTokens = dailyUsage?.tokens || 0;

        // Get tier limits
        const tier = this.detectedServiceTier || this.detectServiceTier();
        const tierLimits = this.getServiceTierLimits(tier);
        const estimatedLimit = tierLimits?.dailyLimit || 2000000; // Default to Pro tier daily estimate

        // Calculate percentage - handle division by zero
        const percentageUsed = estimatedLimit > 0 ? Math.min(100, (usedTokens / estimatedLimit) * 100) : 0;

        // Calculate reset time (tomorrow at midnight)
        const resetTime = new Date(dayEnd);
        resetTime.setDate(resetTime.getDate() + 1);
        resetTime.setHours(0, 0, 0, 0);

        return {
            windowType: 'daily',
            startTime: dayStart.toISOString(),
            endTime: dayEnd.toISOString(),
            usedTokens,
            estimatedLimit,
            percentageUsed: Math.max(0, Math.min(100, Math.round(percentageUsed * 100) / 100)),
            serviceTier: tier,
            resetTime: resetTime.toISOString()
        };
    }

    /**
     * Calculates weekly usage for a given week start
     */
    private calculateWeeklyUsage(weekStartStr: string): number {
        const weekStart = new Date(weekStartStr);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 6);
        weekEnd.setHours(23, 59, 59, 999);

        let totalTokens = 0;

        // Sum up daily usage for the week
        for (const dailyUsage of this.statistics.dailyUsage) {
            const usageDate = new Date(dailyUsage.date);
            if (usageDate >= weekStart && usageDate <= weekEnd) {
                totalTokens += dailyUsage.tokens;
            }
        }

        return totalTokens;
    }

    /**
     * Gets comprehensive usage window statistics
     */
    public getUsageWindowStatistics(): UsageWindowStatistics {
        const config = vscode.workspace.getConfiguration('claude-config');
        const customLimits = config.get<{daily?: number, weekly?: number}>('usageTracking.customLimits') || {};
        const thresholds = config.get<UsageThresholds>('usageTracking.warningThresholds') || this.defaultThresholds;

        const currentWeeklyWindow = this.getCurrentWeeklyWindow();
        const currentDailyWindow = this.getCurrentDailyWindow();

        // Apply custom limits if configured
        if (customLimits?.weekly) {
            currentWeeklyWindow.estimatedLimit = customLimits.weekly;
            currentWeeklyWindow.percentageUsed = Math.round((currentWeeklyWindow.usedTokens / customLimits.weekly) * 100 * 100) / 100;
        }
        if (customLimits?.daily) {
            currentDailyWindow.estimatedLimit = customLimits.daily;
            currentDailyWindow.percentageUsed = Math.round((currentDailyWindow.usedTokens / customLimits.daily) * 100 * 100) / 100;
        }

        this.usageWindowStats = {
            currentWeeklyWindow,
            currentDailyWindow,
            detectedServiceTier: this.detectedServiceTier || this.detectServiceTier(),
            customLimits,
            thresholds
        };

        return this.usageWindowStats;
    }

    /**
     * Gets usage percentage for current day (main feature - changed from weekly due to Claude's session-based model)
     */
    public getCurrentUsagePercentage(): number {
        try {
            const weeklyWindow = this.getCurrentWeeklyWindow(); // Actually daily now
            const percentage = weeklyWindow.percentageUsed;
            
            // Validate percentage is a valid number
            if (isNaN(percentage) || !isFinite(percentage)) {
                console.warn('Invalid percentage calculated:', percentage);
                return 0;
            }
            
            return Math.max(0, Math.min(100, percentage));
        } catch (error) {
            console.warn('Error calculating usage percentage:', error);
            return 0;
        }
    }

    /**
     * Checks if usage is above warning/critical thresholds
     */
    public getUsageStatus(): 'normal' | 'warning' | 'critical' {
        const percentage = this.getCurrentUsagePercentage();
        const config = vscode.workspace.getConfiguration('claude-config');
        const configThresholds = config.get<UsageThresholds>('usageTracking.warningThresholds');
        const thresholds = configThresholds || this.defaultThresholds;

        // Validate thresholds
        const warning = Math.max(0, Math.min(100, thresholds.warning || this.defaultThresholds.warning));
        const critical = Math.max(0, Math.min(100, thresholds.critical || this.defaultThresholds.critical));

        if (percentage >= critical) return 'critical';
        if (percentage >= warning) return 'warning';
        return 'normal';
    }

    /**
     * Gets time until usage window resets (daily reset)
     */
    public getTimeUntilReset(): { days: number, hours: number, minutes: number } {
        const dailyWindow = this.getCurrentWeeklyWindow(); // Actually daily window now
        const resetTime = new Date(dailyWindow.resetTime);
        const now = new Date();
        const diff = Math.max(0, resetTime.getTime() - now.getTime());

        // Handle case where reset time has passed (shouldn't happen but safety check)
        if (diff <= 0) {
            return { days: 0, hours: 0, minutes: 0 };
        }

        const days = Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
        const hours = Math.max(0, Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)));
        const minutes = Math.max(0, Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60)));

        return { days, hours, minutes };
    }

    /**
     * Checks usage thresholds and shows warning notifications
     */
    private checkUsageThresholds(): void {
        try {
            const percentage = this.getCurrentUsagePercentage();
            const usageStatus = this.getUsageStatus();
            const now = Date.now();
            
            // Don't spam notifications - at least 30 minutes between threshold notifications
            const minNotificationInterval = 30 * 60 * 1000; // 30 minutes
            const timeSinceLastNotification = now - this.lastNotificationTime;
            
            // Only notify if we've crossed a new threshold or enough time has passed
            if (timeSinceLastNotification < minNotificationInterval && 
                (usageStatus === this.lastNotificationLevel || usageStatus === 'normal')) {
                return;
            }
            
            let shouldNotify = false;
            let notificationLevel: 'none' | 'warning' | 'critical' = 'none';
            
            if (usageStatus === 'critical' && this.lastNotificationLevel !== 'critical') {
                shouldNotify = true;
                notificationLevel = 'critical';
            } else if (usageStatus === 'warning' && 
                      (this.lastNotificationLevel === 'none' || timeSinceLastNotification >= minNotificationInterval)) {
                shouldNotify = true;
                notificationLevel = 'warning';
            }
            
            if (shouldNotify && (usageStatus === 'warning' || usageStatus === 'critical')) {
                this.showUsageThresholdNotification(percentage, usageStatus);
                this.lastNotificationLevel = notificationLevel;
                this.lastNotificationTime = now;
            }
            
        } catch (error) {
            console.warn('Failed to check usage thresholds:', error);
        }
    }

    /**
     * Shows usage threshold warning notification
     */
    private showUsageThresholdNotification(percentage: number, status: 'warning' | 'critical'): void {
        const resetTime = this.getTimeUntilReset();
        const resetText = resetTime.days > 0 ? 
            `${resetTime.days}d ${resetTime.hours}h` : 
            `${resetTime.hours}h ${resetTime.minutes}m`;
        
        let title: string;
        let message: string;
        let actions: string[];
        
        if (status === 'critical') {
            title = '🚨 Claude Usage Critical!';
            message = `You've used ${percentage.toFixed(1)}% of estimated daily limit. Usage may be restricted.\nResets in: ${resetText}`;
            actions = ['View Details', 'OK'];
        } else {
            title = '⚠️ Claude Usage Warning';
            message = `You've used ${percentage.toFixed(1)}% of estimated daily limit. Consider monitoring your usage.\nResets in: ${resetText}`;
            actions = ['View Details', 'Dismiss'];
        }
        
        vscode.window.showWarningMessage(title + '\n' + message, ...actions).then(selection => {
            if (selection === 'View Details') {
                vscode.commands.executeCommand('claude-config.viewUsageStats');
            }
        });
    }

    /**
     * Manually trigger threshold check (useful for testing or forced updates)
     */
    public forceThresholdCheck(): void {
        this.lastNotificationTime = 0; // Reset to allow immediate notification
        this.checkUsageThresholds();
    }
}