import * as vscode from 'vscode';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as os from 'os';
import { loggers } from '../utils/Logger';

const execAsync = promisify(exec);

interface CachedData<T = any> {
    data: T;
    timestamp: number;
}

interface ExecutionMethod {
    runner: string;
    command: string;
    errorHint: string;
}

interface RunnerResult {
    name: string;
    available: boolean;
    error?: string;
}

interface CcusageTestResult {
    available: boolean;
    version?: string;
    runner?: string;
    error?: string;
    runners: RunnerResult[];
}

interface DailyUsageData {
    date: string;
    inputTokens: number;
    outputTokens: number;
    cacheCreationTokens: number;
    cacheReadTokens: number;
    totalTokens: number;
    totalCost: number;
    modelsUsed: string[];
}

interface UsageTotals {
    inputTokens: number;
    outputTokens: number;
    cacheCreationTokens: number;
    cacheReadTokens: number;
    totalTokens: number;
    totalCost: number;
}

interface TodayUsageResult {
    todayUsage: DailyUsageData | null;
    totalUsage: UsageTotals;
    modelsUsed: string[];
    recentDays: DailyUsageData[];
}

/**
 * Service wrapper for ccusage CLI tool
 * Provides programmatic access to Claude Code usage statistics via bunx ccusage
 */
export class CcusageService {
    private static instance: CcusageService;
    private cache: Map<string, CachedData> = new Map();
    private readonly cacheTimeout = 30000; // 30 seconds
    private claudeDataPath: string;
    private logger = loggers.ccusage;

    constructor() {
        this.claudeDataPath = this.getClaudeDataPath();
    }

    public static getInstance(): CcusageService {
        if (!CcusageService.instance) {
            CcusageService.instance = new CcusageService();
        }
        return CcusageService.instance;
    }

    private getClaudeDataPath(): string {
        const config = vscode.workspace.getConfiguration('claude-config');
        const customPath = config.get<string>('conversationDataPath');
        
        if (customPath) {
            return customPath;
        }
        
        return path.join(os.homedir(), '.claude', 'projects');
    }

    /**
     * Execute ccusage command with proper error handling and fallback chain
     */
    public async executeCcusage(command: string): Promise<string> {
        const executionMethods: ExecutionMethod[] = [
            {
                runner: 'bunx',
                command: `bunx ccusage ${command}`,
                errorHint: 'Bun not found. Install from https://bun.sh or the Bun VS Code extension.'
            },
            {
                runner: 'npx',
                command: `npx ccusage@latest ${command}`,
                errorHint: 'npx not found. Make sure Node.js is installed.'
            },
            {
                runner: 'npm exec',
                command: `npm exec --yes -- ccusage ${command}`,
                errorHint: 'npm not found. Please install Node.js from https://nodejs.org'
            }
        ];

        let lastError: Error | null = null;

        // Try each execution method in order
        for (const method of executionMethods) {
            try {
                if (false) {
                    console.log(`[CcusageService] Trying ${method.runner}...`);
                }

                const { stdout, stderr } = await execAsync(method.command, {
                    cwd: this.claudeDataPath,
                    timeout: 30000, // 30 second timeout
                    env: {
                        ...process.env,
                        // Ensure ccusage uses the correct data path
                        CLAUDE_PROJECTS_PATH: this.claudeDataPath
                    }
                });

                if (stderr && !stderr.includes('warning')) {
                    console.warn(`[CcusageService] ${method.runner} stderr:`, stderr);
                }

                if (false) {
                    console.log(`[CcusageService] Success with ${method.runner}`);
                }
                return stdout.trim();

            } catch (error: any) {
                lastError = error;

                // Check if this is a command not found error
                if (error.code === 'ENOENT' || error.message.includes('command not found')) {
                    if (false) {
                        console.log(`[CcusageService] ${method.runner} not available: ${method.errorHint}`);
                    }
                    continue; // Try next method
                }

                // Check for timeout
                if (error.killed) {
                    throw new Error('ccusage command timed out. Please try again.');
                }

                // Parse ccusage-specific errors that we should handle
                const errorMessage = error.stderr || error.message || 'Unknown error';

                if (errorMessage.includes('No conversations found')) {
                    // This is expected for new users
                    return JSON.stringify({
                        usage: [],
                        totalTokens: 0,
                        totalCost: 0,
                        summary: {
                            currentUsage: 0,
                            limit: 0,
                            percentage: 0,
                            tier: 'unknown'
                        }
                    });
                }

                // For other errors, continue to next method
                if (false) {
                    console.log(`[CcusageService] ${method.runner} failed:`, errorMessage);
                }
            }
        }

        // All methods failed
        const errorMessage = lastError ? (lastError.message || String(lastError)) : 'All execution methods failed';
        throw new Error(
            `ccusage unavailable. ${errorMessage}\n\n` +
            `To use ccusage integration, please install one of:\n` +
            `1. Bun (recommended): https://bun.sh\n` +
            `2. Node.js: https://nodejs.org\n` +
            `3. Bun VS Code Extension: Search for "Bun for Visual Studio Code" in Extensions`
        );
    }

    /**
     * Get cached result or execute command
     */
    private async getCachedOrExecute(cacheKey: string, command: string): Promise<any> {
        const cached = this.cache.get(cacheKey);
        const now = Date.now();

        if (cached && (now - cached.timestamp) < this.cacheTimeout) {
            return cached.data;
        }

        try {
            const result = await this.executeCcusage(command);
            const data = JSON.parse(result);

            this.cache.set(cacheKey, {
                data,
                timestamp: now
            });

            // Clean up old cache entries
            if (this.cache.size > 10) {
                const oldestKey = this.cache.keys().next().value;
                if (oldestKey) {
                    this.cache.delete(oldestKey);
                }
            }

            return data;
        } catch (error) {
            // Always log errors as they're important for troubleshooting
            console.error(`[CcusageService] Error executing '${command}':`, error instanceof Error ? error.message : String(error));
            throw error;
        }
    }

