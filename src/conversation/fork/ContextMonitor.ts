import * as vscode from 'vscode';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';
import { ForkAnalyzer } from './ForkAnalyzer';
import { TokenCalculator } from './TokenCalculator';
import { ConversationTree, ForkAnalysisResult } from './types';
import { ConversationMessage } from '../types';

export interface ContextAlert {
    level: 'info' | 'warning' | 'critical';
    message: string;
    action?: string;
    actionCommand?: string;
    actionArgs?: any[];
    dismissible: boolean;
}

export interface ContextUsageState {
    currentTokens: number;
    contextLimit: number;
    usagePercentage: number;
    approaching: boolean;
    critical: boolean;
    lastUpdated: Date;
    activeConversation?: string;
    suggestedActions: string[];
}

export class ContextMonitor {
    private analyzer: ForkAnalyzer;
    private currentState: ContextUsageState;
    private watchers: Map<string, vscode.FileSystemWatcher> = new Map();
    private alertHistory: Set<string> = new Set();
    private onStateChangedEmitter = new vscode.EventEmitter<ContextUsageState>();
    public onStateChanged = this.onStateChangedEmitter.event;

    constructor(private context: vscode.ExtensionContext) {
        this.analyzer = new ForkAnalyzer();
        this.currentState = this.getInitialState();
        // Don't start monitoring automatically - will be coordinated with ConversationManager
    }

    /**
     * Get initial state
     */
    private getInitialState(): ContextUsageState {
        return {
            currentTokens: 0,
            contextLimit: 200000, // Default Claude-3.5-Sonnet limit
            usagePercentage: 0,
            approaching: false,
            critical: false,
            lastUpdated: new Date(),
            suggestedActions: []
        };
    }

    /**
     * Start monitoring using ConversationManager events (no duplicate file watchers)
     */
    setupWithConversationManager(conversationManager: any): void {
        // Listen to conversation changes instead of creating duplicate watchers
        conversationManager.onConversationsChanged(() => {
            this.handleConversationChanges();
        });
        
        console.log('[ContextMonitor] Setup with ConversationManager - no duplicate file watchers');
    }

    /**
     * Handle conversation changes from ConversationManager
     */
    private async handleConversationChanges(): Promise<void> {
        // Update context analysis when conversations change
        await this.analyzeActiveConversations();
    }

    /**
     * Analyze active conversations for context usage
     */
    private async analyzeActiveConversations(): Promise<void> {
        try {
            // Get the most recent conversation files
            const config = vscode.workspace.getConfiguration('claude-config');
            const conversationPath = config.get<string>('conversationDataPath') || path.join(os.homedir(), '.claude', 'projects');
            
            if (await fs.pathExists(conversationPath)) {
                const files = await fs.readdir(conversationPath);
                const jsonlFiles = files.filter(f => f.endsWith('.jsonl'));
                
                if (jsonlFiles.length > 0) {
                    // Analyze the most recent file
                    const mostRecent = jsonlFiles
                        .map(f => ({ name: f, path: path.join(conversationPath, f) }))
                        .sort((a, b) => {
                            try {
                                const statA = fs.statSync(a.path);
                                const statB = fs.statSync(b.path);
                                return statB.mtime.getTime() - statA.mtime.getTime();
                            } catch {
                                return 0;
                            }
                        })[0];
                    
                    if (mostRecent) {
                        await this.handleConversationChange(mostRecent.path);
                    }
                }
            }
        } catch (error) {
            console.error('[ContextMonitor] Error analyzing active conversations:', error);
        }
    }

    /**
     * Start monitoring Claude conversation directories (REMOVED - use setupWithConversationManager instead)
     * This method is deprecated and should not be used to prevent duplicate file watchers.
     */
    private async startMonitoring(): Promise<void> {
        console.log('[ContextMonitor] startMonitoring() is deprecated - using ConversationManager coordination instead');
        // INTENTIONALLY EMPTY - All monitoring is now handled via setupWithConversationManager()
        // to prevent duplicate file watchers that cause panel conflicts
    }

    /**
     * Monitor a specific directory for conversation changes (REMOVED - use ConversationManager events instead)
     * This method is deprecated and should not be used to prevent duplicate file watchers.
     */
    private async monitorDirectory(dirPath: string): Promise<void> {
        console.log('[ContextMonitor] monitorDirectory() is deprecated - using ConversationManager coordination instead');
        // INTENTIONALLY EMPTY - All monitoring is now handled via setupWithConversationManager()
        // to prevent duplicate file watchers that cause panel conflicts
    }

