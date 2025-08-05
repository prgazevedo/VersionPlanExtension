export interface ConversationMessage {
    uuid: string;
    timestamp: string;
    type: 'user' | 'assistant';
    parentUuid: string | null;
    sessionId: string;
    conversationId?: string;
    cwd: string;
    gitBranch?: string;
    version?: string;
    message: {
        role: 'user' | 'assistant';
        content: string | any[];
        id?: string;
        model?: string;
        stop_reason?: string;
        usage?: {
            input_tokens: number;
            output_tokens: number;
            cache_creation_input_tokens?: number;
            cache_read_input_tokens?: number;
            service_tier?: string;
        };
    };
    requestId?: string;
    toolUseResult?: any;
    isMeta?: boolean;
    isSidechain?: boolean;
    userType?: string;
}

export interface ConversationSession {
    sessionId: string;
    projectPath: string;
    startTime: string;
    endTime?: string;
    messageCount: number;
    filePath: string;
    messages: ConversationMessage[];
}

export interface ConversationSummary {
    sessionId: string;
    projectPath: string;
    projectName: string;
    startTime: string;
    endTime?: string;
    messageCount: number;
    duration?: string;
    filePath: string;
    firstMessage?: string;
    lastMessage?: string;
    // 🆕 Cloud sync support
    isFromCloud?: boolean;
    cloudSyncMetadata?: any;
}

export interface ConversationFilter {
    projectPath?: string;
    projectName?: string;
    dateFrom?: Date;
    dateTo?: Date;
    searchText?: string;
    messageType?: 'user' | 'assistant' | 'all';
    minMessages?: number;
    maxMessages?: number;
    minDuration?: number; // in minutes
}

