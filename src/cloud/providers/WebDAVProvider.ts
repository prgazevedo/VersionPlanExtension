/**
 * WebDAV Provider - Core HTTP operations for WebDAV servers
 * Supports Nextcloud, ownCloud, and generic WebDAV servers
 */

import * as vscode from 'vscode';
import * as https from 'https';
import * as http from 'http';
import { parseString } from 'xml2js';
import * as crypto from 'crypto';
import * as zlib from 'zlib';
import { promisify } from 'util';
import { CloudAuthManager } from '../CloudAuthManager';

const parseXML = promisify(parseString);
const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

export interface WebDAVResource {
    path: string;
    name: string;
    isDirectory: boolean;
    size: number;
    lastModified: Date;
    etag?: string;
    contentType?: string;
}

export interface WebDAVConfig {
    serverUrl: string;
    username: string;
    password: string;
    basePath?: string;
    verifySSL?: boolean;
}

export interface UploadProgress {
    sessionId: string;
    bytesUploaded: number;
    totalBytes: number;
    percentage: number;
}

export interface RemoteFileInfo {
    exists: boolean;
    etag?: string;
    lastModified?: Date;
    size?: number;
}

/**
 * WebDAV HTTP Client with comprehensive operations
 */
export class WebDAVProvider {
    private config: WebDAVConfig | null = null;
    private authManager: CloudAuthManager;
    private onProgressCallback?: (progress: UploadProgress) => void;

    constructor(authManager: CloudAuthManager) {
        this.authManager = authManager;
    }

    /**
     * Initialize provider with credentials
     */
    async initialize(providerConfig: any): Promise<void> {
        if (providerConfig.type !== 'webdav') {
            throw new Error('Invalid provider type for WebDAV');
        }

        this.config = {
            serverUrl: providerConfig.config.serverUrl,
            username: providerConfig.config.username,
            password: providerConfig.config.password,
            basePath: providerConfig.config.basePath || '/',
            verifySSL: providerConfig.config.acceptInvalidCerts !== 'true'
        };

        // Normalize base path: ensure it starts with '/' but don't force trailing slash yet
        // This will be handled properly in buildFullPath to avoid duplication
        if (this.config.basePath && !this.config.basePath.startsWith('/')) {
            this.config.basePath = '/' + this.config.basePath;
        }
    }

    /**
     * Set progress callback for upload operations
     */
    setProgressCallback(callback: (progress: UploadProgress) => void): void {
        this.onProgressCallback = callback;
    }

    /**
     * Test connection to WebDAV server
     */
    async testConnection(): Promise<boolean> {
        try {
            await this.propfind(this.config?.basePath || '/');
            return true;
        } catch (error) {
            console.error('[WebDAVProvider] Connection test failed:', error);
            return false;
        }
    }

    /**
     * PROPFIND - List directory contents
     */
    async propfind(path: string, depth: '0' | '1' | 'infinity' = '1'): Promise<WebDAVResource[]> {
        if (!this.config) throw new Error('WebDAV provider not initialized');

        const fullPath = this.buildFullPath(path);
        const response = await this.makeRequest(fullPath, 'PROPFIND', {
            headers: {
                'Content-Type': 'application/xml',
                'Depth': depth
            },
            body: `<?xml version="1.0" encoding="utf-8"?>
                   <propfind xmlns="DAV:">
                     <prop>
                       <displayname/>
                       <resourcetype/>
                       <getcontentlength/>
                       <getlastmodified/>
                       <getetag/>
                       <getcontenttype/>
                     </prop>
                   </propfind>`
        });

        const xmlText = await response.text();
        const result = await parseXML(xmlText);

        return this.parsePropfindResponse(result, path);
    }

    /**
     * GET - Download file
     */
    async get(path: string): Promise<Buffer> {
        if (!this.config) throw new Error('WebDAV provider not initialized');

        const fullPath = this.buildFullPath(path);
        const response = await this.makeRequest(fullPath, 'GET');

        if (!response.ok) {
            throw new Error(`Failed to download file: ${response.status} ${response.statusText}`);
        }

        return Buffer.from(await response.arrayBuffer());
    }

