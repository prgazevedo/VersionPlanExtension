import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';

/**
 * Model pricing configuration (as of 2025)
 * All prices are per million tokens
 */
const MODEL_PRICING: Record<string, {
    input: number;
    output: number;
    cacheWrite: number;
    cacheRead: number;
}> = {
    'claude-sonnet-4-5-20250929': {
        input: 3.00 / 1_000_000,        // $3 per MTok
        output: 15.00 / 1_000_000,      // $15 per MTok
        cacheWrite: 3.75 / 1_000_000,   // $3.75 per MTok
        cacheRead: 0.30 / 1_000_000     // $0.30 per MTok
    },
    'claude-opus-4-20250514': {
        input: 15.00 / 1_000_000,
        output: 75.00 / 1_000_000,
        cacheWrite: 18.75 / 1_000_000,
        cacheRead: 1.50 / 1_000_000
    },
    'claude-sonnet-3-5-20241022': {
        input: 3.00 / 1_000_000,
        output: 15.00 / 1_000_000,
        cacheWrite: 3.75 / 1_000_000,
        cacheRead: 0.30 / 1_000_000
    },
    'claude-3-5-sonnet-20240620': {
        input: 3.00 / 1_000_000,
        output: 15.00 / 1_000_000,
        cacheWrite: 3.75 / 1_000_000,
        cacheRead: 0.30 / 1_000_000
    },
    // Generic fallback for unknown models
    'default': {
        input: 3.00 / 1_000_000,
        output: 15.00 / 1_000_000,
        cacheWrite: 3.75 / 1_000_000,
        cacheRead: 0.30 / 1_000_000
    }
};

/**
 * Token usage data structure
 */
export interface TokenUsage {
    inputTokens: number;
    outputTokens: number;
    cacheCreationTokens: number;
    cacheReadTokens: number;
    totalTokens: number;
    cost: number;
}

/**
 * Usage statistics by time period
 */
export interface UsageStats {
    usage: TokenUsage;
    modelBreakdown: Record<string, TokenUsage>;
    conversationCount: number;
    startTime?: string;
    endTime?: string;
}

/**
 * JSONL message structure from Claude Code
 */
interface ClaudeMessage {
    message?: {
        model?: string;
        usage?: {
            input_tokens?: number;
            output_tokens?: number;
            cache_creation_input_tokens?: number;
            cache_read_input_tokens?: number;
            service_tier?: string;
        };
    };
    timestamp?: string;
    sessionId?: string;
    uuid?: string;
}

/**
 * Native usage calculator that reads JSONL files directly
 * Replaces external ccusage CLI with built-in JSONL parsing
 */
export class UsageCalculator {
    private dataPath: string;
    private cache: Map<string, UsageStats> = new Map();
    private cacheExpiry: Map<string, number> = new Map();
    private readonly CACHE_TTL = 30000; // 30 seconds like ccusage

    constructor(dataPath?: string) {
        this.dataPath = dataPath || path.join(os.homedir(), '.claude', 'projects');
    }

    /**
     * Get usage statistics for today
     */
    async getTodayUsage(): Promise<UsageStats> {
        const cacheKey = 'today';
        const cached = this.getCached(cacheKey);
        if (cached) {
            return cached;
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const stats = await this.getUsageInRange(today, new Date());
        this.setCache(cacheKey, stats);
        return stats;
    }

    /**
     * Get usage statistics for current month
     */
    async getMonthlyUsage(): Promise<UsageStats> {
        const cacheKey = 'monthly';
        const cached = this.getCached(cacheKey);
        if (cached) {
            return cached;
        }

        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);

        const stats = await this.getUsageInRange(startOfMonth, new Date());
        this.setCache(cacheKey, stats);
        return stats;
    }

