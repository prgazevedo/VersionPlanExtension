import * as vscode from 'vscode';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';
import { RepositoryManager } from './repository';
import { ClaudeFileManager } from './fileManager';
import { ClaudeTreeDataProvider } from './claudeTreeProvider';
import { ConversationManager } from './conversation/ConversationManager';
import { ConversationTreeProvider } from './conversation/ConversationTreeProvider';
import { ConversationViewer } from './conversation/ConversationViewer';
import { UsageMonitorTreeProvider } from './UsageMonitorTreeProvider';
import { ForkTreeProvider } from './conversation/fork/ForkTreeProvider';
import { ForkCommands } from './conversation/fork/ForkCommands';
import { syncCommand } from './commands/sync';
import { editCommand } from './commands/edit';
import { openConversationsCommand, viewConversationCommand, exportConversationCommand, exportAllConversationsCommand } from './commands/openConversations';
import { viewUsageStatsCommand, showUsageQuickPickCommand, debugCcusageCommand, installCcusageHelpCommand } from './commands/usage';
import { syncToCloudCommand, openCloudSettingsCommand, setWebDAVPasswordCommand, debugWebDAVCredentialsCommand } from './commands/cloudSyncIntegrated';
import { searchConversationsCommand, advancedSearchConversationsCommand, searchSuggestionsCommand } from './commands/searchConversations';
import { viewAnalyticsCommand, viewAnalyticsSummaryCommand } from './commands/viewAnalytics';
import { GitignoreManager } from './utils/GitignoreManager';
import { SummaryCacheManager } from './conversation/SummaryCache';
import { Logger } from './utils/Logger';

let repositoryManager: RepositoryManager;
let fileManager: ClaudeFileManager;
let conversationManager: ConversationManager;
let conversationTreeProvider: ConversationTreeProvider;
let conversationViewer: ConversationViewer;
let usageMonitorTreeProvider: UsageMonitorTreeProvider;
let forkTreeProvider: ForkTreeProvider;
let statusBarItem: vscode.StatusBarItem;
let outputChannel: vscode.OutputChannel;

async function ensureClaudeDirectoryStructure() {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        // Silent - this is expected when no workspace is open
        return;
    }
    
    const claudeDir = path.join(workspaceFolder.uri.fsPath, '.claude');
    const chatsDir = path.join(claudeDir, '.chats');
    const plansDir = path.join(claudeDir, '.plans');
    
    try {
        // Check if .claude already exists in workspace
        const claudeExists = await fs.pathExists(claudeDir);
        
        // Safely create the subdirectories we need
        await fs.ensureDir(chatsDir);
        await fs.ensureDir(plansDir);
        
        // Only log during development or when DEBUG flag is set
        // console.log(`Claude workspace directory structure ensured:`, {
        //     claudeDir: claudeExists ? 'already existed' : 'created',
        //     chatsDir: 'ensured',
        //     plansDir: 'ensured',
        //     workspacePath: workspaceFolder.uri.fsPath
        // });
    } catch (error) {
        console.error('Failed to ensure Claude workspace directory structure:', error);
        // Don't throw - extension should still work even if directory creation fails
    }
}

async function ensureGitignoreRules() {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        return;
    }

    try {
        const workspacePath = workspaceFolder.uri.fsPath;
        const wasUpdated = await GitignoreManager.ensureGitignoreRules(workspacePath);
        
        if (wasUpdated) {
            const message = 'Added Claude security rules to .gitignore to prevent private conversation data from being committed to Git.';
            vscode.window.showInformationMessage(message, 'View .gitignore').then(selection => {
                if (selection === 'View .gitignore') {
                    const gitignorePath = path.join(workspacePath, '.gitignore');
                    vscode.workspace.openTextDocument(gitignorePath).then(doc => {
                        vscode.window.showTextDocument(doc);
                    });
                }
            });
            // Removed verbose logging - user gets notification above
        }
    } catch (error) {
        console.warn('Failed to update .gitignore rules:', error);
        vscode.window.showWarningMessage('Failed to update .gitignore with Claude security rules. Please manually add .claude/.chats/ to your .gitignore file.');
    }
}