    /**
     * PUT - Upload file with retry logic for transient errors
     */
    async put(path: string, data: Buffer, sessionId?: string): Promise<void> {
        if (!this.config) throw new Error('WebDAV provider not initialized');

        // Build full path first
        const fullPath = this.buildFullPath(path);
        
        // Ensure parent directory exists - use the path structure without the filename
        const parentPath = path.substring(0, path.lastIndexOf('/'));
        if (parentPath && parentPath !== '/') {
            console.log(`[WebDAVProvider] Ensuring parent directory exists: ${parentPath}`);
            await this.ensureDirectoryExists(parentPath);
        }
        
        // Report progress if callback is set
        if (this.onProgressCallback && sessionId) {
            this.onProgressCallback({
                sessionId,
                bytesUploaded: 0,
                totalBytes: data.length,
                percentage: 0
            });
        }

        // Retry logic for transient server errors
        const maxRetries = 3;
        const baseDelay = 1000; // 1 second base delay
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const response = await this.makeRequest(fullPath, 'PUT', {
                    body: data,
                    headers: {
                        'Content-Type': 'application/octet-stream',
                        'Content-Length': data.length.toString()
                    }
                });

                if (response.ok) {
                    // Success! Report completion
                    if (this.onProgressCallback && sessionId) {
                        this.onProgressCallback({
                            sessionId,
                            bytesUploaded: data.length,
                            totalBytes: data.length,
                            percentage: 100
                        });
                    }
                    return;
                }

                // Check if this is a retryable error
                const isRetryableError = response.status >= 500 || 
                                       response.status === 408 || // Request Timeout
                                       response.status === 429;   // Too Many Requests

                if (!isRetryableError || attempt === maxRetries) {
                    throw new Error(`Failed to upload file: ${response.status} ${response.statusText}`);
                }

                // Log retry attempt
                console.log(`[WebDAVProvider] Upload attempt ${attempt}/${maxRetries} failed with ${response.status}, retrying in ${baseDelay * Math.pow(2, attempt - 1)}ms...`);
                
                // Exponential backoff delay
                const delay = baseDelay * Math.pow(2, attempt - 1);
                await new Promise(resolve => setTimeout(resolve, delay));
                
            } catch (error) {
                if (attempt === maxRetries) {
                    throw error;
                }
                
                // Log retry attempt for other errors
                console.log(`[WebDAVProvider] Upload attempt ${attempt}/${maxRetries} failed with error, retrying in ${baseDelay * Math.pow(2, attempt - 1)}ms...`, error);
                
                // Exponential backoff delay
                const delay = baseDelay * Math.pow(2, attempt - 1);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }

    /**
     * DELETE - Remove file or directory
     */
    async delete(path: string): Promise<void> {
        if (!this.config) throw new Error('WebDAV provider not initialized');

        const fullPath = this.buildFullPath(path);
        const response = await this.makeRequest(fullPath, 'DELETE');

        if (!response.ok && response.status !== 404) {
            throw new Error(`Failed to delete: ${response.status} ${response.statusText}`);
        }
    }

    /**
     * MKCOL - Create directory
     */
    async mkcol(path: string): Promise<void> {
        if (!this.config) throw new Error('WebDAV provider not initialized');

        const fullPath = this.buildFullPath(path);
        console.log(`[WebDAVProvider] MKCOL creating directory - Path: ${path}, Full URL: ${fullPath}`);
        
        const response = await this.makeRequest(fullPath, 'MKCOL');

        console.log(`[WebDAVProvider] MKCOL response - Status: ${response.status}, StatusText: ${response.statusText}`);
        
        if (!response.ok && response.status !== 405) { // 405 = already exists
            const errorMsg = `Failed to create directory: ${response.status} ${response.statusText}`;
            console.error(`[WebDAVProvider] ${errorMsg}`);
            throw new Error(errorMsg);
        }
        
        console.log(`[WebDAVProvider] MKCOL completed successfully for path: ${path}`);
    }

    /**
     * Check if file exists
     */
    async exists(path: string): Promise<boolean> {
        try {
            await this.propfind(path, '0');
            return true;
        } catch (error) {
            return false;
        }
    }

