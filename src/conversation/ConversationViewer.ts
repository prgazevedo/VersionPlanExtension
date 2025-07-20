import * as vscode from 'vscode';
import * as path from 'path';
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
                'conversationViewer',
                `💬 ${conversationSummary.projectName}`,
                vscode.ViewColumn.One,
                {
                    enableScripts: true,
                    retainContextWhenHidden: true
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
        // Extract simple conversation text with timestamps and tool details
        let conversationText = '';
        
        conversation.messages.forEach(message => {
            const role = message.type === 'user' ? 'User' : 'Claude';
            const timestamp = new Date(message.timestamp).toLocaleString();
            const content = this.extractDetailedContent(message.message.content);
            
            if (content.trim()) {
                conversationText += `${role} (${timestamp}):\n${content}\n\n---\n\n`;
            }
        });

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
            padding: 20px;
            border-radius: 8px;
            margin-bottom: 20px;
            border: 1px solid var(--vscode-panel-border);
        }
        .header h1 {
            margin: 0 0 15px 0;
            color: var(--vscode-textLink-foreground);
            font-size: 24px;
        }
        .metadata {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 12px;
            font-size: 14px;
        }
        .metadata-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .metadata-label {
            font-weight: 600;
            color: var(--vscode-descriptionForeground);
            margin-right: 10px;
        }
        .metadata-value {
            color: var(--vscode-editor-foreground);
            font-family: 'Consolas', 'Courier New', monospace;
            font-size: 13px;
        }
        .search-container {
            margin-bottom: 20px;
        }
        .search-container input {
            width: 100%;
            padding: 12px;
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 6px;
            font-size: 14px;
        }
        .conversation {
            background-color: var(--vscode-editor-inactiveSelectionBackground);
            padding: 20px;
            border-radius: 8px;
            border: 1px solid var(--vscode-panel-border);
            white-space: pre-wrap;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            font-size: 14px;
            line-height: 1.7;
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
            border: none;
            padding: 8px 16px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
            font-weight: 500;
        }
        .export-btn:hover {
            background-color: var(--vscode-button-hoverBackground);
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
        <div class="metadata">
            <div class="metadata-item">
                <span class="metadata-label">Session ID:</span>
                <span class="metadata-value">${conversation.sessionId || 'Unknown'}</span>
            </div>
            <div class="metadata-item">
                <span class="metadata-label">Project:</span>
                <span class="metadata-value">${conversationSummary.projectName || 'Unknown'}</span>
            </div>
            <div class="metadata-item">
                <span class="metadata-label">Started:</span>
                <span class="metadata-value">${new Date(conversationSummary.startTime).toLocaleString()}</span>
            </div>
            <div class="metadata-item">
                <span class="metadata-label">Ended:</span>
                <span class="metadata-value">${conversationSummary.endTime ? new Date(conversationSummary.endTime).toLocaleString() : 'Ongoing'}</span>
            </div>
            <div class="metadata-item">
                <span class="metadata-label">Duration:</span>
                <span class="metadata-value">${conversationSummary.duration || 'Unknown'}</span>
            </div>
            <div class="metadata-item">
                <span class="metadata-label">Messages:</span>
                <span class="metadata-value">${conversationSummary.messageCount || 0}</span>
            </div>
        </div>
    </div>

    <div class="search-container">
        <input type="text" id="searchInput" placeholder="🔍 Search conversation..." oninput="filterContent()">
    </div>

    <div class="conversation" id="conversationContent">${this.escapeHtml(conversationText)}</div>

    <script>
        function filterContent() {
            const searchTerm = document.getElementById('searchInput').value.toLowerCase();
            const content = document.getElementById('conversationContent');
            const originalText = ${JSON.stringify(conversationText)};
            
            if (searchTerm === '') {
                content.innerHTML = originalText;
                return;
            }
            
            const lines = originalText.split('\\n');
            const filteredLines = lines.filter(line => 
                line.toLowerCase().includes(searchTerm)
            );
            
            content.innerHTML = filteredLines.join('\\n');
        }
        
        function exportConversation(format) {
            const vscode = acquireVsCodeApi();
            vscode.postMessage({
                command: 'export',
                format: format
            });
        }
    </script>
</body>
</html>`;
    }

    private extractDetailedContent(content: any): string {
        if (typeof content === 'string') {
            return content;
        } else if (Array.isArray(content)) {
            return content.map(item => {
                if (item.type === 'text') {
                    return item.text || '';
                } else if (item.type === 'tool_use') {
                    const toolName = item.name || 'Unknown Tool';
                    const toolInput = item.input ? JSON.stringify(item.input, null, 2) : '';
                    return `[Tool: ${toolName}]\n${toolInput ? `Input: ${toolInput}` : ''}`;
                } else if (item.type === 'tool_result') {
                    const resultContent = item.content || 'No result content';
                    return `[Tool Result]\n${resultContent}`;
                }
                return '';
            }).join('\n\n');
        }
        return '';
    }

    private extractTextContent(content: any): string {
        if (typeof content === 'string') {
            return content;
        } else if (Array.isArray(content)) {
            return content.map(item => {
                if (item.type === 'text') {
                    return item.text || '';
                } else if (item.type === 'tool_use') {
                    return `[Tool: ${item.name}]`;
                } else if (item.type === 'tool_result') {
                    return '[Tool Result]';
                }
                return '';
            }).join(' ');
        }
        return '';
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
            const saveUri = await vscode.window.showSaveDialog({
                defaultUri: vscode.Uri.file(`conversation-${conversation.sessionId}.${format}`),
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

        conversation.messages.forEach((message, index) => {
            const role = message.type === 'user' ? 'User' : 'Assistant';
            const timestamp = new Date(message.timestamp).toLocaleString();
            
            markdown += `## ${role} - ${timestamp}\n\n`;
            
            const content = this.extractTextContent(message.message.content);
            if (content.trim()) {
                markdown += `${content}\n\n`;
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

        conversation.messages.forEach((message, index) => {
            const role = message.type === 'user' ? 'USER' : 'CLAUDE';
            const timestamp = new Date(message.timestamp).toLocaleString();
            
            text += `[${role}] ${timestamp}\n`;
            
            const content = this.extractTextContent(message.message.content);
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