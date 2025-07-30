import * as vscode from 'vscode';
import { TokenTracker, UsageStatistics } from '../tokenTracker';

export async function viewUsageStatsCommand(): Promise<void> {
    const tokenTracker = TokenTracker.getInstance();
    const stats = tokenTracker.getStatistics();
    
    // Create and show webview panel
    const panel = vscode.window.createWebviewPanel(
        'claudeUsageStats',
        'Claude Usage Statistics',
        vscode.ViewColumn.One,
        {
            enableScripts: true,
            retainContextWhenHidden: true
        }
    );

    panel.webview.html = generateUsageStatsHtml(stats);
    
    // Handle messages from webview
    panel.webview.onDidReceiveMessage(async (message) => {
        switch (message.command) {
            case 'resetStats':
                const result = await vscode.window.showWarningMessage(
                    'Are you sure you want to reset all usage statistics? This action cannot be undone.',
                    'Reset',
                    'Cancel'
                );
                if (result === 'Reset') {
                    await tokenTracker.resetStatistics();
                    panel.webview.html = generateUsageStatsHtml(tokenTracker.getStatistics());
                }
                break;
            case 'refreshStats':
                panel.webview.html = generateUsageStatsHtml(tokenTracker.getStatistics());
                break;
        }
    });
}

export async function showUsageQuickPickCommand(): Promise<void> {
    const tokenTracker = TokenTracker.getInstance();
    const stats = tokenTracker.getStatistics();
    
    const items: vscode.QuickPickItem[] = [
        {
            label: '📊 Total Usage',
            detail: `${stats.totalTokens.toLocaleString()} tokens • $${stats.totalCost.toFixed(4)} • ${stats.operationCount} operations`
        },
        {
            label: '📅 Daily Usage',
            detail: `Last ${stats.dailyUsage.length} days tracked`
        },
        {
            label: '📆 Weekly Usage', 
            detail: `Last ${stats.weeklyUsage.length} weeks tracked`
        },
        {
            label: '📈 Monthly Usage',
            detail: `Last ${stats.monthlyUsage.length} months tracked`
        },
        {
            label: '🔄 Reset Statistics',
            detail: 'Clear all usage data'
        },
        {
            label: '📋 View Detailed Report',
            detail: 'Open full statistics view'
        }
    ];

    const selected = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select usage statistics option'
    });

    if (!selected) {
        return;
    }

    switch (selected.label) {
        case '📅 Daily Usage':
            showDailyUsageQuickPick(stats);
            break;
        case '📆 Weekly Usage':
            showWeeklyUsageQuickPick(stats);
            break;
        case '📈 Monthly Usage':
            showMonthlyUsageQuickPick(stats);
            break;
        case '🔄 Reset Statistics':
            const result = await vscode.window.showWarningMessage(
                'Are you sure you want to reset all usage statistics?',
                'Reset',
                'Cancel'
            );
            if (result === 'Reset') {
                await tokenTracker.resetStatistics();
                vscode.window.showInformationMessage('Usage statistics reset successfully');
            }
            break;
        case '📋 View Detailed Report':
            await viewUsageStatsCommand();
            break;
    }
}

async function showDailyUsageQuickPick(stats: UsageStatistics): Promise<void> {
    const items = stats.dailyUsage.map(day => ({
        label: `📅 ${day.date}`,
        detail: `${day.tokens.toLocaleString()} tokens • $${day.cost.toFixed(4)} • ${day.operations} operations`
    }));

    await vscode.window.showQuickPick(items, {
        placeHolder: 'Daily usage breakdown'
    });
}

async function showWeeklyUsageQuickPick(stats: UsageStatistics): Promise<void> {
    const items = stats.weeklyUsage.map(week => ({
        label: `📆 ${week.weekStart} to ${week.weekEnd}`,
        detail: `${week.tokens.toLocaleString()} tokens • $${week.cost.toFixed(4)} • ${week.operations} operations`
    }));

    await vscode.window.showQuickPick(items, {
        placeHolder: 'Weekly usage breakdown'
    });
}

async function showMonthlyUsageQuickPick(stats: UsageStatistics): Promise<void> {
    const items = stats.monthlyUsage.map(month => ({
        label: `📈 ${month.month} ${month.year}`,
        detail: `${month.tokens.toLocaleString()} tokens • $${month.cost.toFixed(4)} • ${month.operations} operations`
    }));

    await vscode.window.showQuickPick(items, {
        placeHolder: 'Monthly usage breakdown'
    });
}

