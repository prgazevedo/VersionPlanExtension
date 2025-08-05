import * as fs from 'fs-extra';
import * as path from 'path';

interface GitignoreComplianceCheck {
    hasGitignore: boolean;
    hasClaudeRules: boolean;
    missingRules: string[];
}

export class GitignoreManager {
    private static readonly CLAUDE_GITIGNORE_RULES = [
        '',
        '# Claude Config Manager Extension - Security Rules',
        '# Prevents accidental commit of private conversation data',
        '.claude/.chats/',
        '.claude/.chats/**',
        '.claude/settings.local.json',
        '',
        '# Team-sharable Claude Code files (tracked by git):',
        '# .claude/settings.json     # Team settings (official Claude Code)',
        '# .claude/commands/         # Team slash commands (official Claude Code)',
        '# .claude/.plans/           # Project documentation (extension-specific)',
        ''
    ];

    private static readonly GITIGNORE_MARKER = '# Claude Config Manager Extension - Security Rules';

    static async ensureGitignoreRules(workspacePath: string): Promise<boolean> {
        try {
            const gitignorePath = path.join(workspacePath, '.gitignore');
            
            // Check if .gitignore exists
            const gitignoreExists = await fs.pathExists(gitignorePath);
            let content = '';
            
            if (gitignoreExists) {
                content = await fs.readFile(gitignorePath, 'utf8');
                
                // Check if our rules are already present
                if (content.includes(this.GITIGNORE_MARKER)) {
                    return false; // Rules already exist, no update needed
                }
            }
            
            // Append our rules
            const newContent = content + 
                (content.endsWith('\n') ? '' : '\n') + 
                this.CLAUDE_GITIGNORE_RULES.join('\n');
            
            await fs.writeFile(gitignorePath, newContent, 'utf8');
            return true; // Rules were added
        } catch (error) {
            console.error('Failed to update .gitignore:', error);
            throw new Error(`Failed to update .gitignore: ${error}`);
        }
    }

    static async validateNoPrivateFiles(workspacePath: string, files: string[]): Promise<string[]> {
        const privatePatterns = [
            '.claude/.chats/',
            '.claude/settings.local.json'
        ];

        const violations: string[] = [];
        
        for (const file of files) {
            for (const pattern of privatePatterns) {
                if (file.includes(pattern) || file.startsWith(pattern)) {
                    violations.push(file);
                }
            }
        }

        return violations;
    }

    static async checkGitignoreCompliance(workspacePath: string): Promise<GitignoreComplianceCheck> {
        try {
            const gitignorePath = path.join(workspacePath, '.gitignore');
            const hasGitignore = await fs.pathExists(gitignorePath);

            if (!hasGitignore) {
                return {
                    hasGitignore: false,
                    hasClaudeRules: false,
                    missingRules: ['.claude/.chats/', '.claude/settings.local.json']
                };
            }

            const content = await fs.readFile(gitignorePath, 'utf8');
            const hasClaudeRules = content.includes(this.GITIGNORE_MARKER);

            const missingRules: string[] = [];
            if (!content.includes('.claude/.chats/')) {
                missingRules.push('.claude/.chats/');
            }
            if (!content.includes('.claude/settings.local.json')) {
                missingRules.push('.claude/settings.local.json');
            }

            return {
                hasGitignore,
                hasClaudeRules,
                missingRules
            };
        } catch (error) {
            console.error('Failed to check .gitignore compliance:', error);
            return {
                hasGitignore: false,
                hasClaudeRules: false,
                missingRules: ['.claude/.chats/', '.claude/settings.local.json']
            };
        }
    }

    static getSafeFilesToSync(): string[] {
        return [
            '.claude/.plans/',
            '.claude/settings.json',
            '.claude/commands/'
        ];
    }

    static getPrivateFilesDescription(): string {
        return 'Private files (.claude/.chats/, .claude/settings.local.json) are excluded for security';
    }
}