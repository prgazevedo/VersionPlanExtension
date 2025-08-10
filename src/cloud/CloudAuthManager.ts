/**
 * WebDAV authentication and credential management system
 * Uses VSCode SecretStorage API for secure credential storage
 */

import * as vscode from 'vscode';
import * as crypto from 'crypto';

export interface CloudCredentials {
    provider: string;
    credentials: any;
    createdAt: Date;
    isValid: boolean;
}

export interface WebDAVConfig {
    serverUrl: string;
    username: string;
    password: string;
    basePath?: string;
    acceptInvalidCerts?: boolean;
}

export interface AuthResult {
    success: boolean;
    credentials?: CloudCredentials;
    error?: string;
}

/**
 * Manages WebDAV authentication and credentials
 */
export class CloudAuthManager {
    private static instance: CloudAuthManager;
    private secretStorage: vscode.SecretStorage;

    private constructor(private context: vscode.ExtensionContext) {
        this.secretStorage = context.secrets;
    }

    public static getInstance(context?: vscode.ExtensionContext): CloudAuthManager {
        if (!CloudAuthManager.instance && context) {
            CloudAuthManager.instance = new CloudAuthManager(context);
        }
        return CloudAuthManager.instance;
    }

    /**
     * Store credentials securely using VSCode SecretStorage
     */
    async storeCredentials(provider: string, credentials: CloudCredentials): Promise<void> {
        const key = this.getCredentialKey(provider);
        const encryptedData = await this.encryptCredentials(credentials);
        await this.secretStorage.store(key, encryptedData);
    }

    /**
     * Retrieve credentials from secure storage
     */
    async getCredentials(provider: string): Promise<CloudCredentials | null> {
        const key = this.getCredentialKey(provider);
        const encryptedData = await this.secretStorage.get(key);
        
        if (!encryptedData) {
            return null;
        }

        try {
            return await this.decryptCredentials(encryptedData);
        } catch (error: any) {
            console.error(`Failed to decrypt credentials for ${provider}:`, error);
            
            // If credentials are corrupted (old format), clear them automatically
            if (error.message?.includes('Corrupted credentials detected')) {
                console.warn(`Clearing corrupted credentials for ${provider}`);
                await this.deleteCredentials(provider);
            }
            
            return null;
        }
    }

    /**
     * Delete credentials from secure storage
     */
    async deleteCredentials(provider: string): Promise<void> {
        const key = this.getCredentialKey(provider);
        await this.secretStorage.delete(key);
    }

    /**
     * Check if credentials exist for a provider
     */
    async hasCredentials(provider: string): Promise<boolean> {
        const credentials = await this.getCredentials(provider);
        return credentials !== null && credentials.isValid;
    }

    /**
     * Authenticate with WebDAV server
     */
    async authenticateWebDAV(config: WebDAVConfig): Promise<AuthResult> {
        try {
            // Validate server URL format
            try {
                new URL(config.serverUrl);
            } catch (error) {
                throw new Error('Invalid server URL format');
            }

            // Create temporary credentials for testing
            const tempCredentials: CloudCredentials = {
                provider: 'webdav',
                credentials: {
                    serverUrl: config.serverUrl,
                    username: config.username,
                    password: config.password,
                    basePath: config.basePath || '/',
                    acceptInvalidCerts: config.acceptInvalidCerts?.toString() || 'false'
                },
                createdAt: new Date(),
                isValid: true
            };

            // Test the connection using the provider
            try {
                const testResult = await this.testWebDAVCredentials(tempCredentials);
                if (!testResult) {
                    throw new Error('WebDAV connection test failed - please check your credentials and server URL');
                }
            } catch (error: any) {
                // Re-throw with more context if it's not already a descriptive error
                if (error.message && (
                    error.message.includes('Connection refused') ||
                    error.message.includes('Server not found') ||
                    error.message.includes('Certificate verification') ||
                    error.message.includes('timeout') ||
                    error.message.includes('unreachable')
                )) {
                    throw error; // Already has good error message
                }
                throw new Error(`WebDAV connection test failed: ${error.message || 'Unknown error'}`);
            }

            const credentials: CloudCredentials = {
                provider: 'webdav',
                credentials: {
                    serverUrl: config.serverUrl,
                    username: config.username,
                    password: config.password,
                    basePath: config.basePath || '/',
                    acceptInvalidCerts: config.acceptInvalidCerts?.toString() || 'false'
                },
                createdAt: new Date(),
                isValid: true
            };

            await this.storeCredentials('webdav', credentials);
            
            return {
                success: true,
                credentials
            };
        } catch (error: any) {
            return {
                success: false,
                error: `WebDAV authentication failed: ${error.message || error}`
            };
        }
    }

    /**
     * Test credentials validity
     */
    async testCredentials(provider: string): Promise<boolean> {
        const credentials = await this.getCredentials(provider);
        if (!credentials) return false;

        try {
            if (provider === 'webdav') {
                return await this.testWebDAVCredentials(credentials);
            }
            return false;
        } catch (error) {
            console.error(`Credential test failed for ${provider}:`, error);
            return false;
        }
    }