    /**
     * Batch check multiple files for existence and metadata
     */
    async checkRemoteFiles(cloudPaths: string[]): Promise<Map<string, RemoteFileInfo>> {
        const result = new Map<string, RemoteFileInfo>();
        
        // Group paths by directory for efficient PROPFIND calls
        const directoriesMap = new Map<string, string[]>();
        
        for (const path of cloudPaths) {
            const dir = path.substring(0, path.lastIndexOf('/'));
            const fileName = path.substring(path.lastIndexOf('/') + 1);
            
            if (!directoriesMap.has(dir)) {
                directoriesMap.set(dir, []);
            }
            directoriesMap.get(dir)!.push(fileName);
        }
        
        // Check each directory with batch PROPFIND
        for (const [dir, fileNames] of directoriesMap) {
            try {
                console.log(`[WebDAVProvider] Batch checking directory: ${dir} for ${fileNames.length} files`);
                const resources = await this.propfind(dir, '1');
                
                // Create lookup map for quick filename matching
                const resourceMap = new Map<string, WebDAVResource>();
                resources.forEach(resource => {
                    resourceMap.set(resource.name, resource);
                });
                
                // Check each requested file
                for (const fileName of fileNames) {
                    const fullPath = `${dir}/${fileName}`;
                    const resource = resourceMap.get(fileName);
                    
                    if (resource) {
                        result.set(fullPath, {
                            exists: true,
                            etag: resource.etag,
                            lastModified: resource.lastModified,
                            size: resource.size
                        });
                    } else {
                        result.set(fullPath, {
                            exists: false
                        });
                    }
                }
                
            } catch (error) {
                console.warn(`[WebDAVProvider] Failed to check directory ${dir}:`, error);
                
                // Mark all files in this directory as non-existent on error
                for (const fileName of fileNames) {
                    const fullPath = `${dir}/${fileName}`;
                    result.set(fullPath, {
                        exists: false
                    });
                }
            }
        }
        
        console.log(`[WebDAVProvider] Batch check completed: ${result.size} files checked`);
        return result;
    }

    /**
     * Get file metadata
     */
    async getMetadata(path: string): Promise<WebDAVResource | null> {
        try {
            const resources = await this.propfind(path, '0');
            return resources.length > 0 ? resources[0] : null;
        } catch (error) {
            return null;
        }
    }

    /**
     * Get the configured base path
     */
    getBasePath(): string {
        if (!this.config) throw new Error('WebDAV provider not initialized');
        return this.config.basePath || '/';
    }

    /**
     * Build path within the configured base path for use cases
     */
    buildUseCasePath(useCasePath: string): string {
        const basePath = this.getBasePath();
        
        // Ensure basePath ends with / for proper concatenation
        const normalizedBasePath = basePath.endsWith('/') ? basePath : basePath + '/';
        
        // Remove leading / from useCasePath if present to avoid double slashes
        const normalizedUseCasePath = useCasePath.startsWith('/') ? useCasePath.slice(1) : useCasePath;
        
        return normalizedBasePath + normalizedUseCasePath;
    }

    /**
     * Compress data using gzip
     */
    async compress(data: Buffer): Promise<Buffer> {
        return await gzip(data);
    }

    /**
     * Decompress gzip data
     */
    async decompress(data: Buffer): Promise<Buffer> {
        return await gunzip(data);
    }

    /**
     * Encrypt data using AES-256-GCM
     */
    async encrypt(data: Buffer, password: string): Promise<Buffer> {
        const algorithm = 'aes-256-gcm';
        const key = crypto.scryptSync(password, 'claude-config-salt', 32);
        const iv = crypto.randomBytes(16);
        
        const cipher = crypto.createCipheriv(algorithm, key, iv);
        let encrypted = cipher.update(data);
        encrypted = Buffer.concat([encrypted, cipher.final()]);
        
        const tag = cipher.getAuthTag();
        
        // Combine IV, tag, and encrypted data
        return Buffer.concat([iv, tag, encrypted]);
    }

    /**
     * Decrypt data using AES-256-GCM
     */
    async decrypt(data: Buffer, password: string): Promise<Buffer> {
        const algorithm = 'aes-256-gcm';
        const key = crypto.scryptSync(password, 'claude-config-salt', 32);
        
        // Extract IV, tag, and encrypted data
        const iv = data.slice(0, 16);
        const tag = data.slice(16, 32);
        const encrypted = data.slice(32);
        
        const decipher = crypto.createDecipheriv(algorithm, key, iv);
        decipher.setAuthTag(tag);
        
        let decrypted = decipher.update(encrypted);
        decrypted = Buffer.concat([decrypted, decipher.final()]);
        
        return decrypted;
    }

