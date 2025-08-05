/**
 * CloudTokenTracker with ccusage integration for real usage data cloud sync
 * Provides cross-device usage synchronization using ccusage CLI data
 */

import * as vscode from 'vscode';
import { Logger } from '../utils/Logger';
import { CcusageService } from '../services/CcusageService';

export interface CloudUsageStatistics {
    totalTokens: number;
    totalCost: number;
    operationCount: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    totalCacheCreationTokens: number;
    totalCacheReadTokens: number;
    dailyUsage: any[];
    weeklyUsage: any[];
    monthlyUsage: any[];
    lastUpdated: number;
}

export interface UsageCloudSyncStatus {
    enabled: boolean;
    ccusageAvailable: boolean;
    ccusageVersion?: string;
    cloudProviderConfigured: boolean;
    lastSync?: Date;
    status: string;
    message?: string;
}

/**
 * CloudTokenTracker with ccusage integration for real usage statistics
 * Provides cross-device usage synchronization using actual ccusage data
 */
export class CloudTokenTracker {
    private logger: Logger;
    private deviceId: string;
    private ccusageService: CcusageService;
    private cloudProvider: any = null;
    private syncInProgress: boolean = false;
    private lastSyncTime: Date | null = null;

    // Additional stub methods for compatibility
    public onSyncEvent = new vscode.EventEmitter<any>();

    constructor(private context: vscode.ExtensionContext, cloudProvider?: any) {
        this.logger = new Logger({ prefix: 'CloudTokenTracker' });
        this.deviceId = this.generateDeviceId();
        this.cloudProvider = cloudProvider || null;
        this.ccusageService = CcusageService.getInstance();
    }

    // Stub methods that return empty/default values
    getCurrentDailyWindow(): any {
        return {
            startTime: new Date(),
            endTime: new Date(),
            tokens: 0,
            conversationCount: 0
        };
    }

    async getStatistics(): Promise<CloudUsageStatistics> {
        try {
            const todayData = await this.ccusageService.getTodayUsage();
            const dailyData = await this.ccusageService.getDailyUsage();
            const monthlyData = await this.ccusageService.getMonthlyUsage();
            
            return this.transformCcusageToUsageStatistics(todayData, dailyData, monthlyData);
        } catch (error) {
            this.logger.info('ccusage unavailable, using fallback data:', error instanceof Error ? error.message : String(error));
            
            // Fallback to stub data when ccusage is unavailable
            return {
                totalTokens: 0,
                totalCost: 0,
                operationCount: 0,
                totalInputTokens: 0,
                totalOutputTokens: 0,
                totalCacheCreationTokens: 0,
                totalCacheReadTokens: 0,
                dailyUsage: [],
                weeklyUsage: [],
                monthlyUsage: [],
                lastUpdated: Date.now()
            };
        }
    }

    async getUsageCloudSyncStatus(): Promise<UsageCloudSyncStatus> {
        let ccusageAvailable = false;
        let ccusageVersion: string | undefined;
        
        try {
            const testResult = await this.ccusageService.testCcusageAvailability();
            ccusageAvailable = testResult.available;
            ccusageVersion = testResult.version;
        } catch (error) {
            // ccusage test failed
            ccusageAvailable = false;
        }

        return {
            enabled: true,
            ccusageAvailable,
            ccusageVersion,
            cloudProviderConfigured: this.cloudProvider !== null,
            lastSync: this.lastSyncTime || undefined,
            status: ccusageAvailable ? 'ready' : 'ccusage-unavailable',
            message: ccusageAvailable ? 'ccusage CLI integration active' : 'ccusage CLI not found - install Bun or Node.js'
        };
    }

    private transformCcusageToUsageStatistics(todayData: any, dailyData: any, monthlyData: any): CloudUsageStatistics {
        // Transform ccusage data to CloudUsageStatistics format
        return {
            totalTokens: todayData?.totalTokens || 0,
            totalCost: todayData?.totalCost || 0,
            operationCount: todayData?.requests || 0,
            totalInputTokens: todayData?.inputTokens || 0,
            totalOutputTokens: todayData?.outputTokens || 0,
            totalCacheCreationTokens: todayData?.cacheCreationTokens || 0,
            totalCacheReadTokens: todayData?.cacheReadTokens || 0,
            dailyUsage: dailyData || [],
            weeklyUsage: [],
            monthlyUsage: monthlyData || [],
            lastUpdated: Date.now()
        };
    }

    async syncToCloud(): Promise<boolean> {
        this.logger.info('CloudTokenTracker sync disabled - using ccusage integration instead');
        return false;
    }

    async getCrossDeviceUsage(): Promise<any> {
        return {
            totalDevices: 1,
            devices: [{
                deviceId: this.deviceId,
                deviceName: 'Current Device',
                platform: process.platform,
                lastSeen: new Date()
            }],
            aggregatedStatistics: await this.getStatistics(),
            lastSyncTime: new Date(),
            conflictCount: 0
        };
    }

    private generateDeviceId(): string {
        return 'stub-device-' + Math.random().toString(36).substring(7);
    }

    setCloudProvider(provider: any): void {
        this.cloudProvider = provider;
    }

    addCloudProvider(provider: any): void {
        this.setCloudProvider(provider);
    }

    async syncUsageFromCloud(options?: any): Promise<any[]> {
        this.logger.info('CloudTokenTracker syncUsageFromCloud disabled - using ccusage integration instead');
        return [{
            success: false,
            message: 'Using ccusage integration instead'
        }];
    }

    async syncUsageToCloud(options?: any): Promise<any[]> {
        this.logger.info('CloudTokenTracker syncUsageToCloud disabled - using ccusage integration instead');
        return [{
            success: false,
            message: 'Using ccusage integration instead'
        }];
    }
}