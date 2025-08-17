import * as vscode from 'vscode';
import * as fs from 'fs-extra';
import * as path from 'path';
import { ConversationBranch, ConversationFork, ForkAnalysisResult } from './types';
import { ConversationMessage } from '../types';
import { TokenCalculator } from './TokenCalculator';
import { ForkAnalyzer } from './ForkAnalyzer';

export interface PruningAction {
    type: 'prune' | 'deactivate' | 'merge';
    branch: ConversationBranch;
    reason: string;
    tokensSaved: number;
    riskLevel: 'low' | 'medium' | 'high';
    confirmationRequired: boolean;
}

export interface BranchBackup {
    filePath: string;
    branch: ConversationBranch;
    timestamp: Date;
    reason: string;
}

export class BranchManager {
    private analyzer: ForkAnalyzer;
    private backupDir: string;

    constructor(private context: vscode.ExtensionContext) {
        this.analyzer = new ForkAnalyzer();
        this.backupDir = path.join(context.globalStorageUri?.fsPath || context.extensionPath, 'branch-backups');
        this.ensureBackupDirectory();
    }

    /**
     * Ensure backup directory exists
     */
    private async ensureBackupDirectory(): Promise<void> {
        try {
            await fs.ensureDir(this.backupDir);
        } catch (error) {
            console.error('[BranchManager] Error creating backup directory:', error);
        }
    }

    /**
     * Analyze conversation and suggest pruning actions
     */
    async suggestPruningActions(analysis: ForkAnalysisResult): Promise<PruningAction[]> {
        const actions: PruningAction[] = [];

        for (const fork of analysis.tree.forks) {
            for (const branch of fork.branches) {
                const action = this.evaluateBranchForPruning(branch, fork, analysis);
                if (action) {
                    actions.push(action);
                }
            }
        }

        // Sort by token savings (highest first)
        return actions.sort((a, b) => b.tokensSaved - a.tokensSaved);
    }

    /**
     * Evaluate a branch for pruning
     */
    private evaluateBranchForPruning(
        branch: ConversationBranch, 
        fork: ConversationFork, 
        analysis: ForkAnalysisResult
    ): PruningAction | null {
        // Don't prune main path branches
        if (branch.isMainPath) {
            return null;
        }

        const daysSinceActivity = (Date.now() - branch.lastActivity.getTime()) / (1000 * 60 * 60 * 24);
        const tokensSaved = branch.tokenCount;
        
        // Abandoned branch (inactive for >1 day)
        if (!branch.isActive || daysSinceActivity > 1) {
            return {
                type: 'prune',
                branch,
                reason: `Abandoned for ${daysSinceActivity.toFixed(1)} days`,
                tokensSaved,
                riskLevel: daysSinceActivity > 7 ? 'low' : 'medium',
                confirmationRequired: daysSinceActivity < 7
            };
        }

        // Large inactive branch
        if (tokensSaved > 50000 && !branch.isActive) {
            return {
                type: 'deactivate',
                branch,
                reason: `Large inactive branch (${this.formatTokenCount(tokensSaved)} tokens)`,
                tokensSaved,
                riskLevel: 'medium',
                confirmationRequired: true
            };
        }

        // Duplicate exploration (similar to other branches)
        const similarBranches = fork.branches.filter(b => 
            b !== branch && 
            Math.abs(b.tokenCount - tokensSaved) < tokensSaved * 0.2 && 
            Math.abs(b.messages.length - branch.messages.length) < 3
        );

        if (similarBranches.length > 0) {
            return {
                type: 'merge',
                branch,
                reason: `Similar to ${similarBranches.length} other branch(es)`,
                tokensSaved: tokensSaved * 0.5, // Partial savings from merge
                riskLevel: 'high',
                confirmationRequired: true
            };
        }

        return null;
    }