    /**
     * Build full URL path
     */
    private buildFullPath(path: string): string {
        if (!this.config) throw new Error('WebDAV provider not initialized');
        
        let serverUrl = this.config.serverUrl;
        let fullPath: string;
        
        // If path starts with '/', it's absolute - use as-is
        if (path.startsWith('/')) {
            fullPath = path;
        } else {
            // Relative path - combine with basePath
            let basePath = this.config.basePath || '/';
            if (basePath.endsWith('/') && path) {
                fullPath = basePath + path;
            } else if (!basePath.endsWith('/') && path) {
                fullPath = basePath + '/' + path;
            } else {
                fullPath = basePath;
            }
        }
        
        // Handle double slash prevention between serverUrl and fullPath
        if (serverUrl.endsWith('/') && fullPath.startsWith('/')) {
            return serverUrl + fullPath.slice(1);  // Remove leading slash from fullPath
        } else if (!serverUrl.endsWith('/') && !fullPath.startsWith('/')) {
            return serverUrl + '/' + fullPath;     // Add separator slash
        } else {
            return serverUrl + fullPath;           // Just concatenate
        }
    }

    /**
     * Make HTTP request with authentication using Node.js native client
     */
    private async makeRequest(url: string, method: string, options?: {headers?: {[key: string]: string}, body?: string | Buffer}): Promise<{ok: boolean; status: number; statusText: string; text: () => Promise<string>; arrayBuffer: () => Promise<ArrayBuffer>}> {
        if (!this.config) throw new Error('WebDAV provider not initialized');

        return new Promise((resolve, reject) => {
            const parsedUrl = new URL(url);
            const isHttps = parsedUrl.protocol === 'https:';
            const httpModule = isHttps ? https : http;

            const headers: {[key: string]: string} = {
                'Authorization': `Basic ${Buffer.from(`${this.config!.username}:${this.config!.password}`).toString('base64')}`,
                'User-Agent': 'Claude-Config-Manager/1.0',
                ...options?.headers
            };

            // Add Content-Length header if body is provided
            if (options?.body) {
                const bodyLength = Buffer.isBuffer(options.body) ? options.body.length : Buffer.byteLength(options.body);
                headers['Content-Length'] = bodyLength.toString();
            }

            // DETAILED HTTP REQUEST DEBUGGING - LOG EVERYTHING
            console.log('\n=== WebDAV HTTP REQUEST DEBUG (Native) ===');
            console.log(`Method: ${method}`);
            console.log(`URL: ${url}`);
            console.log(`Username: ${this.config!.username}`);
            console.log(`Password: ${this.config!.password}`);
            console.log(`Base64 Auth: ${Buffer.from(`${this.config!.username}:${this.config!.password}`).toString('base64')}`);
            console.log('Headers:');
            Object.entries(headers).forEach(([key, value]) => {
                console.log(`  ${key}: ${value}`);
            });
            if (options?.body) {
                console.log(`Body: ${options.body}`);
            }
            
            // Generate equivalent curl command for manual testing
            let curlCommand = `curl -X ${method} \\\n`;
            Object.entries(headers).forEach(([key, value]) => {
                curlCommand += `  -H "${key}: ${value}" \\\n`;
            });
            if (options?.body) {
                curlCommand += `  -d '${options.body}' \\\n`;
            }
            curlCommand += `  "${url}" \\\n  -v`;
            console.log('\nEquivalent curl command:');
            console.log(curlCommand);
            console.log('=== END DEBUG ===\n');

            const requestOptions = {
                hostname: parsedUrl.hostname,
                port: parsedUrl.port || (isHttps ? 443 : 80),
                path: parsedUrl.pathname + parsedUrl.search,
                method,
                headers,
                // Handle SSL verification setting
                rejectUnauthorized: this.config?.verifySSL !== false
            };

            const req = httpModule.request(requestOptions, (res) => {
                let data = Buffer.alloc(0);

                res.on('data', (chunk) => {
                    data = Buffer.concat([data, chunk]);
                });

                res.on('end', () => {
                    const response = {
                        ok: res.statusCode! >= 200 && res.statusCode! < 300,
                        status: res.statusCode!,
                        statusText: res.statusMessage!,
                        text: async () => data.toString(),
                        arrayBuffer: async () => data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
                    };

                    // Log detailed info for debugging
                    if (!response.ok) {
                        console.error(`[WebDAVProvider] ${method} request failed:`);
                        console.error(`  Full URL: ${url}`);
                        console.error(`  Username: ${this.config!.username}`);
                        console.error(`  Status: ${response.status} ${response.statusText}`);
                        console.error(`  Base Path: ${this.config!.basePath}`);
                        console.error(`  Server URL: ${this.config!.serverUrl}`);
                        
                        // Show user-friendly error messages
                        const urlDisplay = url.length > 100 ? url.substring(0, 100) + '...' : url;
                        
                        if (response.status === 401) {
                            vscode.window.showErrorMessage(
                                `❌ Authentication failed for ${this.config!.username}\n` +
                                `Server: ${this.config!.serverUrl}\n` +
                                `Check WebDAV credentials`
                            );
                        } else if (response.status === 404) {
                            vscode.window.showErrorMessage(
                                `❌ WebDAV path not found (${response.status})\n` +
                                `URL: ${urlDisplay}\n` +
                                `Check server URL and base path`
                            );
                        } else if (response.status >= 500) {
                            vscode.window.showErrorMessage(
                                `❌ WebDAV server error (${response.status})\n` +
                                `Server: ${this.config!.serverUrl}\n` +
                                `Try again later or contact server admin`
                            );
                        } else {
                            vscode.window.showErrorMessage(
                                `❌ WebDAV ${method} failed (${response.status})\n` +
                                `URL: ${urlDisplay}\n` +
                                `User: ${this.config!.username}`
                            );
                        }
                    }

                    resolve(response);
                });
            });

            req.on('error', (error) => {
                console.error(`[WebDAVProvider] Request error:`, error);
                reject(error);
            });

            // Write body data if provided
            if (options?.body) {
                if (Buffer.isBuffer(options.body)) {
                    req.write(options.body);
                } else {
                    req.write(options.body);
                }
            }

            req.end();
        });
    }

