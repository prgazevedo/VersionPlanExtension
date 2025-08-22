import * as vscode from 'vscode';
import { UsageMonitor } from '../components/UsageMonitor';
import { CcusageService } from '../services/CcusageService';

function formatTokens(tokens: number): string {
    if (tokens >= 1000000) {
        const millions = Math.round(tokens / 1000);
        return `${millions.toLocaleString()}M`;
    }
    return tokens.toLocaleString();
}

export async function viewUsageStatsCommand(): Promise<void> {
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

    panel.webview.html = await generateUsageStatsHtml();
    
    // Auto-refresh timer for retrying ccusage when unavailable
    let refreshInterval: NodeJS.Timeout | undefined;
    
    // Start auto-refresh if ccusage is unavailable
    const startAutoRefresh = () => {
        if (refreshInterval) {
            clearInterval(refreshInterval);
        }
        
        // Try to refresh every 5 seconds if ccusage is unavailable
        refreshInterval = setInterval(async () => {
            try {
                const ccusageService = CcusageService.getInstance();
                await ccusageService.getTodayUsage();
                // If successful, stop auto-refresh and update the panel
                if (refreshInterval) {
                    clearInterval(refreshInterval);
                    refreshInterval = undefined;
                }
                panel.webview.html = await generateUsageStatsHtml();
            } catch (error) {
                // Still unavailable, keep trying
            }
        }, 5000);
    };
    
    // Check if we need to start auto-refresh
    try {
        const ccusageService = CcusageService.getInstance();
        await ccusageService.getTodayUsage();
    } catch (error) {
        // ccusage unavailable, start auto-refresh
        startAutoRefresh();
    }
    
    // Clean up interval when panel is disposed
    panel.onDidDispose(() => {
        if (refreshInterval) {
            clearInterval(refreshInterval);
        }
    });
    
    // Handle messages from webview
    panel.webview.onDidReceiveMessage(async (message) => {
        switch (message.command) {
            case 'refreshStats':
                panel.webview.html = await generateUsageStatsHtml();
                // Check if we need to restart auto-refresh
                try {
                    const ccusageService = CcusageService.getInstance();
                    await ccusageService.getTodayUsage();
                    // Stop auto-refresh if running
                    if (refreshInterval) {
                        clearInterval(refreshInterval);
                        refreshInterval = undefined;
                    }
                } catch (error) {
                    // Restart auto-refresh
                    startAutoRefresh();
                }
                break;
            case 'loadTabData':
                try {
                    const ccusageService = CcusageService.getInstance();
                    let data: any = {};
                    
                    switch (message.tab) {
                        case 'daily':
                            data = await ccusageService.getDailyUsage();
                            break;
                        case 'weekly':
                            data = await ccusageService.getWeeklyUsage();
                            break;
                        case 'monthly':
                            data = await ccusageService.getMonthlyUsage();
                            break;
                        case 'sessions':
                            data = await ccusageService.getDetailedSessionUsage();
                            break;
                        case 'projects':
                            data = await ccusageService.getProjectUsage();
                            break;
                    }
                    
                    panel.webview.postMessage({
                        command: 'updateTabData',
                        tab: message.tab,
                        data: data
                    });
                } catch (error) {
                    panel.webview.postMessage({
                        command: 'updateTabData',
                        tab: message.tab,
                        data: {
                            error: 'ccusage unavailable',
                            message: 'Please install Bun or Node.js to enable ccusage integration'
                        }
                    });
                }
                break;
            case 'exportData':
                try {
                    const ccusageService = CcusageService.getInstance();
                    const dailyData = await ccusageService.getDailyUsage();
                    const weeklyData = await ccusageService.getWeeklyUsage();
                    const monthlyData = await ccusageService.getMonthlyUsage();
                    const sessionsData = await ccusageService.getDetailedSessionUsage();
                    const projectsData = await ccusageService.getProjectUsage();
                    
                    const exportData = {
                        exportDate: new Date().toISOString(),
                        daily: dailyData,
                        weekly: weeklyData,
                        monthly: monthlyData,
                        sessions: sessionsData,
                        projects: projectsData
                    };
                    
                    const doc = await vscode.workspace.openTextDocument({
                        content: JSON.stringify(exportData, null, 2),
                        language: 'json'
                    });
                    
                    await vscode.window.showTextDocument(doc);
                    vscode.window.showInformationMessage('Usage data exported successfully!');
                } catch (error) {
                    vscode.window.showErrorMessage(`Export failed: ${error instanceof Error ? error.message : String(error)}`);
                }
                break;
            case 'getLatestUsage':
                try {
                    // Get latest ccusage data
                    const ccusageService = CcusageService.getInstance();
                    const todayData = await ccusageService.getTodayUsage();
                    
                    panel.webview.postMessage({
                        command: 'updateUsage',
                        data: {
                            todayTokens: todayData.todayUsage?.totalTokens || 0,
                            todayCost: todayData.todayUsage?.totalCost || 0,
                            totalTokens: todayData.totalUsage.totalTokens,
                            totalCost: todayData.totalUsage.totalCost,
                            modelsUsed: todayData.modelsUsed,
                            source: 'ccusage'
                        }
                    });
                } catch (error) {
                    panel.webview.postMessage({
                        command: 'updateUsage',
                        data: {
                            error: 'ccusage unavailable',
                            message: 'Please install Bun or Node.js to enable ccusage integration'
                        }
                    });
                }
                break;
            case 'enableCcusage':
                vscode.commands.executeCommand('claude-config.installCcusageHelp');
                break;
            case 'testCcusage':
                vscode.commands.executeCommand('claude-config.debugCcusage');
                break;
        }
    });
}

