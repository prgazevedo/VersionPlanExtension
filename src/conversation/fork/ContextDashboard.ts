import * as vscode from 'vscode';
import { ContextMonitor, ContextUsageState } from './ContextMonitor';
import { ForkTreeProvider } from './ForkTreeProvider';

export class ContextDashboard {
    private panel: vscode.WebviewPanel | undefined;
    private contextMonitor: ContextMonitor;
    private forkTreeProvider: ForkTreeProvider;
    private updateInterval: NodeJS.Timeout | undefined;

    constructor(
        private context: vscode.ExtensionContext,
        contextMonitor: ContextMonitor,
        forkTreeProvider: ForkTreeProvider
    ) {
        this.contextMonitor = contextMonitor;
        this.forkTreeProvider = forkTreeProvider;
        
        // Listen for context state changes
        this.contextMonitor.onStateChanged(state => {
            this.updateDashboard(state);
        });
    }

    /**
     * Show the context usage dashboard
     */
    async show(): Promise<void> {
        if (this.panel) {
            this.panel.reveal();
            return;
        }

        this.panel = vscode.window.createWebviewPanel(
            'contextDashboard',
            'Context Usage Dashboard',
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: [],
                retainContextWhenHidden: true
            }
        );

        // Handle panel disposal
        this.panel.onDidDispose(() => {
            this.panel = undefined;
            if (this.updateInterval) {
                clearInterval(this.updateInterval);
                this.updateInterval = undefined;
            }
        });

        // Handle messages from webview
        this.panel.webview.onDidReceiveMessage(async (message) => {
            await this.handleWebviewMessage(message);
        });

        // Initial render
        const currentState = this.contextMonitor.getCurrentState();
        await this.renderDashboard(currentState);