async function checkForClaudemdAndOfferProjectPlan() {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        return;
    }

    try {
        const workspacePath = workspaceFolder.uri.fsPath;
        const claudemdPath = path.join(workspacePath, 'CLAUDE.md');
        const claudemdExists = await fs.pathExists(claudemdPath);
        
        if (claudemdExists) {
            const planPath = path.join(workspacePath, '.claude', '.plans', 'PROJECT_PLAN.md');
            const planExists = await fs.pathExists(planPath);
            
            // Always check if CLAUDE.md needs the PROJECT_PLAN rule
            await ensureProjectPlanRuleInClaudeMd(workspacePath);
            
            // If PROJECT_PLAN.md doesn't exist, offer to create it
            if (!planExists) {
                const message = 'CLAUDE.md detected! Would you like to create a PROJECT_PLAN.md to help Claude Code understand your project better?';
                vscode.window.showInformationMessage(message, 'Yes, Create PROJECT_PLAN.md', 'Not Now').then(selection => {
                    if (selection === 'Yes, Create PROJECT_PLAN.md') {
                        createProjectPlanTemplate();
                    }
                });
            }
        }
    } catch (error) {
        // Only log errors, not warnings for expected conditions
        console.error('Error checking for CLAUDE.md:', error);
    }
}

async function ensureProjectPlanRuleInClaudeMd(workspacePath: string) {
    try {
        const claudemdPath = path.join(workspacePath, 'CLAUDE.md');
        const projectPlanRule = `

# PROJECT_PLAN Integration
# Added by Claude Config Manager Extension

When working on this project, always refer to and maintain the project plan located at \`.claude/.plans/PROJECT_PLAN.md\`.

**Instructions for Claude Code:**
1. **Read the project plan first** - Always check \`.claude/.plans/PROJECT_PLAN.md\` when starting work to understand the project context, architecture, and current priorities.
2. **Update the project plan regularly** - When making significant changes, discoveries, or completing major features, update the relevant sections in PROJECT_PLAN.md to keep it current.
3. **Use it for context** - Reference the project plan when making architectural decisions, understanding dependencies, or explaining code to ensure consistency with project goals.

**Plan Mode Integration:**
- **When entering plan mode**: Read the current PROJECT_PLAN.md to understand existing context and priorities
- **During plan mode**: Build upon and refine the existing project plan structure
- **When exiting plan mode**: ALWAYS update PROJECT_PLAN.md with your new plan details, replacing or enhancing the relevant sections (Architecture, TODO, Development Workflow, etc.)
- **Plan persistence**: The PROJECT_PLAN.md serves as the permanent repository for all planning work - plan mode should treat it as the single source of truth

This ensures better code quality and maintains project knowledge continuity across different Claude Code sessions and plan mode iterations.
`;

        // Check if the rule already exists
        if (await fs.pathExists(claudemdPath)) {
            const content = await fs.readFile(claudemdPath, 'utf8');
            if (content.includes('# PROJECT_PLAN Integration')) {
                // Silent - this is the expected case
                return;
            }
        }

        // Append the rule to CLAUDE.md
        await fs.appendFile(claudemdPath, projectPlanRule);
        // Silent - user will see the notification when PROJECT_PLAN.md is created
    } catch (error) {
        console.error('Failed to add PROJECT_PLAN rule to CLAUDE.md:', error);
        throw error;
    }
}

