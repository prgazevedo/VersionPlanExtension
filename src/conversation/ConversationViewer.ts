import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs-extra';
import * as os from 'os';
import { ConversationManager } from './ConversationManager';
import { ConversationSummary, ConversationSession, ConversationMessage } from './types';

export class ConversationViewer {
    private panel: vscode.WebviewPanel | undefined;

    constructor(
        private context: vscode.ExtensionContext,
        private conversationManager: ConversationManager
    ) {}

    async showConversation(conversationSummary: ConversationSummary): Promise<void> {
        try {
            // Load the full conversation
            const conversation = await this.conversationManager.loadConversation(conversationSummary.filePath);
            if (!conversation) {
                vscode.window.showErrorMessage('Failed to load conversation');
                return;
            }

            // Create or update the webview panel
            if (this.panel) {
                this.panel.dispose();
            }

            this.panel = vscode.window.createWebviewPanel(
                'conversationViewer-' + Date.now(),
                `💬 ${conversationSummary.projectName}`,
                vscode.ViewColumn.One,
                {
                    enableScripts: true,
                    retainContextWhenHidden: false
                }
            );

            // Set the webview content using conversation summary + messages
            this.panel.webview.html = this.getWebviewContent(conversationSummary, conversation);

            // Handle messages from the webview
            this.panel.webview.onDidReceiveMessage(
                message => this.handleWebviewMessage(message, conversation),
                undefined,
                this.context.subscriptions
            );

            // Clean up when the panel is closed
            this.panel.onDidDispose(
                () => { this.panel = undefined; },
                null,
                this.context.subscriptions
            );

        } catch (error) {
            vscode.window.showErrorMessage(`Failed to show conversation: ${error}`);
        }
    }