        // Set up periodic updates
        this.updateInterval = setInterval(async () => {
            await this.contextMonitor.refresh();
        }, 10000); // Update every 10 seconds
    }

    /**
     * Update dashboard with new state
     */
    private updateDashboard(state: ContextUsageState): void {
        if (this.panel) {
            this.panel.webview.postMessage({
                type: 'updateState',
                state: state
            });
        }
    }

    /**
     * Handle messages from webview
     */
    private async handleWebviewMessage(message: any): Promise<void> {
        switch (message.type) {
            case 'loadConversation':
                await vscode.commands.executeCommand('claude-config.loadConversationForForkAnalysis');
                break;
            case 'refreshMonitoring':
                await this.contextMonitor.refresh();
                break;
            case 'openForkManager':
                // Focus on the fork manager tree view
                await vscode.commands.executeCommand('claude-fork-manager.focus');
                break;
            case 'pruneRecommended':
                await this.showPruningRecommendations();
                break;
        }
    }

    /**
     * Show pruning recommendations
     */
    private async showPruningRecommendations(): Promise<void> {
        const analysis = this.forkTreeProvider.getCurrentAnalysis();
        if (!analysis) {
            vscode.window.showWarningMessage('No conversation analysis available. Load a conversation first.');
            return;
        }

        let recommendations = '# Pruning Recommendations\n\n';
        
        if (analysis.tokenDistribution.abandonedBranches > 0) {
            recommendations += `## 🗑️ Abandoned Branches\n`;
            recommendations += `**${this.formatTokenCount(analysis.tokenDistribution.abandonedBranches)} tokens** can be saved by removing old, unused branches.\n\n`;
        }

        if (analysis.forkCount > 2) {
            recommendations += `## 🔀 Multiple Forks\n`;
            recommendations += `You have **${analysis.forkCount} fork points** in this conversation. Consider consolidating similar explorations.\n\n`;
        }

        for (let i = 0; i < analysis.tree.forks.length; i++) {
            const fork = analysis.tree.forks[i];
            const inactiveBranches = fork.branches.filter(b => !b.isActive);
            if (inactiveBranches.length > 0) {
                recommendations += `## Fork ${i + 1}\n`;
                recommendations += `- **${fork.branches.length} branches** total\n`;
                recommendations += `- **${inactiveBranches.length} inactive branches** could be pruned\n`;
                recommendations += `- **${this.formatTokenCount(inactiveBranches.reduce((sum, b) => sum + b.tokenCount, 0))} tokens** saved\n\n`;
            }
        }

        const panel = vscode.window.createWebviewPanel(
            'pruningRecommendations',
            'Pruning Recommendations',
            vscode.ViewColumn.Beside,
            {
                enableScripts: false
            }
        );

        panel.webview.html = this.getRecommendationsHtml(recommendations);
    }

    /**
     * Render the main dashboard
     */
    private async renderDashboard(state: ContextUsageState): Promise<void> {
        if (!this.panel) return;

        this.panel.webview.html = this.getDashboardHtml(state);
    }

    /**
     * Generate dashboard HTML
     */
    private getDashboardHtml(state: ContextUsageState): string {
        const usageColor = this.getUsageColor(state.usagePercentage);
        const status = this.getUsageStatus(state.usagePercentage);
        
        return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Context Usage Dashboard</title>
            <style>
                body {
                    font-family: var(--vscode-font-family);
                    padding: 20px;
                    margin: 0;
                    background: var(--vscode-editor-background);
                    color: var(--vscode-editor-foreground);
                }
                .dashboard {
                    max-width: 800px;
                    margin: 0 auto;
                }
                .header {
                    text-align: center;
                    margin-bottom: 30px;
                }
                .status-card {
                    background: var(--vscode-panel-background);
                    border: 1px solid var(--vscode-panel-border);
                    border-radius: 8px;
                    padding: 20px;
                    margin: 20px 0;
                    text-align: center;
                }
                .usage-ring {
                    width: 200px;
                    height: 200px;
                    margin: 0 auto 20px;
                    position: relative;
                }
                .ring-background {
                    width: 100%;
                    height: 100%;
                    border-radius: 50%;
                    background: conic-gradient(
                        ${usageColor} 0deg ${state.usagePercentage * 3.6}deg,
                        var(--vscode-input-background) ${state.usagePercentage * 3.6}deg 360deg
                    );
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }
                .ring-inner {
                    width: 140px;
                    height: 140px;
                    background: var(--vscode-panel-background);
                    border-radius: 50%;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                }
                .usage-percentage {
                    font-size: 32px;
                    font-weight: bold;
                    color: ${usageColor};
                }
                .usage-label {
                    font-size: 14px;
                    color: var(--vscode-descriptionForeground);
                }
                .stats-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                    gap: 15px;
                    margin: 20px 0;
                }
                .stat-card {
                    background: var(--vscode-input-background);
                    border: 1px solid var(--vscode-input-border);
                    border-radius: 6px;
                    padding: 15px;
                    text-align: center;
                }
                .stat-value {
                    font-size: 24px;
                    font-weight: bold;
                    margin-bottom: 5px;
                }
                .stat-label {
                    font-size: 12px;
                    color: var(--vscode-descriptionForeground);
                }
                .suggestions {
                    background: var(--vscode-panel-background);
                    border: 1px solid var(--vscode-panel-border);
                    border-radius: 6px;
                    padding: 15px;
                    margin: 20px 0;
                }
                .suggestion-item {
                    background: var(--vscode-input-background);
                    border-left: 3px solid var(--vscode-charts-blue);
                    padding: 10px;
                    margin: 10px 0;
                    border-radius: 0 4px 4px 0;
                }
                .action-buttons {
                    display: flex;
                    gap: 10px;
                    justify-content: center;
                    margin: 20px 0;
                    flex-wrap: wrap;
                }
                .btn {
                    background: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    padding: 10px 20px;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 14px;
                }
                .btn:hover {
                    background: var(--vscode-button-hoverBackground);
                }
                .btn-secondary {
                    background: var(--vscode-input-background);
                    color: var(--vscode-input-foreground);
                    border: 1px solid var(--vscode-input-border);
                }
                .btn-secondary:hover {
                    background: var(--vscode-list-hoverBackground);
                }
                .status-${status.toLowerCase()} {
                    color: ${usageColor};
                }
                .last-updated {
                    font-size: 12px;
                    color: var(--vscode-descriptionForeground);
                    text-align: center;
                    margin-top: 20px;
                }
            </style>
        </head>
        <body>
            <div class="dashboard">
                <div class="header">
                    <h1>🧠 Context Usage Dashboard</h1>
                    <p>Real-time monitoring of Claude conversation context window</p>
                </div>

                <div class="status-card">
                    <div class="usage-ring">
                        <div class="ring-background">
                            <div class="ring-inner">
                                <div class="usage-percentage">${state.usagePercentage.toFixed(1)}%</div>
                                <div class="usage-label">Used</div>
                            </div>
                        </div>
                    </div>
                    <h2 class="status-${status.toLowerCase()}">Status: ${status}</h2>
                    ${state.activeConversation ? `<p>Active: ${state.activeConversation}</p>` : ''}
                </div>

                <div class="stats-grid">
                    <div class="stat-card">
                        <div class="stat-value">${this.formatTokenCount(state.currentTokens)}</div>
                        <div class="stat-label">Current Tokens</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value">${this.formatTokenCount(state.contextLimit)}</div>
                        <div class="stat-label">Context Limit</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value">${this.formatTokenCount(state.contextLimit - state.currentTokens)}</div>
                        <div class="stat-label">Remaining</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value">${state.suggestedActions.length}</div>
                        <div class="stat-label">Suggestions</div>
                    </div>
                </div>

                ${state.suggestedActions.length > 0 ? `
                <div class="suggestions">
                    <h3>💡 Optimization Suggestions</h3>
                    ${state.suggestedActions.map(action => `
                        <div class="suggestion-item">${action}</div>
                    `).join('')}
                </div>
                ` : ''}

                <div class="action-buttons">
                    <button class="btn" onclick="loadConversation()">📁 Load Conversation</button>
                    <button class="btn btn-secondary" onclick="refreshMonitoring()">🔄 Refresh</button>
                    <button class="btn btn-secondary" onclick="openForkManager()">🌳 Fork Manager</button>
                    ${state.suggestedActions.length > 0 ? `
                    <button class="btn" onclick="pruneRecommended()">✂️ Pruning Guide</button>
                    ` : ''}
                </div>

                <div class="last-updated">
                    Last updated: ${state.lastUpdated.toLocaleString()}
                </div>
            </div>

            <script>
                const vscode = acquireVsCodeApi();
                
                function loadConversation() {
                    vscode.postMessage({ type: 'loadConversation' });
                }
                
                function refreshMonitoring() {
                    vscode.postMessage({ type: 'refreshMonitoring' });
                }
                
                function openForkManager() {
                    vscode.postMessage({ type: 'openForkManager' });
                }
                
                function pruneRecommended() {
                    vscode.postMessage({ type: 'pruneRecommended' });
                }

                // Listen for state updates
                window.addEventListener('message', event => {
                    const message = event.data;
                    if (message.type === 'updateState') {
                        // Reload the page with new state
                        location.reload();
                    }
                });
            </script>
        </body>
        </html>
        `;
    }

    /**
     * Generate recommendations HTML
     */
    private getRecommendationsHtml(recommendations: string): string {
        return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <style>
                body { 
                    font-family: var(--vscode-font-family); 
                    padding: 20px; 
                    line-height: 1.6;
                }
                h1, h2 { color: var(--vscode-symbolIcon-functionForeground); }
                code { 
                    background: var(--vscode-textCodeBlock-background); 
                    padding: 2px 4px; 
                    border-radius: 3px; 
                }
            </style>
        </head>
        <body>
            ${recommendations.split('\n').map(line => {
                if (line.startsWith('# ')) return `<h1>${line.substring(2)}</h1>`;
                if (line.startsWith('## ')) return `<h2>${line.substring(3)}</h2>`;
                if (line.startsWith('**') && line.endsWith('**')) return `<strong>${line.slice(2, -2)}</strong>`;
                if (line.startsWith('- ')) return `<li>${line.substring(2)}</li>`;
                return line ? `<p>${line}</p>` : '<br>';
            }).join('')}
        </body>
        </html>
        `;
    }

    /**
     * Get usage color based on percentage
     */
    private getUsageColor(percentage: number): string {
        if (percentage >= 90) return 'var(--vscode-charts-red)';
        if (percentage >= 70) return 'var(--vscode-charts-orange)';
        if (percentage >= 50) return 'var(--vscode-charts-yellow)';
        return 'var(--vscode-charts-green)';
    }

    /**
     * Get usage status text
     */
    private getUsageStatus(percentage: number): string {
        if (percentage >= 90) return 'CRITICAL';
        if (percentage >= 70) return 'WARNING';
        if (percentage >= 50) return 'MODERATE';
        return 'HEALTHY';
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
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
        }
        if (this.panel) {
            this.panel.dispose();
        }
    }
}