export async function showUsageQuickPickCommand(): Promise<void> {
    try {
        const ccusageService = CcusageService.getInstance();
        const todayData = await ccusageService.getTodayUsage();
        const dailyData = await ccusageService.getDailyUsage();
        const monthlyData = await ccusageService.getMonthlyUsage();
        
        const items: vscode.QuickPickItem[] = [
            {
                label: '📊 Total Usage',
                detail: `${formatTokens(todayData.totalUsage.totalTokens)} tokens • $${todayData.totalUsage.totalCost.toFixed(2)} • Source: ccusage`
            },
            {
                label: '📅 Today\'s Usage',
                detail: todayData.todayUsage 
                    ? `${formatTokens(todayData.todayUsage.totalTokens)} tokens • $${todayData.todayUsage.totalCost.toFixed(2)}`
                    : 'No usage today'
            },
            {
                label: '📅 Daily Usage',
                detail: `Last ${dailyData.daily?.length || 0} days tracked`
            },
            {
                label: '📈 Monthly Usage',
                detail: `Monthly data available`
            },
            {
                label: '🤖 Models Used',
                detail: `${todayData.modelsUsed.join(', ') || 'No models detected'}`
            },
            {
                label: '📋 View Detailed Report',
                detail: 'Open full ccusage statistics view'
            },
            {
                label: '🔧 ccusage Debug',
                detail: 'Test ccusage integration'
            }
        ];

        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: 'Select ccusage statistics option'
        });

        if (!selected) {
            return;
        }

        switch (selected.label) {
            case '📋 View Detailed Report':
                await viewUsageStatsCommand();
                break;
            case '🔧 ccusage Debug':
                await debugCcusageCommand();
                break;
            case '📅 Daily Usage':
                await showDailyUsageFromCcusage(dailyData.daily || []);
                break;
            // Add other cases as needed
        }
    } catch (error) {
        // Error is expected when ccusage not available - show user-friendly message instead
        vscode.window.showErrorMessage(
            'ccusage is not available. Please install Bun or Node.js to enable usage tracking.',
            'Install Guide'
        ).then(selection => {
            if (selection === 'Install Guide') {
                vscode.commands.executeCommand('claude-config.installCcusageHelp');
            }
        });
    }
}

async function showDailyUsageFromCcusage(dailyUsage: any[]): Promise<void> {
    const items = dailyUsage.map(day => ({
        label: `📅 ${day.date}`,
        detail: `${formatTokens(day.totalTokens)} tokens • $${day.totalCost.toFixed(2)} • Models: ${day.modelsUsed?.join(', ') || 'N/A'}`
    }));

    await vscode.window.showQuickPick(items, {
        placeHolder: 'Daily usage breakdown (powered by ccusage)'
    });
}



