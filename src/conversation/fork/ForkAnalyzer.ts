import * as fs from 'fs-extra';
import { ConversationMessage } from '../types';
import { 
    ConversationTree, 
    ConversationFork, 
    ConversationBranch, 
    ForkAnalysisResult,
    TokenCalculationOptions 
} from './types';

export class ForkAnalyzer {
    /**
     * Analyze a conversation file and build a complete fork tree
     */
    async analyzeConversationFile(filePath: string): Promise<ForkAnalysisResult> {
        const messages = await this.loadMessagesFromFile(filePath);
        return this.analyzeMessages(messages);
    }

    /**
     * Analyze an array of messages and build fork tree
     */
    analyzeMessages(messages: ConversationMessage[]): ForkAnalysisResult {
        const tree = this.buildConversationTree(messages);
        const forks = this.identifyForks(tree);
        const branches = this.buildBranches(tree, forks);
        
        // Update tree with identified forks and branches
        tree.forks = forks.map(fork => this.buildForkWithBranches(fork, branches, tree));
        
        // Calculate token distribution
        const tokenDistribution = this.calculateTokenDistribution(tree);
        
        return {
            tree,
            forkCount: forks.length,
            branchCount: branches.length,
            largestBranch: this.findLargestBranch(tree.forks),
            tokenDistribution
        };
    }

    /**
     * Load and parse messages from JSONL file
     */
    private async loadMessagesFromFile(filePath: string): Promise<ConversationMessage[]> {
        const messages: ConversationMessage[] = [];
        
        if (!await fs.pathExists(filePath)) {
            throw new Error(`Conversation file not found: ${filePath}`);
        }

        const content = await fs.readFile(filePath, 'utf-8');
        const lines = content.split('\n').filter(line => line.trim());

        for (const line of lines) {
            try {
                const parsed = JSON.parse(line);
                
                // Only include actual conversation messages (skip summary lines)
                if (parsed.uuid && parsed.hasOwnProperty('parentUuid') && parsed.message) {
                    messages.push(parsed as ConversationMessage);
                }
            } catch (error) {
                // Skip malformed lines
                console.warn(`[ForkAnalyzer] Skipping malformed line in ${filePath}: ${error}`);
            }
        }

        // Sort by timestamp to ensure proper ordering
        messages.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
        
        return messages;
    }

    /**
     * Build the conversation tree structure from messages
     */
    private buildConversationTree(messages: ConversationMessage[]): ConversationTree {
        const allMessages = new Map<string, ConversationMessage>();
        const children = new Map<string, string[]>();
        let rootMessage: ConversationMessage | null = null;
        let maxDepth = 0;

        // First pass: index all messages and find root
        for (const message of messages) {
            allMessages.set(message.uuid, message);
            
            if (!message.parentUuid) {
                rootMessage = message;
            }
        }

        // Second pass: build parent-child relationships
        for (const message of messages) {
            if (message.parentUuid) {
                if (!children.has(message.parentUuid)) {
                    children.set(message.parentUuid, []);
                }
                children.get(message.parentUuid)!.push(message.uuid);
            }
        }

        // Calculate max depth
        if (rootMessage) {
            maxDepth = this.calculateMaxDepth(rootMessage.uuid, children);
        }

        return {
            sessionId: messages[0]?.sessionId || 'unknown',
            rootMessage,
            allMessages,
            children,
            forks: [], // Will be populated later
            totalTokens: 0, // Will be calculated later
            maxDepth
        };
    }

    /**
     * Identify all fork points in the conversation tree
     */
    private identifyForks(tree: ConversationTree): ConversationFork[] {
        const forks: ConversationFork[] = [];

        for (const [parentUuid, childUuids] of tree.children) {
            if (childUuids.length > 1) {
                // This is a fork point
                const parentMessage = tree.allMessages.get(parentUuid);
                if (parentMessage) {
                    forks.push({
                        parentUuid,
                        branches: [], // Will be populated later
                        totalTokens: 0, // Will be calculated later
                        createdAt: new Date(parentMessage.timestamp),
                        forkDepth: this.calculateDepthToMessage(parentUuid, tree)
                    });
                }
            }
        }

        return forks;
    }

    /**
     * Build branch objects for all conversation paths
     */
    private buildBranches(tree: ConversationTree, forks: ConversationFork[]): ConversationBranch[] {
        const branches: ConversationBranch[] = [];
        const processedUuids = new Set<string>();

        // For each fork, create branches for each child path
        for (const fork of forks) {
            const childUuids = tree.children.get(fork.parentUuid) || [];
            
            for (let i = 0; i < childUuids.length; i++) {
                const startUuid = childUuids[i];
                if (!processedUuids.has(startUuid)) {
                    const branchMessages = this.collectBranchMessages(startUuid, tree, processedUuids);
                    
                    branches.push({
                        startUuid,
                        messages: branchMessages,
                        tokenCount: this.calculateBranchTokens(branchMessages),
                        isActive: true, // Default to active
                        isMainPath: i === 0, // Consider first branch as main path
                        depth: branchMessages.length,
                        lastActivity: this.getLastActivity(branchMessages)
                    });
                }
            }
        }

        return branches;
    }

