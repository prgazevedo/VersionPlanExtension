/**
 * Summary Cache Manager
 * Provides in-memory caching of conversation summaries with TTL for fast tree view loading
 */

import * as vscode from 'vscode';
import { ConversationSummary, ConversationFilter } from './types';

interface CacheEntry {
    summary: ConversationSummary;
    cachedAt: Date;
    ttl: number;
    source: 'local' | 'cloud';
    hash: string;
}

interface CacheStats {
    totalEntries: number;
    hitCount: number;
    missCount: number;
    hitRatio: number;
    memoryUsage: number;
    lastCleanup: Date;
}

export class SummaryCache {
    private cache = new Map<string, CacheEntry>();
    private hitCount = 0;
    private missCount = 0;
    private lastCleanup = new Date();
    private cleanupInterval: NodeJS.Timeout | undefined;
    private defaultTTL: number;

    constructor(defaultTTLMinutes: number = 5) {
        this.defaultTTL = defaultTTLMinutes * 60 * 1000; // Convert to milliseconds
        this.startCleanupScheduler();
    }

    /**
     * Get summary from cache if available and not expired
     */
    get(sessionId: string): ConversationSummary | null {
        const entry = this.cache.get(sessionId);
        if (!entry) {
            this.missCount++;
            return null;
        }

        const now = new Date();
        const age = now.getTime() - entry.cachedAt.getTime();

        if (age > entry.ttl) {
            // Entry has expired
            this.cache.delete(sessionId);
            this.missCount++;
            return null;
        }

        this.hitCount++;
        return entry.summary;
    }

    /**
     * Store summary in cache with optional custom TTL
     */
    set(sessionId: string, summary: ConversationSummary, source: 'local' | 'cloud' = 'local', customTTL?: number): void {
        const entry: CacheEntry = {
            summary,
            cachedAt: new Date(),
            ttl: customTTL || this.defaultTTL,
            source,
            hash: this.calculateSummaryHash(summary)
        };
        this.cache.set(sessionId, entry);
    }

    /**
     * Update existing cache entry if hash has changed
     */
    update(sessionId: string, summary: ConversationSummary, source: 'local' | 'cloud' = 'local'): boolean {
        const existing = this.cache.get(sessionId);
        const newHash = this.calculateSummaryHash(summary);

        if (!existing || existing.hash !== newHash) {
            this.set(sessionId, summary, source);
            return true; // Entry was updated
        }
        return false; // No change needed
    }

    /**
     * Check if summary exists in cache and is still valid
     */
    has(sessionId: string): boolean {
        return this.get(sessionId) !== null;
    }

    /**
     * Remove specific entry from cache
     */
    delete(sessionId: string): boolean {
        return this.cache.delete(sessionId);
    }

    /**
     * Clear all cache entries
     */
    clear(): void {
        this.cache.clear();
        this.hitCount = 0;
        this.missCount = 0;
    }

    /**
     * Get all cached summaries
     */
    getAll(): ConversationSummary[] {
        const validEntries: ConversationSummary[] = [];
        const now = new Date();

        for (const [sessionId, entry] of this.cache) {
            const age = now.getTime() - entry.cachedAt.getTime();
            if (age <= entry.ttl) {
                validEntries.push(entry.summary);
            } else {
                // Remove expired entry
                this.cache.delete(sessionId);
            }
        }

        return validEntries;
    }

    /**
     * Get all cached summaries grouped by project
     */
    getAllGroupedByProject(): { [projectName: string]: ConversationSummary[] } {
        const summaries = this.getAll();
        const grouped: { [projectName: string]: ConversationSummary[] } = {};

        for (const summary of summaries) {
            const projectName = summary.projectName;
            if (!grouped[projectName]) {
                grouped[projectName] = [];
            }
            grouped[projectName].push(summary);
        }

        return grouped;
    }

    /**
     * Search cached summaries by text content
     */
    search(query: string): ConversationSummary[] {
        const summaries = this.getAll();
        const queryLower = query.toLowerCase();

        return summaries.filter(summary => {
            return (
                summary.projectName.toLowerCase().includes(queryLower) ||
                summary.firstMessage?.toLowerCase().includes(queryLower) ||
                summary.lastMessage?.toLowerCase().includes(queryLower)
            );
        });
    }