    private getWebviewContent(conversationSummary: ConversationSummary, conversation: ConversationSession): string {
        // Extract metadata from any available message
        const metadata = this.extractConversationMetadata(conversation.messages);
        
        // Also extract from conversation session
        const sessionMetadata = {
            version: metadata.version,
            gitBranch: metadata.gitBranch,
            serviceTier: metadata.serviceTier,
            cwd: metadata.cwd || conversation.projectPath || 'Unknown'
        };

        // Group messages by request ID for collapsible display
        const conversationHTML = this.generateGroupedConversationHTML(conversation.messages);

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Claude Conversation</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            margin: 0;
            padding: 20px;
            background-color: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
            line-height: 1.6;
        }
        .header {
            background-color: var(--vscode-editor-inactiveSelectionBackground);
            padding: 12px 16px;
            border-radius: 6px;
            margin-bottom: 16px;
            border: 1px solid var(--vscode-panel-border);
        }
        .header h1 {
            margin: 0 0 8px 0;
            color: var(--vscode-textLink-foreground);
            font-size: 18px;
            font-weight: 600;
        }
        .metadata-container {
            display: flex;
            gap: 20px;
            align-items: flex-start;
        }
        .metadata-short {
            flex: 0 0 auto;
            min-width: 300px;
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 4px 16px;
            font-size: var(--vscode-editor-font-size, 14px);
        }
        .metadata-long {
            flex: 1 1 auto;
            display: flex;
            flex-direction: column;
            gap: 4px;
            font-size: var(--vscode-editor-font-size, 14px);
        }
        .metadata-item {
            display: flex;
            flex-direction: column;
            gap: 2px;
        }
        .metadata-item.short {
            flex-direction: column;
            align-items: flex-start;
            gap: 1px;
        }
        .metadata-label {
            font-weight: 600;
            color: var(--vscode-descriptionForeground);
            font-size: var(--vscode-editor-font-size, 14px);
            white-space: nowrap;
        }
        .metadata-value {
            color: var(--vscode-editor-foreground);
            font-family: var(--vscode-editor-font-family), 'Consolas', 'Courier New', monospace;
            font-size: var(--vscode-editor-font-size, 14px);
            word-break: break-word;
            overflow-wrap: break-word;
        }
        .search-container {
            position: fixed;
            bottom: 0;
            left: 0;
            right: 0;
            background-color: var(--vscode-editor-background);
            border-top: 1px solid var(--vscode-panel-border);
            padding: 15px;
            display: flex;
            align-items: center;
            gap: 10px;
            z-index: 1000;
            box-shadow: 0 -2px 8px rgba(0, 0, 0, 0.1);
        }
        .search-container input {
            flex: 1;
            padding: 12px;
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 6px;
            font-size: 14px;
            max-width: 300px;
        }
        .search-nav-buttons {
            display: flex;
            gap: 5px;
        }
        .search-nav-btn {
            padding: 8px 12px;
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
            display: none;
        }
        .search-nav-btn:hover {
            background-color: var(--vscode-button-hoverBackground);
        }
        .search-nav-btn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }
        #collapseAllBtn, #expandAllBtn {
            display: block; /* Always visible, unlike search navigation buttons */
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }
        #collapseAllBtn:hover, #expandAllBtn:hover {
            background-color: var(--vscode-button-secondaryHoverBackground);
        }
        .search-results-info {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
            white-space: nowrap;
            display: none;
        }
        .search-highlight {
            background-color: var(--vscode-editor-findMatchBackground);
            color: var(--vscode-editor-findMatchForeground);
            border-radius: 2px;
            padding: 1px 2px;
        }
        .search-highlight.current {
            background-color: var(--vscode-editor-findMatchHighlightBackground);
            color: var(--vscode-editor-findMatchHighlightForeground);
        }
        .conversation {
            background-color: var(--vscode-editor-inactiveSelectionBackground);
            padding: 15px;
            padding-bottom: 100px; /* Add space for fixed search bar */
            border-radius: 8px;
            border: 1px solid var(--vscode-panel-border);
            font-family: var(--vscode-editor-font-family), 'Consolas', 'Courier New', monospace;
            font-size: var(--vscode-editor-font-size, 12px);
            line-height: 1.3;
        }
        .export-buttons {
            position: fixed;
            top: 20px;
            right: 20px;
            display: flex;
            gap: 8px;
            z-index: 1000;
        }
        .export-btn {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: 1px solid var(--vscode-button-border);
            padding: 8px 16px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
            font-weight: 500;
            transition: all 0.2s ease;
        }
        .export-btn:hover {
            background-color: var(--vscode-button-hoverBackground);
            transform: translateY(-1px);
        }
        .export-btn:active {
            transform: translateY(0);
            background-color: var(--vscode-button-background);
        }
        .request-header {
            background-color: var(--vscode-editor-selectionBackground);
            padding: 0;
            margin: 0;
            cursor: pointer;
            display: flex;
            align-items: center;
            user-select: text;
            border: none;
        }
        .request-header:hover {
            background-color: var(--vscode-list-hoverBackground);
        }
        .request-content {
            display: none !important;
            height: 0 !important;
            overflow: hidden !important;
            padding: 0 !important;
            margin: 0 !important;
        }
        .request-content.expanded {
            display: block !important;
            height: auto !important;
            padding: 10px !important;
        }
        .message-content {
            margin: 5px 0;
            padding: 5px;
            background-color: var(--vscode-textCodeBlock-background);
            border-radius: 3px;
            font-family: var(--vscode-editor-font-family), monospace;
            font-size: 12px;
            line-height: 1.3;
            white-space: pre-wrap;
        }
        .collapse-icon {
            margin-right: 8px;
            transition: transform 0.2s ease;
            cursor: pointer;
            user-select: none;
        }
        .collapse-icon.expanded {
            transform: rotate(90deg);
        }
    </style>
