import * as vscode from 'vscode';
import { CcusageService } from '../services/CcusageService';
import { loggers } from '../utils/Logger';

export interface TokenWindowData {
    currentUsage: number;
    currentPercentage: number;
    projectedUsage: number;
    projectedPercentage: number;
    limit: number;
    windowStart: Date;
    windowEnd: Date;
    resetTime: Date;
    status: 'ok' | 'warning' | 'critical';
    projection: {
        totalTokens: number;
        totalCost: number;
        remainingMinutes: number;
    };
    burnRate: {
        tokensPerMinute: number;
        tokensPerHour: number;
        costPerHour: number;
    };
    windowId: string;
    isActive: boolean;
    timeElapsed: number;
    timeRemaining: number;
}

interface SubscriptionInfo {
    tier: string;
    estimatedLimit: number;
    confidence: 'low' | 'medium' | 'high';
}

interface DisplayData {
    currentProgressBar: string;
    currentUsageText: string;
    currentPercentageText: string;
    projectedProgressBar: string;
    projectedUsageText: string;
    projectedPercentageText: string;
    windowTimeText: string;
    timeRemainingText: string;
    burnRateText: string;
    statusIcon: string;
    projectionText: string;
}

/**
 * Real-time token window usage monitor for Claude Code 5-hour billing blocks
 * Provides percentage-based usage tracking with limits and reset times
 */
export class TokenWindowMonitor {
    private static instance: TokenWindowMonitor;
    private logger = loggers.tokenWindow;
    private updateInterval: NodeJS.Timeout | null = null;
    private updateFrequency = 30000; // 30 seconds
    private onDataUpdatedEmitter = new vscode.EventEmitter<TokenWindowData>();
    public readonly onDataUpdated = this.onDataUpdatedEmitter.event;
    private ccusageService = CcusageService.getInstance();

    public static getInstance(): TokenWindowMonitor {
        if (!TokenWindowMonitor.instance) {
            TokenWindowMonitor.instance = new TokenWindowMonitor();
        }
        return TokenWindowMonitor.instance;
    }

    /**
     * Start real-time monitoring with automatic updates
     */
    public startMonitoring(): void {
        if (this.updateInterval) {
            return; // Already monitoring
        }

        // Initial fetch
        this.fetchWindowData();

        // Set up periodic updates
        this.updateInterval = setInterval(() => {
            this.fetchWindowData();
        }, this.updateFrequency);

        this.logger.info('Token window monitoring started');
    }