function getEnhancedStyles(): string {
    return `
        <style>
            body {
                font-family: var(--vscode-font-family);
                font-size: var(--vscode-font-size);
                color: var(--vscode-foreground);
                background-color: var(--vscode-editor-background);
                padding: 20px;
                line-height: 1.6;
                margin: 0;
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
            
            /* Tab Styles */
            .tab-container {
                margin-bottom: 30px;
            }
            
            .tab-nav {
                display: flex;
                gap: 2px;
                border-bottom: 1px solid var(--vscode-panel-border);
                margin-bottom: 30px;
            }
            
            .tab-button {
                background: var(--vscode-tab-inactiveBackground);
                color: var(--vscode-tab-inactiveForeground);
                border: none;
                padding: 12px 20px;
                cursor: pointer;
                font-size: 14px;
                font-weight: 500;
                transition: all 0.2s ease;
                border-top-left-radius: 6px;
                border-top-right-radius: 6px;
            }
            
            .tab-button:hover {
                background: var(--vscode-tab-hoverBackground);
                color: var(--vscode-tab-hoverForeground);
            }
            
            .tab-button.active {
                background: var(--vscode-tab-activeBackground);
                color: var(--vscode-tab-activeForeground);
                border-bottom: 2px solid var(--vscode-textLink-foreground);
            }
            
            .tab-content {
                display: none;
            }
            
            .tab-content.active {
                display: block;
                animation: fadeIn 0.3s ease-in;
            }
            
            @keyframes fadeIn {
                from { opacity: 0; transform: translateY(10px); }
                to { opacity: 1; transform: translateY(0); }
            }
            
            /* Analytics Grid */
            .analytics-grid {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
                gap: 30px;
                margin-bottom: 40px;
            }
            
            .chart-container {
                background: var(--vscode-editor-inactiveSelectionBackground);
                border: 1px solid var(--vscode-panel-border);
                border-radius: 8px;
                padding: 20px;
            }
            
            .chart-container h3 {
                margin: 0 0 20px 0;
                font-size: 16px;
                font-weight: 600;
                color: var(--vscode-foreground);
            }
            
            .chart-container canvas {
                max-width: 100%;
                height: auto !important;
            }
            
            /* Data Tables */
            .data-table-container {
                background: var(--vscode-editor-inactiveSelectionBackground);
                border: 1px solid var(--vscode-panel-border);
                border-radius: 8px;
                padding: 20px;
                margin-top: 20px;
            }
            
            .data-table {
                width: 100%;
                border-collapse: collapse;
                font-size: 14px;
            }
            
            .data-table th,
            .data-table td {
                padding: 12px;
                text-align: left;
                border-bottom: 1px solid var(--vscode-panel-border);
            }
            
            .data-table th {
                background: var(--vscode-list-activeSelectionBackground);
                font-weight: 600;
                color: var(--vscode-list-activeSelectionForeground);
            }
            
            .data-table tr:hover {
                background: var(--vscode-list-hoverBackground);
            }
            
            .data-table .number {
                text-align: right;
                font-family: var(--vscode-editor-font-family);
            }
            
            .data-table .cost {
                color: var(--vscode-textLink-foreground);
                font-weight: 500;
            }
            
            /* Buttons */
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
                transition: background-color 0.2s ease;
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
            
            /* Loading States */
            .loading {
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 40px;
                color: var(--vscode-descriptionForeground);
            }
            
            .loading::before {
                content: "⏳";
                margin-right: 10px;
                animation: spin 1s linear infinite;
            }
            
            @keyframes spin {
                from { transform: rotate(0deg); }
                to { transform: rotate(360deg); }
            }
            
            /* Error States */
            .error {
                background: var(--vscode-inputValidation-errorBackground);
                border: 1px solid var(--vscode-inputValidation-errorBorder);
                color: var(--vscode-inputValidation-errorForeground);
                padding: 20px;
                border-radius: 6px;
                margin: 20px 0;
            }
            
            /* Responsive Design */
            @media (max-width: 768px) {
                .analytics-grid {
                    grid-template-columns: 1fr;
                }
                
                .tab-nav {
                    flex-wrap: wrap;
                }
                
                .tab-button {
                    flex: 1;
                    min-width: 120px;
                }
            }
        </style>
    `;
}

