/**
 * Search conversations commands - removed in v3.3.2 for core focus
 */

import * as vscode from 'vscode';

/**
 * Search conversations command
 */
export async function searchConversationsCommand(): Promise<void> {
    vscode.window.showInformationMessage(
        'Advanced search functionality has been removed in v3.3.2 to focus on core features. Use the conversation browser instead.'
    );
}

/**
 * Advanced search conversations command
 */
export async function advancedSearchConversationsCommand(): Promise<void> {
    vscode.window.showInformationMessage(
        'Advanced search functionality has been removed in v3.3.2 to focus on core features. Use the conversation browser instead.'
    );
}

/**
 * Search suggestions command
 */
export async function searchSuggestionsCommand(): Promise<void> {
    vscode.window.showInformationMessage(
        'Search suggestions functionality has been removed in v3.3.2 to focus on core features. Use the conversation browser instead.'
    );
}