</head>
<body>
    <div class="export-buttons">
        <button class="export-btn" onclick="exportConversation('md')">📄 MD</button>
        <button class="export-btn" onclick="exportConversation('json')">📋 JSON</button>
        <button class="export-btn" onclick="exportConversation('txt')">📝 TXT</button>
    </div>

    <div class="header">
        <h1>💬 Claude Conversation</h1>
        <div class="metadata-container">
            <!-- Short values section - compact 2x3 grid -->
            <div class="metadata-short">
                <div class="metadata-item short">
                    <span class="metadata-label">Duration:</span>
                    <span class="metadata-value">${conversationSummary.duration || 'Unknown'}</span>
                </div>
                <div class="metadata-item short">
                    <span class="metadata-label">Messages:</span>
                    <span class="metadata-value">${conversationSummary.messageCount || 0}</span>
                </div>
                <div class="metadata-item short">
                    <span class="metadata-label">Started:</span>
                    <span class="metadata-value">${new Date(conversationSummary.startTime).toLocaleString()}</span>
                </div>
                <div class="metadata-item short">
                    <span class="metadata-label">Service Tier:</span>
                    <span class="metadata-value">${sessionMetadata.serviceTier}</span>
                </div>
                <div class="metadata-item short">
                    <span class="metadata-label">Ended:</span>
                    <span class="metadata-value">${conversationSummary.endTime ? new Date(conversationSummary.endTime).toLocaleString() : 'Ongoing'}</span>
                </div>
                <div class="metadata-item short">
                    <span class="metadata-label">Version:</span>
                    <span class="metadata-value">${sessionMetadata.version}</span>
                </div>
            </div>
            
            <!-- Long values section -->
            <div class="metadata-long">
                <div class="metadata-item">
                    <span class="metadata-label">Project:</span>
                    <span class="metadata-value">${conversationSummary.projectName || 'Unknown'}</span>
                </div>
                <div class="metadata-item">
                    <span class="metadata-label">Git Branch:</span>
                    <span class="metadata-value">${sessionMetadata.gitBranch}</span>
                </div>
                <div class="metadata-item">
                    <span class="metadata-label">Session ID:</span>
                    <span class="metadata-value">${conversation.sessionId || 'Unknown'}</span>
                </div>
                <div class="metadata-item">
                    <span class="metadata-label">Working Directory:</span>
                    <span class="metadata-value">${sessionMetadata.cwd}</span>
                </div>
            </div>
        </div>
    </div>

    <div class="conversation" id="conversationContent">${conversationHTML}</div>

    <div class="search-container">
        <input type="text" id="searchInput" placeholder="🔍 Search conversation..." oninput="performSearch()" onkeydown="handleSearchKeydown(event)">
        <div class="search-results-info" id="searchResultsInfo"></div>
        <div class="search-nav-buttons">
            <button class="search-nav-btn" id="prevBtn" onclick="navigateSearch(-1)">◀ Prev</button>
            <button class="search-nav-btn" id="nextBtn" onclick="navigateSearch(1)">Next ▶</button>
            <button class="search-nav-btn" id="collapseAllBtn" onclick="collapseAll()" title="Collapse all sections">⌃ Collapse All</button>
            <button class="search-nav-btn" id="expandAllBtn" onclick="expandAll()" title="Expand all sections">⌄ Expand All</button>
        </div>
    </div>

    <script>
        function toggleRequest(requestId) {
            const content = document.getElementById('content-' + requestId);
            const icon = document.getElementById('icon-' + requestId);
            
            if (content.classList.contains('expanded')) {
                content.classList.remove('expanded');
                icon.classList.remove('expanded');
            } else {
                content.classList.add('expanded');
                icon.classList.add('expanded');
            }
        }
        
        function exportConversation(format) {
            const vscode = acquireVsCodeApi();
            vscode.postMessage({
                command: 'export',
                format: format
            });
        }
        
        // Initialize all requests as collapsed
        window.addEventListener('load', function() {
            // All sections start collapsed by default
            console.log('Conversation loaded with all sections collapsed');
        });
        
        let searchResults = [];
        let currentSearchIndex = -1;
        let originalContent = '';

        // Store original content on page load
        window.addEventListener('load', function() {
            originalContent = document.getElementById('conversationContent').innerHTML;
        });

        function performSearch() {
            const searchTerm = document.getElementById('searchInput').value.trim();
            const searchResultsInfo = document.getElementById('searchResultsInfo');
            const prevBtn = document.getElementById('prevBtn');
            const nextBtn = document.getElementById('nextBtn');
            
            // Clear previous search
            clearSearch();
            
            if (searchTerm === '') {
                // Hide search UI elements
                searchResultsInfo.style.display = 'none';
                prevBtn.style.display = 'none';
                nextBtn.style.display = 'none';
                return;
            }
            
            // Find and highlight all matches
            searchResults = findAndHighlightMatches(searchTerm);
            
            if (searchResults.length > 0) {
                currentSearchIndex = 0;
                updateCurrentSearchResult();
                
                // Show search UI elements
                searchResultsInfo.style.display = 'block';
                prevBtn.style.display = 'block';
                nextBtn.style.display = 'block';
                
                searchResultsInfo.textContent = searchResults.length + ' result' + (searchResults.length > 1 ? 's' : '');
            } else {
                searchResultsInfo.style.display = 'block';
                searchResultsInfo.textContent = 'No results found';
                prevBtn.style.display = 'none';
                nextBtn.style.display = 'none';
            }
        }

        function findAndHighlightMatches(searchTerm) {
            const conversationContent = document.getElementById('conversationContent');
            const results = [];
            
            // Use case-insensitive search
            const searchLower = searchTerm.toLowerCase();
            
            // Find all text nodes and highlight matches
            function traverseAndHighlight(node) {
                if (node.nodeType === 3) { // Text node
                    const text = node.textContent;
                    const textLower = text.toLowerCase();
                    let searchIndex = 0;
                    const matches = [];
                    
                    while (searchIndex < textLower.length) {
                        const foundIndex = textLower.indexOf(searchLower, searchIndex);
                        if (foundIndex === -1) break;
                        
                        matches.push({
                            index: foundIndex,
                            text: text.substring(foundIndex, foundIndex + searchTerm.length)
                        });
                        searchIndex = foundIndex + searchTerm.length;
                    }
                    
                    if (matches.length > 0) {
                        const parent = node.parentNode;
                        const fragment = document.createDocumentFragment();
                        let lastIndex = 0;
                        
                        matches.forEach(function(match) {
                            // Add text before match
                            if (match.index > lastIndex) {
                                fragment.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
                            }
                            
                            // Create highlighted span
                            const highlightSpan = document.createElement('span');
                            highlightSpan.className = 'search-highlight';
                            highlightSpan.setAttribute('data-search-index', results.length.toString());
                            highlightSpan.textContent = match.text;
                            fragment.appendChild(highlightSpan);
                            
                            results.push(highlightSpan);
                            lastIndex = match.index + searchTerm.length;
                        });
                        
                        // Add remaining text
                        if (lastIndex < text.length) {
                            fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
                        }
                        
                        parent.replaceChild(fragment, node);
                    }
                } else if (node.nodeType === 1) { // Element node
                    // Skip already highlighted content
                    if (!node.classList.contains('search-highlight')) {
                        const children = Array.from(node.childNodes);
                        children.forEach(function(child) { return traverseAndHighlight(child); });
                    }
                }
            }
            
            traverseAndHighlight(conversationContent);
            
            // Expand sections that contain matches
            results.forEach(function(result) {
                let parent = result.closest('.request-content');
                if (parent && !parent.classList.contains('expanded')) {
                    const header = parent.previousElementSibling;
                    if (header && header.classList.contains('request-header')) {
                        const icon = header.querySelector('.collapse-icon');
                        parent.classList.add('expanded');
                        if (icon) icon.classList.add('expanded');
                    }
                }
            });
            
            return results;
        }

        function clearSearch() {
            // Remove all highlighting
            const highlights = document.querySelectorAll('.search-highlight');
            highlights.forEach(function(highlight) {
                const parent = highlight.parentNode;
                parent.replaceChild(document.createTextNode(highlight.textContent), highlight);
                parent.normalize(); // Merge adjacent text nodes
            });
        }

        function updateCurrentSearchResult() {
            if (searchResults.length === 0) return;
            
            // Remove current class from all results
            searchResults.forEach(function(result) { return result.classList.remove('current'); });
            
            // Add current class to current result
            const currentResult = searchResults[currentSearchIndex];
            currentResult.classList.add('current');
            
            // Scroll to current result
            currentResult.scrollIntoView({
                behavior: 'smooth',
                block: 'center'
            });
            
            // Update results info
            const searchResultsInfo = document.getElementById('searchResultsInfo');
            searchResultsInfo.textContent = (currentSearchIndex + 1) + ' of ' + searchResults.length;
        }

        function navigateSearch(direction) {
            if (searchResults.length === 0) return;
            
            currentSearchIndex += direction;
            
            // Cycle through results
            if (currentSearchIndex >= searchResults.length) {
                currentSearchIndex = 0;
            } else if (currentSearchIndex < 0) {
                currentSearchIndex = searchResults.length - 1;
            }
            
            updateCurrentSearchResult();
        }

        function handleSearchKeydown(event) {
            if (event.key === 'Enter') {
                event.preventDefault();
                if (event.shiftKey) {
                    navigateSearch(-1); // Shift+Enter for previous
                } else {
                    navigateSearch(1);  // Enter for next
                }
            } else if (event.key === 'Escape') {
                event.preventDefault();
                document.getElementById('searchInput').value = '';
                performSearch(); // Clear search
            }
        }

        function collapseAll() {
            const requestHeaders = document.querySelectorAll('.request-header');
            const requestContents = document.querySelectorAll('.request-content');
            
            requestHeaders.forEach(function(header, index) {
                const content = requestContents[index];
                const icon = header.querySelector('.collapse-icon');
                
                // Collapse the section
                content.classList.remove('expanded');
                if (icon) {
                    icon.classList.remove('expanded');
                }
            });
            
            // Clear search to avoid confusion with collapsed sections
            document.getElementById('searchInput').value = '';
            performSearch();
        }

        function expandAll() {
            const requestHeaders = document.querySelectorAll('.request-header');
            const requestContents = document.querySelectorAll('.request-content');
            
            requestHeaders.forEach(function(header, index) {
                const content = requestContents[index];
                const icon = header.querySelector('.collapse-icon');
                
                // Expand the section
                content.classList.add('expanded');
                if (icon) {
                    icon.classList.add('expanded');
                }
            });
        }
    </script>