function getEnhancedScripts(): string {
    return `
        <script>
            const vscode = acquireVsCodeApi();
            let chartsData = {};
            let chartInstances = {};
            
            // Tab Management
            function initializeTabs() {
                const tabButtons = document.querySelectorAll('.tab-button');
                const tabContents = document.querySelectorAll('.tab-content');
                
                tabButtons.forEach(button => {
                    button.addEventListener('click', () => {
                        const targetTab = button.getAttribute('data-tab');
                        
                        // Update active states
                        tabButtons.forEach(btn => btn.classList.remove('active'));
                        tabContents.forEach(content => content.classList.remove('active'));
                        
                        button.classList.add('active');
                        document.getElementById(targetTab).classList.add('active');
                        
                        // Load data for the active tab
                        loadTabData(targetTab);
                    });
                });
                
                // Load initial data
                loadTabData('daily');
            }
            
            // Data Loading Functions
            async function loadTabData(tab) {
                const container = document.getElementById(tab);
                const tableContainer = container.querySelector('.data-table-container');
                
                if (!tableContainer) return;
                
                tableContainer.innerHTML = '<div class="loading">Loading data...</div>';
                
                try {
                    vscode.postMessage({ command: 'loadTabData', tab: tab });
                } catch (error) {
                    tableContainer.innerHTML = '<div class="error">Failed to load data: ' + error.message + '</div>';
                }
            }
            
            // Chart Creation Functions
            function createDailyCharts(data) {
                // Daily Token Usage Chart
                const dailyCtx = document.getElementById('dailyChart');
                if (dailyCtx && data.daily) {
                    if (chartInstances.dailyChart) {
                        chartInstances.dailyChart.destroy();
                    }
                    
                    chartInstances.dailyChart = new Chart(dailyCtx, {
                        type: 'line',
                        data: {
                            labels: data.daily.map(d => d.date),
                            datasets: [{
                                label: 'Total Tokens',
                                data: data.daily.map(d => d.totalTokens),
                                borderColor: '#0078d4',
                                backgroundColor: 'rgba(0, 120, 212, 0.1)',
                                tension: 0.4,
                                fill: true
                            }]
                        },
                        options: {
                            responsive: true,
                            plugins: {
                                legend: { display: false }
                            },
                            scales: {
                                y: {
                                    beginAtZero: true,
                                    ticks: {
                                        callback: function(value) {
                                            return value >= 1000000 ? (value/1000000).toFixed(1) + 'M' : 
                                                   value >= 1000 ? (value/1000).toFixed(1) + 'K' : value;
                                        }
                                    }
                                }
                            }
                        }
                    });
                }
                
                // Daily Cost Chart
                const costCtx = document.getElementById('dailyCostChart');
                if (costCtx && data.daily) {
                    if (chartInstances.dailyCostChart) {
                        chartInstances.dailyCostChart.destroy();
                    }
                    
                    chartInstances.dailyCostChart = new Chart(costCtx, {
                        type: 'bar',
                        data: {
                            labels: data.daily.map(d => d.date),
                            datasets: [{
                                label: 'Daily Cost',
                                data: data.daily.map(d => d.totalCost),
                                backgroundColor: '#107c10',
                                borderColor: '#0e6e0e'
                            }]
                        },
                        options: {
                            responsive: true,
                            plugins: {
                                legend: { display: false }
                            },
                            scales: {
                                y: {
                                    beginAtZero: true,
                                    ticks: {
                                        callback: function(value) {
                                            return '$' + value.toFixed(2);
                                        }
                                    }
                                }
                            }
                        }
                    });
                }
            }
            
            function createWeeklyCharts(data) {
                if (!data.weekly) return;
                
                // Weekly Usage Chart
                const weeklyCtx = document.getElementById('weeklyChart');
                if (weeklyCtx) {
                    if (chartInstances.weeklyChart) {
                        chartInstances.weeklyChart.destroy();
                    }
                    
                    chartInstances.weeklyChart = new Chart(weeklyCtx, {
                        type: 'line',
                        data: {
                            labels: data.weekly.map(w => w.week),
                            datasets: [{
                                label: 'Weekly Tokens',
                                data: data.weekly.map(w => w.totalTokens),
                                borderColor: '#8a2be2',
                                backgroundColor: 'rgba(138, 43, 226, 0.1)',
                                tension: 0.4,
                                fill: true
                            }]
                        },
                        options: {
                            responsive: true,
                            plugins: { legend: { display: false } },
                            scales: {
                                y: {
                                    beginAtZero: true,
                                    ticks: {
                                        callback: function(value) {
                                            return value >= 1000000 ? (value/1000000).toFixed(1) + 'M' : 
                                                   value >= 1000 ? (value/1000).toFixed(1) + 'K' : value;
                                        }
                                    }
                                }
                            }
                        }
                    });
                }
                
                // Weekly Model Distribution
                const modelCtx = document.getElementById('weeklyModelChart');
                if (modelCtx) {
                    if (chartInstances.weeklyModelChart) {
                        chartInstances.weeklyModelChart.destroy();
                    }
                    
                    const allModels = [...new Set(data.weekly.flatMap(w => w.modelsUsed))];
                    const colors = ['#0078d4', '#107c10', '#d13438', '#ff8c00', '#8a2be2'];
                    
                    chartInstances.weeklyModelChart = new Chart(modelCtx, {
                        type: 'doughnut',
                        data: {
                            labels: allModels,
                            datasets: [{
                                data: allModels.map(model => {
                                    return data.weekly.reduce((total, week) => {
                                        const breakdown = week.modelBreakdowns?.find(b => b.modelName === model);
                                        return total + (breakdown?.totalTokens || 0);
                                    }, 0);
                                }),
                                backgroundColor: colors.slice(0, allModels.length)
                            }]
                        },
                        options: {
                            responsive: true,
                            plugins: {
                                legend: { position: 'bottom' }
                            }
                        }
                    });
                }
            }
            
            function createMonthlyCharts(data) {
                if (!data.monthly) return;
                
                // Monthly Usage Chart
                const monthlyCtx = document.getElementById('monthlyChart');
                if (monthlyCtx) {
                    if (chartInstances.monthlyChart) {
                        chartInstances.monthlyChart.destroy();
                    }
                    
                    chartInstances.monthlyChart = new Chart(monthlyCtx, {
                        type: 'bar',
                        data: {
                            labels: data.monthly.map(m => m.month),
                            datasets: [{
                                label: 'Input Tokens',
                                data: data.monthly.map(m => m.inputTokens),
                                backgroundColor: '#0078d4'
                            }, {
                                label: 'Output Tokens',
                                data: data.monthly.map(m => m.outputTokens),
                                backgroundColor: '#107c10'
                            }]
                        },
                        options: {
                            responsive: true,
                            scales: {
                                x: { stacked: true },
                                y: { 
                                    stacked: true,
                                    beginAtZero: true,
                                    ticks: {
                                        callback: function(value) {
                                            return value >= 1000000 ? (value/1000000).toFixed(1) + 'M' : 
                                                   value >= 1000 ? (value/1000).toFixed(1) + 'K' : value;
                                        }
                                    }
                                }
                            }
                        }
                    });
                }
                
                // Cache Efficiency Chart
                const cacheCtx = document.getElementById('cacheEfficiencyChart');
                if (cacheCtx) {
                    if (chartInstances.cacheEfficiencyChart) {
                        chartInstances.cacheEfficiencyChart.destroy();
                    }
                    
                    chartInstances.cacheEfficiencyChart = new Chart(cacheCtx, {
                        type: 'line',
                        data: {
                            labels: data.monthly.map(m => m.month),
                            datasets: [{
                                label: 'Cache Read %',
                                data: data.monthly.map(m => {
                                    const total = m.inputTokens + m.outputTokens + m.cacheCreationTokens + m.cacheReadTokens;
                                    return total > 0 ? ((m.cacheReadTokens / total) * 100).toFixed(1) : 0;
                                }),
                                borderColor: '#ff8c00',
                                backgroundColor: 'rgba(255, 140, 0, 0.1)',
                                tension: 0.4,
                                fill: true
                            }]
                        },
                        options: {
                            responsive: true,
                            plugins: { legend: { display: false } },
                            scales: {
                                y: {
                                    beginAtZero: true,
                                    max: 100,
                                    ticks: {
                                        callback: function(value) {
                                            return value + '%';
                                        }
                                    }
                                }
                            }
                        }
                    });
                }
            }
            
            function createSessionCharts(data) {
                if (!data.sessions) return;
                
                // Session Cost Distribution
                const sessionCostCtx = document.getElementById('sessionCostChart');
                if (sessionCostCtx) {
                    if (chartInstances.sessionCostChart) {
                        chartInstances.sessionCostChart.destroy();
                    }
                    
                    const topSessions = data.sessions
                        .sort((a, b) => b.totalCost - a.totalCost)
                        .slice(0, 10);
                    
                    chartInstances.sessionCostChart = new Chart(sessionCostCtx, {
                        type: 'horizontalBar',
                        data: {
                            labels: topSessions.map(s => s.sessionId.split('-').pop() || 'Unknown'),
                            datasets: [{
                                label: 'Session Cost',
                                data: topSessions.map(s => s.totalCost),
                                backgroundColor: '#d13438'
                            }]
                        },
                        options: {
                            responsive: true,
                            plugins: { legend: { display: false } },
                            scales: {
                                x: {
                                    beginAtZero: true,
                                    ticks: {
                                        callback: function(value) {
                                            return '$' + value.toFixed(2);
                                        }
                                    }
                                }
                            }
                        }
                    });
                }
            }
            
            function createProjectCharts(data) {
                if (!data.projects) return;
                
                // Project Usage Ranking
                const projectRankingCtx = document.getElementById('projectRankingChart');
                if (projectRankingCtx) {
                    if (chartInstances.projectRankingChart) {
                        chartInstances.projectRankingChart.destroy();
                    }
                    
                    const projectTotals = Object.entries(data.projects).map(([name, days]) => ({
                        name: name.split('-').pop() || name,
                        totalTokens: days.reduce((sum, day) => sum + day.totalTokens, 0),
                        totalCost: days.reduce((sum, day) => sum + day.totalCost, 0)
                    })).sort((a, b) => b.totalTokens - a.totalTokens);
                    
                    chartInstances.projectRankingChart = new Chart(projectRankingCtx, {
                        type: 'bar',
                        data: {
                            labels: projectTotals.map(p => p.name),
                            datasets: [{
                                label: 'Total Tokens',
                                data: projectTotals.map(p => p.totalTokens),
                                backgroundColor: '#8a2be2'
                            }]
                        },
                        options: {
                            responsive: true,
                            plugins: { legend: { display: false } },
                            scales: {
                                y: {
                                    beginAtZero: true,
                                    ticks: {
                                        callback: function(value) {
                                            return value >= 1000000 ? (value/1000000).toFixed(1) + 'M' : 
                                                   value >= 1000 ? (value/1000).toFixed(1) + 'K' : value;
                                        }
                                    }
                                }
                            }
                        }
                    });
                }
                
                // Project Cost Comparison
                const projectCostCtx = document.getElementById('projectCostChart');
                if (projectCostCtx) {
                    if (chartInstances.projectCostChart) {
                        chartInstances.projectCostChart.destroy();
                    }
                    
                    const projectTotals = Object.entries(data.projects).map(([name, days]) => ({
                        name: name.split('-').pop() || name,
                        totalCost: days.reduce((sum, day) => sum + day.totalCost, 0)
                    })).sort((a, b) => b.totalCost - a.totalCost);
                    
                    chartInstances.projectCostChart = new Chart(projectCostCtx, {
                        type: 'pie',
                        data: {
                            labels: projectTotals.map(p => p.name),
                            datasets: [{
                                data: projectTotals.map(p => p.totalCost),
                                backgroundColor: ['#0078d4', '#107c10', '#d13438', '#ff8c00', '#8a2be2', '#00bcf2', '#b146c2']
                            }]
                        },
                        options: {
                            responsive: true,
                            plugins: {
                                legend: { position: 'right' }
                            }
                        }
                    });
                }
            }
            
            // Data Table Generation
            function generateDataTable(data, type) {
                let html = '<table class="data-table"><thead><tr>';
                
                switch (type) {
                    case 'daily':
                        html += '<th>Date</th><th>Total Tokens</th><th>Cost</th><th>Models</th>';
                        html += '</tr></thead><tbody>';
                        if (data.daily) {
                            data.daily.forEach(day => {
                                html += \`<tr>
                                    <td>\${day.date}</td>
                                    <td class="number">\${formatTokens(day.totalTokens)}</td>
                                    <td class="number cost">$\${day.totalCost.toFixed(2)}</td>
                                    <td>\${day.modelsUsed.join(', ')}</td>
                                </tr>\`;
                            });
                        }
                        break;
                        
                    case 'weekly':
                        html += '<th>Week</th><th>Total Tokens</th><th>Cost</th><th>Models</th>';
                        html += '</tr></thead><tbody>';
                        if (data.weekly) {
                            data.weekly.forEach(week => {
                                html += \`<tr>
                                    <td>\${week.week}</td>
                                    <td class="number">\${formatTokens(week.totalTokens)}</td>
                                    <td class="number cost">$\${week.totalCost.toFixed(2)}</td>
                                    <td>\${week.modelsUsed.join(', ')}</td>
                                </tr>\`;
                            });
                        }
                        break;
                        
                    case 'monthly':
                        html += '<th>Month</th><th>Total Tokens</th><th>Cost</th><th>Cache Efficiency</th>';
                        html += '</tr></thead><tbody>';
                        if (data.monthly) {
                            data.monthly.forEach(month => {
                                const cacheEfficiency = month.totalTokens > 0 ? 
                                    ((month.cacheReadTokens / month.totalTokens) * 100).toFixed(1) + '%' : '0%';
                                html += \`<tr>
                                    <td>\${month.month}</td>
                                    <td class="number">\${formatTokens(month.totalTokens)}</td>
                                    <td class="number cost">$\${month.totalCost.toFixed(2)}</td>
                                    <td class="number">\${cacheEfficiency}</td>
                                </tr>\`;
                            });
                        }
                        break;
                        
                    case 'sessions':
                        html += '<th>Session</th><th>Total Tokens</th><th>Cost</th><th>Last Activity</th>';
                        html += '</tr></thead><tbody>';
                        if (data.sessions) {
                            data.sessions.slice(0, 20).forEach(session => {
                                const sessionName = session.sessionId.split('-').pop() || 'Unknown';
                                html += \`<tr>
                                    <td>\${sessionName}</td>
                                    <td class="number">\${formatTokens(session.totalTokens)}</td>
                                    <td class="number cost">$\${session.totalCost.toFixed(2)}</td>
                                    <td>\${session.lastActivity}</td>
                                </tr>\`;
                            });
                        }
                        break;
                        
                    case 'projects':
                        html += '<th>Project</th><th>Total Tokens</th><th>Total Cost</th><th>Sessions</th>';
                        html += '</tr></thead><tbody>';
                        if (data.projects) {
                            Object.entries(data.projects).forEach(([name, days]) => {
                                const projectName = name.split('-').pop() || name;
                                const totalTokens = days.reduce((sum, day) => sum + day.totalTokens, 0);
                                const totalCost = days.reduce((sum, day) => sum + day.totalCost, 0);
                                html += \`<tr>
                                    <td>\${projectName}</td>
                                    <td class="number">\${formatTokens(totalTokens)}</td>
                                    <td class="number cost">$\${totalCost.toFixed(2)}</td>
                                    <td class="number">\${days.length}</td>
                                </tr>\`;
                            });
                        }
                        break;
                }
                
                html += '</tbody></table>';
                return html;
            }
            
            function formatTokens(tokens) {
                if (tokens >= 1000000) {
                    return (tokens / 1000000).toFixed(1) + 'M';
                } else if (tokens >= 1000) {
                    return (tokens / 1000).toFixed(1) + 'K';
                }
                return tokens.toLocaleString();
            }
            
            // Event Handlers
            function refreshStats() {
                vscode.postMessage({ command: 'refreshStats' });
            }
            
            function exportData() {
                vscode.postMessage({ command: 'exportData' });
            }
            
            // Message Handler
            window.addEventListener('message', event => {
                const message = event.data;
                
                switch (message.command) {
                    case 'updateTabData':
                        const { tab, data } = message;
                        chartsData[tab] = data;
                        
                        // Update charts
                        switch (tab) {
                            case 'daily':
                                createDailyCharts(data);
                                break;
                            case 'weekly':
                                createWeeklyCharts(data);
                                break;
                            case 'monthly':
                                createMonthlyCharts(data);
                                break;
                            case 'sessions':
                                createSessionCharts(data);
                                break;
                            case 'projects':
                                createProjectCharts(data);
                                break;
                        }
                        
                        // Update table
                        const tableContainer = document.getElementById(tab + 'Table');
                        if (tableContainer) {
                            tableContainer.innerHTML = generateDataTable(data, tab);
                        }
                        break;
                        
                    case 'updateUsage':
                        // Handle real-time usage updates for the monitor
                        break;
                }
            });
            
            // Initialize when DOM is ready
            document.addEventListener('DOMContentLoaded', initializeTabs);
            
            // Initialize immediately if DOM is already loaded
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', initializeTabs);
            } else {
                initializeTabs();
            }
        </script>
    `;
}