    /**
     * Parse PROPFIND XML response
     */
    private parsePropfindResponse(xmlResult: any, basePath: string): WebDAVResource[] {
        const resources: WebDAVResource[] = [];
        
        if (!xmlResult.multistatus || !xmlResult.multistatus.response) {
            return resources;
        }

        const responses = Array.isArray(xmlResult.multistatus.response) 
            ? xmlResult.multistatus.response 
            : [xmlResult.multistatus.response];

        for (const response of responses) {
            if (!response.href || !response.propstat) {
                continue;
            }

            const href = response.href[0];
            const propstat = response.propstat[0];
            
            if (!propstat.prop) {
                continue;
            }

            const prop = propstat.prop[0];
            const isDirectory = prop.resourcetype?.[0]?.collection !== undefined;
            
            // Extract file name from href
            const decodedHref = decodeURIComponent(href);
            const name = decodedHref.split('/').filter(Boolean).pop() || '';
            
            // Skip the base directory itself
            if (decodedHref === basePath || !name) {
                continue;
            }

            const resource: WebDAVResource = {
                path: decodedHref,
                name,
                isDirectory,
                size: parseInt(prop.getcontentlength?.[0] || '0'),
                lastModified: new Date(prop.getlastmodified?.[0] || Date.now()),
                etag: prop.getetag?.[0],
                contentType: prop.getcontenttype?.[0]
            };

            resources.push(resource);
        }

        return resources;
    }

    /**
     * Ensure directory path exists, creating if necessary
     */
    private async ensureDirectoryExists(path: string): Promise<void> {
        console.log(`[WebDAVProvider] ensureDirectoryExists called with path: ${path}`);
        
        // Split path into segments
        const segments = path.split('/').filter(Boolean);
        let currentPath = '';

        console.log(`[WebDAVProvider] Path segments: [${segments.join(', ')}]`);

        for (const segment of segments) {
            currentPath += '/' + segment;
            
            console.log(`[WebDAVProvider] Checking/creating directory: ${currentPath}`);
            
            try {
                const exists = await this.exists(currentPath);
                console.log(`[WebDAVProvider] Directory ${currentPath} exists: ${exists}`);
                
                if (!exists) {
                    console.log(`[WebDAVProvider] Creating directory: ${currentPath}`);
                    await this.mkcol(currentPath);
                    console.log(`[WebDAVProvider] Successfully created directory: ${currentPath}`);
                } else {
                    console.log(`[WebDAVProvider] Directory already exists: ${currentPath}`);
                }
            } catch (error) {
                // Directory creation might fail if it already exists (405) or other reasons
                console.log(`[WebDAVProvider] Directory operation for ${currentPath} failed (might be OK):`, error);
                
                // For 405 (Method Not Allowed), directory likely already exists
                // For other errors, we should still continue as the directory might exist
                if (error instanceof Error && !error.message.includes('405')) {
                    console.warn(`[WebDAVProvider] Unexpected error creating ${currentPath}:`, error.message);
                }
            }
        }
        
        console.log(`[WebDAVProvider] ensureDirectoryExists completed for path: ${path}`);
    }
}