    /**
     * Find all conversation files in a directory
     */
    private async findConversationFiles(dirPath: string): Promise<string[]> {
        const files: string[] = [];
        
        try {
            const entries = await fs.readdir(dirPath, { withFileTypes: true });
            
            for (const entry of entries) {
                const fullPath = path.join(dirPath, entry.name);
                
                if (entry.isDirectory()) {
                    const subFiles = await this.findConversationFiles(fullPath);
                    files.push(...subFiles);
                } else if (entry.name.endsWith('.jsonl')) {
                    files.push(fullPath);
                }
            }
        } catch (error) {
            // Directory might not exist or be inaccessible
        }
        
        return files;
    }

    /**
     * Handle conversation file changes
     */
    private async handleConversationChange(filePath: string): Promise<void> {
        try {
            // Debounce rapid changes
            const debounceKey = `change-${filePath}`;
            if (this.alertHistory.has(debounceKey)) {
                return;
            }
            this.alertHistory.add(debounceKey);
            setTimeout(() => this.alertHistory.delete(debounceKey), 2000);

            console.log(`[ContextMonitor] Analyzing conversation change: ${path.basename(filePath)}`);
            
            const analysis = await this.analyzer.analyzeConversationFile(filePath);
            await this.updateContextState(analysis, filePath);
            
        } catch (error) {
            console.error('[ContextMonitor] Error handling conversation change:', error);
        }
    }

    /**
     * Update context state based on analysis
     */
    private async updateContextState(analysis: ForkAnalysisResult, filePath: string): Promise<void> {
        const totalTokens = this.calculateTotalActiveTokens(analysis);
        const contextLimit = this.getContextLimit();
        const usagePercentage = (totalTokens / contextLimit) * 100;
        const approaching = usagePercentage >= 70; // 70% threshold
        const critical = usagePercentage >= 90; // 90% threshold

        const newState: ContextUsageState = {
            currentTokens: totalTokens,
            contextLimit,
            usagePercentage,
            approaching,
            critical,
            lastUpdated: new Date(),
            activeConversation: path.basename(filePath),
            suggestedActions: this.generateSuggestions(analysis, usagePercentage)
        };

        // Check if we should show alerts
        await this.checkAndShowAlerts(this.currentState, newState, analysis);

        this.currentState = newState;
        this.onStateChangedEmitter.fire(newState);
    }

    /**
     * Calculate total tokens from active branches
     */
    private calculateTotalActiveTokens(analysis: ForkAnalysisResult): number {
        let total = 0;
        
        for (const fork of analysis.tree.forks) {
            for (const branch of fork.branches) {
                if (branch.isActive) {
                    total += branch.tokenCount;
                }
            }
        }
        
        // Add main path tokens that aren't in forks
        total += analysis.tokenDistribution.mainPath;
        
        return total;
    }

    /**
     * Get context limit based on configuration or detection
     */
    private getContextLimit(): number {
        const config = vscode.workspace.getConfiguration('claude-config');
        return config.get<number>('contextWindowLimit') || 200000; // Default to Claude-3.5-Sonnet
    }

    /**
     * Generate suggested actions based on analysis
     */
    private generateSuggestions(analysis: ForkAnalysisResult, usagePercentage: number): string[] {
        const suggestions: string[] = [];
        
        if (usagePercentage > 60) {
            suggestions.push('Consider pruning inactive conversation branches');
        }
        
        if (analysis.tokenDistribution.abandonedBranches > 10000) {
            suggestions.push(`Save ${this.formatTokenCount(analysis.tokenDistribution.abandonedBranches)} tokens by removing abandoned branches`);
        }
        
        if (analysis.forkCount > 2) {
            suggestions.push('Multiple forks detected - review and consolidate conversation paths');
        }
        
        if (usagePercentage > 80) {
            suggestions.push('Context approaching limit - immediate action recommended');
        }
        
        return suggestions;
    }