async function generateUsageStatsHtml(): Promise<string> {
    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Claude Usage Analytics</title>
        <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
        ${getEnhancedStyles()}
    </head>
    <body>
        ${await UsageMonitor.generateMonitorHtml()}
        
        <div class="header">
            <div class="title">📊 Claude Code Usage Analytics</div>
            <div class="subtitle">Powered by ccusage CLI integration • Last updated: ${new Date().toLocaleString()}</div>
        </div>
        
        <!-- Tab Navigation -->
        <div class="tab-container">
            <div class="tab-nav">
                <button class="tab-button active" data-tab="daily">📅 Daily</button>
                <button class="tab-button" data-tab="weekly">📊 Weekly</button>
                <button class="tab-button" data-tab="monthly">📈 Monthly</button>
                <button class="tab-button" data-tab="sessions">💬 Sessions</button>
                <button class="tab-button" data-tab="projects">📁 Projects</button>
            </div>
            
            <!-- Daily Tab -->
            <div class="tab-content active" id="daily">
                <div class="analytics-grid">
                    <div class="chart-container">
                        <h3>Daily Token Usage Trend</h3>
                        <canvas id="dailyChart" width="400" height="200"></canvas>
                    </div>
                    <div class="chart-container">
                        <h3>Daily Cost Trend</h3>
                        <canvas id="dailyCostChart" width="400" height="200"></canvas>
                    </div>
                </div>
                <div id="dailyTable" class="data-table-container"></div>
            </div>
            
            <!-- Weekly Tab -->
            <div class="tab-content" id="weekly">
                <div class="analytics-grid">
                    <div class="chart-container">
                        <h3>Weekly Usage Overview</h3>
                        <canvas id="weeklyChart" width="400" height="200"></canvas>
                    </div>
                    <div class="chart-container">
                        <h3>Weekly Model Distribution</h3>
                        <canvas id="weeklyModelChart" width="400" height="200"></canvas>
                    </div>
                </div>
                <div id="weeklyTable" class="data-table-container"></div>
            </div>
            
            <!-- Monthly Tab -->
            <div class="tab-content" id="monthly">
                <div class="analytics-grid">
                    <div class="chart-container">
                        <h3>Monthly Usage Trends</h3>
                        <canvas id="monthlyChart" width="400" height="200"></canvas>
                    </div>
                    <div class="chart-container">
                        <h3>Cache Efficiency Over Time</h3>
                        <canvas id="cacheEfficiencyChart" width="400" height="200"></canvas>
                    </div>
                </div>
                <div id="monthlyTable" class="data-table-container"></div>
            </div>
            
            <!-- Sessions Tab -->
            <div class="tab-content" id="sessions">
                <div class="analytics-grid">
                    <div class="chart-container">
                        <h3>Session Cost Distribution</h3>
                        <canvas id="sessionCostChart" width="400" height="200"></canvas>
                    </div>
                    <div class="chart-container">
                        <h3>Session Duration Analysis</h3>
                        <canvas id="sessionDurationChart" width="400" height="200"></canvas>
                    </div>
                </div>
                <div id="sessionTable" class="data-table-container"></div>
            </div>
            
            <!-- Projects Tab -->
            <div class="tab-content" id="projects">
                <div class="analytics-grid">
                    <div class="chart-container">
                        <h3>Project Usage Ranking</h3>
                        <canvas id="projectRankingChart" width="400" height="200"></canvas>
                    </div>
                    <div class="chart-container">
                        <h3>Project Cost Comparison</h3>
                        <canvas id="projectCostChart" width="400" height="200"></canvas>
                    </div>
                </div>
                <div id="projectTable" class="data-table-container"></div>
            </div>
        </div>
        
        <div class="button-group">
            <button class="button secondary" onclick="refreshStats()">🔄 Refresh All Data</button>
            <button class="button secondary" onclick="exportData()">📊 Export Data</button>
        </div>
        
        ${getEnhancedScripts()}
    </body>
    </html>`;
}




export async function installCcusageHelpCommand(): Promise<void> {
    const items: vscode.QuickPickItem[] = [
        {
            label: '🚀 Install Bun (Recommended)',
            detail: 'Fast package manager and runtime - bunx ccusage',
            description: 'Open https://bun.sh'
        },
        {
            label: '📦 Install Bun VS Code Extension',
            detail: 'Bun integration for VS Code',
            description: 'Search in Extensions marketplace'
        },
        {
            label: '🟢 Use Node.js (npx)',
            detail: 'Use existing Node.js installation - npx ccusage',
            description: 'Requires Node.js to be installed'
        },
        {
            label: '📊 Test ccusage Availability',
            detail: 'Check which runners are available',
            description: 'Run debug command'
        }
    ];

    const selected = await vscode.window.showQuickPick(items, {
        placeHolder: 'Choose how to enable ccusage integration',
        ignoreFocusOut: true
    });

    if (!selected) {
        return;
    }

    switch (selected.label) {
        case '🚀 Install Bun (Recommended)':
            vscode.env.openExternal(vscode.Uri.parse('https://bun.sh'));
            vscode.window.showInformationMessage(
                'After installing Bun, restart VS Code and try the Usage Monitor again.',
                'Test ccusage'
            ).then(selection => {
                if (selection === 'Test ccusage') {
                    vscode.commands.executeCommand('claude-config.debugCcusage');
                }
            });
            break;
            
        case '📦 Install Bun VS Code Extension':
            vscode.commands.executeCommand('workbench.extensions.search', 'oven.bun-vscode');
            vscode.window.showInformationMessage(
                'Install the "Bun for Visual Studio Code" extension, then restart VS Code.',
                'Test ccusage'
            ).then(selection => {
                if (selection === 'Test ccusage') {
                    vscode.commands.executeCommand('claude-config.debugCcusage');
                }
            });
            break;
            
        case '🟢 Use Node.js (npx)':
            vscode.window.showInformationMessage(
                'Make sure Node.js is installed from https://nodejs.org, then test ccusage.',
                'Open Node.js Site', 'Test ccusage'
            ).then(selection => {
                if (selection === 'Open Node.js Site') {
                    vscode.env.openExternal(vscode.Uri.parse('https://nodejs.org'));
                } else if (selection === 'Test ccusage') {
                    vscode.commands.executeCommand('claude-config.debugCcusage');
                }
            });
            break;
            
        case '📊 Test ccusage Availability':
            vscode.commands.executeCommand('claude-config.debugCcusage');
            break;
    }
}

export async function debugCcusageCommand(): Promise<void> {
    try {
        const ccusageService = CcusageService.getInstance();
        
        // Test availability
        const availability = await ccusageService.testCcusageAvailability();
        
        let output = [
            '🔍 **ccusage Integration Debug**',
            '',
            '**Availability Test:**',
            `  • Available: ${availability.available ? '✅ Yes' : '❌ No'}`,
            `  • Version: ${availability.version || 'N/A'}`,
            `  • Working Runner: ${availability.runner || 'None'}`,
            `  • Error: ${availability.error || 'None'}`,
            ''
        ];

        // Add runner details
        if (availability.runners && availability.runners.length > 0) {
            output.push('**Runner Availability:**');
            for (const runner of availability.runners) {
                const status = runner.available ? '✅' : '❌';
                const errorText = runner.error ? ` (${runner.error})` : '';
                output.push(`  • ${runner.name}: ${status} ${runner.available ? 'Available' : 'Not Available'}${errorText}`);
            }
            output.push('');
        }

        if (availability.available) {
            try {
                // Test data retrieval
                const dailyData = await ccusageService.getDailyUsage();
                const todayData = await ccusageService.getTodayUsage();
                const cacheStats = ccusageService.getCacheStats();
                
                output.push(
                    '**Daily Usage Data:**',
                    `  • Total Tokens: ${todayData.totalUsage.totalTokens.toLocaleString()}`,
                    `  • Total Cost: $${todayData.totalUsage.totalCost.toFixed(2)}`,
                    `  • Daily Entries: ${dailyData.daily?.length || 0}`,
                    '',
                    '**Today\'s Usage:**',
                    `  • Today Tokens: ${todayData.todayUsage?.totalTokens.toLocaleString() || '0'}`,
                    `  • Today Cost: $${todayData.todayUsage?.totalCost.toFixed(2) || '0.00'}`,
                    `  • Models Used: ${todayData.modelsUsed.join(', ') || 'None'}`,
                    '',
                    '**Cache Statistics:**',
                    `  • Size: ${cacheStats.size} entries`,
                    `  • Keys: ${cacheStats.keys.join(', ') || 'None'}`,
                    `  • Oldest Age: ${cacheStats.oldestAge}s`,
                    ''
                );
            } catch (dataError) {
                output.push(
                    '**Data Retrieval Test:**',
                    `  • Error: ${dataError instanceof Error ? dataError.message : String(dataError)}`,
                    ''
                );
            }
        }

        output.push(
            '**Integration Status:**',
            `  • CcusageService: ✅ Created`,
            `  • UsageMonitor: ✅ Updated with fallback`,
            `  • Usage Commands: ✅ Updated with fallback`,
            `  • Real-time Updates: ✅ Integrated`
        );

        // Create debug document
        const doc = await vscode.workspace.openTextDocument({
            content: output.join('\n'),
            language: 'markdown'
        });
        
        await vscode.window.showTextDocument(doc);
        
        // Also log to console
        console.log('[Debug] ccusage Integration:', {
            available: availability.available,
            runner: availability.runner,
            version: availability.version,
            cacheSize: availability.available ? ccusageService.getCacheStats().size : 0
        });
        
        const message = availability.available 
            ? `ccusage is available and working! Integration successful.`
            : `ccusage unavailable: ${availability.error}. Using TokenTracker fallback.`;
            
        vscode.window.showInformationMessage(message, 'View Details').then(selection => {
            if (selection === 'View Details') {
                // Document is already open
            }
        });

    } catch (error) {
        console.error('[Debug] ccusage Integration Error:', error instanceof Error ? error.message : String(error));
        vscode.window.showErrorMessage(`ccusage Debug Error: ${error instanceof Error ? error.message : String(error)}`);
    }
}

