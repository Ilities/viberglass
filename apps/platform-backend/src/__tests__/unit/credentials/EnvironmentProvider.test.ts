/**
 * Unit tests for EnvironmentProvider
 *
 * Tests:
 * - Getting existing credentials from process.env
 * - Getting non-existent credentials returns null
 * - put() throws read-only error
 * - delete() throws read-only error
 * - isAvailable() always returns true
 * - Key transformation: github_token -> GITHUB_TOKEN
 * - listKeys() returns credential-like environment variables
 */

import { EnvironmentProvider } from '../../../credentials/providers/EnvironmentProvider';

describe('EnvironmentProvider', () => {
  let provider: EnvironmentProvider;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    provider = new EnvironmentProvider();
    // Store original environment
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe('get()', () => {
    it('should return credential value when exists in process.env', async () => {
      process.env.GITHUB_TOKEN = 'ghp_test_token_value';

      const result = await provider.get('tenant-123', 'github_token');

      expect(result).toBe('ghp_test_token_value');
    });

    it('should return null when credential does not exist', async () => {
      delete process.env.GITHUB_TOKEN;

      const result = await provider.get('tenant-123', 'github_token');

      expect(result).toBeNull();
    });

    it('should return null when environment variable is empty string', async () => {
      process.env.GITHUB_TOKEN = '';

      const result = await provider.get('tenant-123', 'github_token');

      expect(result).toBeNull();
    });

    it('should transform lowercase key to uppercase for environment lookup', async () => {
      process.env.CLAUDE_API_KEY = 'sk-ant-test-key';

      const result = await provider.get('tenant-456', 'claude_api_key');

      expect(result).toBe('sk-ant-test-key');
    });

    it('should handle special characters by converting to underscores', async () => {
      process.env.MY_CUSTOM_KEY = 'value123';

      const result = await provider.get('tenant-789', 'my-custom.key');

      expect(result).toBe('value123');
    });

    it('should ignore tenantId (all tenants share same environment)', async () => {
      process.env.GITHUB_TOKEN = 'shared_value';

      const result1 = await provider.get('tenant-1', 'github_token');
      const result2 = await provider.get('tenant-2', 'github_token');

      expect(result1).toBe('shared_value');
      expect(result2).toBe('shared_value');
    });
  });

  describe('put()', () => {
    it('should throw read-only error when trying to set credential', async () => {
      await expect(provider.put('tenant-123', 'key', 'value')).rejects.toThrow(
        'EnvironmentProvider is read-only: cannot set environment variables at runtime'
      );
    });

    it('should throw error with consistent message regardless of parameters', async () => {
      await expect(provider.put('tenant-1', 'key1', 'value1')).rejects.toThrow('read-only');
      await expect(provider.put('tenant-2', 'key2', 'value2')).rejects.toThrow('read-only');
    });
  });

  describe('delete()', () => {
    it('should throw read-only error when trying to delete credential', async () => {
      await expect(provider.delete('tenant-123', 'key')).rejects.toThrow(
        'EnvironmentProvider is read-only: cannot delete environment variables at runtime'
      );
    });

    it('should throw error with consistent message regardless of parameters', async () => {
      await expect(provider.delete('tenant-1', 'key1')).rejects.toThrow('read-only');
      await expect(provider.delete('tenant-2', 'key2')).rejects.toThrow('read-only');
    });
  });

  describe('isAvailable()', () => {
    it('should always return true (no external dependencies)', async () => {
      const result = await provider.isAvailable();

      expect(result).toBe(true);
    });

    it('should return true even when no credentials are set', async () => {
      // Clear all env vars
      Object.keys(process.env).forEach(key => delete process.env[key]);

      const result = await provider.isAvailable();

      expect(result).toBe(true);
    });
  });

  describe('listKeys()', () => {
    it('should return environment variables containing TOKEN', async () => {
      process.env.GITHUB_TOKEN = 'ghp_123';
      process.env.GITLAB_TOKEN = 'glpat_456';

      const result = await provider.listKeys('tenant-123');

      expect(result).toContain('github_token');
      expect(result).toContain('gitlab_token');
    });

    it('should return environment variables containing API_KEY', async () => {
      process.env.CLAUDE_API_KEY = 'sk-ant-123';
      process.env.OPENAI_API_KEY = 'sk-123';

      const result = await provider.listKeys('tenant-123');

      expect(result).toContain('claude_api_key');
      expect(result).toContain('openai_api_key');
    });

    it('should return environment variables containing PASSWORD', async () => {
      process.env.DB_PASSWORD = 'secret123';

      const result = await provider.listKeys('tenant-123');

      expect(result).toContain('db_password');
    });

    it('should return environment variables containing SECRET', async () => {
      process.env.JWT_SECRET = 'jwt-secret';

      const result = await provider.listKeys('tenant-123');

      expect(result).toContain('jwt_secret');
    });

    it('should return environment variables containing CREDENTIAL', async () => {
      process.env.SOME_CREDENTIAL = 'value';

      const result = await provider.listKeys('tenant-123');

      expect(result).toContain('some_credential');
    });

    it('should return empty array when no credential-like environment variables exist', async () => {
      // Clear all env vars
      Object.keys(process.env).forEach(key => delete process.env[key]);
      process.env.PATH = '/usr/bin'; // Not a credential

      const result = await provider.listKeys('tenant-123');

      expect(result).toEqual([]);
    });

    it('should return keys in lowercase format', async () => {
      process.env.MY_API_KEY = 'value';

      const result = await provider.listKeys('tenant-123');

      expect(result).toContain('my_api_key');
    });

    it('should ignore tenantId parameter (environment is shared)', async () => {
      process.env.GITHUB_TOKEN = 'value';

      const result1 = await provider.listKeys('tenant-1');
      const result2 = await provider.listKeys('tenant-2');

      expect(result1).toEqual(result2);
    });
  });

  describe('name property', () => {
    it('should have correct provider name', () => {
      expect(provider.name).toBe('EnvironmentProvider');
    });
  });
});
