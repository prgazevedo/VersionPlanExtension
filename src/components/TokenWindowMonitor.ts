import * as vscode from 'vscode';
import { CcusageService } from '../services/CcusageService';
import { loggers } from '../utils/Logger';

/**
 * Token counts breakdown from ccusage
 */
export interface TokenCounts {
    inputTokens: number;
    outputTokens: number;
    cacheCreationInputTokens: number;
    cacheReadInputTokens: number;
}

/**
 * Burn rate information from ccusage
 */
export interface BurnRate {
    tokensPerMinute: number;
    tokensPerMinuteForIndicator: number;
    costPerHour: number;
}

/**
 * Projection data from ccusage
 */
export interface Projection {
    totalTokens: number;
    totalCost: number;
    remainingMinutes: number;
}

/**
 * Token window data matching ccusage blocks --active --json output
 */
export interface TokenWindowData {
    id: string;
    startTime: Date;
    endTime: Date;
    actualEndTime: Date;
    isActive: boolean;
    isGap: boolean;
    entries: number;
    tokenCounts: TokenCounts;
    totalTokens: number;
    costUSD: number;
    models: string[];
    burnRate?: BurnRate;
    projection?: Projection;
}

interface DisplayData {
    // Basic info
    totalTokensText: string;
    totalCostText: string;
    windowTimeText: string;
    timeRemainingText: string;
    modelsText: string;
    entriesText: string;

    // Token breakdown
    inputTokensText: string;
    outputTokensText: string;
    cacheCreationText: string;
    cacheReadText: string;

    // Burn rate
    burnRateText?: string;
    costPerHourText?: string;

    // Projection
    projectionText?: string;
    projectedCostText?: string;
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
            this.logger.debug('Executing ccusage blocks command...');
            const result = await this.ccusageService.executeCcusage('blocks --active --json --breakdown');
            this.logger.debug('ccusage command executed, result length:', result.length);
            this.logger.debug('First 200 chars of result:', result.substring(0, 200));

            // EMERGENCY FIX: Strip any non-JSON lines (like "[ccusage] ⚙ No valid configuration file found")
            const lines = result.split('\n');
            // Look for line starting with { (object) or [ followed by whitespace/newline (array, not [ccusage])
            const jsonStartIndex = lines.findIndex(line => {
                const trimmed = line.trim();
                return trimmed.startsWith('{') || (trimmed.startsWith('[') && (trimmed.length === 1 || trimmed[1] === '\n' || trimmed[1] === ' ' || trimmed[1] === '\r'));
            });
            const cleanResult = jsonStartIndex >= 0 ? lines.slice(jsonStartIndex).join('\n') : result;

            let data;
            try {
                data = JSON.parse(cleanResult);
                this.logger.debug('Parsed JSON data successfully');

            } catch (parseError) {
                this.logger.error('JSON PARSE FAILED! Clean result was:', cleanResult);
                this.logger.error('Parse error:', parseError);
                throw parseError;
            }
            if (!data.blocks || data.blocks.length === 0) {
                this.logger.warn('No blocks found in ccusage response');
                return null;
            }

            const activeBlock = data.blocks.find((block: any) => block.isActive) || data.blocks[0];
            this.logger.debug('Found active block:', activeBlock);

