import { ConversationMessage } from '../types';

export interface ConversationFork {
    parentUuid: string;
    branches: ConversationBranch[];
    totalTokens: number;
    createdAt: Date;
    forkDepth: number; // How deep in the conversation this fork occurs
}

export interface ConversationBranch {
    startUuid: string;
    messages: ConversationMessage[];
    tokenCount: number;
    isActive: boolean;
    isMainPath: boolean;
    depth: number; // Number of messages in this branch
    lastActivity: Date;
}

export interface ConversationTree {
    sessionId: string;
    rootMessage: ConversationMessage | null;
    allMessages: Map<string, ConversationMessage>;
    children: Map<string, string[]>; // parentUuid -> childUuids[]
    forks: ConversationFork[];
    totalTokens: number;
    maxDepth: number;
}

export interface ForkAnalysisResult {
    tree: ConversationTree;
    forkCount: number;
    branchCount: number;
    largestBranch: ConversationBranch | null;
    tokenDistribution: {
        mainPath: number;
        alternativeBranches: number;
        abandonedBranches: number;
    };
}

export interface TokenCalculationOptions {
    includeToolUse: boolean;
    includeCachedTokens: boolean;
    estimateIfMissing: boolean;
}