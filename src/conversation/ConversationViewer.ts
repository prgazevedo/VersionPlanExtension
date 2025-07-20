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
                `Conversation: ${conversationSummary.projectName}`,
                vscode.ViewColumn.One,
                {
                    enableScripts: true,
                    retainContextWhenHidden: true,
                    localResourceRoots: [
                        vscode.Uri.file(path.join(this.context.extensionPath, 'out', 'webview'))
                    ]
                }
            );

            // Set the webview content
            this.panel.webview.html = this.getWebviewContent(conversation);

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

    private getWebviewContent(conversation: ConversationSession): string {
        const messages = conversation.messages.map(msg => this.formatMessage(msg));
        const conversationData = JSON.stringify({
            session: {
                sessionId: conversation.sessionId,
                projectPath: conversation.projectPath,
                startTime: conversation.startTime,
                endTime: conversation.endTime,
                messageCount: conversation.messageCount
            },
            messages: messages
        });

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Claude Conversation Viewer</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            margin: 0;
            padding: 20px;
            background-color: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
            line-height: 1.6;
        }

        .conversation-header {
            margin-bottom: 20px;
            padding: 15px;
            background-color: var(--vscode-editor-inactiveSelectionBackground);
            border-radius: 6px;
            border-left: 4px solid var(--vscode-activityBarBadge-background);
        }

        .conversation-meta {
            display: grid;
            grid-template-columns: auto 1fr;
            gap: 10px 20px;
            font-size: 0.9em;
            color: var(--vscode-descriptionForeground);
        }

        .conversation-meta strong {
            color: var(--vscode-editor-foreground);
        }

        .message {
            margin-bottom: 20px;
            padding: 15px;
            border-radius: 6px;
            position: relative;
        }

        .message.user {
            background-color: var(--vscode-inputOption-activeBackground);
            border-left: 4px solid var(--vscode-button-background);
        }

        .message.assistant {
            background-color: var(--vscode-editor-inactiveSelectionBackground);
            border-left: 4px solid var(--vscode-activityBarBadge-background);
        }

        .message-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 10px;
            font-size: 0.9em;
            color: var(--vscode-descriptionForeground);
        }

        .message-role {
            font-weight: bold;
            color: var(--vscode-editor-foreground);
        }

        .message-timestamp {
            font-family: 'Monaco', 'Courier New', monospace;
            font-size: 0.8em;
        }

        .message-content {
            white-space: pre-wrap;
            word-wrap: break-word;
        }

        .tool-use {
            background-color: var(--vscode-terminal-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 4px;
            padding: 10px;
            margin: 10px 0;
            font-family: 'Monaco', 'Courier New', monospace;
            font-size: 0.9em;
        }

        .tool-name {
            color: var(--vscode-symbolIcon-functionForeground);
            font-weight: bold;
        }

        .json-content {
            background-color: var(--vscode-textCodeBlock-background);
            border-radius: 4px;
            padding: 10px;
            margin: 5px 0;
            font-family: 'Monaco', 'Courier New', monospace;
            font-size: 0.85em;
            overflow-x: auto;
            max-height: 200px;
            overflow-y: auto;
        }

        .collapsible {
            cursor: pointer;
            user-select: none;
        }

        .collapsible:hover {
            background-color: var(--vscode-list-hoverBackground);
        }

        .content-collapsed {
            display: none;
        }

        .search-box {
            margin-bottom: 20px;
            padding: 10px;
            width: 100%;
            background-color: var(--vscode-input-background);
            border: 1px solid var(--vscode-input-border);
            border-radius: 4px;
            color: var(--vscode-input-foreground);
            font-size: 14px;
        }

        .search-box:focus {
            outline: none;
            border-color: var(--vscode-focusBorder);
        }

        .highlight {
            background-color: var(--vscode-editor-findMatchHighlightBackground);
            border-radius: 2px;
        }
    </style>
</head>
<body>
    <div class="conversation-header">
        <h2>Claude Conversation</h2>
        <div class="conversation-meta">
            <strong>Session ID:</strong> <span id="sessionId"></span>
            <strong>Project:</strong> <span id="projectPath"></span>
            <strong>Started:</strong> <span id="startTime"></span>
            <strong>Ended:</strong> <span id="endTime"></span>
            <strong>Duration:</strong> <span id="duration"></span>
            <strong>Messages:</strong> <span id="messageCount"></span>
        </div>
    </div>

    <input type="text" class="search-box" placeholder="Search conversation..." id="searchBox">

    <div id="messagesContainer"></div>

    <script>
        const conversationData = ${conversationData};
        
        // Initialize the conversation view
        function initializeConversation() {
            const session = conversationData.session;
            
            document.getElementById('sessionId').textContent = session.sessionId;
            document.getElementById('projectPath').textContent = session.projectPath;
            document.getElementById('startTime').textContent = new Date(session.startTime).toLocaleString();
            document.getElementById('endTime').textContent = session.endTime ? new Date(session.endTime).toLocaleString() : 'Ongoing';
            document.getElementById('messageCount').textContent = session.messageCount;
            
            // Calculate duration
            if (session.endTime) {
                const duration = new Date(session.endTime) - new Date(session.startTime);
                const minutes = Math.floor(duration / 60000);
                const hours = Math.floor(minutes / 60);
                document.getElementById('duration').textContent = hours > 0 ? 
                    \`\${hours}h \${minutes % 60}m\` : \`\${minutes}m\`;
            } else {
                document.getElementById('duration').textContent = 'Ongoing';
            }

            renderMessages();
            setupSearch();
        }

        function renderMessages() {
            const container = document.getElementById('messagesContainer');
            container.innerHTML = '';

            conversationData.messages.forEach((message, index) => {
                const messageElement = createMessageElement(message, index);
                container.appendChild(messageElement);
            });
        }

        function createMessageElement(message, index) {
            const messageDiv = document.createElement('div');
            messageDiv.className = \`message \${message.role}\`;
            messageDiv.setAttribute('data-message-index', index);

            const headerDiv = document.createElement('div');
            headerDiv.className = 'message-header';
            headerDiv.innerHTML = \`
                <span class="message-role">\${message.role === 'user' ? '👤 User' : '🤖 Assistant'}</span>
                <span class="message-timestamp">\${new Date(message.timestamp).toLocaleString()}</span>
            \`;

            const contentDiv = document.createElement('div');
            contentDiv.className = 'message-content';
            contentDiv.innerHTML = formatMessageContent(message);

            messageDiv.appendChild(headerDiv);
            messageDiv.appendChild(contentDiv);

            return messageDiv;
        }

        function formatMessageContent(message) {
            if (typeof message.content === 'string') {
                return escapeHtml(message.content);
            } else if (Array.isArray(message.content)) {
                return message.content.map(item => {
                    if (item.type === 'text') {
                        return escapeHtml(item.text);
                    } else if (item.type === 'tool_use') {
                        return \`<div class="tool-use">
                            <div class="tool-name">🔧 \${item.name}</div>
                            <div class="json-content">\${JSON.stringify(item.input, null, 2)}</div>
                        </div>\`;
                    }
                    return '';
                }).join('');
            }
            return 'No content';
        }

        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }

        function setupSearch() {
            const searchBox = document.getElementById('searchBox');
            searchBox.addEventListener('input', (e) => {
                const searchTerm = e.target.value.toLowerCase();
                searchMessages(searchTerm);
            });
        }

        function searchMessages(searchTerm) {
            const messages = document.querySelectorAll('.message');
            
            messages.forEach(message => {
                const content = message.textContent.toLowerCase();
                if (searchTerm === '' || content.includes(searchTerm)) {
                    message.style.display = 'block';
                    if (searchTerm !== '') {
                        highlightText(message, searchTerm);
                    } else {
                        removeHighlights(message);
                    }
                } else {
                    message.style.display = 'none';
                }
            });
        }

        function highlightText(element, searchTerm) {
            // Simple text highlighting
            const content = element.querySelector('.message-content');
            if (content) {
                const text = content.textContent;
                const regex = new RegExp(\`(\${searchTerm})\`, 'gi');
                const highlightedText = text.replace(regex, '<span class="highlight">$1</span>');
                content.innerHTML = highlightedText;
            }
        }

        function removeHighlights(element) {
            const highlights = element.querySelectorAll('.highlight');
            highlights.forEach(highlight => {
                const parent = highlight.parentNode;
                parent.replaceChild(document.createTextNode(highlight.textContent), highlight);
                parent.normalize();
            });
        }

        // Initialize when page loads
        initializeConversation();
    </script>
</body>
</html>`;
    }

    private formatMessage(message: ConversationMessage): any {
        return {
            uuid: message.uuid,
            timestamp: message.timestamp,
            role: message.type,
            content: message.message.content,
            requestId: message.requestId,
            toolUseResult: message.toolUseResult,
            isMeta: message.isMeta
        };
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
            
            if (typeof message.message.content === 'string') {
                markdown += `${message.message.content}\n\n`;
            } else if (Array.isArray(message.message.content)) {
                message.message.content.forEach(item => {
                    if (item.type === 'text') {
                        markdown += `${item.text}\n\n`;
                    } else if (item.type === 'tool_use') {
                        markdown += `### Tool Use: ${item.name}\n\n`;
                        markdown += `\`\`\`json\n${JSON.stringify(item.input, null, 2)}\n\`\`\`\n\n`;
                    }
                });
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
            const role = message.type === 'user' ? 'USER' : 'ASSISTANT';
            const timestamp = new Date(message.timestamp).toLocaleString();
            
            text += `[${role}] ${timestamp}\n`;
            
            if (typeof message.message.content === 'string') {
                text += `${message.message.content}\n\n`;
            } else if (Array.isArray(message.message.content)) {
                message.message.content.forEach(item => {
                    if (item.type === 'text') {
                        text += `${item.text}\n\n`;
                    } else if (item.type === 'tool_use') {
                        text += `[TOOL: ${item.name}]\n${JSON.stringify(item.input, null, 2)}\n\n`;
                    }
                });
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