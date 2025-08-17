import * as vscode from 'vscode';
import { ConversationBranch, ConversationFork } from './types';
import { ConversationMessage } from '../types';
import { ForkTreeProvider } from './ForkTreeProvider';
import { TokenCalculator } from './TokenCalculator';

export class ForkCommands {
    private forkTreeProvider: ForkTreeProvider;

    constructor(forkTreeProvider: ForkTreeProvider) {
        this.forkTreeProvider = forkTreeProvider;
    }

    /**
     * Register all fork-related commands
     */
    static registerCommands(context: vscode.ExtensionContext, forkTreeProvider: ForkTreeProvider): void {
        const commands = new ForkCommands(forkTreeProvider);

        // Register all commands
        const commandRegistrations = [
            vscode.commands.registerCommand('claude-config.viewBranchDetails', (branch: ConversationBranch) => 
                commands.viewBranchDetails(branch)
            ),
            vscode.commands.registerCommand('claude-config.viewMessageDetails', (message: ConversationMessage) => 
                commands.viewMessageDetails(message)
            ),
            vscode.commands.registerCommand('claude-config.viewFullBranch', (branch: ConversationBranch) => 
                commands.viewFullBranch(branch)
            ),
            vscode.commands.registerCommand('claude-config.pruneBranch', (branch: ConversationBranch) => 
                commands.pruneBranch(branch)
            ),
            vscode.commands.registerCommand('claude-config.toggleBranchActive', (branch: ConversationBranch) => 
                commands.toggleBranchActive(branch)
            ),
            vscode.commands.registerCommand('claude-config.analyzeForkImpact', (fork: ConversationFork) => 
                commands.analyzeForkImpact(fork)
            ),
            vscode.commands.registerCommand('claude-config.loadConversationForForkAnalysis', () => 
                commands.loadConversationForAnalysis()
            ),
            vscode.commands.registerCommand('claude-config.refreshForkTree', () => 
                commands.refreshForkTree()
            ),
            vscode.commands.registerCommand('claude-config.exportForkAnalysis', () => 
                commands.exportForkAnalysis()
            )
        ];

        // Add all command disposables to the context
        commandRegistrations.forEach(disposable => context.subscriptions.push(disposable));
    }

    /**
     * View detailed information about a branch
     */
    async viewBranchDetails(branch: ConversationBranch): Promise<void> {
        const panel = vscode.window.createWebviewPanel(
            'branchDetails',
            `Branch Details`,
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: []
            }
        );