function generateUsageStatsHtml(stats: UsageStatistics): string {
    const theme = vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark ? 'dark' : 'light';
    
    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Claude Usage Statistics</title>
        <style>
            body {
                font-family: var(--vscode-font-family);
                font-size: var(--vscode-font-size);
                color: var(--vscode-foreground);
                background-color: var(--vscode-editor-background);
                padding: 20px;
                line-height: 1.6;
            }
            
            .header {
                border-bottom: 1px solid var(--vscode-panel-border);
                padding-bottom: 20px;
                margin-bottom: 30px;
            }
            
            .title {
                font-size: 24px;
                font-weight: bold;
                margin-bottom: 10px;
            }
            
            .subtitle {
                color: var(--vscode-descriptionForeground);
                font-size: 14px;
            }
            
            .stats-grid {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
                gap: 20px;
                margin-bottom: 30px;
            }
            
            .stat-card {
                background-color: var(--vscode-editor-inactiveSelectionBackground);
                border: 1px solid var(--vscode-panel-border);
                border-radius: 6px;
                padding: 20px;
                text-align: center;
            }
            
            .stat-number {
                font-size: 28px;
                font-weight: bold;
                color: var(--vscode-textLink-foreground);
                margin-bottom: 5px;
            }
            
            .stat-label {
                font-size: 14px;
                color: var(--vscode-descriptionForeground);
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }
            
            .section {
                margin-bottom: 40px;
            }
            
            .section-title {
                font-size: 18px;
                font-weight: bold;
                margin-bottom: 15px;
                border-bottom: 1px solid var(--vscode-panel-border);
                padding-bottom: 5px;
            }
            
            .usage-table {
                width: 100%;
                border-collapse: collapse;
                margin-bottom: 20px;
            }
            
            .usage-table th,
            .usage-table td {
                padding: 12px;
                text-align: left;
                border-bottom: 1px solid var(--vscode-panel-border);
            }
            
            .usage-table th {
                background-color: var(--vscode-editor-inactiveSelectionBackground);
                font-weight: bold;
            }
            
            .usage-table tr:hover {
                background-color: var(--vscode-list-hoverBackground);
            }
            
            .button-group {
                margin-top: 30px;
                text-align: center;
            }
            
            .button {
                background-color: var(--vscode-button-background);
                color: var(--vscode-button-foreground);
                border: none;
                padding: 10px 20px;
                margin: 0 10px;
                border-radius: 4px;
                cursor: pointer;
                font-size: 14px;
            }
            
            .button:hover {
                background-color: var(--vscode-button-hoverBackground);
            }
            
            .button.secondary {
                background-color: var(--vscode-button-secondaryBackground);
                color: var(--vscode-button-secondaryForeground);
            }
            
            .button.secondary:hover {
                background-color: var(--vscode-button-secondaryHoverBackground);
            }
            
            .empty-state {
                text-align: center;
                color: var(--vscode-descriptionForeground);
                font-style: italic;
                padding: 40px;
            }
            
            .usage-breakdown {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                gap: 15px;
                margin-top: 20px;
            }
            
            .breakdown-item {
                background-color: var(--vscode-editor-inactiveSelectionBackground);
                padding: 15px;
                border-radius: 4px;
                text-align: center;
            }
            
            .breakdown-number {
                font-size: 20px;
                font-weight: bold;
                color: var(--vscode-textLink-foreground);
            }
            
            .breakdown-label {
                font-size: 12px;
                color: var(--vscode-descriptionForeground);
                margin-top: 5px;
            }
        </style>
    </head>
    <body>
        <div class="header">
            <div class="title">📊 Claude Code Usage Statistics</div>
            <div class="subtitle">Real-time tracking of Claude Code token usage • Last updated: ${new Date(stats.lastUpdated).toLocaleString()}</div>
        </div>
        
        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-number">${stats.totalTokens.toLocaleString()}</div>
                <div class="stat-label">Total Tokens</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">$${stats.totalCost.toFixed(4)}</div>
                <div class="stat-label">Total Cost</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">${stats.operationCount.toLocaleString()}</div>
                <div class="stat-label">Operations</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">${stats.totalTokens > 0 ? (stats.totalCost / stats.totalTokens * 1000).toFixed(6) : '0'}</div>
                <div class="stat-label">Cost per 1K Tokens</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">${new Date(stats.lastUpdated).toLocaleDateString()}</div>
                <div class="stat-label">Last Activity</div>
            </div>
        </div>
        
        <div class="section">
            <div class="section-title">🔍 Token Breakdown</div>
            <div class="usage-breakdown">
                <div class="breakdown-item">
                    <div class="breakdown-number">${stats.totalInputTokens.toLocaleString()}</div>
                    <div class="breakdown-label">Input Tokens</div>
                    <div class="breakdown-label">$${((stats.totalInputTokens / 1000000) * 15).toFixed(4)}</div>
                </div>
                <div class="breakdown-item">
                    <div class="breakdown-number">${stats.totalOutputTokens.toLocaleString()}</div>
                    <div class="breakdown-label">Output Tokens</div>
                    <div class="breakdown-label">$${((stats.totalOutputTokens / 1000000) * 75).toFixed(4)}</div>
                </div>
                <div class="breakdown-item">
                    <div class="breakdown-number">${stats.totalCacheCreationTokens.toLocaleString()}</div>
                    <div class="breakdown-label">Cache Creation</div>
                    <div class="breakdown-label">$${((stats.totalCacheCreationTokens / 1000000) * 18.75).toFixed(4)}</div>
                </div>
                <div class="breakdown-item">
                    <div class="breakdown-number">${stats.totalCacheReadTokens.toLocaleString()}</div>
                    <div class="breakdown-label">Cache Read</div>
                    <div class="breakdown-label">$${((stats.totalCacheReadTokens / 1000000) * 1.50).toFixed(4)}</div>
                </div>
            </div>
        </div>
        
        ${generateUsageSection('📅 Daily Usage', stats.dailyUsage, ['Date', 'Tokens', 'Cost', 'Operations'])}
        ${generateUsageSection('📆 Weekly Usage', stats.weeklyUsage, ['Week', 'Tokens', 'Cost', 'Operations'])}
        ${generateUsageSection('📈 Monthly Usage', stats.monthlyUsage, ['Month', 'Tokens', 'Cost', 'Operations'])}
        
        <div class="button-group">
            <button class="button secondary" onclick="refreshStats()">🔄 Refresh</button>
            <button class="button secondary" onclick="resetStats()">🗑️ Reset Statistics</button>
        </div>
        
        <script>
            const vscode = acquireVsCodeApi();
            
            function refreshStats() {
                vscode.postMessage({ command: 'refreshStats' });
            }
            
            function resetStats() {
                vscode.postMessage({ command: 'resetStats' });
            }
        </script>
    </body>
    </html>`;
}

function generateUsageSection(title: string, data: any[], headers: string[]): string {
    if (data.length === 0) {
        return `
        <div class="section">
            <div class="section-title">${title}</div>
            <div class="empty-state">No data available</div>
        </div>`;
    }
    
    const tableRows = data.map(item => {
        let cells = '';
        
        if (title.includes('Daily')) {
            cells = `
                <td>${item.date}</td>
                <td>${item.tokens.toLocaleString()}</td>
                <td>$${item.cost.toFixed(4)}</td>
                <td>${item.operations}</td>`;
        } else if (title.includes('Weekly')) {
            cells = `
                <td>${item.weekStart} - ${item.weekEnd}</td>
                <td>${item.tokens.toLocaleString()}</td>
                <td>$${item.cost.toFixed(4)}</td>
                <td>${item.operations}</td>`;
        } else if (title.includes('Monthly')) {
            cells = `
                <td>${item.month} ${item.year}</td>
                <td>${item.tokens.toLocaleString()}</td>
                <td>$${item.cost.toFixed(4)}</td>
                <td>${item.operations}</td>`;
        }
        
        return `<tr>${cells}</tr>`;
    }).join('');
    
    const headerRow = headers.map(header => `<th>${header}</th>`).join('');
    
    return `
    <div class="section">
        <div class="section-title">${title}</div>
        <table class="usage-table">
            <thead>
                <tr>${headerRow}</tr>
            </thead>
            <tbody>
                ${tableRows}
            </tbody>
        </table>
    </div>`;
}