            const windowData = this.parseBlockData(activeBlock);
            this.logger.debug('Parsed window data successfully');
            return windowData;
        } catch (error) {
            this.logger.error('Failed to get current window data:', error);
            if (error instanceof Error) {
                this.logger.error('Error stack:', error.stack);
            }
            return null;
        }
    }

    /**
     * Estimate subscription tier based on usage patterns
     */
    private estimateSubscriptionTier(data: TokenWindowData): string {
        // Check if using premium models (Opus, Sonnet 4)
        const models = data.models.join(' ').toLowerCase();
        const usingPremiumModels = models.includes('opus') || models.includes('sonnet-4');

        // High token usage suggests Pro tier
        const highUsage = data.totalTokens > 1000000; // 1M+ tokens in 5 hours

        if (usingPremiumModels || highUsage) {
            return 'Claude Pro';
        }

        return 'Claude Free';
    }

    /**
     * Get formatted display data for UI components
     */
    public formatForDisplay(data: TokenWindowData): DisplayData {
        // Basic info
        const totalTokensText = `${this.formatTokenCount(data.totalTokens)} total`;
        const totalCostText = `$${data.costUSD.toFixed(2)}`;
        const subscriptionTier = this.estimateSubscriptionTier(data);
        const windowTimeText = this.formatTimeWindow(data.startTime, data.endTime);

        // Time remaining
        const now = new Date();
        const remainingMs = data.endTime.getTime() - now.getTime();
        const remainingMinutes = Math.max(0, Math.floor(remainingMs / (1000 * 60)));
        const timeRemainingText = this.formatTimeRemaining(remainingMinutes);

        const modelsText = data.models.length > 0 ? data.models.join(', ') : 'No models';
        const entriesText = `${data.entries} API calls`;

        // Token breakdown
        const inputTokensText = this.formatTokenCount(data.tokenCounts.inputTokens);
        const outputTokensText = this.formatTokenCount(data.tokenCounts.outputTokens);
        const cacheCreationText = this.formatTokenCount(data.tokenCounts.cacheCreationInputTokens);
        const cacheReadText = this.formatTokenCount(data.tokenCounts.cacheReadInputTokens);

        // Burn rate (if available)
        let burnRateText: string | undefined;
        let costPerHourText: string | undefined;
        if (data.burnRate) {
            burnRateText = `${this.formatTokenCount(Math.round(data.burnRate.tokensPerMinute))}/min`;
            costPerHourText = `$${data.burnRate.costPerHour.toFixed(2)}/hour`;
        }

        // Projection (if available)
        let projectionText: string | undefined;
        let projectedCostText: string | undefined;
        if (data.projection) {
            projectionText = `${this.formatTokenCount(data.projection.totalTokens)} (in ${data.projection.remainingMinutes}m)`;
            projectedCostText = `$${data.projection.totalCost.toFixed(2)}`;
        }

        return {
            totalTokensText,
            totalCostText,
            windowTimeText,
            timeRemainingText,
            modelsText,
            entriesText,
            inputTokensText,
            outputTokensText,
            cacheCreationText,
            cacheReadText,
            burnRateText,
            costPerHourText,
            projectionText,
            projectedCostText
        };
    }


    private async fetchWindowData(): Promise<void> {
        try {
            this.logger.debug('Fetching token window data...');
            const windowData = await this.getCurrentWindow();
            if (windowData) {
                this.logger.debug('Token window data fetched successfully');
                this.onDataUpdatedEmitter.fire(windowData);
            } else {
                this.logger.warn('No token window data available - ccusage returned no blocks');
                // Don't fire null - just skip this update
            }
        } catch (error) {
            this.logger.error('Error fetching window data:', error);
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.logger.error('Error details:', errorMessage);
            // Don't fire null - just skip this update
        }
    }


    private parseBlockData(block: any): TokenWindowData {
        // Parse all data from ccusage blocks --active --json output
        return {
            id: block.id || 'unknown',
            startTime: new Date(block.startTime),
            endTime: new Date(block.endTime),
            actualEndTime: new Date(block.actualEndTime),
            isActive: block.isActive || false,
            isGap: block.isGap || false,
            entries: block.entries || 0,
            tokenCounts: {
                inputTokens: block.tokenCounts?.inputTokens || 0,
                outputTokens: block.tokenCounts?.outputTokens || 0,
                cacheCreationInputTokens: block.tokenCounts?.cacheCreationInputTokens || 0,
                cacheReadInputTokens: block.tokenCounts?.cacheReadInputTokens || 0
            },
            totalTokens: block.totalTokens || 0,
            costUSD: block.costUSD || 0,
            models: Array.isArray(block.models) ? block.models : [],
            burnRate: block.burnRate ? {
                tokensPerMinute: block.burnRate.tokensPerMinute || 0,
                tokensPerMinuteForIndicator: block.burnRate.tokensPerMinuteForIndicator || 0,
                costPerHour: block.burnRate.costPerHour || 0
            } : undefined,
            projection: block.projection ? {
                totalTokens: block.projection.totalTokens || 0,
                totalCost: block.projection.totalCost || 0,
                remainingMinutes: block.projection.remainingMinutes || 0
            } : undefined
        };
    }

    private formatTokenCount(tokens: number): string {
        if (tokens >= 1000000) {
            return `${(tokens / 1000000).toFixed(1)}M`;
        } else if (tokens >= 1000) {
            return `${(tokens / 1000).toFixed(1)}K`;
        }
        return tokens.toString();
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