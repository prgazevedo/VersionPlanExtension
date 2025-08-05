import * as vscode from 'vscode';
import { CcusageService } from '../services/CcusageService';
import { loggers } from '../utils/Logger';

export class UsageMonitor {
    private static hasShownCcusageUnavailableNotification = false;
    private static logger = loggers.ccusage;

    /**
     * Generates the HTML for the visual usage monitor component
     */
    public static async generateMonitorHtml(): Promise<string> {
        try {
            const ccusageService = CcusageService.getInstance();
            const todayData = await ccusageService.getTodayUsage();
            return await this.generateHtmlWithCcusage(todayData);
        } catch (error) {
            UsageMonitor.logger.debug('ccusage unavailable for usage monitor:', error instanceof Error ? error.message : String(error));
            
            // Show helpful notification (only once per session)
            if (!this.hasShownCcusageUnavailableNotification) {
                this.hasShownCcusageUnavailableNotification = true;
                this.showCcusageUnavailableNotification();
            }
            
            return this.generateUnavailableHtml(error);
        }
    }

    /**
     * Generate HTML using ccusage data
     */
    private static async generateHtmlWithCcusage(todayData: any): Promise<string> {
        const todayUsage = todayData.todayUsage;
        const totalUsage = todayData.totalUsage;
        const modelsUsed = todayData.modelsUsed;
        const recentDays = todayData.recentDays || [];

        // Today's stats
        const todayTokens = todayUsage?.totalTokens || 0;
        const todayCost = todayUsage?.totalCost || 0;
        const todayInputTokens = todayUsage?.inputTokens || 0;
        const todayOutputTokens = todayUsage?.outputTokens || 0;
        const todayCacheCreation = todayUsage?.cacheCreationTokens || 0;
        const todayCacheRead = todayUsage?.cacheReadTokens || 0;

        // Calculate cache efficiency
        const cacheEfficiency = todayTokens > 0 ? ((todayCacheRead / todayTokens) * 100).toFixed(1) : 0;

        // Try to get active session data for real-time monitoring
        let activeSessionInfo = '';
        try {
            const ccusageService = await import('../services/CcusageService');
            const activeData = await ccusageService.CcusageService.getInstance().getActiveSessionUsage();
            
            if (activeData.blocks && activeData.blocks.length > 0) {
                const activeBlock = activeData.blocks.find((b: any) => b.isActive);
                if (activeBlock) {
                    const burnRate = activeBlock.burnRate || 0;
                    activeSessionInfo = `
                    <div class="active-session">
                        <h3>🔴 Active Session</h3>
                        <div class="active-stats">
                            <div class="active-stat">
                                <span class="active-label">Burn Rate:</span>
                                <span class="active-value">${burnRate > 0 ? '$' + burnRate.toFixed(2) + '/hr' : 'N/A'}</span>
                            </div>
                            <div class="active-stat">
                                <span class="active-label">Session Tokens:</span>
                                <span class="active-value">${this.formatTokens(activeBlock.totalTokens)}</span>
                            </div>
                            <div class="active-stat">
                                <span class="active-label">Session Cost:</span>
                                <span class="active-value">$${activeBlock.costUSD.toFixed(2)}</span>
                            </div>
                        </div>
                    </div>`;
                }
            }
        } catch (error) {
            // Active session data not available - continue without it
        }

        // Format numbers
        const formatTokens = this.formatTokens;

        return `
        <div class="usage-monitor">
            <div class="monitor-header">
                <h2>📊 Claude Usage Monitor</h2>
                <div class="monitor-subtitle">Powered by ccusage • ${modelsUsed.join(', ') || 'No models detected'}</div>
            </div>
            
            <div class="monitor-content">
                <div class="usage-summary">
                    <div class="usage-card">
                        <div class="usage-number">${formatTokens(todayTokens)}</div>
                        <div class="usage-label">Today's Tokens</div>
                    </div>
                    <div class="usage-card">
                        <div class="usage-number">$${todayCost.toFixed(2)}</div>
                        <div class="usage-label">Today's Cost</div>
                    </div>
                    <div class="usage-card">
                        <div class="usage-number">${formatTokens(totalUsage.totalTokens)}</div>
                        <div class="usage-label">Total Tokens</div>
                    </div>
                    <div class="usage-card">
                        <div class="usage-number">$${totalUsage.totalCost.toFixed(2)}</div>
                        <div class="usage-label">Total Cost</div>
                    </div>
                </div>
                
                ${activeSessionInfo}
                
                ${todayUsage ? `
                <div class="token-breakdown">
                    <h3>Today's Token Breakdown</h3>
                    <div class="breakdown-grid">
                        <div class="breakdown-item">
                            <span class="breakdown-label">Input:</span>
                            <span class="breakdown-value">${formatTokens(todayInputTokens)}</span>
                        </div>
                        <div class="breakdown-item">
                            <span class="breakdown-label">Output:</span>
                            <span class="breakdown-value">${formatTokens(todayOutputTokens)}</span>
                        </div>
                        <div class="breakdown-item">
                            <span class="breakdown-label">Cache Creation:</span>
                            <span class="breakdown-value">${formatTokens(todayCacheCreation)}</span>
                        </div>
                        <div class="breakdown-item">
                            <span class="breakdown-label">Cache Read:</span>
                            <span class="breakdown-value">${formatTokens(todayCacheRead)}</span>
                        </div>
                        <div class="breakdown-item">
                            <span class="breakdown-label">Cache Efficiency:</span>
                            <span class="breakdown-value">${cacheEfficiency}%</span>
                        </div>
                    </div>
                </div>
                ` : '<div class="no-usage">No usage detected for today</div>'}
                
                ${recentDays.length > 0 ? `
                <div class="recent-activity">
                    <h3>📅 Recent Activity (Last 7 Days)</h3>
                    <div class="recent-days">
                        ${recentDays.slice(0, 7).map((day: any) => `
                            <div class="recent-day">
                                <div class="recent-date">${day.date}</div>
                                <div class="recent-tokens">${formatTokens(day.totalTokens)}</div>
                                <div class="recent-cost">$${day.totalCost.toFixed(2)}</div>
                            </div>
                        `).join('')}
                    </div>
                </div>
                ` : ''}
            </div>
        </div>
        
        ${this.getStyles()}`;
    }