    /**
     * Stop monitoring
     */
    public stopMonitoring(): void {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
            this.logger.info('Token window monitoring stopped');
        }
    }

    /**
     * Get current active token window data
     */
    public async getCurrentWindow(): Promise<TokenWindowData | null> {
        try {
            const result = await this.ccusageService.executeCcusage('blocks --active --token-limit max --json');
            const data = JSON.parse(result);

            if (!data.blocks || data.blocks.length === 0) {
                return null;
            }

            const activeBlock = data.blocks.find((block: any) => block.isActive) || data.blocks[0];
            return this.parseBlockData(activeBlock);
        } catch (error) {
            this.logger.error('Failed to get current window data:', error);
            return null;
        }
    }

    /**
     * Get formatted display data for UI components
     */
    public formatForDisplay(data: TokenWindowData): DisplayData {
        // Current usage display
        const currentProgressBar = this.createProgressBar(data.currentPercentage);
        const currentPercentageText = `${data.currentPercentage.toFixed(1)}%`;
        const currentUsageText = `${this.formatTokenCount(data.currentUsage)} / ${this.formatTokenCount(data.limit)} tokens`;

        // Projected usage display
        const projectedProgressBar = this.createProgressBar(data.projectedPercentage);
        const projectedPercentageText = `${data.projectedPercentage.toFixed(1)}%`;
        const projectedUsageText = `${this.formatTokenCount(data.projectedUsage)} / ${this.formatTokenCount(data.limit)} tokens (projected)`;

        // Time window display
        const windowTimeText = this.formatTimeWindow(data.windowStart, data.windowEnd);
        const timeRemainingText = this.formatTimeRemaining(data.timeRemaining);

        // Burn rate display
        const burnRateText = `${this.formatTokenCount(data.burnRate.tokensPerHour)}/hour (${this.formatTokenCount(data.burnRate.tokensPerMinute)}/min)`;

        // Status icon based on projected usage
        const statusIcon = this.getStatusIcon(data.status);

        // Enhanced projection text with limit breach timing
        let projectionText = 'No projection available';
        if (data.burnRate.tokensPerMinute > 0) {
            const remainingTokensToLimit = data.limit - data.currentUsage;
            const minutesToLimit = remainingTokensToLimit / data.burnRate.tokensPerMinute;

            if (minutesToLimit > 0 && minutesToLimit <= data.timeRemaining) {
                // Will hit limit before window ends
                const limitReachedTime = new Date(Date.now() + (minutesToLimit * 60 * 1000));
                const timeString = limitReachedTime.toLocaleTimeString('en-US', {
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: true
                });

                const hoursToLimit = Math.floor(minutesToLimit / 60);
                const minsToLimit = Math.round(minutesToLimit % 60);

                if (hoursToLimit > 0) {
                    projectionText = `⚠️ Limit reached in ${hoursToLimit}h ${minsToLimit}m (at ${timeString})`;
                } else {
                    projectionText = `⚠️ Limit reached in ${minsToLimit}m (at ${timeString})`;
                }
            } else if (data.projection.remainingMinutes > 0) {
                // Won't hit limit, show end-of-window projection
                projectionText = `✅ Safe: ${this.formatTokenCount(data.projection.totalTokens)} total by window end, $${data.projection.totalCost.toFixed(2)} cost`;
            }
        }

        return {
            currentProgressBar,
            currentUsageText,
            currentPercentageText,
            projectedProgressBar,
            projectedUsageText,
            projectedPercentageText,
            windowTimeText,
            timeRemainingText,
            burnRateText,
            statusIcon,
            projectionText
        };
    }

    /**
     * Get subscription tier information from usage patterns
     */
    public async getSubscriptionInfo(): Promise<SubscriptionInfo> {
        try {
            const windowData = await this.getCurrentWindow();
            if (!windowData) {
                return { tier: 'unknown', estimatedLimit: 0, confidence: 'low' };
            }

            // Estimate tier based on token limits
            const limit = windowData.limit;

            if (limit >= 40000000) { // 40M+ tokens suggests Max tier
                return {
                    tier: 'Max',
                    estimatedLimit: limit,
                    confidence: 'high'
                };
            } else if (limit >= 8000000) { // 8M+ tokens suggests Pro tier
                return {
                    tier: 'Pro',
                    estimatedLimit: limit,
                    confidence: 'medium'
                };
            } else if (limit > 0) {
                return {
                    tier: 'Free',
                    estimatedLimit: limit,
                    confidence: 'medium'
                };
            }

            return { tier: 'unknown', estimatedLimit: 0, confidence: 'low' };
        } catch (error) {
            this.logger.error('Failed to get subscription info:', error);
            return { tier: 'unknown', estimatedLimit: 0, confidence: 'low' };
        }
    }

    private async fetchWindowData(): Promise<void> {
        try {
            const windowData = await this.getCurrentWindow();
            if (windowData) {
                this.onDataUpdatedEmitter.fire(windowData);
            } else {
                // Fire a null/error state so UI can show appropriate message
                this.onDataUpdatedEmitter.fire(null as any);
            }
        } catch (error) {
            this.logger.error('Error fetching window data:', error);
            // Fire a null/error state so UI can show appropriate message
            this.onDataUpdatedEmitter.fire(null as any);
        }
    }

    private parseSimpleData(dayData: any): TokenWindowData {
        const currentUsage = dayData?.totalTokens || 0;
        const totalCost = dayData?.totalCost || 0;
        
        // Estimate limits based on typical Claude usage patterns
        // Free tier: ~100K tokens, Pro: ~500K tokens per month
        const estimatedLimit = totalCost > 0 ? 500000 : 100000; // Rough estimation
        
        const currentPercentage = estimatedLimit > 0 ? (currentUsage / estimatedLimit) * 100 : 0;
        const projectedUsage = currentUsage; // For daily data, current = projected
        const projectedPercentage = currentPercentage;

        // Create date ranges (daily window)
        const today = new Date();
        const windowStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        const windowEnd = new Date(windowStart);
        windowEnd.setDate(windowEnd.getDate() + 1);
        
        // Next reset is tomorrow
        const resetTime = new Date(windowEnd);
        
        const status: 'ok' | 'warning' | 'critical' = 
            currentPercentage > 90 ? 'critical' :
            currentPercentage > 70 ? 'warning' : 'ok';

        const timeElapsed = Date.now() - windowStart.getTime();
        const timeRemaining = windowEnd.getTime() - Date.now();
        const remainingMinutes = Math.max(0, Math.floor(timeRemaining / (1000 * 60)));

        return {
            currentUsage,
            currentPercentage,
            projectedUsage,
            projectedPercentage,
            limit: estimatedLimit,
            windowStart,
            windowEnd,
            resetTime,
            status,
            projection: {
                totalTokens: projectedUsage,
                totalCost: totalCost,
                remainingMinutes
            },
            burnRate: {
                tokensPerMinute: timeElapsed > 0 ? currentUsage / (timeElapsed / (1000 * 60)) : 0,
                tokensPerHour: timeElapsed > 0 ? currentUsage / (timeElapsed / (1000 * 60 * 60)) : 0,
                costPerHour: timeElapsed > 0 ? totalCost / (timeElapsed / (1000 * 60 * 60)) : 0
            },
            windowId: dayData?.date || today.toISOString().split('T')[0],
            isActive: true,
            timeElapsed: timeElapsed,
            timeRemaining: timeRemaining
        };
    }

    private parseBlockData(block: any): TokenWindowData {
        const currentUsage = block.totalTokens || 0;
        const limit = block.tokenLimitStatus?.limit || 0;
        const projectedUsage = block.projection?.totalTokens || currentUsage;

        // Calculate current and projected percentages
        const currentPercentage = limit > 0 ? (currentUsage / limit) * 100 : 0;
        const projectedPercentage = limit > 0 ? (projectedUsage / limit) * 100 : 0;

        // Parse time information
        const windowStart = new Date(block.startTime);
        const windowEnd = new Date(block.endTime);
        const resetTime = windowEnd;
        const now = new Date();

        // Calculate time elapsed and remaining
        const totalWindowMinutes = Math.round((windowEnd.getTime() - windowStart.getTime()) / (1000 * 60));
        const elapsedMinutes = Math.round((now.getTime() - windowStart.getTime()) / (1000 * 60));
        const remainingMinutes = Math.max(0, Math.round((windowEnd.getTime() - now.getTime()) / (1000 * 60)));

        // Determine status based on projected percentage (what matters for billing)
        let status: 'ok' | 'warning' | 'critical' = 'ok';
        if (projectedPercentage >= 90) {
            status = 'critical';
        } else if (projectedPercentage >= 75) {
            status = 'warning';
        }

        return {
            currentUsage,
            currentPercentage,
            projectedUsage,
            projectedPercentage,
            limit,
            windowStart,
            windowEnd,
            resetTime,
            status,
            projection: {
                totalTokens: block.projection?.totalTokens || 0,
                totalCost: block.projection?.totalCost || 0,
                remainingMinutes: block.projection?.remainingMinutes || 0
            },
            burnRate: {
                tokensPerMinute: block.burnRate?.tokensPerMinute || 0,
                tokensPerHour: (block.burnRate?.tokensPerMinute || 0) * 60,
                costPerHour: block.burnRate?.costPerHour || 0
            },
            windowId: block.id,
            isActive: block.isActive || false,
            timeElapsed: elapsedMinutes,
            timeRemaining: remainingMinutes
        };
    }

    private createProgressBar(percentage: number, width: number = 20): string {
        const filled = Math.round((percentage / 100) * width);
        const empty = width - filled;

        let barChar = '█';
        let emptyChar = '░';

        // Use different colors for different status levels
        if (percentage >= 90) {
            barChar = '🔴'; // Critical
        } else if (percentage >= 75) {
            barChar = '🟡'; // Warning
        } else {
            barChar = '🟢'; // OK
        }

        return barChar.repeat(Math.max(0, filled)) + emptyChar.repeat(Math.max(0, empty));
    }

    private formatTokenCount(tokens: number): string {
        if (tokens >= 1000000) {
            return `${(tokens / 1000000).toFixed(1)}M`;
        } else if (tokens >= 1000) {
            return `${(tokens / 1000).toFixed(1)}K`;
        }
        return tokens.toString();
    }

    private getStatusIcon(status: string): string {
        switch (status) {
            case 'critical': return '🔴';
            case 'warning': return '🟡';
            case 'ok': return '🟢';
            default: return '⚪';
        }
    }

    /**
     * Format time window with start and end times
     */
    private formatTimeWindow(start: Date, end: Date): string {
        const formatTime = (date: Date): string => {
            return date.toLocaleTimeString('en-US', {
                hour: 'numeric',
                minute: '2-digit',
                hour12: true,
                timeZoneName: 'short'
            });
        };

        const startTime = formatTime(start);
        const endTime = formatTime(end);

        return `Started at ${startTime}, resets at ${endTime}`;
    }

    /**
     * Format time remaining in a readable format
     */
    private formatTimeRemaining(minutes: number): string {
        if (minutes <= 0) {
            return 'Window expired';
        }

        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;

        if (hours > 0) {
            return `${hours}h ${mins}m remaining`;
        } else {
            return `${mins}m remaining`;
        }
    }

    /**
     * Clear cached data from ccusage service
     */
    public clearCache(): void {
        this.ccusageService.clearCache();
    }

    /**
     * Dispose resources
     */
    public dispose(): void {
        this.stopMonitoring();
        this.onDataUpdatedEmitter.dispose();
    }
}