    /**
     * Collect all messages in a branch starting from a given message
     */
    private collectBranchMessages(
        startUuid: string, 
        tree: ConversationTree, 
        processedUuids: Set<string>
    ): ConversationMessage[] {
        const messages: ConversationMessage[] = [];
        const queue = [startUuid];

        while (queue.length > 0) {
            const currentUuid = queue.shift()!;
            
            if (processedUuids.has(currentUuid)) {
                continue;
            }
            
            const message = tree.allMessages.get(currentUuid);
            if (message) {
                messages.push(message);
                processedUuids.add(currentUuid);
                
                // Add children to queue (prefer continuing straight path)
                const children = tree.children.get(currentUuid) || [];
                if (children.length === 1) {
                    // Single child - continue the branch
                    queue.unshift(children[0]);
                } else if (children.length > 1) {
                    // Multiple children - this starts new forks, stop this branch here
                    break;
                }
            }
        }

        return messages;
    }

    /**
     * Build a complete fork object with its branches
     */
    private buildForkWithBranches(
        fork: ConversationFork, 
        allBranches: ConversationBranch[], 
        tree: ConversationTree
    ): ConversationFork {
        const childUuids = tree.children.get(fork.parentUuid) || [];
        const forkBranches = allBranches.filter(branch => 
            childUuids.includes(branch.startUuid)
        );

        return {
            ...fork,
            branches: forkBranches,
            totalTokens: forkBranches.reduce((sum, branch) => sum + branch.tokenCount, 0)
        };
    }

    /**
     * Calculate token count for a branch of messages
     */
    private calculateBranchTokens(
        messages: ConversationMessage[], 
        options: TokenCalculationOptions = { 
            includeToolUse: true, 
            includeCachedTokens: true, 
            estimateIfMissing: true 
        }
    ): number {
        let totalTokens = 0;

        for (const message of messages) {
            const usage = message.message?.usage;
            
            if (usage) {
                // Add input and output tokens
                totalTokens += usage.input_tokens || 0;
                totalTokens += usage.output_tokens || 0;
                
                // Add cache tokens if requested
                if (options.includeCachedTokens) {
                    totalTokens += usage.cache_creation_input_tokens || 0;
                    totalTokens += usage.cache_read_input_tokens || 0;
                }
            } else if (options.estimateIfMissing) {
                // Rough estimation: ~4 characters per token
                const content = this.extractTextContent(message.message?.content);
                totalTokens += Math.ceil(content.length / 4);
            }
        }

        return totalTokens;
    }

    /**
     * Extract text content from message content (handles both string and array formats)
     */
    private extractTextContent(content: any): string {
        if (typeof content === 'string') {
            return content;
        } else if (Array.isArray(content)) {
            return content
                .filter(item => item.type === 'text' && item.text)
                .map(item => item.text)
                .join(' ');
        }
        return '';
    }

    /**
     * Calculate the depth of a message in the conversation tree
     */
    private calculateDepthToMessage(uuid: string, tree: ConversationTree): number {
        let depth = 0;
        let currentUuid = uuid;

        while (currentUuid) {
            const message = tree.allMessages.get(currentUuid);
            if (!message?.parentUuid) {
                break;
            }
            depth++;
            currentUuid = message.parentUuid;
        }

        return depth;
    }

    /**
     * Calculate maximum depth of the conversation tree
     */
    private calculateMaxDepth(startUuid: string, children: Map<string, string[]>): number {
        let maxDepth = 0;
        
        const calculateDepth = (uuid: string, currentDepth: number) => {
            maxDepth = Math.max(maxDepth, currentDepth);
            
            const childUuids = children.get(uuid) || [];
            for (const childUuid of childUuids) {
                calculateDepth(childUuid, currentDepth + 1);
            }
        };

        calculateDepth(startUuid, 0);
        return maxDepth;
    }

    /**
     * Get the last activity timestamp from a branch
     */
    private getLastActivity(messages: ConversationMessage[]): Date {
        if (messages.length === 0) {
            return new Date();
        }

        const lastMessage = messages[messages.length - 1];
        return new Date(lastMessage.timestamp);
    }

    /**
     * Find the largest branch by message count
     */
    private findLargestBranch(forks: ConversationFork[]): ConversationBranch | null {
        let largest: ConversationBranch | null = null;
        let maxMessages = 0;

        for (const fork of forks) {
            for (const branch of fork.branches) {
                if (branch.messages.length > maxMessages) {
                    maxMessages = branch.messages.length;
                    largest = branch;
                }
            }
        }

        return largest;
    }

    /**
     * Calculate token distribution across different types of branches
     */
    private calculateTokenDistribution(tree: ConversationTree): {
        mainPath: number;
        alternativeBranches: number;
        abandonedBranches: number;
    } {
        let mainPath = 0;
        let alternativeBranches = 0;
        let abandonedBranches = 0;

        for (const fork of tree.forks) {
            for (const branch of fork.branches) {
                if (branch.isMainPath) {
                    mainPath += branch.tokenCount;
                } else {
                    // Consider a branch abandoned if it has no recent activity
                    const daysSinceActivity = (Date.now() - branch.lastActivity.getTime()) / (1000 * 60 * 60 * 24);
                    if (daysSinceActivity > 1) { // More than 1 day old
                        abandonedBranches += branch.tokenCount;
                    } else {
                        alternativeBranches += branch.tokenCount;
                    }
                }
            }
        }

        return { mainPath, alternativeBranches, abandonedBranches };
    }
}