    public static formatTokens(tokens: number): string {
        if (tokens >= 1000000) {
            return `${(tokens / 1000000).toFixed(1)}M`;
        } else if (tokens >= 1000) {
            return `${(tokens / 1000).toFixed(1)}K`;
        }
        return tokens.toString();
    }

    /**
     * Generate HTML when ccusage is unavailable
     */
    private static generateUnavailableHtml(error: any): string {
        return `
        <div class="usage-monitor unavailable">
            <div class="monitor-header">
                <h2>📊 Claude Usage Monitor</h2>
                <div class="monitor-subtitle">ccusage integration unavailable</div>
            </div>
            
            <div class="monitor-content">
                <div class="unavailable-message">
                    <div class="unavailable-icon">⚠️</div>
                    <div class="unavailable-text">
                        <p><strong>ccusage not available</strong></p>
                        <p>To enable accurate usage tracking:</p>
                        <ul>
                            <li>Install Bun: <code>curl -fsSL https://bun.sh/install | bash</code></li>
                            <li>Or install Node.js and use: <code>npx ccusage</code></li>
                            <li>Or install the Bun VS Code extension</li>
                        </ul>
                    </div>
                </div>
                
                <div class="unavailable-actions">
                    <button onclick="enableCcusage()">Enable ccusage</button>
                    <button onclick="testCcusage()">Test Integration</button>
                </div>
            </div>
        </div>
        
        ${this.getStyles()}
        <script>
        function enableCcusage() {
            vscode.postMessage({ command: 'enableCcusage' });
        }
        function testCcusage() {
            vscode.postMessage({ command: 'testCcusage' });
        }
        </script>`;
    }

