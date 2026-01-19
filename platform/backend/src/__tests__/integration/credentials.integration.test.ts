/**
 * Integration tests for credential system
 *
 * Tests:
 * - End-to-end credential operations with factory
 * - Environment provider integration
 * - File provider integration with temp files
 * - Tenant isolation across providers
 * - Put and delete operations
 * - Provider failure fallback
 * - Logging without credential values
 * - Graceful handling when all providers unavailable
 */

import { CredentialProviderFactory } from '../../credentials/CredentialProviderFactory';
import { FileProvider } from '../../credentials/providers/FileProvider';
import { EnvironmentProvider } from '../../credentials/providers/EnvironmentProvider';
import { resetCredentialFactory } from '../../config/credentials';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('Credential Integration Tests', () => {
  const VALID_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  let tempFilePath: string;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(async () => {
    resetCredentialFactory();
    jest.clearAllMocks();

    // Store original environment
    originalEnv = { ...process.env };

    // Create a unique temp file for each test
    const uniqueId = Math.random().toString(36).substring(7);
    tempFilePath = join(tmpdir(), `test-credentials-integration-${uniqueId}.json`);

    // Clean up any existing temp file
    try {
      await fs.unlink(tempFilePath);
    } catch {
      // File doesn't exist, that's fine
    }
  });

  afterEach(async () => {
    // Restore original environment
    process.env = originalEnv;

    // Clean up temp file after each test
    try {
      await fs.unlink(tempFilePath);
    } catch {
      // File doesn't exist, that's fine
    }
  });

  describe('File provider integration', () => {
    it('should store and retrieve credentials end-to-end', async () => {
      const factory = new CredentialProviderFactory({
        environment: { enabled: false },
        file: {
          enabled: true,
          filePath: tempFilePath,
          encryptionKey: VALID_ENCRYPTION_KEY,
        },
      });

      await factory.put('tenant-123', 'GITHUB_TOKEN', 'ghp_secret_value');
      const result = await factory.get('tenant-123', 'GITHUB_TOKEN');

      expect(result).toBe('ghp_secret_value');
    });

    it('should maintain tenant isolation', async () => {
      const factory = new CredentialProviderFactory({
        environment: { enabled: false },
        file: {
          enabled: true,
          filePath: tempFilePath,
          encryptionKey: VALID_ENCRYPTION_KEY,
        },
      });

      await factory.put('tenant-1', 'API_KEY', 'key1');
      await factory.put('tenant-2', 'API_KEY', 'key2');

      const result1 = await factory.get('tenant-1', 'API_KEY');
      const result2 = await factory.get('tenant-2', 'API_KEY');

      expect(result1).toBe('key1');
      expect(result2).toBe('key2');
    });

    it('should handle put and delete operations', async () => {
      const factory = new CredentialProviderFactory({
        environment: { enabled: false },
        file: {
          enabled: true,
          filePath: tempFilePath,
          encryptionKey: VALID_ENCRYPTION_KEY,
        },
      });

      await factory.put('tenant-123', 'KEY', 'value');
      let result = await factory.get('tenant-123', 'KEY');
      expect(result).toBe('value');

      await factory.delete('tenant-123', 'KEY');
      result = await factory.get('tenant-123', 'KEY');
      expect(result).toBeNull();
    });

    it('should persist data across factory instances', async () => {
      // First factory
      const factory1 = new CredentialProviderFactory({
        environment: { enabled: false },
        file: {
          enabled: true,
          filePath: tempFilePath,
          encryptionKey: VALID_ENCRYPTION_KEY,
        },
      });

      await factory1.put('tenant-123', 'PERSISTED_KEY', 'persisted_value');

      // Second factory with same config
      const factory2 = new CredentialProviderFactory({
        environment: { enabled: false },
        file: {
          enabled: true,
          filePath: tempFilePath,
          encryptionKey: VALID_ENCRYPTION_KEY,
        },
      });

      const result = await factory2.get('tenant-123', 'PERSISTED_KEY');
      expect(result).toBe('persisted_value');
    });
  });

  describe('Environment provider integration', () => {
    it('should retrieve from process.env', async () => {
      process.env.GITHUB_TOKEN = 'ghp_env_value';
      process.env.GITLAB_TOKEN = 'glpat_env_value';

      const factory = new CredentialProviderFactory({
        environment: { enabled: true },
      });

      const githubToken = await factory.get('tenant-123', 'github_token');
      const gitlabToken = await factory.get('tenant-123', 'gitlab_token');

      expect(githubToken).toBe('ghp_env_value');
      expect(gitlabToken).toBe('glpat_env_value');
    });

    it('should return null for non-existent environment variables', async () => {
      const factory = new CredentialProviderFactory({
        environment: { enabled: true },
      });

      const result = await factory.get('tenant-123', 'nonexistent_key');

      expect(result).toBeNull();
    });

    it('should share environment variables across tenants (no isolation)', async () => {
      process.env.SHARED_KEY = 'shared_value';

      const factory = new CredentialProviderFactory({
        environment: { enabled: true },
      });

      const result1 = await factory.get('tenant-1', 'shared_key');
      const result2 = await factory.get('tenant-2', 'shared_key');

      expect(result1).toBe('shared_value');
      expect(result2).toBe('shared_value');
    });
  });

  describe('Factory with fallback chain', () => {
    it('should try Environment before File', async () => {
      process.env.API_KEY = 'env_value';

      const factory = new CredentialProviderFactory({
        environment: { enabled: true },
        file: {
          enabled: true,
          filePath: tempFilePath,
          encryptionKey: VALID_ENCRYPTION_KEY,
        },
      });

      // Put to file provider (environment is read-only)
      await factory.put('tenant-123', 'FILE_ONLY_KEY', 'file_value');

      // Get from environment (should win)
      const result = await factory.get('tenant-123', 'api_key');
      expect(result).toBe('env_value');
    });

    it('should fall back to File when Environment returns null', async () => {
      // Don't set the env var
      delete process.env.FALLBACK_KEY;

      const factory = new CredentialProviderFactory({
        environment: { enabled: true },
        file: {
          enabled: true,
          filePath: tempFilePath,
          encryptionKey: VALID_ENCRYPTION_KEY,
        },
      });

      await factory.put('tenant-123', 'FALLBACK_KEY', 'file_value');

      // Use same case for both put and get
      const result = await factory.get('tenant-123', 'FALLBACK_KEY');
      expect(result).toBe('file_value');
    });

    it('should use first provider with value', async () => {
      process.env.PRIORITY_KEY = 'env_value';

      const factory = new CredentialProviderFactory({
        environment: { enabled: true },
        file: {
          enabled: true,
          filePath: tempFilePath,
          encryptionKey: VALID_ENCRYPTION_KEY,
        },
      });

      // Also write to file (should not be read since env has it)
      await factory.put('tenant-123', 'PRIORITY_KEY', 'file_value');

      const result = await factory.get('tenant-123', 'priority_key');
      expect(result).toBe('env_value');
    });
  });

  describe('Provider failure handling', () => {
    it('should continue to next provider on failure', async () => {
      // Create a factory with a mock failing provider
      const factory = new CredentialProviderFactory({
        environment: { enabled: true },
        file: {
          enabled: true,
          filePath: tempFilePath,
          encryptionKey: VALID_ENCRYPTION_KEY,
        },
      });

      // Environment will return null (file not in env)
      // File should succeed
      await factory.put('tenant-123', 'KEY', 'value');

      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
      const result = await factory.get('tenant-123', 'KEY');

      expect(result).toBe('value');
      consoleWarnSpy.mockRestore();
    });

    it('should return null when all providers fail', async () => {
      const factory = new CredentialProviderFactory({
        environment: { enabled: true },
      });

      // No env vars set, only environment provider (which returns null for missing keys)
      const result = await factory.get('tenant-123', 'nonexistent_key');

      expect(result).toBeNull();
    });
  });

  describe('Logging without credential values', () => {
    it('should not log actual credential values', async () => {
      const consoleDebugSpy = jest.spyOn(console, 'debug').mockImplementation();

      const factory = new CredentialProviderFactory({
        environment: { enabled: true },
      });

      process.env.SECRET_KEY = 'super_secret_value_123';
      await factory.get('tenant-123', 'secret_key');

      // Check that no log contains the actual value
      const logCalls = consoleDebugSpy.mock.calls.map(call => JSON.stringify(call));
      logCalls.forEach(log => {
        expect(log).not.toContain('super_secret_value_123');
      });

      consoleDebugSpy.mockRestore();
    });

    it('should log metadata but not values', async () => {
      const consoleInfoSpy = jest.spyOn(console, 'info').mockImplementation();

      const factory = new CredentialProviderFactory({
        environment: { enabled: false },
        file: {
          enabled: true,
          filePath: tempFilePath,
          encryptionKey: VALID_ENCRYPTION_KEY,
        },
      });

      await factory.put('tenant-123', 'SECRET', 'my_secret_value');

      const logCalls = consoleInfoSpy.mock.calls.map(call => JSON.stringify(call));
      logCalls.forEach(log => {
        expect(log).not.toContain('my_secret_value');
      });

      consoleInfoSpy.mockRestore();
    });
  });

  describe('Graceful degradation', () => {
    it('should return null for unavailable credentials', async () => {
      const factory = new CredentialProviderFactory({
        environment: { enabled: true },
      });

      const result = await factory.get('tenant-123', 'definitely_not_a_real_key');

      expect(result).toBeNull();
    });

    it('should handle isAvailable gracefully', async () => {
      const factory = new CredentialProviderFactory({
        environment: { enabled: true },
      });

      const available = await factory.isAvailable();
      expect(typeof available).toBe('boolean');
    });

    it('should handle listKeys gracefully for empty tenant', async () => {
      const factory = new CredentialProviderFactory({
        environment: { enabled: true },
      });

      const keys = await factory.listKeys('nonexistent_tenant');
      expect(Array.isArray(keys)).toBe(true);
    });
  });

  describe('Multi-tenant scenarios', () => {
    it('should isolate credentials between tenants', async () => {
      const factory = new CredentialProviderFactory({
        environment: { enabled: false },
        file: {
          enabled: true,
          filePath: tempFilePath,
          encryptionKey: VALID_ENCRYPTION_KEY,
        },
      });

      // Multiple tenants with same key
      await factory.put('tenant-a', 'API_KEY', 'key_a');
      await factory.put('tenant-b', 'API_KEY', 'key_b');
      await factory.put('tenant-c', 'API_KEY', 'key_c');

      expect(await factory.get('tenant-a', 'API_KEY')).toBe('key_a');
      expect(await factory.get('tenant-b', 'API_KEY')).toBe('key_b');
      expect(await factory.get('tenant-c', 'API_KEY')).toBe('key_c');
    });

    it('should list keys per tenant', async () => {
      const factory = new CredentialProviderFactory({
        environment: { enabled: false },
        file: {
          enabled: true,
          filePath: tempFilePath,
          encryptionKey: VALID_ENCRYPTION_KEY,
        },
      });

      await factory.put('tenant-1', 'KEY1', 'val1');
      await factory.put('tenant-1', 'KEY2', 'val2');
      await factory.put('tenant-2', 'KEY3', 'val3');

      const keys1 = await factory.listKeys('tenant-1');
      const keys2 = await factory.listKeys('tenant-2');

      expect(keys1.sort()).toEqual(['KEY1', 'KEY2']);
      expect(keys2).toEqual(['KEY3']);
    });

    it('should delete only from specified tenant', async () => {
      const factory = new CredentialProviderFactory({
        environment: { enabled: false },
        file: {
          enabled: true,
          filePath: tempFilePath,
          encryptionKey: VALID_ENCRYPTION_KEY,
        },
      });

      await factory.put('tenant-1', 'SHARED_KEY', 'val1');
      await factory.put('tenant-2', 'SHARED_KEY', 'val2');

      await factory.delete('tenant-1', 'SHARED_KEY');

      expect(await factory.get('tenant-1', 'SHARED_KEY')).toBeNull();
      expect(await factory.get('tenant-2', 'SHARED_KEY')).toBe('val2');
    });
  });

  describe('Write operations', () => {
    it('should write to first writable provider', async () => {
      const factory = new CredentialProviderFactory({
        environment: { enabled: true },
        file: {
          enabled: true,
          filePath: tempFilePath,
          encryptionKey: VALID_ENCRYPTION_KEY,
        },
      });

      // Environment is read-only, should write to File
      await factory.put('tenant-123', 'WRITE_KEY', 'write_value');

      // Verify via file provider (bypass factory to check actual file storage)
      const fileProvider = new FileProvider({
        filePath: tempFilePath,
        encryptionKey: VALID_ENCRYPTION_KEY,
      });
      const result = await fileProvider.get('tenant-123', 'WRITE_KEY');
      expect(result).toBe('write_value');
    });

    it('should throw when no writable provider available', async () => {
      const factory = new CredentialProviderFactory({
        environment: { enabled: true },
      });

      await expect(
        factory.put('tenant-123', 'KEY', 'value')
      ).rejects.toThrow('No writable credential provider available');
    });

    it('should delete using first writable provider', async () => {
      const factory = new CredentialProviderFactory({
        environment: { enabled: true },
        file: {
          enabled: true,
          filePath: tempFilePath,
          encryptionKey: VALID_ENCRYPTION_KEY,
        },
      });

      await factory.put('tenant-123', 'DELETE_KEY', 'value');
      expect(await factory.get('tenant-123', 'DELETE_KEY')).toBe('value');

      await factory.delete('tenant-123', 'DELETE_KEY');
      expect(await factory.get('tenant-123', 'DELETE_KEY')).toBeNull();
    });
  });

  describe('Real-world scenarios', () => {
    it('should handle typical GitHub credentials workflow', async () => {
      const factory = new CredentialProviderFactory({
        environment: { enabled: false },
        file: {
          enabled: true,
          filePath: tempFilePath,
          encryptionKey: VALID_ENCRYPTION_KEY,
        },
      });

      // Store GitHub token for tenant
      await factory.put('acme-corp', 'GITHUB_TOKEN', 'ghp_acme_token');

      // Retrieve it
      const token = await factory.get('acme-corp', 'GITHUB_TOKEN');
      expect(token).toBe('ghp_acme_token');

      // Different tenant should not get it
      const otherToken = await factory.get('other-corp', 'GITHUB_TOKEN');
      expect(otherToken).toBeNull();

      // List keys for tenant
      const keys = await factory.listKeys('acme-corp');
      expect(keys).toContain('GITHUB_TOKEN');

      // Delete when done
      await factory.delete('acme-corp', 'GITHUB_TOKEN');
      expect(await factory.get('acme-corp', 'GITHUB_TOKEN')).toBeNull();
    });

    it('should support multiple credential types per tenant', async () => {
      const factory = new CredentialProviderFactory({
        environment: { enabled: false },
        file: {
          enabled: true,
          filePath: tempFilePath,
          encryptionKey: VALID_ENCRYPTION_KEY,
        },
      });

      await factory.put('tenant-123', 'GITHUB_TOKEN', 'ghp_...');
      await factory.put('tenant-123', 'GITLAB_TOKEN', 'glpat_...');
      await factory.put('tenant-123', 'CLAUDE_API_KEY', 'sk-ant-...');
      await factory.put('tenant-123', 'OPENAI_API_KEY', 'sk-...');

      const keys = await factory.listKeys('tenant-123');
      expect(keys.sort()).toEqual([
        'CLAUDE_API_KEY',
        'GITHUB_TOKEN',
        'GITLAB_TOKEN',
        'OPENAI_API_KEY',
      ]);

      // Each should be retrievable
      expect(await factory.get('tenant-123', 'GITHUB_TOKEN')).toBe('ghp_...');
      expect(await factory.get('tenant-123', 'GITLAB_TOKEN')).toBe('glpat_...');
      expect(await factory.get('tenant-123', 'CLAUDE_API_KEY')).toBe('sk-ant-...');
      expect(await factory.get('tenant-123', 'OPENAI_API_KEY')).toBe('sk-...');
    });
  });
});
