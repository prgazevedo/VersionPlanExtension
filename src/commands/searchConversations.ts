/**
 * Search conversations commands - redirects to conversation browser
 */

import * as vscode from 'vscode';

/**
 * Search conversations command
 */
export async function searchConversationsCommand(): Promise<void> {
    vscode.window.showInformationMessage(
        'Advanced search redirects to the conversation browser for better focus. Use the conversation browser for searching and filtering.'
    );
}

/**
 * Advanced search conversations command
 */
export async function advancedSearchConversationsCommand(): Promise<void> {
    vscode.window.showInformationMessage(
        'Advanced search redirects to the conversation browser for better focus. Use the conversation browser for searching and filtering.'
    );
}

/**
 * Search suggestions command
 */
export async function searchSuggestionsCommand(): Promise<void> {
    vscode.window.showInformationMessage(
        'Search suggestions redirect to the conversation browser for better focus. Use the conversation browser for finding conversations.'
    );
}