    /**
     * Filter cached summaries by criteria
     */
    filter(criteria: ConversationFilter): ConversationSummary[] {
        const summaries = this.getAll();

        return summaries.filter(summary => {
            // Project name filter
            if (criteria.projectName && !summary.projectName.includes(criteria.projectName)) {
                return false;
            }

            // Message count filters
            if (criteria.minMessages && summary.messageCount < criteria.minMessages) {
                return false;
            }
            if (criteria.maxMessages && summary.messageCount > criteria.maxMessages) {
                return false;
            }

            // Date range filters
            const startTime = new Date(summary.startTime);
            if (criteria.dateFrom && startTime < criteria.dateFrom) {
                return false;
            }
            if (criteria.dateTo && startTime > criteria.dateTo) {
                return false;
            }

            // Duration filter (convert duration string to minutes)
            if (criteria.minDuration && summary.duration) {
                const durationMinutes = this.parseDurationToMinutes(summary.duration);
                if (durationMinutes < criteria.minDuration) {
                    return false;
                }
            }

            return true;
        });
    }

    /**
     * Get cache statistics for monitoring
     */
    getStats(): CacheStats {
        const totalRequests = this.hitCount + this.missCount;
        const hitRatio = totalRequests > 0 ? this.hitCount / totalRequests : 0;

        // Estimate memory usage (rough calculation)
        let memoryUsage = 0;
        for (const entry of this.cache.values()) {
            memoryUsage += JSON.stringify(entry).length * 2; // Rough UTF-16 estimate
        }

        return {
            totalEntries: this.cache.size,
            hitCount: this.hitCount,
            missCount: this.missCount,
            hitRatio,
            memoryUsage,
            lastCleanup: this.lastCleanup
        };
    }

    /**
     * Force cleanup of expired entries
     */
    cleanup(): number {
        const before = this.cache.size;
        const now = new Date();
        const expired: string[] = [];

        for (const [sessionId, entry] of this.cache) {
            const age = now.getTime() - entry.cachedAt.getTime();
            if (age > entry.ttl) {
                expired.push(sessionId);
            }
        }

        for (const sessionId of expired) {
            this.cache.delete(sessionId);
        }

        this.lastCleanup = now;
        return expired.length;
    }

    /**
     * Dispose cache and cleanup resources
     */
    dispose(): void {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = undefined;
        }
        this.clear();
    }

    /**
     * Calculate hash of summary for change detection
     */
    private calculateSummaryHash(summary: ConversationSummary): string {
        const crypto = require('crypto');
        const summaryString = JSON.stringify({
            sessionId: summary.sessionId,
            messageCount: summary.messageCount,
            startTime: summary.startTime,
            endTime: summary.endTime,
            firstMessage: summary.firstMessage,
            lastMessage: summary.lastMessage
        });
        return crypto.createHash('sha256').update(summaryString).digest('hex');
    }

    /**
     * Parse duration string to minutes
     */
    private parseDurationToMinutes(duration: string): number {
        const hourMatch = duration.match(/(\d+)h/);
        const minuteMatch = duration.match(/(\d+)m/);
        
        const hours = hourMatch ? parseInt(hourMatch[1]) : 0;
        const minutes = minuteMatch ? parseInt(minuteMatch[1]) : 0;
        
        return hours * 60 + minutes;
    }

    /**
     * Start automatic cleanup scheduler
     */
    private startCleanupScheduler(): void {
        // Run cleanup every 10 minutes
        this.cleanupInterval = setInterval(() => {
            this.cleanup();
        }, 10 * 60 * 1000);
    }
}

/**
 * Singleton instance for global use
 */
export class SummaryCacheManager {
    private static instance: SummaryCache | null = null;

    static getInstance(): SummaryCache {
        if (!SummaryCacheManager.instance) {
            // Get TTL from configuration
            const config = vscode.workspace.getConfiguration('claude-config');
            const ttlMinutes = config.get<number>('summaryCache.ttlMinutes') || 5;
            
            SummaryCacheManager.instance = new SummaryCache(ttlMinutes);
        }
        return SummaryCacheManager.instance;
    }

    static dispose(): void {
        if (SummaryCacheManager.instance) {
            SummaryCacheManager.instance.dispose();
            SummaryCacheManager.instance = null;
        }
    }
}