import * as path from 'path';

/**
 * Security utilities for input validation and sanitization
 */

/**
 * Sanitizes project names to prevent path traversal attacks
 */
export function sanitizeProjectName(name: string): string {
    if (!name || typeof name !== 'string') {
        return 'default';
    }
    
    // Remove path traversal sequences and dangerous characters
    return name
        .replace(/[./\\:*?"<>|]/g, '_')  // Replace dangerous characters
        .replace(/^\.+/, '')              // Remove leading dots
        .substring(0, 50)                 // Limit length
        .trim() || 'default';             // Fallback if empty
}

/**
 * Validates Git repository URLs to prevent malicious URLs
 */
export function validateRepoUrl(url: string): boolean {
    if (!url || typeof url !== 'string') {
        return false;
    }
    
    try {
        const parsed = new URL(url);
        
        // Only allow safe protocols
        const allowedProtocols = ['https:', 'git:', 'ssh:'];
        if (!allowedProtocols.includes(parsed.protocol)) {
            return false;
        }
        
        // Block localhost and private IPs
        const hostname = parsed.hostname.toLowerCase();
        if (hostname === 'localhost' || 
            hostname === '127.0.0.1' ||
            hostname.startsWith('192.168.') ||
            hostname.startsWith('10.') ||
            hostname.match(/^172\.(1[6-9]|2[0-9]|3[0-1])\./)) {
            return false;
        }
        
        // Ensure it's a Git repository URL pattern
        const gitUrlPattern = /\.(git)$/i;
        if (parsed.protocol === 'https:' && !gitUrlPattern.test(parsed.pathname)) {
            // Allow only trusted Git hosting providers with exact domain matching
            const allowedHosts = [
                'github.com',
                'gitlab.com',
                'bitbucket.org',
                'dev.azure.com',
                'ssh.dev.azure.com'
            ];
            
            // Check for exact hostname match or trusted subdomain
            const isAllowedHost = allowedHosts.some(allowedHost => {
                return hostname === allowedHost || hostname.endsWith('.' + allowedHost);
            });
            
            if (!isAllowedHost) {
                return false;
            }
        }
        
        return true;
    } catch {
        return false;
    }
}

/**
 * Validates file paths to prevent path traversal
 */
export function validatePath(filePath: string, allowedBasePath: string): boolean {
    if (!filePath || !allowedBasePath) {
        return false;
    }
    
    try {
        const resolved = path.resolve(filePath);
        const allowed = path.resolve(allowedBasePath);
        return resolved.startsWith(allowed);
    } catch {
        return false;
    }
}

/**
 * Sanitizes error messages to prevent information disclosure
 */
export function sanitizeErrorMessage(error: any): string {
    if (!error) {
        return 'An unknown error occurred';
    }
    
    const errorMessage = error.message || error.toString();
    
    // Remove sensitive information patterns
    return errorMessage
        .replace(/\/Users\/[^/\s]+/g, '/Users/***')     // Remove usernames
        .replace(/\/home\/[^/\s]+/g, '/home/***')       // Remove Linux usernames  
        .replace(/C:\\Users\\[^\\s]+/g, 'C:\\Users\\***') // Remove Windows usernames
        .replace(/file:\/\/[^\s]+/g, 'file://***')       // Remove file paths
        .replace(/https?:\/\/[^\s]+/g, 'https://***')    // Remove URLs
        .substring(0, 200);                              // Limit length
}

/**
 * Sanitizes template variables to prevent injection
 */
export function sanitizeTemplateVariable(value: string): string {
    if (!value || typeof value !== 'string') {
        return '';
    }
    
    return value
        .replace(/[<>&"']/g, '')          // Remove HTML/XML characters
        .replace(/\{\{|\}\}/g, '')        // Remove template syntax
        .replace(/\$\{[^}]*\}/g, '')      // Remove variable syntax
        .substring(0, 100)                // Limit length
        .trim();
}

/**
 * Sanitizes file paths to prevent path traversal attacks
 */
export function sanitizePath(filePath: string): string {
    if (!filePath || typeof filePath !== 'string') {
        return '';
    }
    
    // Resolve the path to normalize it and remove any .. sequences
    const normalizedPath = path.resolve(filePath);
    
    // Remove null bytes and other dangerous characters
    return normalizedPath
        .replace(/\0/g, '')               // Remove null bytes
        .replace(/[<>:"|?*]/g, '_');      // Replace dangerous characters for cross-platform compatibility
}