async function ensureContext7RuleInClaudeMd(workspacePath: string) {
    try {
        const claudemdPath = path.join(workspacePath, 'CLAUDE.md');
        const context7Rule = `

# Context7 Integration
# Added by Claude Config Manager Extension

When responding to coding requests, automatically append "use context7" to retrieve real-time, version-specific documentation.

**Instructions for Claude Code:**
- For any prompt involving code generation, debugging, or technical questions, automatically include context7
- This ensures you have access to the most current API documentation and examples
- Prevents outdated or hallucinated code responses

**Activation**: This rule is active. All coding prompts will trigger context7 documentation retrieval.
**Benefits**: Real-time documentation, accurate API references, up-to-date code examples.
`;

        // Check if the rule already exists
        if (await fs.pathExists(claudemdPath)) {
            const content = await fs.readFile(claudemdPath, 'utf8');
            if (content.includes('# Context7 Integration')) {
                // Silent - this is the expected case
                return;
            }
        }

        // Append the rule to CLAUDE.md
        await fs.appendFile(claudemdPath, context7Rule);
    } catch (error) {
        console.error('Failed to add Context7 rule to CLAUDE.md:', error);
        throw error;
    }
}

async function removeContext7RuleFromClaudeMd(workspacePath: string) {
    try {
        const claudemdPath = path.join(workspacePath, 'CLAUDE.md');
        
        if (await fs.pathExists(claudemdPath)) {
            const content = await fs.readFile(claudemdPath, 'utf8');
            
            // Remove Context7 section if it exists
            const context7SectionStart = content.indexOf('# Context7 Integration');
            if (context7SectionStart !== -1) {
                // Find the next section or end of file
                const nextSectionIndex = content.indexOf('\n#', context7SectionStart + 1);
                const endIndex = nextSectionIndex !== -1 ? nextSectionIndex : content.length;
                
                const updatedContent = content.substring(0, context7SectionStart) + 
                                     content.substring(endIndex);
                
                await fs.writeFile(claudemdPath, updatedContent);
            }
        }
    } catch (error) {
        console.error('Failed to remove Context7 rule from CLAUDE.md:', error);
        throw error;
    }
}

async function checkContext7Installation(): Promise<boolean> {
    try {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            return false;
        }

        // Check for .vscode/mcp.json with context7 configuration
        const mcpConfigPath = path.join(workspaceFolder.uri.fsPath, '.vscode', 'mcp.json');
        if (await fs.pathExists(mcpConfigPath)) {
            try {
                const mcpConfig = JSON.parse(await fs.readFile(mcpConfigPath, 'utf8'));
                // Check if context7 MCP is configured
                const hasContext7 = mcpConfig.mcpServers && 
                                  Object.keys(mcpConfig.mcpServers).some(key => 
                                      key.includes('context7') || 
                                      (mcpConfig.mcpServers[key].command && 
                                       mcpConfig.mcpServers[key].command.includes('context7'))
                                  );
                if (hasContext7) {
                    return true;
                }
            } catch (parseError) {
                // Invalid JSON, continue checking other methods
            }
        }

        // Check user settings for context7 MCP configuration
        const userConfig = vscode.workspace.getConfiguration('github.copilot.chat');
        const mcpServers = userConfig.get('mcpServers');
        if (mcpServers && typeof mcpServers === 'object') {
            const hasContext7 = Object.keys(mcpServers).some(key => key.includes('context7'));
            if (hasContext7) {
                return true;
            }
        }

        return false;
    } catch (error) {
        console.error('Error checking Context7 installation:', error);
        return false;
    }
}

