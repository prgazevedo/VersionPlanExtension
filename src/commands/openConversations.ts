import * as vscode from 'vscode';
import * as fs from 'fs-extra';
import * as path from 'path';
import { ConversationViewer } from '../conversation/ConversationViewer';
import { ConversationManager } from '../conversation/ConversationManager';
import { ConversationSummary, ConversationSession } from '../conversation/types';

export async function openConversationsCommand(
    conversationManager: ConversationManager,
    conversationViewer: ConversationViewer
): Promise<void> {
    try {
        // Get all available conversations
        const conversations = await conversationManager.getAvailableConversations();
        
        if (conversations.length === 0) {
            const choice = await vscode.window.showInformationMessage(
                'No conversations found. Make sure the Claude data path is configured correctly.',
                'Configure Path'
            );
            
            if (choice === 'Configure Path') {
                await vscode.commands.executeCommand('workbench.action.openSettings', 'claude-config.conversationDataPath');
            }
            return;
        }

        // Create quick pick items
        const quickPickItems = conversations.map(conv => ({
            label: `${conv.projectName}`,
            description: `${new Date(conv.startTime).toLocaleDateString()} - ${conv.duration}`,
            detail: `${conv.messageCount} messages - ${conv.firstMessage}`,
            conversation: conv
        }));

        // Show quick pick
        const selectedItem = await vscode.window.showQuickPick(quickPickItems, {
            placeHolder: 'Select a conversation to view',
            matchOnDescription: true,
            matchOnDetail: true,
            ignoreFocusOut: true
        });

        if (selectedItem) {
            await conversationViewer.showConversation(selectedItem.conversation);
        }

    } catch (error) {
        vscode.window.showErrorMessage(`Failed to open conversations: ${error}`);
        console.error('Open conversations command error:', error);
    }
}

export async function viewConversationCommand(
    conversationViewer: ConversationViewer,
    conversationSummary: ConversationSummary
): Promise<void> {
    try {
        await conversationViewer.showConversation(conversationSummary);
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to view conversation: ${error}`);
        console.error('View conversation command error:', error);
    }
}

export async function exportConversationCommand(
    conversationManager: ConversationManager,
    conversationSummary: ConversationSummary
): Promise<void> {
    try {
        // Load the conversation
        const conversation = await conversationManager.loadConversation(conversationSummary.filePath);
        if (!conversation) {
            vscode.window.showErrorMessage('Failed to load conversation for export');
            return;
        }

        // Ask user for export format
        const format = await vscode.window.showQuickPick([
            { label: 'Markdown (.md)', value: 'md' },
            { label: 'JSON (.json)', value: 'json' },
            { label: 'Plain Text (.txt)', value: 'txt' }
        ], {
            placeHolder: 'Select export format'
        });

        if (!format) {
            return;
        }

        // Show save dialog
        const saveUri = await vscode.window.showSaveDialog({
            defaultUri: vscode.Uri.file(`conversation-${conversation.sessionId}.${format.value}`),
            filters: {
                'Markdown': ['md'],
                'JSON': ['json'],
                'Text': ['txt']
            }
        });

        if (saveUri) {
            let content = '';
            
            switch (format.value) {
                case 'md':
                    content = formatAsMarkdown(conversation);
                    break;
                case 'json':
                    content = JSON.stringify(conversation, null, 2);
                    break;
                case 'txt':
                    content = formatAsText(conversation);
                    break;
            }

            await vscode.workspace.fs.writeFile(saveUri, Buffer.from(content, 'utf8'));
            vscode.window.showInformationMessage(`Conversation exported to ${saveUri.fsPath}`);
        }

    } catch (error) {
        vscode.window.showErrorMessage(`Failed to export conversation: ${error}`);
        console.error('Export conversation command error:', error);
    }
}

function formatAsMarkdown(conversation: any): string {
    let markdown = `# Claude Conversation\n\n`;
    markdown += `**Session ID:** ${conversation.sessionId}\n`;
    markdown += `**Project:** ${conversation.projectPath}\n`;
    markdown += `**Started:** ${new Date(conversation.startTime).toLocaleString()}\n`;
    markdown += `**Ended:** ${conversation.endTime ? new Date(conversation.endTime).toLocaleString() : 'Ongoing'}\n`;
    markdown += `**Messages:** ${conversation.messageCount}\n\n`;

    conversation.messages.forEach((message: any) => {
        const role = message.type === 'user' ? 'User' : 'Assistant';
        const timestamp = new Date(message.timestamp).toLocaleString();
        
        markdown += `## ${role} - ${timestamp}\n\n`;
        
        if (typeof message.message.content === 'string') {
            markdown += `${message.message.content}\n\n`;
        } else if (Array.isArray(message.message.content)) {
            message.message.content.forEach((item: any) => {
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

function formatAsText(conversation: any): string {
    let text = `Claude Conversation\n`;
    text += `Session ID: ${conversation.sessionId}\n`;
    text += `Project: ${conversation.projectPath}\n`;
    text += `Started: ${new Date(conversation.startTime).toLocaleString()}\n`;
    text += `Ended: ${conversation.endTime ? new Date(conversation.endTime).toLocaleString() : 'Ongoing'}\n`;
    text += `Messages: ${conversation.messageCount}\n\n`;
    text += '='.repeat(50) + '\n\n';

    conversation.messages.forEach((message: any) => {
        const role = message.type === 'user' ? 'USER' : 'ASSISTANT';
        const timestamp = new Date(message.timestamp).toLocaleString();
        
        text += `[${role}] ${timestamp}\n`;
        
        if (typeof message.message.content === 'string') {
            text += `${message.message.content}\n\n`;
        } else if (Array.isArray(message.message.content)) {
            message.message.content.forEach((item: any) => {
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

export async function exportAllConversationsCommand(
    conversationManager: ConversationManager
): Promise<void> {
    try {
        // Get all conversations
        const conversations = await conversationManager.getAvailableConversations();
        
        if (conversations.length === 0) {
            vscode.window.showInformationMessage('No conversations found to export.');
            return;
        }

        // Create workspace .claude/.chats directory
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            vscode.window.showErrorMessage('No workspace folder available.');
            return;
        }

        const claudeDir = path.join(workspaceFolder.uri.fsPath, '.claude');
        const chatsDir = path.join(claudeDir, '.chats');
        await fs.ensureDir(chatsDir);

        // Export each conversation
        let exportCount = 0;
        const errors: string[] = [];

        for (const conversationSummary of conversations) {
            try {
                const conversation = await conversationManager.loadConversation(conversationSummary.filePath);
                if (conversation) {
                    const filename = `conversation-${conversation.sessionId}.md`;
                    const filePath = path.join(chatsDir, filename);
                    const content = formatAsMarkdown(conversation);
                    
                    await fs.writeFile(filePath, content, 'utf8');
                    exportCount++;
                }
            } catch (error) {
                errors.push(`Failed to export conversation ${conversationSummary.projectName}: ${error}`);
            }
        }

        if (errors.length > 0) {
            vscode.window.showWarningMessage(`Exported ${exportCount} conversations with ${errors.length} errors. Check output for details.`);
            console.error('Export errors:', errors);
        } else {
            vscode.window.showInformationMessage(`Successfully exported ${exportCount} conversations to .claude/.chats/`);
        }
        
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to export conversations: ${error}`);
        console.error('Export all conversations error:', error);
    }
}