    /**
     * Get usage within a specific time window (for 5-hour tracking)
     */
    async getWindowUsage(windowHours: number = 5): Promise<UsageStats> {
        const cacheKey = `window_${windowHours}h`;
        const cached = this.getCached(cacheKey);
        if (cached) {
            return cached;
        }

        const windowStart = new Date();
        windowStart.setHours(windowStart.getHours() - windowHours);

        const stats = await this.getUsageInRange(windowStart, new Date());
        this.setCache(cacheKey, stats);
        return stats;
    }

    /**
     * Get usage for a specific session
     */
    async getSessionUsage(sessionId: string): Promise<UsageStats> {
        const cacheKey = `session_${sessionId}`;
        const cached = this.getCached(cacheKey);
        if (cached) {
            return cached;
        }

        const stats = await this.calculateUsageForSession(sessionId);
        this.setCache(cacheKey, stats);
        return stats;
    }

    /**
     * Get all-time usage statistics
     */
    async getAllTimeUsage(): Promise<UsageStats> {
        const cacheKey = 'alltime';
        const cached = this.getCached(cacheKey);
        if (cached) {
            return cached;
        }

        const stats = await this.getUsageInRange(new Date(0), new Date());
        this.setCache(cacheKey, stats);
        return stats;
    }

    /**
     * Core method: Calculate usage within a time range
     */
    private async getUsageInRange(startTime: Date, endTime: Date): Promise<UsageStats> {
        const totalUsage: TokenUsage = {
            inputTokens: 0,
            outputTokens: 0,
            cacheCreationTokens: 0,
            cacheReadTokens: 0,
            totalTokens: 0,
            cost: 0
        };

        const modelBreakdown: Record<string, TokenUsage> = {};
        const conversationIds = new Set<string>();

        try {
            // Get all project directories
            const projects = await this.getProjectDirectories();

            for (const projectPath of projects) {
                // Get all JSONL files in this project
                const files = await fs.readdir(projectPath);
                const jsonlFiles = files.filter(f => f.endsWith('.jsonl'));

                for (const file of jsonlFiles) {
                    const filePath = path.join(projectPath, file);
                    await this.processJsonlFile(
                        filePath,
                        startTime,
                        endTime,
                        totalUsage,
                        modelBreakdown,
                        conversationIds
                    );
                }
            }
        } catch (error) {
            console.error('[UsageCalculator] Error calculating usage:', error);
        }

        return {
            usage: totalUsage,
            modelBreakdown,
            conversationCount: conversationIds.size,
            startTime: startTime.toISOString(),
            endTime: endTime.toISOString()
        };
    }

    /**
     * Calculate usage for a specific session
     */
    private async calculateUsageForSession(sessionId: string): Promise<UsageStats> {
        const totalUsage: TokenUsage = {
            inputTokens: 0,
            outputTokens: 0,
            cacheCreationTokens: 0,
            cacheReadTokens: 0,
            totalTokens: 0,
            cost: 0
        };

        const modelBreakdown: Record<string, TokenUsage> = {};
        const conversationIds = new Set<string>();

        try {
            const projects = await this.getProjectDirectories();

            for (const projectPath of projects) {
                const sessionFile = path.join(projectPath, `${sessionId}.jsonl`);
                if (await fs.pathExists(sessionFile)) {
                    await this.processJsonlFile(
                        sessionFile,
                        new Date(0),
                        new Date(),
                        totalUsage,
                        modelBreakdown,
                        conversationIds
                    );
                    break;
                }
            }
        } catch (error) {
            console.error('[UsageCalculator] Error calculating session usage:', error);
        }

        return {
            usage: totalUsage,
            modelBreakdown,
            conversationCount: conversationIds.size
        };
    }