    /**
     * Generate clean CSS styles for the usage monitor
     */
    private static getStyles(): string {
        return `
        <style>
            .usage-monitor {
                margin: -20px -20px 30px -20px;
                padding: 30px;
                border-bottom: 2px solid var(--vscode-panel-border);
            }
            
            .monitor-header {
                text-align: center;
                margin-bottom: 30px;
            }
            
            .monitor-header h2 {
                font-size: 24px;
                margin: 0 0 10px 0;
                font-weight: 600;
            }
            
            .monitor-subtitle {
                color: var(--vscode-descriptionForeground);
                font-size: 14px;
            }
            
            .usage-summary {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
                gap: 20px;
                margin-bottom: 30px;
            }
            
            .usage-card {
                background-color: var(--vscode-editor-inactiveSelectionBackground);
                border: 1px solid var(--vscode-panel-border);
                border-radius: 6px;
                padding: 20px;
                text-align: center;
            }
            
            .usage-number {
                font-size: 24px;
                font-weight: bold;
                color: var(--vscode-textLink-foreground);
                margin-bottom: 8px;
            }
            
            .usage-label {
                font-size: 12px;
                color: var(--vscode-descriptionForeground);
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }
            
            .token-breakdown {
                background-color: var(--vscode-editor-inactiveSelectionBackground);
                border-radius: 6px;
                padding: 20px;
            }
            
            .token-breakdown h3 {
                margin: 0 0 15px 0;
                font-size: 16px;
                color: var(--vscode-foreground);
            }
            
            .breakdown-grid {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                gap: 10px;
            }
            
            .breakdown-item {
                display: flex;
                justify-content: space-between;
                padding: 8px 0;
                border-bottom: 1px solid var(--vscode-panel-border);
            }
            
            .breakdown-item:last-child {
                border-bottom: none;
            }
            
            .breakdown-label {
                color: var(--vscode-descriptionForeground);
            }
            
            .breakdown-value {
                font-weight: 600;
                color: var(--vscode-foreground);
            }
            
            .no-usage {
                text-align: center;
                color: var(--vscode-descriptionForeground);
                font-style: italic;
                padding: 40px;
            }
            
            /* Active Session Styles */
            .active-session {
                background-color: var(--vscode-editor-inactiveSelectionBackground);
                border: 1px solid var(--vscode-panel-border);
                border-left: 4px solid #d13438;
                border-radius: 6px;
                padding: 20px;
                margin: 20px 0;
            }
            
            .active-session h3 {
                margin: 0 0 15px 0;
                font-size: 16px;
                color: var(--vscode-foreground);
                display: flex;
                align-items: center;
                gap: 8px;
            }
            
            .active-stats {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
                gap: 15px;
            }
            
            .active-stat {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 8px 0;
                border-bottom: 1px solid var(--vscode-panel-border);
            }
            
            .active-stat:last-child {
                border-bottom: none;
            }
            
            .active-label {
                color: var(--vscode-descriptionForeground);
                font-size: 14px;
            }
            
            .active-value {
                font-weight: 600;
                color: var(--vscode-textLink-foreground);
                font-size: 14px;
            }
            
            /* Recent Activity Styles */
            .recent-activity {
                background-color: var(--vscode-editor-inactiveSelectionBackground);
                border-radius: 6px;
                padding: 20px;
                margin: 20px 0;
            }
            
            .recent-activity h3 {
                margin: 0 0 15px 0;
                font-size: 16px;
                color: var(--vscode-foreground);
            }
            
            .recent-days {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
                gap: 10px;
            }
            
            .recent-day {
                background: var(--vscode-list-activeSelectionBackground);
                border-radius: 4px;
                padding: 12px;
                text-align: center;
                transition: all 0.2s ease;
            }
            
            .recent-day:hover {
                background: var(--vscode-list-hoverBackground);
                transform: translateY(-2px);
            }
            
            .recent-date {
                font-size: 12px;
                color: var(--vscode-descriptionForeground);
                margin-bottom: 6px;
            }
            
            .recent-tokens {
                font-size: 14px;
                font-weight: 600;
                color: var(--vscode-foreground);
                margin-bottom: 4px;
            }
            
            .recent-cost {
                font-size: 13px;
                color: var(--vscode-textLink-foreground);
                font-weight: 500;
            }
            
            .unavailable .unavailable-message {
                display: flex;
                align-items: flex-start;
                gap: 20px;
                background-color: var(--vscode-editor-inactiveSelectionBackground);
                border-radius: 6px;
                padding: 20px;
                margin-bottom: 20px;
            }
            
            .unavailable-icon {
                font-size: 24px;
            }
            
            .unavailable-text ul {
                margin: 10px 0;
                padding-left: 20px;
            }
            
            .unavailable-text code {
                background-color: var(--vscode-textBlockQuote-background);
                padding: 2px 4px;
                border-radius: 3px;
                font-family: var(--vscode-editor-font-family);
            }
            
            .unavailable-actions {
                text-align: center;
            }
            
            .unavailable-actions button {
                background-color: var(--vscode-button-background);
                color: var(--vscode-button-foreground);
                border: none;
                padding: 10px 20px;
                margin: 0 10px;
                border-radius: 4px;
                cursor: pointer;
                font-size: 14px;
            }
            
            .unavailable-actions button:hover {
                background-color: var(--vscode-button-hoverBackground);
            }
        </style>`;
    }

    /**
     * Simple update script for refreshing data
     */
    public static getUpdateScript(): string {
        return `
            // Refresh the entire usage monitor when data updates
            function updateUsageMonitor(data) {
                // For ccusage integration, we'll refresh the entire panel
                // since the data structure is different from the old percentage-based system
                vscode.postMessage({ command: 'refreshStats' });
            }
        `;
    }

    /**
     * Show helpful notification when ccusage is unavailable
     */
    private static showCcusageUnavailableNotification(): void {
        UsageMonitor.logger.info('Showing ccusage installation guidance to user');
        
        vscode.window.showInformationMessage(
            'ccusage integration unavailable. Install Bun or Node.js for accurate usage tracking.',
            'Enable ccusage',
            'Learn More'
        ).then((selection) => {
            if (!selection) return;
            
            if (selection === 'Enable ccusage') {
                vscode.commands.executeCommand('claude-config.installCcusageHelp');
            } else if (selection === 'Learn More') {
                vscode.commands.executeCommand('claude-config.debugCcusage');
            }
        });
    }
}