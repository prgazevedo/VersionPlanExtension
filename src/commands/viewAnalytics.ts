/**
 * Analytics commands - removed in v3.3.2 for core focus
 */

import * as vscode from 'vscode';

/**
 * View analytics command
 */
export async function viewAnalyticsCommand(): Promise<void> {
    vscode.window.showInformationMessage(
        'Analytics functionality has been removed in v3.3.2 to focus on core features. Use the usage statistics instead.',
        'View Usage Stats'
    ).then(selection => {
        if (selection === 'View Usage Stats') {
            vscode.commands.executeCommand('claude-config.viewUsageStats');
        }
    });
}

/**
 * View analytics summary command
 */
export async function viewAnalyticsSummaryCommand(): Promise<void> {
    vscode.window.showInformationMessage(
        'Analytics functionality has been removed in v3.3.2 to focus on core features. Use the usage statistics instead.',
        'View Usage Stats'
    ).then(selection => {
        if (selection === 'View Usage Stats') {
            vscode.commands.executeCommand('claude-config.viewUsageStats');
        }
    });
}