    /**
     * Process a single JSONL file and accumulate usage
     */
    private async processJsonlFile(
        filePath: string,
        startTime: Date,
        endTime: Date,
        totalUsage: TokenUsage,
        modelBreakdown: Record<string, TokenUsage>,
        conversationIds: Set<string>
    ): Promise<void> {
        try {
            const content = await fs.readFile(filePath, 'utf8');
            const lines = content.split('\n').filter(line => line.trim());

            for (const line of lines) {
                try {
                    const message: ClaudeMessage = JSON.parse(line);

                    // Check if message is in time range
                    if (message.timestamp) {
                        const msgTime = new Date(message.timestamp);
                        if (msgTime < startTime || msgTime > endTime) {
                            continue;
                        }
                    }

                    // Track conversation ID
                    if (message.sessionId) {
                        conversationIds.add(message.sessionId);
                    }

                    // Extract usage data
                    if (message.message?.usage) {
                        const usage = message.message.usage;
                        const model = message.message.model || 'default';

                        // Get pricing for this model
                        const pricing = MODEL_PRICING[model] || MODEL_PRICING['default'];

                        // Calculate tokens
                        const inputTokens = usage.input_tokens || 0;
                        const outputTokens = usage.output_tokens || 0;
                        const cacheCreationTokens = usage.cache_creation_input_tokens || 0;
                        const cacheReadTokens = usage.cache_read_input_tokens || 0;

                        // Calculate cost
                        const cost =
                            (inputTokens * pricing.input) +
                            (outputTokens * pricing.output) +
                            (cacheCreationTokens * pricing.cacheWrite) +
                            (cacheReadTokens * pricing.cacheRead);

                        // Update total usage
                        totalUsage.inputTokens += inputTokens;
                        totalUsage.outputTokens += outputTokens;
                        totalUsage.cacheCreationTokens += cacheCreationTokens;
                        totalUsage.cacheReadTokens += cacheReadTokens;
                        // Total tokens for display = only input + output (not cache tokens)
                        totalUsage.totalTokens += inputTokens + outputTokens;
                        totalUsage.cost += cost;

                        // Update model breakdown
                        if (!modelBreakdown[model]) {
                            modelBreakdown[model] = {
                                inputTokens: 0,
                                outputTokens: 0,
                                cacheCreationTokens: 0,
                                cacheReadTokens: 0,
                                totalTokens: 0,
                                cost: 0
                            };
                        }

                        modelBreakdown[model].inputTokens += inputTokens;
                        modelBreakdown[model].outputTokens += outputTokens;
                        modelBreakdown[model].cacheCreationTokens += cacheCreationTokens;
                        modelBreakdown[model].cacheReadTokens += cacheReadTokens;
                        // Total tokens for display = only input + output (not cache tokens)
                        modelBreakdown[model].totalTokens += inputTokens + outputTokens;
                        modelBreakdown[model].cost += cost;
                    }
                } catch (parseError) {
                    // Skip invalid JSON lines
                    continue;
                }
            }
        } catch (error) {
            console.error(`[UsageCalculator] Error processing ${filePath}:`, error);
        }
    }

    /**
     * Get all project directories from Claude data path
     */
    private async getProjectDirectories(): Promise<string[]> {
        try {
            if (!await fs.pathExists(this.dataPath)) {
                return [];
            }

            const entries = await fs.readdir(this.dataPath, { withFileTypes: true });
            const projectDirs = entries
                .filter(entry => entry.isDirectory())
                .map(entry => path.join(this.dataPath, entry.name));

            return projectDirs;
        } catch (error) {
            console.error('[UsageCalculator] Error reading project directories:', error);
            return [];
        }
    }

    /**
     * Cache management
     */
    private getCached(key: string): UsageStats | null {
        const expiry = this.cacheExpiry.get(key);
        if (expiry && Date.now() < expiry) {
            return this.cache.get(key) || null;
        }
        return null;
    }

    private setCache(key: string, stats: UsageStats): void {
        this.cache.set(key, stats);
        this.cacheExpiry.set(key, Date.now() + this.CACHE_TTL);
    }

    /**
     * Clear all cache
     */
    clearCache(): void {
        this.cache.clear();
        this.cacheExpiry.clear();
    }

    /**
     * Set custom data path (for testing or configuration changes)
     */
    setDataPath(newPath: string): void {
        this.dataPath = newPath;
        this.clearCache();
    }
}
