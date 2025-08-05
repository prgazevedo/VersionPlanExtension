/**
 * Simple logging utility with debug flags for better control over console output
 */

interface LoggerOptions {
    prefix?: string;
    debugFlag?: string;
}

export class Logger {
    private prefix: string;
    private debugEnabled: boolean;

    constructor(options: LoggerOptions = {}) {
        this.prefix = options.prefix || '';
        this.debugEnabled = options.debugFlag ? process.env[options.debugFlag] === 'true' : false;
    }

    /**
     * Log debug messages only when debug flag is enabled
     */
    debug(message: string, ...args: any[]): void {
        if (this.debugEnabled) {
            console.log(`${this.prefix}${message}`, ...args);
        }
    }

    /**
     * Log info messages (always shown)
     */
    info(message: string, ...args: any[]): void {
        console.log(`${this.prefix}${message}`, ...args);
    }

    /**
     * Log warning messages (always shown)
     */
    warn(message: string, ...args: any[]): void {
        console.warn(`${this.prefix}${message}`, ...args);
    }

    /**
     * Log error messages (always shown)
     */
    error(message: string, ...args: any[]): void {
        console.error(`${this.prefix}${message}`, ...args);
    }

    /**
     * Create a new logger with a different prefix
     */
    withPrefix(newPrefix: string): Logger {
        return new Logger({
            prefix: `${this.prefix}${newPrefix}`,
            debugFlag: this.debugEnabled ? 'DEBUG' : undefined
        });
    }
}

/**
 * Pre-configured loggers for different components
 */
export const loggers = {
    extension: new Logger({ prefix: '[Extension] ', debugFlag: 'DEBUG_EXTENSION' }),
    ccusage: new Logger({ prefix: '[CcusageService] ', debugFlag: 'DEBUG_CCUSAGE' }),
    cloudSync: new Logger({ prefix: '[CloudSync] ', debugFlag: 'DEBUG_CLOUD_SYNC' }),
    tokenTracker: new Logger({ prefix: '[TokenTracker] ', debugFlag: 'DEBUG_TOKEN_TRACKER' }),
    tokenWindow: new Logger({ prefix: '[TokenWindowMonitor] ', debugFlag: 'DEBUG_TOKEN_WINDOW' }),
    conversations: new Logger({ prefix: '[Conversations] ', debugFlag: 'DEBUG_CONVERSATIONS' })
};