    /**
     * Execute pruning action with safety checks
     */
    async executePruningAction(action: PruningAction, conversationFilePath: string): Promise<boolean> {
        try {
            // Show confirmation dialog if required
            if (action.confirmationRequired) {
                const confirmed = await this.confirmPruningAction(action);
                if (!confirmed) {
                    return false;
                }
            }

            // Create backup before pruning
            await this.createBranchBackup(action.branch, conversationFilePath, action.reason);

            // Execute the action
            switch (action.type) {
                case 'prune':
                    return await this.pruneBranch(action.branch, conversationFilePath);
                case 'deactivate':
                    return await this.deactivateBranch(action.branch, conversationFilePath);
                case 'merge':
                    return await this.prepareBranchMerge(action.branch, conversationFilePath);
                default:
                    return false;
            }

        } catch (error) {
            console.error('[BranchManager] Error executing pruning action:', error);
            vscode.window.showErrorMessage(`Failed to execute pruning action: ${error}`);
            return false;
        }
    }

    /**
     * Show confirmation dialog for pruning action
     */
    private async confirmPruningAction(action: PruningAction): Promise<boolean> {
        const riskEmoji = { low: '✅', medium: '⚠️', high: '🚨' }[action.riskLevel];
        const actionText = {
            prune: 'permanently remove',
            deactivate: 'deactivate',
            merge: 'prepare for merge'
        }[action.type];

        const message = `${riskEmoji} ${action.type.toUpperCase()} branch?\n\n` +
                       `Action: ${actionText}\n` +
                       `Reason: ${action.reason}\n` +
                       `Tokens saved: ${this.formatTokenCount(action.tokensSaved)}\n` +
                       `Messages: ${action.branch.messages.length}\n` +
                       `Risk level: ${action.riskLevel}\n\n` +
                       `A backup will be created before making changes.`;

        const choice = await vscode.window.showWarningMessage(
            message,
            { modal: true },
            `${action.type.charAt(0).toUpperCase() + action.type.slice(1)} Branch`,
            'Cancel'
        );

        return choice === `${action.type.charAt(0).toUpperCase() + action.type.slice(1)} Branch`;
    }

    /**
     * Create backup of branch before modification
     */
    private async createBranchBackup(
        branch: ConversationBranch, 
        conversationFilePath: string, 
        reason: string
    ): Promise<void> {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupFileName = `branch-${branch.startUuid.substring(0, 8)}-${timestamp}.json`;
        const backupFilePath = path.join(this.backupDir, backupFileName);

        const backup: BranchBackup = {
            filePath: conversationFilePath,
            branch: branch,
            timestamp: new Date(),
            reason: reason
        };

        await fs.writeJson(backupFilePath, backup, { spaces: 2 });
        console.log(`[BranchManager] Created backup: ${backupFilePath}`);
    }

    /**
     * Prune branch from conversation (remove messages)
     */
    private async pruneBranch(branch: ConversationBranch, conversationFilePath: string): Promise<boolean> {
        // Read current conversation file
        const content = await fs.readFile(conversationFilePath, 'utf-8');
        const lines = content.split('\n').filter(line => line.trim());

        // Get UUIDs to remove
        const uuidsToRemove = new Set(branch.messages.map(msg => msg.uuid));

        // Filter out messages in the branch
        const filteredLines = lines.filter(line => {
            try {
                const parsed = JSON.parse(line);
                return !uuidsToRemove.has(parsed.uuid);
            } catch {
                return true; // Keep non-JSON lines (like summaries)
            }
        });

        // Write back to file
        await fs.writeFile(conversationFilePath, filteredLines.join('\n'));
        
        vscode.window.showInformationMessage(
            `✅ Branch pruned! Removed ${branch.messages.length} messages, saved ${this.formatTokenCount(branch.tokenCount)} tokens.`
        );

        return true;
    }

    /**
     * Deactivate branch (mark as inactive)
     */
    private async deactivateBranch(branch: ConversationBranch, conversationFilePath: string): Promise<boolean> {
        // For now, this is a logical operation - we'd need to extend the JSONL format
        // to support metadata like "inactive" status. For demo purposes, we'll just
        // show a message and mark it in memory.
        
        branch.isActive = false;
        
        vscode.window.showInformationMessage(
            `✅ Branch deactivated! ${this.formatTokenCount(branch.tokenCount)} tokens excluded from context.`
        );

        return true;
    }

