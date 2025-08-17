import { ConversationMessage } from '../types';
import { TokenCalculationOptions } from './types';

/**
 * Utility class for accurate token counting in Claude conversations
 */
export class TokenCalculator {
    
    /**
     * Calculate tokens for a single message
     */
    static calculateMessageTokens(
        message: ConversationMessage, 
        options: TokenCalculationOptions = { 
            includeToolUse: true, 
            includeCachedTokens: true, 
            estimateIfMissing: true 
        }
    ): number {
        const usage = message.message?.usage;
        
        if (usage) {
            let total = 0;
            
            // Add input and output tokens
            total += usage.input_tokens || 0;
            total += usage.output_tokens || 0;
            
            // Add cache tokens if requested
            if (options.includeCachedTokens) {
                total += usage.cache_creation_input_tokens || 0;
                total += usage.cache_read_input_tokens || 0;
            }
            
            return total;
        } else if (options.estimateIfMissing) {
            // Estimate tokens when usage data is missing
            return this.estimateTokensFromContent(message.message?.content);
        }
        
        return 0;
    }

    /**
     * Calculate tokens for an array of messages
     */
    static calculateMessagesTokens(
        messages: ConversationMessage[], 
        options?: TokenCalculationOptions
    ): number {
        return messages.reduce((total, message) => 
            total + this.calculateMessageTokens(message, options), 0
        );
    }

    /**
     * Estimate token count from message content
     * Uses rough approximation: ~4 characters per token
     */
    static estimateTokensFromContent(content: any): number {
        const text = this.extractTextContent(content);
        
        // More sophisticated estimation based on content type
        let baseTokens = Math.ceil(text.length / 4);
        
        // Add extra tokens for structured content (tool use, etc.)
        if (Array.isArray(content)) {
            const hasToolUse = content.some(item => item.type === 'tool_use');
            if (hasToolUse) {
                baseTokens += 50; // Tool use overhead
            }
        }
        
        return baseTokens;
    }

    /**
     * Extract text content from various message content formats
     */
    private static extractTextContent(content: any): string {
        if (typeof content === 'string') {
            return content;
        } else if (Array.isArray(content)) {
            let text = '';
            
            for (const item of content) {
                if (item.type === 'text' && item.text) {
                    text += item.text + ' ';
                } else if (item.type === 'tool_use' && item.name) {
                    text += `[Tool: ${item.name}] `;
                } else if (item.type === 'tool_result') {
                    // Add some weight for tool results
                    text += '[Tool Result] ';
                }
            }
            
            return text.trim();
        }
        
        return '';
    }

    /**
     * Get detailed token breakdown for a message
     */
    static getTokenBreakdown(message: ConversationMessage): {
        input: number;
        output: number;
        cacheCreation: number;
        cacheRead: number;
        estimated: boolean;
    } {
        const usage = message.message?.usage;
        
        if (usage) {
            return {
                input: usage.input_tokens || 0,
                output: usage.output_tokens || 0,
                cacheCreation: usage.cache_creation_input_tokens || 0,
                cacheRead: usage.cache_read_input_tokens || 0,
                estimated: false
            };
        } else {
            const estimated = this.estimateTokensFromContent(message.message?.content);
            return {
                input: message.type === 'user' ? estimated : 0,
                output: message.type === 'assistant' ? estimated : 0,
                cacheCreation: 0,
                cacheRead: 0,
                estimated: true
            };
        }
    }

    /**
     * Calculate context window usage percentage
     * Assumes Claude's context window limit (varies by model)
     */
    static calculateContextUsage(
        totalTokens: number, 
        contextLimit: number = 200000 // Default to Claude-3.5-Sonnet limit
    ): number {
        return Math.min((totalTokens / contextLimit) * 100, 100);
    }

    /**
     * Determine if approaching context limit
     */
    static isApproachingLimit(
        totalTokens: number, 
        threshold: number = 0.8, // 80% threshold
        contextLimit: number = 200000
    ): boolean {
        return (totalTokens / contextLimit) >= threshold;
    }

    /**
     * Estimate tokens that could be saved by pruning a branch
     */
    static calculatePruningSavings(messages: ConversationMessage[]): {
        tokensSaved: number;
        messagesRemoved: number;
        lastActivity: Date;
    } {
        const tokensSaved = this.calculateMessagesTokens(messages);
        const messagesRemoved = messages.length;
        const lastActivity = messages.length > 0 
            ? new Date(messages[messages.length - 1].timestamp)
            : new Date();

        return { tokensSaved, messagesRemoved, lastActivity };
    }
}