    /**
     * Test WebDAV credentials
     */
    private async testWebDAVCredentials(credentials: CloudCredentials): Promise<boolean> {
        try {
            // Use the WebDAVProvider's testConnection method directly for consistency
            const { WebDAVProvider } = require('./providers/WebDAVProvider');
            const provider = new WebDAVProvider(this);
            
            // Initialize the provider with credentials
            await provider.initialize({
                type: 'webdav',
                enabled: true,
                config: credentials.credentials
            });
            
            // Use the provider's own test connection method
            return await provider.testConnection();
        } catch (error) {
            console.error('WebDAV credential test failed:', error);
            return false;
        }
    }

    /**
     * Get credential storage key
     */
    private getCredentialKey(provider: string): string {
        return `claude-config-manager.credentials.${provider}`;
    }

    /**
     * Encrypt credentials before storage
     */
    private async encryptCredentials(credentials: CloudCredentials): Promise<string> {
        // Use a simple encryption for additional security layer
        const algorithm = 'aes-256-gcm';
        const key = crypto.scryptSync('claude-config-manager', 'salt', 32);
        const iv = crypto.randomBytes(16);

        // Create a serializable version of credentials with Date converted to ISO string
        const serializableCredentials = {
            ...credentials,
            createdAt: credentials.createdAt.toISOString()
        };

        const cipher = crypto.createCipheriv(algorithm, key, iv);
        let encrypted = cipher.update(JSON.stringify(serializableCredentials), 'utf8', 'hex');
        encrypted += cipher.final('hex');

        // Get the authentication tag for GCM mode
        const tag = cipher.getAuthTag();

        // Combine IV, tag, and encrypted data
        return iv.toString('hex') + ':' + tag.toString('hex') + ':' + encrypted;
    }

    /**
     * Decrypt credentials after retrieval
     */
    private async decryptCredentials(encryptedData: string): Promise<CloudCredentials> {
        const algorithm = 'aes-256-gcm';
        const key = crypto.scryptSync('claude-config-manager', 'salt', 32);

        // Handle both old format (iv:encrypted) and new format (iv:tag:encrypted)
        const parts = encryptedData.split(':');
        let iv: Buffer, tag: Buffer, encrypted: string;

        if (parts.length === 2) {
            // Old format without auth tag - fallback to non-GCM
            console.warn('Detected old credential format, clearing corrupted credentials');
            throw new Error('Corrupted credentials detected - please reconfigure WebDAV');
        } else if (parts.length === 3) {
            // New format with auth tag
            [iv, tag, encrypted] = [
                Buffer.from(parts[0], 'hex'),
                Buffer.from(parts[1], 'hex'),
                parts[2]
            ];
        } else {
            throw new Error('Invalid credential format');
        }

        const decipher = crypto.createDecipheriv(algorithm, key, iv);
        decipher.setAuthTag(tag);

        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');

        const parsed = JSON.parse(decrypted);
        
        // Convert ISO string back to Date object
        if (parsed.createdAt && typeof parsed.createdAt === 'string') {
            parsed.createdAt = new Date(parsed.createdAt);
        }

        return parsed;
    }

    /**
     * Setup authentication wizard for users - reorganized with provider selection first
     */
    async setupAuthenticationWizard(): Promise<void> {
        // Get WebDAV provider status
        const webdavStatus = await this.getProviderStatus('webdav');
        
        const choice = {
            label: '$(server) WebDAV',
            description: `Self-hosted storage ${webdavStatus.statusText}`,
            detail: 'Nextcloud, ownCloud, or any WebDAV server',
            provider: 'webdav',
            configured: webdavStatus.configured
        };

        // Show a confirmation if provider is already configured
        if (choice.configured) {
            const action = await vscode.window.showWarningMessage(
                `WebDAV is already configured. What would you like to do?`,
                'Reconfigure',
                'Test Connection',
                'Cancel'
            );

            if (action === 'Test Connection') {
                const isValid = await this.testCredentials('webdav');
                vscode.window.showInformationMessage(
                    isValid ? 'WebDAV connection test successful!' :
                    'WebDAV connection test failed. Consider reconfiguring.'
                );
                return;
            } else if (action !== 'Reconfigure') {
                return;
            }
        }

        // Configure the WebDAV provider
        await this.configureProvider('webdav');
    }

    /**
     * Get provider status for display
     */
    private async getProviderStatus(provider: string): Promise<{ configured: boolean; statusText: string }> {
        const hasCredentials = await this.hasCredentials(provider);
        if (!hasCredentials) {
            return { configured: false, statusText: '• Not configured' };
        }

        const isValid = await this.testCredentials(provider);
        return {
            configured: true,
            statusText: isValid ? '• ✅ Connected' : '• ⚠️ Invalid credentials'
        };
    }

    /**
     * Configure WebDAV provider
     */
    private async configureProvider(provider: string): Promise<void> {
        try {
            if (provider === 'webdav') {
                await this.setupWebDAVWizard();
            } else {
                vscode.window.showErrorMessage(`Unknown provider: ${provider}`);
            }
        } catch (error: any) {
            vscode.window.showErrorMessage(`Configuration failed: ${error.message || error}`);
        }
    }