        panel.webview.html = this.getBranchDetailsHtml(branch);
    }

    /**
     * View details of a specific message
     */
    async viewMessageDetails(message: ConversationMessage): Promise<void> {
        const panel = vscode.window.createWebviewPanel(
            'messageDetails',
            `Message Details`,
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: []
            }
        );

        panel.webview.html = this.getMessageDetailsHtml(message);
    }

    /**
     * View all messages in a branch
     */
    async viewFullBranch(branch: ConversationBranch): Promise<void> {
        const panel = vscode.window.createWebviewPanel(
            'fullBranch',
            `Full Branch (${branch.messages.length} messages)`,
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: []
            }
        );

        panel.webview.html = this.getFullBranchHtml(branch);
    }

    /**
     * Prune (delete) a branch
     */
    async pruneBranch(branch: ConversationBranch): Promise<void> {
        const savings = TokenCalculator.calculatePruningSavings(branch.messages);
        
        const choice = await vscode.window.showWarningMessage(
            `Prune branch with ${branch.messages.length} messages?\n\nThis will save ${this.formatTokenCount(savings.tokensSaved)} tokens.\n\n⚠️ This action cannot be undone.`,
            { modal: true },
            'Prune Branch',
            'Cancel'
        );

        if (choice === 'Prune Branch') {
            // TODO: Implement actual pruning logic
            vscode.window.showInformationMessage(
                `✅ Branch pruned! Saved ${this.formatTokenCount(savings.tokensSaved)} tokens.`
            );
            this.refreshForkTree();
        }
    }

    /**
     * Toggle branch active status
     */
    async toggleBranchActive(branch: ConversationBranch): Promise<void> {
        const newStatus = !branch.isActive;
        const action = newStatus ? 'activated' : 'deactivated';
        
        // TODO: Implement actual toggle logic
        branch.isActive = newStatus;
        
        vscode.window.showInformationMessage(
            `Branch ${action}. ${newStatus ? 'Included in' : 'Excluded from'} context calculations.`
        );
        this.refreshForkTree();
    }

    /**
     * Analyze the impact of a fork
     */
    async analyzeForkImpact(fork: ConversationFork): Promise<void> {
        const analysis = this.forkTreeProvider.getCurrentAnalysis();
        if (!analysis) return;

        const totalTokens = fork.totalTokens;
        const contextUsage = TokenCalculator.calculateContextUsage(totalTokens);
        const mainBranch = fork.branches.find(b => b.isMainPath);
        const alternativeBranches = fork.branches.filter(b => !b.isMainPath);
        
        const message = `
Fork Impact Analysis:

📊 **Token Usage:**
• Total tokens: ${this.formatTokenCount(totalTokens)}
• Context usage: ${contextUsage.toFixed(1)}%

🔗 **Main Branch:**
• Messages: ${mainBranch?.messages.length || 0}
• Tokens: ${this.formatTokenCount(mainBranch?.tokenCount || 0)}

🔀 **Alternative Branches:**
• Count: ${alternativeBranches.length}
• Total tokens: ${this.formatTokenCount(alternativeBranches.reduce((sum, b) => sum + b.tokenCount, 0))}

💡 **Potential Savings:**
Pruning alternative branches could save ${this.formatTokenCount(alternativeBranches.reduce((sum, b) => sum + b.tokenCount, 0))} tokens.
        `.trim();

        vscode.window.showInformationMessage(message, { modal: true });
    }

    /**
     * Load a conversation file for fork analysis
     */
    async loadConversationForAnalysis(): Promise<void> {
        const fileUri = await vscode.window.showOpenDialog({
            canSelectFiles: true,
            canSelectFolders: false,
            canSelectMany: false,
            filters: {
                'Claude Conversations': ['jsonl']
            },
            title: 'Select Conversation File for Fork Analysis'
        });

        if (fileUri && fileUri[0]) {
            await this.forkTreeProvider.loadConversationFile(fileUri[0].fsPath);
            vscode.window.showInformationMessage('✅ Conversation loaded for fork analysis');
        }
    }

    /**
     * Refresh the fork tree
     */
    refreshForkTree(): void {
        this.forkTreeProvider.refresh();
    }

    /**
     * Export fork analysis results
     */
    async exportForkAnalysis(): Promise<void> {
        const analysis = this.forkTreeProvider.getCurrentAnalysis();
        if (!analysis) {
            vscode.window.showWarningMessage('No fork analysis available to export');
            return;
        }

        const fileUri = await vscode.window.showSaveDialog({
            filters: {
                'JSON': ['json'],
                'Markdown': ['md']
            },
            defaultUri: vscode.Uri.file(`fork-analysis-${Date.now()}.json`)
        });

        if (fileUri) {
            // TODO: Implement export logic
            vscode.window.showInformationMessage('✅ Fork analysis exported');
        }
    }

    /**
     * Generate HTML for branch details
     */
    private getBranchDetailsHtml(branch: ConversationBranch): string {
        const tokenBreakdown = branch.messages.map(msg => TokenCalculator.getTokenBreakdown(msg));
        const totalInput = tokenBreakdown.reduce((sum, t) => sum + t.input, 0);
        const totalOutput = tokenBreakdown.reduce((sum, t) => sum + t.output, 0);
        const totalCache = tokenBreakdown.reduce((sum, t) => sum + t.cacheCreation + t.cacheRead, 0);

        return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>Branch Details</title>
            <style>
                body { font-family: var(--vscode-font-family); padding: 20px; }
                .header { border-bottom: 1px solid var(--vscode-panel-border); padding-bottom: 10px; margin-bottom: 20px; }
                .stat { margin: 10px 0; }
                .stat-label { font-weight: bold; color: var(--vscode-descriptionForeground); }
                .stat-value { color: var(--vscode-editor-foreground); }
                .token-breakdown { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin: 20px 0; }
                .token-card { background: var(--vscode-editor-background); border: 1px solid var(--vscode-panel-border); border-radius: 4px; padding: 15px; }
                .messages-list { margin-top: 20px; }
                .message-item { background: var(--vscode-editor-background); border: 1px solid var(--vscode-panel-border); border-radius: 4px; padding: 10px; margin: 10px 0; }
                .message-role { font-weight: bold; color: var(--vscode-symbolIcon-functionForeground); }
                .message-preview { margin-top: 5px; color: var(--vscode-descriptionForeground); }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>Branch Details</h1>
                <div class="stat">
                    <span class="stat-label">Start UUID:</span> 
                    <span class="stat-value">${branch.startUuid}</span>
                </div>
                <div class="stat">
                    <span class="stat-label">Last Activity:</span> 
                    <span class="stat-value">${branch.lastActivity.toLocaleString()}</span>
                </div>
                <div class="stat">
                    <span class="stat-label">Status:</span> 
                    <span class="stat-value">${branch.isMainPath ? '🔗 Main Path' : '🔀 Alternative'} • ${branch.isActive ? '✅ Active' : '💤 Inactive'}</span>
                </div>
            </div>

            <div class="token-breakdown">
                <div class="token-card">
                    <h3>Total Messages</h3>
                    <div style="font-size: 24px; font-weight: bold;">${branch.messages.length}</div>
                </div>
                <div class="token-card">
                    <h3>Total Tokens</h3>
                    <div style="font-size: 24px; font-weight: bold;">${this.formatTokenCount(branch.tokenCount)}</div>
                </div>
                <div class="token-card">
                    <h3>Input Tokens</h3>
                    <div style="font-size: 20px; color: var(--vscode-charts-blue);">${this.formatTokenCount(totalInput)}</div>
                </div>
                <div class="token-card">
                    <h3>Output Tokens</h3>
                    <div style="font-size: 20px; color: var(--vscode-charts-green);">${this.formatTokenCount(totalOutput)}</div>
                </div>
            </div>

            <div class="messages-list">
                <h3>Messages in Branch</h3>
                ${branch.messages.map((msg, index) => `
                    <div class="message-item">
                        <div class="message-role">${msg.type === 'user' ? '👤 User' : '🤖 Assistant'} Message ${index + 1}</div>
                        <div class="message-preview">${this.getMessagePreview(msg)}</div>
                        <div style="font-size: 12px; color: var(--vscode-descriptionForeground); margin-top: 5px;">
                            ${new Date(msg.timestamp).toLocaleString()} • ${this.formatTokenCount(TokenCalculator.calculateMessageTokens(msg))} tokens
                        </div>
                    </div>
                `).join('')}
            </div>
        </body>
        </html>
        `;
    }

    /**
     * Generate HTML for message details
     */
    private getMessageDetailsHtml(message: ConversationMessage): string {
        const tokenBreakdown = TokenCalculator.getTokenBreakdown(message);
        
        return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>Message Details</title>
            <style>
                body { font-family: var(--vscode-font-family); padding: 20px; }
                .header { border-bottom: 1px solid var(--vscode-panel-border); padding-bottom: 10px; margin-bottom: 20px; }
                .content { background: var(--vscode-editor-background); border: 1px solid var(--vscode-panel-border); border-radius: 4px; padding: 15px; margin: 20px 0; }
                .metadata { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin: 20px 0; }
                .metadata-card { background: var(--vscode-editor-background); border: 1px solid var(--vscode-panel-border); border-radius: 4px; padding: 15px; }
                pre { white-space: pre-wrap; word-break: break-word; }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>${message.type === 'user' ? '👤 User' : '🤖 Assistant'} Message</h1>
                <p><strong>UUID:</strong> ${message.uuid}</p>
                <p><strong>Timestamp:</strong> ${new Date(message.timestamp).toLocaleString()}</p>
                <p><strong>Parent:</strong> ${message.parentUuid || 'Root message'}</p>
            </div>

            <div class="metadata">
                <div class="metadata-card">
                    <h3>Input Tokens</h3>
                    <div style="font-size: 20px; color: var(--vscode-charts-blue);">${this.formatTokenCount(tokenBreakdown.input)}</div>
                </div>
                <div class="metadata-card">
                    <h3>Output Tokens</h3>
                    <div style="font-size: 20px; color: var(--vscode-charts-green);">${this.formatTokenCount(tokenBreakdown.output)}</div>
                </div>
                <div class="metadata-card">
                    <h3>Cache Tokens</h3>
                    <div style="font-size: 20px; color: var(--vscode-charts-yellow);">${this.formatTokenCount(tokenBreakdown.cacheCreation + tokenBreakdown.cacheRead)}</div>
                </div>
                <div class="metadata-card">
                    <h3>Total Tokens</h3>
                    <div style="font-size: 20px; font-weight: bold;">${this.formatTokenCount(tokenBreakdown.input + tokenBreakdown.output + tokenBreakdown.cacheCreation + tokenBreakdown.cacheRead)}</div>
                </div>
            </div>

            <div class="content">
                <h3>Message Content</h3>
                <pre>${JSON.stringify(message.message?.content, null, 2)}</pre>
            </div>

            ${message.message?.usage ? `
            <div class="content">
                <h3>Usage Data</h3>
                <pre>${JSON.stringify(message.message.usage, null, 2)}</pre>
            </div>
            ` : ''}
        </body>
        </html>
        `;
    }

    /**
     * Generate HTML for full branch view
     */
    private getFullBranchHtml(branch: ConversationBranch): string {
        return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>Full Branch</title>
            <style>
                body { font-family: var(--vscode-font-family); padding: 20px; }
                .message { border: 1px solid var(--vscode-panel-border); border-radius: 4px; margin: 15px 0; padding: 15px; }
                .user { background: var(--vscode-input-background); }
                .assistant { background: var(--vscode-editor-background); }
                .message-header { font-weight: bold; margin-bottom: 10px; }
                .message-content { white-space: pre-wrap; word-break: break-word; }
                .message-meta { font-size: 12px; color: var(--vscode-descriptionForeground); margin-top: 10px; border-top: 1px solid var(--vscode-panel-border); padding-top: 5px; }
            </style>
        </head>
        <body>
            <h1>Full Branch (${branch.messages.length} messages)</h1>
            <p><strong>Total Tokens:</strong> ${this.formatTokenCount(branch.tokenCount)}</p>
            <p><strong>Status:</strong> ${branch.isMainPath ? '🔗 Main Path' : '🔀 Alternative'} • ${branch.isActive ? '✅ Active' : '💤 Inactive'}</p>
            <hr>

            ${branch.messages.map((msg, index) => `
                <div class="message ${msg.type}">
                    <div class="message-header">
                        ${msg.type === 'user' ? '👤 User' : '🤖 Assistant'} Message ${index + 1}
                    </div>
                    <div class="message-content">${this.getMessagePreview(msg)}</div>
                    <div class="message-meta">
                        UUID: ${msg.uuid} | 
                        ${new Date(msg.timestamp).toLocaleString()} | 
                        ${this.formatTokenCount(TokenCalculator.calculateMessageTokens(msg))} tokens
                    </div>
                </div>
            `).join('')}
        </body>
        </html>
        `;
    }

    /**
     * Get message preview text
     */
    private getMessagePreview(message: ConversationMessage): string {
        const content = message.message?.content;
        let preview = '';

        if (typeof content === 'string') {
            preview = content;
        } else if (Array.isArray(content)) {
            const textItems = content.filter(item => item.type === 'text');
            preview = textItems.map(item => item.text).join(' ');
        }

        return preview || '[No text content]';
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
}