</body>
</html>`;
    }

    private extractDetailedContent(content: any): string {
        // Handle missing or null content
        if (!content) {
            return 'No content available';
        }
        
        if (typeof content === 'string') {
            return content.trim();
        } else if (Array.isArray(content)) {
            const parts = content.map(item => {
                if (!item || !item.type) {
                    return '';
                }
                if (item.type === 'text') {
                    return item.text ? item.text.trim() : '';
                } else if (item.type === 'tool_use') {
                    const toolName = item.name || 'Unknown Tool';
                    const toolInput = item.input ? JSON.stringify(item.input, null, 2) : '';
                    return `[Tool: ${toolName}]${toolInput ? `\nInput: ${toolInput}` : ''}`;
                } else if (item.type === 'tool_result') {
                    const resultContent = item.content || 'No result content';
                    return `[Tool Result]\n${resultContent}`;
                }
                return '';
            }).filter(part => part.trim() !== '');
            
            return parts.join('\n\n');
        }
        return 'Unknown content format';
    }



    private generateGroupedConversationHTML(messages: ConversationMessage[]): string {
        const requestGroups: { [requestId: string]: ConversationMessage[] } = {};
        
        // Group messages by request ID
        messages.forEach(message => {
            const requestId = message.requestId || `solo-${message.uuid}`;
            if (!requestGroups[requestId]) {
                requestGroups[requestId] = [];
            }
            requestGroups[requestId].push(message);
        });
        
        let html = '';
        Object.entries(requestGroups).forEach(([requestId, groupMessages]) => {
            const firstMessage = groupMessages[0];
            const isInternalMessage = firstMessage.isMeta || firstMessage.uuid?.includes('system') || false;
            let role = firstMessage.type === 'user' ? 'User Prompt' : 'Claude Response';
            if (isInternalMessage) {
                role = firstMessage.type === 'user' ? 'System Prompt' : 'Claude Internal';
            }
            
            const date = new Date(firstMessage.timestamp);
            const timeStr = date.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' });
            const dateStr = date.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit' });
            const timestamp = `${timeStr}:${dateStr}`;
            
            const messageMetadata = [];
            if (firstMessage.message?.model) messageMetadata.push(`Model: ${firstMessage.message.model}`);
            if (firstMessage.userType) messageMetadata.push(`UserType: ${firstMessage.userType}`);
            
            // Add token usage information if available
            const usage = firstMessage.message?.usage;
            if (usage && (usage.input_tokens || usage.output_tokens)) {
                const totalTokens = (usage.input_tokens || 0) + (usage.output_tokens || 0) + 
                                  (usage.cache_creation_input_tokens || 0) + (usage.cache_read_input_tokens || 0);
                if (totalTokens > 0) {
                    messageMetadata.push(`Tokens: ${totalTokens.toLocaleString()}`);
                    
                    // Calculate cost
                    const inputCost = ((usage.input_tokens || 0) / 1000000) * 15.0;
                    const outputCost = ((usage.output_tokens || 0) / 1000000) * 75.0;
                    const cacheCost = ((usage.cache_creation_input_tokens || 0) / 1000000) * 18.75;
                    const readCost = ((usage.cache_read_input_tokens || 0) / 1000000) * 1.50;
                    const totalCost = inputCost + outputCost + cacheCost + readCost;
                    
                    if (totalCost > 0) {
                        messageMetadata.push(`Cost: $${totalCost.toFixed(4)}`);
                    }
                }
            }
            
            const metadataStr = messageMetadata.length > 0 ? ` [${messageMetadata.join(', ')}]` : '';
            
            html += `<div class="request-header" onclick="toggleRequest('${requestId}')">
                <span class="collapse-icon" id="icon-${requestId}">▶</span>
                <span>${timestamp} - ${role}${metadataStr}</span>
            </div>
            <div class="request-content" id="content-${requestId}">`;
            
            groupMessages.forEach(message => {
                const content = this.extractDetailedContent(message.message?.content);
                if (content.trim()) {
                    // Clean up content: remove excessive whitespace and blank lines
                    const cleanedContent = content
                        .split('\n')
                        .map(line => line.trim())
                        .filter(line => line.length > 0)
                        .join('\n');
                    
                    if (cleanedContent) {
                        html += `<div class="message-content">${this.escapeHtml(cleanedContent)}</div>`;
                    }
                }
            });
            
            html += `</div>`;
        });
        
        return html;
    }

    private extractConversationMetadata(messages: ConversationMessage[]): any {
        const metadata = {
            version: 'Unknown',
            gitBranch: 'Unknown', 
            serviceTier: 'Unknown',
            cwd: 'Unknown'
        };

        // Search through all messages for metadata
        for (const message of messages) {
            if (message.version && metadata.version === 'Unknown') {
                metadata.version = message.version;
            }
            if (message.gitBranch && metadata.gitBranch === 'Unknown') {
                metadata.gitBranch = message.gitBranch;
            }
            if (message.cwd && metadata.cwd === 'Unknown') {
                metadata.cwd = message.cwd;
            }
            if (message.message?.usage?.service_tier && metadata.serviceTier === 'Unknown') {
                metadata.serviceTier = message.message.usage.service_tier;
            }
            
            // Stop early if we found everything
            if (metadata.version !== 'Unknown' && 
                metadata.gitBranch !== 'Unknown' && 
                metadata.serviceTier !== 'Unknown' && 
                metadata.cwd !== 'Unknown') {
                break;
            }
        }

        return metadata;
    }

    private escapeHtml(text: string): string {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    private async handleWebviewMessage(message: any, conversation: ConversationSession): Promise<void> {
        switch (message.command) {
            case 'export':
                await this.exportConversation(conversation, message.format);
                break;
            case 'copy':
                await vscode.env.clipboard.writeText(message.text);
                vscode.window.showInformationMessage('Copied to clipboard');
                break;
        }
    }

    private async exportConversation(conversation: ConversationSession, format: string): Promise<void> {
        try {
            // Create .claude/.chats directory in workspace if it doesn't exist
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            let defaultPath: string;
            
            if (workspaceFolder) {
                const claudeDir = path.join(workspaceFolder.uri.fsPath, '.claude');
                const chatsDir = path.join(claudeDir, '.chats');
                await fs.ensureDir(chatsDir);
                defaultPath = path.join(chatsDir, `conversation-${conversation.sessionId}.${format}`);
            } else {
                // Fallback to current directory if no workspace
                defaultPath = `conversation-${conversation.sessionId}.${format}`;
            }
            
            const saveUri = await vscode.window.showSaveDialog({
                defaultUri: vscode.Uri.file(defaultPath),
                filters: {
                    'Markdown': ['md'],
                    'JSON': ['json'],
                    'Text': ['txt']
                }
            });

            if (saveUri) {
                let content = '';
                
                switch (format) {
                    case 'md':
                        content = this.formatAsMarkdown(conversation);
                        break;
                    case 'json':
                        content = JSON.stringify(conversation, null, 2);
                        break;
                    case 'txt':
                        content = this.formatAsText(conversation);
                        break;
                }

                await vscode.workspace.fs.writeFile(saveUri, Buffer.from(content, 'utf8'));
                vscode.window.showInformationMessage(`Conversation exported to ${saveUri.fsPath}`);
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to export conversation: ${error}`);
        }
    }

    private formatAsMarkdown(conversation: ConversationSession): string {
        let markdown = `# Claude Conversation\n\n`;
        markdown += `**Session ID:** ${conversation.sessionId}\n`;
        markdown += `**Project:** ${conversation.projectPath}\n`;
        markdown += `**Started:** ${new Date(conversation.startTime).toLocaleString()}\n`;
        markdown += `**Ended:** ${conversation.endTime ? new Date(conversation.endTime).toLocaleString() : 'Ongoing'}\n`;
        markdown += `**Messages:** ${conversation.messageCount}\n\n`;

        conversation.messages.forEach((message) => {
            const date = new Date(message.timestamp);
            const timeStr = date.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' });
            const dateStr = date.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit' });
            const timestamp = `${timeStr}:${dateStr}`;
            
            const role = message.type === 'user' ? 'User Prompt' : 'Claude Response';
            const messageMetadata = [];
            if (message.message?.model) messageMetadata.push(`Model: ${message.message.model}`);
            if (message.userType) messageMetadata.push(`UserType: ${message.userType}`);
            
            // Add token usage information if available
            const usage = message.message?.usage;
            if (usage && (usage.input_tokens || usage.output_tokens)) {
                const totalTokens = (usage.input_tokens || 0) + (usage.output_tokens || 0) + 
                                  (usage.cache_creation_input_tokens || 0) + (usage.cache_read_input_tokens || 0);
                if (totalTokens > 0) {
                    messageMetadata.push(`Tokens: ${totalTokens.toLocaleString()}`);
                    
                    // Calculate cost
                    const inputCost = ((usage.input_tokens || 0) / 1000000) * 15.0;
                    const outputCost = ((usage.output_tokens || 0) / 1000000) * 75.0;
                    const cacheCost = ((usage.cache_creation_input_tokens || 0) / 1000000) * 18.75;
                    const readCost = ((usage.cache_read_input_tokens || 0) / 1000000) * 1.50;
                    const totalCost = inputCost + outputCost + cacheCost + readCost;
                    
                    if (totalCost > 0) {
                        messageMetadata.push(`Cost: $${totalCost.toFixed(4)}`);
                    }
                }
            }
            
            const metadataStr = messageMetadata.length > 0 ? ` [${messageMetadata.join(', ')}]` : '';
            
            markdown += `## ${timestamp} - ${role}${metadataStr}\n\n`;
            
            const content = this.extractDetailedContent(message.message.content);
            if (content.trim()) {
                markdown += `\`\`\`\n${content}\n\`\`\`\n\n`;
            }
            
            markdown += '---\n\n';
        });

        return markdown;
    }

    private formatAsText(conversation: ConversationSession): string {
        let text = `Claude Conversation\n`;
        text += `Session ID: ${conversation.sessionId}\n`;
        text += `Project: ${conversation.projectPath}\n`;
        text += `Started: ${new Date(conversation.startTime).toLocaleString()}\n`;
        text += `Ended: ${conversation.endTime ? new Date(conversation.endTime).toLocaleString() : 'Ongoing'}\n`;
        text += `Messages: ${conversation.messageCount}\n\n`;
        text += '='.repeat(50) + '\n\n';

        conversation.messages.forEach((message) => {
            const date = new Date(message.timestamp);
            const timeStr = date.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' });
            const dateStr = date.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit' });
            const timestamp = `${timeStr}:${dateStr}`;
            
            const role = message.type === 'user' ? 'User Prompt' : 'Claude Response';
            const messageMetadata = [];
            if (message.message?.model) messageMetadata.push(`Model: ${message.message.model}`);
            if (message.userType) messageMetadata.push(`UserType: ${message.userType}`);
            
            // Add token usage information if available
            const usage = message.message?.usage;
            if (usage && (usage.input_tokens || usage.output_tokens)) {
                const totalTokens = (usage.input_tokens || 0) + (usage.output_tokens || 0) + 
                                  (usage.cache_creation_input_tokens || 0) + (usage.cache_read_input_tokens || 0);
                if (totalTokens > 0) {
                    messageMetadata.push(`Tokens: ${totalTokens.toLocaleString()}`);
                    
                    // Calculate cost
                    const inputCost = ((usage.input_tokens || 0) / 1000000) * 15.0;
                    const outputCost = ((usage.output_tokens || 0) / 1000000) * 75.0;
                    const cacheCost = ((usage.cache_creation_input_tokens || 0) / 1000000) * 18.75;
                    const readCost = ((usage.cache_read_input_tokens || 0) / 1000000) * 1.50;
                    const totalCost = inputCost + outputCost + cacheCost + readCost;
                    
                    if (totalCost > 0) {
                        messageMetadata.push(`Cost: $${totalCost.toFixed(4)}`);
                    }
                }
            }
            
            const metadataStr = messageMetadata.length > 0 ? ` [${messageMetadata.join(', ')}]` : '';
            
            text += `${timestamp} - ${role}${metadataStr}\n`;
            
            const content = this.extractDetailedContent(message.message.content);
            if (content.trim()) {
                text += `${content}\n\n`;
            }
            
            text += '-'.repeat(30) + '\n\n';
        });

        return text;
    }

    dispose(): void {
        if (this.panel) {
            this.panel.dispose();
        }
    }
}