async function offerContext7Installation() {
    const selection = await vscode.window.showInformationMessage(
        'Context7 MCP server not detected. Would you like help installing it?',
        'Install via NPM',
        'Install via Smithery',
        'Manual Setup Guide',
        'Skip'
    );

    if (selection === 'Install via NPM') {
        vscode.window.showInformationMessage(
            'To install Context7 MCP:\n\n1. Run: npm install -g @upstash/context7-mcp\n2. Configure in .vscode/mcp.json or VS Code settings\n3. Restart VS Code',
            'Open Terminal'
        ).then(terminalSelection => {
            if (terminalSelection === 'Open Terminal') {
                const terminal = vscode.window.createTerminal('Context7 Installation');
                terminal.show();
                terminal.sendText('npm install -g @upstash/context7-mcp');
            }
        });
    } else if (selection === 'Install via Smithery') {
        vscode.window.showInformationMessage(
            'To install Context7 MCP via Smithery:\n\n1. Run: npx -y @smithery/cli@latest install @upstash/context7-mcp\n2. Follow the setup prompts\n3. Restart VS Code',
            'Open Terminal'
        ).then(terminalSelection => {
            if (terminalSelection === 'Open Terminal') {
                const terminal = vscode.window.createTerminal('Context7 Installation');
                terminal.show();
                terminal.sendText('npx -y @smithery/cli@latest install @upstash/context7-mcp');
            }
        });
    } else if (selection === 'Manual Setup Guide') {
        vscode.env.openExternal(vscode.Uri.parse('https://github.com/upstash/context7'));
    }
}

async function createProjectPlanTemplate() {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        return;
    }

    try {
        const workspacePath = workspaceFolder.uri.fsPath;
        const planDir = path.join(workspacePath, '.claude', '.plans');
        const planPath = path.join(planDir, 'PROJECT_PLAN.md');
        
        await fs.ensureDir(planDir);
        
        const template = `# Project Plan

## Overview
Brief description of what this project does and its main purpose.

## Architecture
Key components, technologies, and how they work together.

## Development Setup
Steps needed to get the project running locally:
1. Prerequisites (Node.js version, dependencies, etc.)
2. Installation commands
3. Configuration steps
4. How to run/test

## Key Files & Directories
- \`src/\` - Main source code
- \`tests/\` - Test files
- \`docs/\` - Documentation
- Important configuration files and their purposes

## Development Workflow
- How to make changes
- Testing approach
- Code review process
- Deployment/release process

## Important Context
Any domain-specific knowledge, business rules, or gotchas that would help Claude Code understand the project better.

## TODO
Current priorities and planned improvements.
`;
        
        await fs.writeFile(planPath, template);
        
        // Add PROJECT_PLAN rule to CLAUDE.md
        await ensureProjectPlanRuleInClaudeMd(workspacePath);
        
        // Open the file in the editor
        const document = await vscode.workspace.openTextDocument(planPath);
        await vscode.window.showTextDocument(document);
        
        vscode.window.showInformationMessage('PROJECT_PLAN.md created and CLAUDE.md updated! Fill out the project plan to help Claude Code understand your project better.');
    } catch (error) {
        console.error('Failed to create PROJECT_PLAN.md:', error);
        vscode.window.showErrorMessage(`Failed to create PROJECT_PLAN.md: ${error}`);
    }
}