    /**
     * Check and show context alerts
     */
    private async checkAndShowAlerts(oldState: ContextUsageState, newState: ContextUsageState, analysis: ForkAnalysisResult): Promise<void> {
        // Don't spam alerts
        if (newState.lastUpdated.getTime() - oldState.lastUpdated.getTime() < 10000) {
            return;
        }

        // Critical threshold crossed
        if (!oldState.critical && newState.critical) {
            await this.showAlert({
                level: 'critical',
                message: `🚨 Context critically full! ${newState.usagePercentage.toFixed(1)}% used (${this.formatTokenCount(newState.currentTokens)}/${this.formatTokenCount(newState.contextLimit)})`,
                action: 'Open Fork Manager',
                actionCommand: 'claude-config.loadConversationForForkAnalysis',
                dismissible: false
            });
        }
        // Warning threshold crossed
        else if (!oldState.approaching && newState.approaching && !newState.critical) {
            const savings = analysis.tokenDistribution.abandonedBranches;
            await this.showAlert({
                level: 'warning',
                message: `⚠️ Context ${newState.usagePercentage.toFixed(1)}% full. ${savings > 0 ? `Save ${this.formatTokenCount(savings)} tokens by pruning branches.` : 'Consider managing conversation forks.'}`,
                action: savings > 0 ? 'Prune Branches' : 'Manage Forks',
                actionCommand: 'claude-config.loadConversationForForkAnalysis',
                dismissible: true
            });
        }
        // Significant token savings available
        else if (analysis.tokenDistribution.abandonedBranches > 50000) {
            const alertKey = `savings-${Math.floor(analysis.tokenDistribution.abandonedBranches / 10000)}`;
            if (!this.alertHistory.has(alertKey)) {
                this.alertHistory.add(alertKey);
                await this.showAlert({
                    level: 'info',
                    message: `💡 ${this.formatTokenCount(analysis.tokenDistribution.abandonedBranches)} tokens can be saved by pruning unused branches`,
                    action: 'Optimize Now',
                    actionCommand: 'claude-config.loadConversationForForkAnalysis',
                    dismissible: true
                });
            }
        }
    }

    /**
     * Show context alert to user
     */
    private async showAlert(alert: ContextAlert): Promise<void> {
        const options = alert.dismissible ? [alert.action || 'OK', 'Dismiss'] : [alert.action || 'OK'];
        
        let result: string | undefined;
        if (alert.level === 'critical') {
            result = await vscode.window.showErrorMessage(alert.message, { modal: !alert.dismissible }, ...options);
        } else if (alert.level === 'warning') {
            result = await vscode.window.showWarningMessage(alert.message, ...options);
        } else {
            result = await vscode.window.showInformationMessage(alert.message, ...options);
        }

        // Execute action if user clicked the action button
        if (result === alert.action && alert.actionCommand) {
            await vscode.commands.executeCommand(alert.actionCommand, ...(alert.actionArgs || []));
        }
    }

    /**
     * Get current context state
     */
    getCurrentState(): ContextUsageState {
        return { ...this.currentState };
    }

    /**
     * Force refresh of context monitoring
     */
    async refresh(): Promise<void> {
        try {
            // Find and analyze the most recent conversation
            const claudeDir = path.join(os.homedir(), '.claude', 'projects');
            const files = await this.findConversationFiles(claudeDir);
            
            if (files.length > 0) {
                const sorted = files.sort((a, b) => 
                    fs.statSync(b).mtime.getTime() - fs.statSync(a).mtime.getTime()
                );
                await this.handleConversationChange(sorted[0]);
            }
        } catch (error) {
            console.error('[ContextMonitor] Error during refresh:', error);
        }
    }

    /**
     * Analyze specific conversation file
     */
    async analyzeConversation(filePath: string): Promise<ForkAnalysisResult | null> {
        try {
            return await this.analyzer.analyzeConversationFile(filePath);
        } catch (error) {
            console.error('[ContextMonitor] Error analyzing conversation:', error);
            return null;
        }
    }

    /**
     * Format token count for display
     */
    private formatTokenCount(tokens: number): string {
        if (tokens >= 1000000) {
            return `${(tokens / 1000000).toFixed(1)}M`;
        } else if (tokens >= 1000) {
            return `${(tokens / 1000).toFixed(1)}K`;
        } else {
            return tokens.toString();
        }
    }

    /**
     * Dispose of resources
     */
    dispose(): void {
        for (const watcher of this.watchers.values()) {
            watcher.dispose();
        }
        this.watchers.clear();
        this.onStateChangedEmitter.dispose();
    }
}