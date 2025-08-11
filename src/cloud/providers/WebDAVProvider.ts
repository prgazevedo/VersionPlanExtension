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

export interface BatchUploadOptions {
    maxConcurrency?: number;
    chunkSize?: number; // For large files
    retryAttempts?: number;
    progressCallback?: (progress: UploadProgress) => void;
}

export interface UploadTask {
    path: string;
    data: Buffer;
    sessionId?: string;
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
    private directoryExistsCache = new Set<string>();
    private uploadSemaphore: Map<string, Promise<void>> = new Map();

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
     * PUT - Upload single file with optimized retry logic
     */
    async put(path: string, data: Buffer, sessionId?: string): Promise<void> {
        if (!this.config) throw new Error('WebDAV provider not initialized');

        const fullPath = this.buildFullPath(path);
        
        // Ensure parent directory exists with caching
        const parentPath = path.substring(0, path.lastIndexOf('/'));
        if (parentPath && parentPath !== '/') {
            await this.ensureDirectoryExistsFast(parentPath);
        }
        
        // Report initial progress
        if (this.onProgressCallback && sessionId) {
            this.onProgressCallback({
                sessionId,
                bytesUploaded: 0,
                totalBytes: data.length,
                percentage: 0
            });
        }

        // Optimized retry with faster recovery
        const maxRetries = 1; // Reduced retries for speed
        const baseDelay = 200; // Faster retry
        
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

                // Only retry 500+ errors
                if (response.status < 500 || attempt === maxRetries) {
                    throw new Error(`Failed to upload file: ${response.status} ${response.statusText}`);
                }
                
                await new Promise(resolve => setTimeout(resolve, baseDelay));
                
            } catch (error) {
                if (attempt === maxRetries) {
                    throw error;
                }
                await new Promise(resolve => setTimeout(resolve, baseDelay));
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
        const response = await this.makeRequest(fullPath, 'MKCOL');
        
        if (!response.ok && response.status !== 405) { // 405 = already exists
            throw new Error(`Failed to create directory: ${response.status} ${response.statusText}`);
        }
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
                // Mark all files in this directory as non-existent on error
                for (const fileName of fileNames) {
                    const fullPath = `${dir}/${fileName}`;
                    result.set(fullPath, {
                        exists: false
                    });
                }
            }
        }
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

            // Performance: No verbose logging
            // Removed verbose logging for performance

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

                    // Show user-friendly error messages for failures only
                    if (!response.ok && response.status !== 404 && response.status !== 405) {
                        if (response.status >= 500) {
                            vscode.window.showErrorMessage(
                                `❌ WebDAV server error (${response.status}) Server: ${this.config!.serverUrl} Try again later or contact server admin\\` +
                                `Does the file already exist? password is ${this.config!.password} check manually`
                            );
                        }
                    }

                    resolve(response);
                });
            });

            req.on('error', (error) => {
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
     * Batch upload multiple files with parallelization
     */
    async batchUpload(uploads: UploadTask[], options: BatchUploadOptions = {}): Promise<void> {
        const {
            maxConcurrency = 5,
            chunkSize = 10 * 1024 * 1024, // 10MB chunks
            progressCallback
        } = options;

        // Pre-create all required directories in parallel
        const directories = new Set<string>();
        uploads.forEach(upload => {
            const parentPath = upload.path.substring(0, upload.path.lastIndexOf('/'));
            if (parentPath && parentPath !== '/') {
                directories.add(parentPath);
            }
        });
        
        await this.ensureDirectoriesBatch([...directories]);
        
        // Process uploads with controlled concurrency
        const semaphore = new Array(maxConcurrency).fill(null).map(() => Promise.resolve());
        let semaphoreIndex = 0;
        
        const uploadPromises = uploads.map(async (upload) => {
            // Wait for available slot
            const slot = semaphoreIndex % maxConcurrency;
            await semaphore[slot];
            
            // Start upload and update semaphore
            const uploadPromise = this.uploadWithChunking(upload, chunkSize, progressCallback);
            semaphore[slot] = uploadPromise.catch(() => {});
            semaphoreIndex++;
            
            return uploadPromise;
        });
        
        await Promise.all(uploadPromises);
    }

    /**
     * Upload file with chunking for large files
     */
    private async uploadWithChunking(upload: UploadTask, chunkSize: number, progressCallback?: (progress: UploadProgress) => void): Promise<void> {
        const { path, data, sessionId } = upload;
        
        // For small files, use regular upload
        if (data.length <= chunkSize) {
            return this.put(path, data, sessionId);
        }
        
        // Large file chunking (WebDAV doesn't natively support this, but we can try)
        // For now, just use regular upload but report progress in chunks
        let bytesUploaded = 0;
        const totalBytes = data.length;
        
        if (progressCallback && sessionId) {
            // Simulate chunked progress reporting
            const progressInterval = setInterval(() => {
                if (bytesUploaded < totalBytes) {
                    bytesUploaded = Math.min(bytesUploaded + chunkSize, totalBytes);
                    progressCallback({
                        sessionId,
                        bytesUploaded,
                        totalBytes,
                        percentage: Math.round((bytesUploaded / totalBytes) * 100)
                    });
                }
            }, 100);
            
            try {
                await this.put(path, data, sessionId);
                clearInterval(progressInterval);
            } catch (error) {
                clearInterval(progressInterval);
                throw error;
            }
        } else {
            await this.put(path, data, sessionId);
        }
    }

    /**
     * Fast directory creation with caching
     */
    private async ensureDirectoryExistsFast(path: string): Promise<void> {
        if (this.directoryExistsCache.has(path)) {
            return;
        }
        
        // Check if we have a pending operation for this directory
        const existingOperation = this.uploadSemaphore.get(path);
        if (existingOperation) {
            await existingOperation;
            return;
        }
        
        // Create the operation
        const operation = this.createDirectoryRecursive(path);
        this.uploadSemaphore.set(path, operation);
        
        try {
            await operation;
            this.directoryExistsCache.add(path);
        } finally {
            this.uploadSemaphore.delete(path);
        }
    }

    /**
     * Create directories in batch to reduce individual PROPFIND calls
     */
    private async ensureDirectoriesBatch(paths: string[]): Promise<void> {
        const uncachedPaths = paths.filter(path => !this.directoryExistsCache.has(path));
        if (uncachedPaths.length === 0) return;
        
        // Group by parent directories and check existence in batch
        const uniquePaths = [...new Set(uncachedPaths)];
        const createPromises = uniquePaths.map(path => 
            this.ensureDirectoryExistsFast(path)
        );
        
        await Promise.all(createPromises);
    }

    /**
     * Recursive directory creation (optimized)
     */
    private async createDirectoryRecursive(path: string): Promise<void> {
        const segments = path.split('/').filter(Boolean);
        let currentPath = '';
        
        // Try to create from deepest first, then work backwards if needed
        for (const segment of segments) {
            currentPath += '/' + segment;
            
            if (this.directoryExistsCache.has(currentPath)) {
                continue;
            }
            
            try {
                await this.mkcol(currentPath);
                this.directoryExistsCache.add(currentPath);
            } catch (error) {
                // If directory already exists (405), cache it
                if (error instanceof Error && error.message.includes('405')) {
                    this.directoryExistsCache.add(currentPath);
                }
            }
        }
    }

    /**
     * Clear directory cache (useful for testing or after errors)
     */
    clearDirectoryCache(): void {
        this.directoryExistsCache.clear();
    }

    /**
     * Legacy method - kept for compatibility
     */
    private async ensureDirectoryExists(path: string): Promise<void> {
        return this.ensureDirectoryExistsFast(path);
    }
}