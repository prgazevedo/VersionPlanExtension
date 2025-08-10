/**
 * Analytics commands - redirects to usage statistics
 */

import * as vscode from 'vscode';

/**
 * View analytics command
 */
export async function viewAnalyticsCommand(): Promise<void> {
    vscode.window.showInformationMessage(
        'Analytics feature redirects to usage statistics for better focus. Use the usage statistics for detailed insights.',
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
        'Analytics feature redirects to usage statistics for better focus. Use the usage statistics for detailed insights.',
        'View Usage Stats'
    ).then(selection => {
        if (selection === 'View Usage Stats') {
            vscode.commands.executeCommand('claude-config.viewUsageStats');
        }
    });
}