    /**
     * Prepare branch for merge (show merge guidance)
     */
    private async prepareBranchMerge(branch: ConversationBranch, conversationFilePath: string): Promise<boolean> {
        const panel = vscode.window.createWebviewPanel(
            'branchMerge',
            'Branch Merge Guide',
            vscode.ViewColumn.Beside,
            { enableScripts: false }
        );

        panel.webview.html = this.getBranchMergeHtml(branch);
        
        vscode.window.showInformationMessage(
            `📋 Branch merge guide opened. Review the suggestions for combining similar conversation paths.`
        );

        return true;
    }

    /**
     * Get available backups
     */
    async getAvailableBackups(): Promise<BranchBackup[]> {
        try {
            const files = await fs.readdir(this.backupDir);
            const backups: BranchBackup[] = [];

            for (const file of files) {
                if (file.endsWith('.json')) {
                    try {
                        const backup = await fs.readJson(path.join(this.backupDir, file));
                        backups.push(backup);
                    } catch (error) {
                        console.warn(`[BranchManager] Invalid backup file: ${file}`);
                    }
                }
            }

            return backups.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
        } catch (error) {
            console.error('[BranchManager] Error reading backups:', error);
            return [];
        }
    }

    /**
     * Restore branch from backup
     */
    async restoreBranchFromBackup(backup: BranchBackup): Promise<boolean> {
        try {
            const choice = await vscode.window.showWarningMessage(
                `Restore branch backup from ${backup.timestamp.toLocaleString()}?\n\n` +
                `Messages: ${backup.branch.messages.length}\n` +
                `Tokens: ${this.formatTokenCount(backup.branch.tokenCount)}\n` +
                `Reason: ${backup.reason}`,
                { modal: true },
                'Restore',
                'Cancel'
            );

            if (choice !== 'Restore') {
                return false;
            }

            // Read current conversation file
            const content = await fs.readFile(backup.filePath, 'utf-8');
            const lines = content.split('\n');

            // Add branch messages back to conversation
            for (const message of backup.branch.messages) {
                lines.push(JSON.stringify(message));
            }

            // Write back to file
            await fs.writeFile(backup.filePath, lines.join('\n'));

            vscode.window.showInformationMessage(
                `✅ Branch restored! Added ${backup.branch.messages.length} messages back to conversation.`
            );

            return true;
        } catch (error) {
            console.error('[BranchManager] Error restoring backup:', error);
            vscode.window.showErrorMessage(`Failed to restore backup: ${error}`);
            return false;
        }
    }

    /**
     * Generate branch merge guidance HTML
     */
    private getBranchMergeHtml(branch: ConversationBranch): string {
        return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <style>
                body { font-family: var(--vscode-font-family); padding: 20px; line-height: 1.6; }
                .suggestion { background: var(--vscode-input-background); padding: 15px; margin: 10px 0; border-radius: 6px; }
                .step { margin: 10px 0; }
                h1, h2 { color: var(--vscode-symbolIcon-functionForeground); }
            </style>
        </head>
        <body>
            <h1>🔀 Branch Merge Guide</h1>
            
            <div class="suggestion">
                <h2>Branch Details</h2>
                <p><strong>Messages:</strong> ${branch.messages.length}</p>
                <p><strong>Tokens:</strong> ${this.formatTokenCount(branch.tokenCount)}</p>
                <p><strong>Last Activity:</strong> ${branch.lastActivity.toLocaleString()}</p>
            </div>

            <div class="suggestion">
                <h2>📋 Merge Steps</h2>
                <div class="step">1. <strong>Review both branches</strong> - Compare the conversation paths to identify key insights from each</div>
                <div class="step">2. <strong>Identify overlap</strong> - Look for repeated questions or similar explorations</div>
                <div class="step">3. <strong>Extract key points</strong> - Note unique insights or solutions from this branch</div>
                <div class="step">4. <strong>Synthesize</strong> - Create a new message combining the best elements</div>
                <div class="step">5. <strong>Prune duplicates</strong> - Remove the redundant branch after synthesis</div>
            </div>

            <div class="suggestion">
                <h2>💡 Tips</h2>
                <p>• Focus on preserving unique insights and solutions</p>
                <p>• Consider creating a summary message before pruning</p>
                <p>• Use the backup to restore if needed</p>
            </div>
        </body>
        </html>
        `;
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
        // Cleanup if needed
    }
}