    /**
     * WebDAV setup wizard - improved with common server templates
     */
    private async setupWebDAVWizard(): Promise<void> {
        // Show setup information first
        const proceed = await vscode.window.showInformationMessage(
            'WebDAV setup works with self-hosted cloud storage:\n\n' +
            '• Nextcloud: https://your-domain.com/remote.php/dav/files/username/\n' +
            '• ownCloud: https://your-domain.com/remote.php/webdav/\n' +
            '• Custom WebDAV server\n\n' +
            'You\'ll need your server URL, username, and password/app token.\n\n' +
            'Continue with WebDAV setup?',
            { modal: true },
            'Continue',
            'Cancel'
        );

        if (proceed !== 'Continue') return;

        // Offer common server templates
        const serverTemplate = await vscode.window.showQuickPick([
            {
                label: '$(cloud) Nextcloud',
                description: 'Common Nextcloud WebDAV setup',
                detail: 'https://your-domain.com/remote.php/dav/files/username/',
                template: 'nextcloud'
            },
            {
                label: '$(cloud) ownCloud',
                description: 'Common ownCloud WebDAV setup',
                detail: 'https://your-domain.com/remote.php/webdav/',
                template: 'owncloud'
            },
            {
                label: '$(server) Custom WebDAV',
                description: 'Custom WebDAV server',
                detail: 'Enter your own WebDAV URL',
                template: 'custom'
            }
        ], {
            title: 'WebDAV Setup (Step 1/5)',
            placeHolder: 'Select your WebDAV server type...'
        });

        if (!serverTemplate) return;

        let serverUrl: string;
        if (serverTemplate.template === 'custom') {
            const customUrl = await vscode.window.showInputBox({
                title: 'WebDAV Setup (Step 2/5)',
                prompt: 'Enter your WebDAV server URL',
                placeHolder: 'https://your-server.com/webdav/',
                validateInput: (value) => {
                    if (!value) return 'Server URL is required';
                    try {
                        new URL(value);
                        return undefined;
                    } catch {
                        return 'Please enter a valid URL';
                    }
                }
            });
            if (!customUrl) return;
            serverUrl = customUrl;
        } else {
            const domain = await vscode.window.showInputBox({
                title: 'WebDAV Setup (Step 2/5)',
                prompt: `Enter your ${serverTemplate.label.replace(/\$\(.+?\)\s/, '')} domain`,
                placeHolder: 'your-domain.com',
                validateInput: (value) => {
                    if (!value) return 'Domain is required';
                    if (!value.includes('.')) return 'Please enter a valid domain';
                    return undefined;
                }
            });
            if (!domain) return;

            if (serverTemplate.template === 'nextcloud') {
                const username = await vscode.window.showInputBox({
                    prompt: 'Enter your Nextcloud username (for URL path)',
                    placeHolder: 'your-username'
                });
                if (!username) return;
                serverUrl = `https://${domain}/remote.php/dav/files/${username}/`;
            } else {
                serverUrl = `https://${domain}/remote.php/webdav/`;
            }
        }

        const username = await vscode.window.showInputBox({
            title: 'WebDAV Setup (Step 3/5)',
            prompt: 'Enter your username',
            placeHolder: 'your-username',
            validateInput: (value) => {
                if (!value) return 'Username is required';
                return undefined;
            }
        });
        if (!username) return;

        const password = await vscode.window.showInputBox({
            title: 'WebDAV Setup (Step 4/5)',
            prompt: 'Enter your password or app token',
            placeHolder: 'Use app-specific password for better security',
            password: true,
            validateInput: (value) => {
                if (!value) return 'Password is required';
                return undefined;
            }
        });
        if (!password) return;

        const basePath = await vscode.window.showInputBox({
            title: 'WebDAV Setup (Step 5/5)',
            prompt: 'Enter folder path for Claude data (optional)',
            placeHolder: '/Claude-Config-Sync/',
            value: '/Claude-Config-Sync/'
        });

        const acceptInvalidCerts = await vscode.window.showQuickPick([
            { label: '$(shield) Secure', description: 'Reject invalid SSL certificates (recommended)', value: false },
            { label: '$(alert) Allow insecure', description: 'Accept invalid SSL certificates (not recommended)', value: true }
        ], {
            title: 'SSL Certificate Validation',
            placeHolder: 'Choose SSL security level...'
        });

        if (acceptInvalidCerts === undefined) return;

        // Show progress while testing connection
        const result = await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Testing WebDAV connection...',
            cancellable: false
        }, async () => {
            return await this.authenticateWebDAV({
                serverUrl,
                username,
                password,
                basePath: basePath || undefined,
                acceptInvalidCerts: acceptInvalidCerts.value
            });
        });

        if (result.success) {
            vscode.window.showInformationMessage('✅ WebDAV configured successfully!');
        } else {
            vscode.window.showErrorMessage(`❌ WebDAV configuration failed: ${result.error}`);
        }
    }
}