export async function activate(context: vscode.ExtensionContext) {
    // Create output channel for debugging
    outputChannel = vscode.window.createOutputChannel('Claude Config Manager');
    outputChannel.appendLine('Claude Config Manager activated');
    
    // Set the output channel for all loggers
    Logger.setOutputChannel(outputChannel);
    // Don't auto-show output channel to reduce noise
    
    // Override console.log to also output to our channel (for errors and important messages)
    const originalConsoleLog = console.log;
    console.log = (...args: any[]) => {
        originalConsoleLog(...args);
        // Only log to output channel for debugging purposes
        outputChannel.appendLine(args.map(arg => 
            typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
        ).join(' '));
    };

    // Initialize directory structure and security features safely
    try {
        await ensureClaudeDirectoryStructure();
        await ensureGitignoreRules();
        // Check for CLAUDE.md and offer to create PROJECT_PLAN.md
        await checkForClaudemdAndOfferProjectPlan();
    } catch (error) {
        console.error('Failed during extension initialization:', error);
        // Don't let initialization errors crash the extension
    }

    // Initialize managers
    repositoryManager = new RepositoryManager(context);
    fileManager = new ClaudeFileManager(context, repositoryManager);
    conversationManager = new ConversationManager(context);
    conversationTreeProvider = new ConversationTreeProvider(conversationManager);
    conversationViewer = new ConversationViewer(context, conversationManager);
    
    // Initialize tree providers
    usageMonitorTreeProvider = new UsageMonitorTreeProvider();
    forkTreeProvider = new ForkTreeProvider();
    
    // Refresh tree providers
    setTimeout(() => {
        usageMonitorTreeProvider.refresh();
    }, 100);

    // Create tree data providers and register tree views
    const treeDataProvider = new ClaudeTreeDataProvider();
    vscode.window.createTreeView('claude-config', {
        treeDataProvider: treeDataProvider,
        showCollapseAll: false
    });

    vscode.window.createTreeView('claude-conversations', {
        treeDataProvider: conversationTreeProvider,
        showCollapseAll: true
    });

    vscode.window.createTreeView('claude-usage-monitor', {
        treeDataProvider: usageMonitorTreeProvider,
        showCollapseAll: false
    });

    vscode.window.createTreeView('claude-fork-manager', {
        treeDataProvider: forkTreeProvider,
        showCollapseAll: true
    });


    // Create status bar item
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    updateStatusBarWithUsage();
    statusBarItem.command = 'claude-config.viewUsageStats';
    statusBarItem.show();
    context.subscriptions.push(statusBarItem);

    // Update status bar every 30 seconds
    const statusBarUpdateInterval = setInterval(() => {
        updateStatusBarWithUsage();
    }, 30000);
    
    context.subscriptions.push(new vscode.Disposable(() => {
        clearInterval(statusBarUpdateInterval);
    }));

    // Register commands
    const commands = [
        vscode.commands.registerCommand('claude-config.sync', async () => {
            await syncCommand(repositoryManager, fileManager);
            usageMonitorTreeProvider.refresh();
            updateStatusBarWithUsage();
        }),
        vscode.commands.registerCommand('claude-config.edit', async () => {
            await editCommand(fileManager);
            usageMonitorTreeProvider.refresh();
            updateStatusBarWithUsage();
        }),
        vscode.commands.registerCommand('claude-config.openConversations', () => openConversationsCommand(conversationManager, conversationViewer)),
        vscode.commands.registerCommand('claude-config.refreshConversations', () => conversationTreeProvider.refresh()),
        vscode.commands.registerCommand('claude-config.viewConversation', async (conversationSummary) => {
            await viewConversationCommand(conversationViewer, conversationSummary);
            usageMonitorTreeProvider.refresh();
            updateStatusBarWithUsage();
        }),
        vscode.commands.registerCommand('claude-config.exportConversation', async (conversationSummary) => {
            await exportConversationCommand(conversationManager, conversationSummary);
            usageMonitorTreeProvider.refresh();
            updateStatusBarWithUsage();
        }),
        vscode.commands.registerCommand('claude-config.exportAllConversations', () => exportAllConversationsCommand(conversationManager)),
        vscode.commands.registerCommand('claude-config.addProjectPlanRule', () => {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (workspaceFolder) {
                ensureProjectPlanRuleInClaudeMd(workspaceFolder.uri.fsPath).then(() => {
                    vscode.window.showInformationMessage('PROJECT_PLAN rule added to CLAUDE.md');
                }).catch(err => {
                    vscode.window.showErrorMessage(`Failed to add PROJECT_PLAN rule: ${err.message}`);
                });
            } else {
                vscode.window.showErrorMessage('No workspace folder found');
            }
        }),
        vscode.commands.registerCommand('claude-config.toggleContext7', async () => {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) {
                vscode.window.showErrorMessage('No workspace folder found');
                return;
            }

            const config = vscode.workspace.getConfiguration('claude-config');
            const currentSetting = config.get<boolean>('autoUseContext7', false);
            
            try {
                await config.update('autoUseContext7', !currentSetting, vscode.ConfigurationTarget.Workspace);
                
                if (!currentSetting) {
                    // Enabling Context7
                    const context7Installed = await checkContext7Installation();
                    if (!context7Installed) {
                        await offerContext7Installation();
                    }
                    await ensureContext7RuleInClaudeMd(workspaceFolder.uri.fsPath);
                    vscode.window.showInformationMessage('Context7 auto-append enabled! Added rule to CLAUDE.md');
                } else {
                    // Disabling Context7
                    await removeContext7RuleFromClaudeMd(workspaceFolder.uri.fsPath);
                    vscode.window.showInformationMessage('Context7 auto-append disabled! Removed rule from CLAUDE.md');
                }
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to toggle Context7: ${error}`);
            }
        }),
        vscode.commands.registerCommand('claude-config.installContext7Help', () => {
            offerContext7Installation();
        }),
        vscode.commands.registerCommand('claude-config.viewUsageStats', () => viewUsageStatsCommand()),
        vscode.commands.registerCommand('claude-config.showUsageQuickPick', () => showUsageQuickPickCommand()),
        vscode.commands.registerCommand('claude-config.debugCcusage', () => debugCcusageCommand()),
        vscode.commands.registerCommand('claude-config.installCcusageHelp', () => installCcusageHelpCommand()),
        vscode.commands.registerCommand('claude-config.debugWebDAVCredentials', () => debugWebDAVCredentialsCommand(context)),
        vscode.commands.registerCommand('claude-config.showOutputChannel', () => {
            if (outputChannel) {
                outputChannel.show();
            } else {
                vscode.window.showErrorMessage('Output channel not initialized');
            }
        }),
        vscode.commands.registerCommand('claude-config.refreshUsage', () => {
            usageMonitorTreeProvider.refresh();
            updateStatusBarWithUsage();
        }),
        vscode.commands.registerCommand('claude-config.refreshTokenWindow', async () => {
            // Force refresh the token window monitor
            const tokenWindowMonitor = (await import('./components/TokenWindowMonitor')).TokenWindowMonitor.getInstance();
            tokenWindowMonitor.clearCache();
            await tokenWindowMonitor.getCurrentWindow();
            usageMonitorTreeProvider.refresh();
        }),
        
        // Integrated cloud sync commands
        vscode.commands.registerCommand('claude-config.syncToCloud', () => syncToCloudCommand(context, conversationManager)),
        vscode.commands.registerCommand('claude-config.openCloudSettings', () => openCloudSettingsCommand(context)),
        vscode.commands.registerCommand('claude-config.setWebDAVPassword', () => setWebDAVPasswordCommand(context)),
        
        
        // Summary-based search commands
        vscode.commands.registerCommand('claude-config.searchConversations', () => searchConversationsCommand()),
        vscode.commands.registerCommand('claude-config.advancedSearchConversations', () => advancedSearchConversationsCommand()),
        vscode.commands.registerCommand('claude-config.searchSuggestions', () => searchSuggestionsCommand()),
        
        // Analytics commands
        vscode.commands.registerCommand('claude-config.viewAnalytics', () => viewAnalyticsCommand()),
        vscode.commands.registerCommand('claude-config.viewAnalyticsSummary', () => viewAnalyticsSummaryCommand()),
        
        // Cache management commands
        vscode.commands.registerCommand('claude-config.clearSummaryCache', () => {
            SummaryCacheManager.getInstance().clear();
            conversationTreeProvider.refresh();
            vscode.window.showInformationMessage('Summary cache cleared');
        }),
        vscode.commands.registerCommand('claude-config.viewCacheStats', () => {
            const stats = SummaryCacheManager.getInstance().getStats();
            const message = `Cache Stats:\n• Entries: ${stats.totalEntries}\n• Hit Ratio: ${(stats.hitRatio * 100).toFixed(1)}%\n• Memory: ${(stats.memoryUsage / 1024).toFixed(1)}KB`;
            vscode.window.showInformationMessage(message);
        })
    ];

    commands.forEach(command => context.subscriptions.push(command));

    // Register fork management commands
    ForkCommands.registerCommands(context, forkTreeProvider);

    // Start file watching if auto-sync is enabled
    if (vscode.workspace.getConfiguration('claude-config').get('autoSync')) {
        fileManager.startWatching();
    }

    // Watch for CLAUDE.md file changes to refresh tree view
    const fileWatcher = vscode.workspace.createFileSystemWatcher('**/CLAUDE.md');
    fileWatcher.onDidCreate(() => treeDataProvider.refresh());
    fileWatcher.onDidDelete(() => treeDataProvider.refresh());
    fileWatcher.onDidChange(() => treeDataProvider.refresh());
    context.subscriptions.push(fileWatcher);

    // Listen for configuration changes
    vscode.workspace.onDidChangeConfiguration(event => {
        if (event.affectsConfiguration('claude-config.autoSync')) {
            const autoSync = vscode.workspace.getConfiguration('claude-config').get('autoSync');
            if (autoSync) {
                fileManager.startWatching();
            } else {
                fileManager.stopWatching();
            }
        }
        
        if (event.affectsConfiguration('claude-config.conversationDataPath')) {
            const newPath = vscode.workspace.getConfiguration('claude-config').get<string>('conversationDataPath');
            if (newPath) {
                conversationManager.updateDataPath(newPath);
                conversationTreeProvider.refresh();
            }
        }
        
        if (event.affectsConfiguration('claude-config.autoUseContext7')) {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (workspaceFolder) {
                const autoUseContext7 = vscode.workspace.getConfiguration('claude-config').get<boolean>('autoUseContext7', false);
                if (autoUseContext7) {
                    ensureContext7RuleInClaudeMd(workspaceFolder.uri.fsPath).catch(err => {
                        console.error('Failed to add Context7 rule:', err);
                    });
                } else {
                    removeContext7RuleFromClaudeMd(workspaceFolder.uri.fsPath).catch(err => {
                        console.error('Failed to remove Context7 rule:', err);
                    });
                }
            }
        }
        
        if (event.affectsConfiguration('claude-config.cloudSync')) {
            // Refresh tree view when cloud sync configuration changes
            treeDataProvider.refresh();
        }
    });
}


export function updateStatusBar(message: string, isError: boolean = false) {
    if (statusBarItem) {
        statusBarItem.text = `$(${isError ? 'error' : 'sync'}) ${message}`;
        setTimeout(() => {
            updateStatusBarWithUsage();
        }, 3000);
    }
}

function updateStatusBarWithUsage() {
    if (!statusBarItem) return;
    
    try {
        const config = vscode.workspace.getConfiguration('claude-config');
        const showUsageInStatusBar = config.get<boolean>('usageTracking.showInStatusBar', false);
        
        if (!showUsageInStatusBar) {
            statusBarItem.text = "$(sync) Claude Config";
            statusBarItem.tooltip = "Claude Config Manager - Click for usage statistics";
            return;
        }
        
        // Simple status bar showing ccusage availability
        statusBarItem.text = "$(graph) Claude Usage";
        statusBarItem.tooltip = "Claude Usage Monitor (powered by ccusage) - Click for detailed statistics";
        
    } catch (error) {
        // Fallback to simple display
        statusBarItem.text = "$(sync) Claude Config";
        statusBarItem.tooltip = "Claude Config Manager - Click for usage statistics";
    }
}

export function deactivate() {
    // Clean up file manager
    if (fileManager) {
        fileManager.stopWatching();
    }
    
    // Clean up conversation viewer
    if (conversationViewer) {
        conversationViewer.dispose();
    }
    
    // Clean up usage monitor
    if (usageMonitorTreeProvider) {
        usageMonitorTreeProvider.dispose();
    }
    
    
    // Clean up summary cache
    SummaryCacheManager.dispose();
    
    
    // Dispose status bar item
    if (statusBarItem) {
        statusBarItem.dispose();
    }
    
    // Dispose output channel
    if (outputChannel) {
        outputChannel.dispose();
    }
}