    /**
     * Get daily usage statistics
     */
    public async getDailyUsage(): Promise<any> {
        return this.getCachedOrExecute('daily', 'daily --json');
    }

    /**
     * Get monthly usage statistics
     */
    public async getMonthlyUsage(): Promise<any> {
        return this.getCachedOrExecute('monthly', 'monthly --json');
    }

    /**
     * Get live usage blocks (real-time)
     */
    public async getLiveUsage(): Promise<any> {
        // Don't cache live data - always fetch fresh
        try {
            const result = await this.executeCcusage('blocks --json');
            return JSON.parse(result);
        } catch (error) {
            console.error('[CcusageService] Error getting live usage:', error instanceof Error ? error.message : String(error));
            throw error;
        }
    }

    /**
     * Get usage for a specific date range
     */
    public async getUsageForDateRange(since?: string, until?: string): Promise<any> {
        let command = 'daily --json';
        
        if (since) {
            command += ` --since ${since}`;
        }
        if (until) {
            command += ` --until ${until}`;
        }

        const cacheKey = `range_${since || 'start'}_${until || 'end'}`;
        return this.getCachedOrExecute(cacheKey, command);
    }

    /**
     * Get usage breakdown by model
     */
    public async getUsageBreakdown(): Promise<any> {
        return this.getCachedOrExecute('breakdown', 'daily --json --breakdown');
    }

    /**
     * Get weekly usage statistics
     */
    public async getWeeklyUsage(): Promise<any> {
        return this.getCachedOrExecute('weekly', 'weekly --json');
    }

    /**
     * Get detailed session usage statistics
     */
    public async getDetailedSessionUsage(): Promise<any> {
        return this.getCachedOrExecute('sessions', 'session --json');
    }

    /**
     * Get block usage statistics
     */
    public async getBlockUsage(): Promise<any> {
        return this.getCachedOrExecute('blocks', 'blocks --json');
    }

    /**
     * Get project usage breakdown
     */
    public async getProjectUsage(): Promise<any> {
        return this.getCachedOrExecute('projects', 'daily --json --instances');
    }

    /**
     * Get active session usage (real-time)
     */
    public async getActiveSessionUsage(): Promise<any> {
        // Don't cache active session data - always fetch fresh
        try {
            const result = await this.executeCcusage('blocks --json --active');
            return JSON.parse(result);
        } catch (error) {
            console.error('[CcusageService] Error getting active session usage:', error instanceof Error ? error.message : String(error));
            throw error;
        }
    }

    /**
     * Test if ccusage is available and working
     */
    public async testCcusageAvailability(): Promise<CcusageTestResult> {
        const runners = [
            { name: 'bunx', command: 'bunx ccusage --version' },
            { name: 'npx', command: 'npx ccusage@latest --version' },
            { name: 'npm exec', command: 'npm exec --yes -- ccusage --version' }
        ];

        const runnerResults: RunnerResult[] = [];

        for (const runner of runners) {
            try {
                const { stdout } = await execAsync(runner.command, {
                    timeout: 10000
                });

                runnerResults.push({ name: runner.name, available: true });

                // Return on first success
                return {
                    available: true,
                    version: stdout.trim(),
                    runner: runner.name,
                    runners: runnerResults
                };
            } catch (error: any) {
                runnerResults.push({
                    name: runner.name,
                    available: false,
                    error: error.code === 'ENOENT' ? 'Command not found' : error.message
                });
            }
        }

        // All failed
        return {
            available: false,
            error: 'No package managers available (bunx, npx, or npm)',
            runners: runnerResults
        };
    }

    /**
     * Get today's usage data for the monitor
     */
    public async getTodayUsage(): Promise<TodayUsageResult> {
        try {
            const dailyData = await this.getDailyUsage();

            // Extract today's usage
            const today = new Date().toISOString().split('T')[0];
            const todayUsage = dailyData.daily?.find((u: any) => u.date === today) || null;

            // Get totals
            const totalUsage = dailyData.totals || {
                inputTokens: 0,
                outputTokens: 0,
                cacheCreationTokens: 0,
                cacheReadTokens: 0,
                totalTokens: 0,
                totalCost: 0
            };

            // Get all models used
            const modelsUsed = [...new Set(
                (dailyData.daily || []).flatMap((day: any) => day.modelsUsed || [])
            )] as string[];

            // Get recent days (last 7 days)
            const recentDays = (dailyData.daily || [])
                .sort((a: any, b: any) => b.date.localeCompare(a.date))
                .slice(0, 7);

            return {
                todayUsage,
                totalUsage,
                modelsUsed,
                recentDays
            };
        } catch (error) {
            console.error('[CcusageService] Error getting today usage:', error instanceof Error ? error.message : String(error));
            throw error;
        }
    }

    /**
     * Clear all cached data
     */
    public clearCache(): void {
        this.cache.clear();
    }

    /**
     * Get cache statistics for debugging
     */
    public getCacheStats() {
        const now = Date.now();
        const keys = Array.from(this.cache.keys());

        let oldestAge = 0;
        for (const [, cached] of this.cache) {
            const age = now - cached.timestamp;
            if (age > oldestAge) {
                oldestAge = age;
            }
        }

        return {
            size: this.cache.size,
            keys,
            oldestAge: Math.round(oldestAge / 1000) // in seconds
        };
    }
}