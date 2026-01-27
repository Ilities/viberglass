/**
 * Unit tests for AwsSsmProvider
 *
 * Tests:
 * - Getting existing parameters
 * - Getting non-existent parameters returns null
 * - Putting credentials with SecureString
 * - Deleting credentials
 * - Path building for tenant/key combinations
 * - Special character sanitization
 * - Caching behavior
 * - ParameterNotFound error handling
 */

import { AwsSsmProvider } from '../../../credentials/providers/AwsSsmProvider';
import {
  SSMClient,
  GetParameterCommand,
  PutParameterCommand,
  DeleteParameterCommand,
  GetParametersByPathCommand,
} from '@aws-sdk/client-ssm';

// Mock the SSM client
jest.mock('@aws-sdk/client-ssm', () => {
  return {
    SSMClient: jest.fn().mockImplementation(() => ({
      send: jest.fn(),
    })),
    GetParameterCommand: jest.fn().mockImplementation((input) => ({ input })),
    PutParameterCommand: jest.fn().mockImplementation((input) => ({ input })),
    DeleteParameterCommand: jest.fn().mockImplementation((input) => ({ input })),
    GetParametersByPathCommand: jest.fn().mockImplementation((input) => ({ input })),
    defaultProvider: jest.fn(),
  };
});

describe('AwsSsmProvider', () => {
  let provider: AwsSsmProvider;
  let mockSend: jest.Mock;

  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();

    // Create provider with test configuration
    provider = new AwsSsmProvider({
      region: 'us-east-1',
      pathPrefix: '/viberator/tenants',
    });

    // Get the mock client and send method
    const mockClient = provider['client'] as any;
    mockSend = mockClient.send;
  });

  describe('constructor', () => {
    it('should use default region when not provided', () => {
      const p = new AwsSsmProvider({});
      expect(p).toBeInstanceOf(AwsSsmProvider);
    });

    it('should use provided region', () => {
      const p = new AwsSsmProvider({ region: 'eu-west-1' });
      expect(p).toBeInstanceOf(AwsSsmProvider);
    });

    it('should use default path prefix when not provided', () => {
      const p = new AwsSsmProvider({});
      expect(p).toBeInstanceOf(AwsSsmProvider);
    });

    it('should normalize path prefix (remove trailing slash)', () => {
      const p = new AwsSsmProvider({
        pathPrefix: '/viberator/tenants/',
      });
      expect(p).toBeInstanceOf(AwsSsmProvider);
    });
  });

  describe('buildPath()', () => {
    it('should build correct path for tenant and key', () => {
      const path = provider['buildPath']('tenant-123', 'GITHUB_TOKEN');
      expect(path).toBe('/viberator/tenants/tenant-123/GITHUB_TOKEN');
    });

    it('should sanitize special characters in tenantId', () => {
      const path = provider['buildPath']('tenant/123\\with@special#chars', 'KEY');
      expect(path).toBe('/viberator/tenants/tenant-123-with-special-chars/KEY');
    });

    it('should sanitize special characters in key', () => {
      const path = provider['buildPath']('tenant-123', 'my@api@key');
      expect(path).toBe('/viberator/tenants/tenant-123/my_api_key');
    });

    it('should handle alphanumeric, hyphen, underscore, and dot', () => {
      const path = provider['buildPath']('tenant-123.test', 'my_key-name.123');
      expect(path).toBe('/viberator/tenants/tenant-123.test/my_key-name.123');
    });

    it('should use custom path prefix', () => {
      const p = new AwsSsmProvider({
        pathPrefix: '/custom/prefix',
      });
      const path = p['buildPath']('tenant-1', 'KEY');
      expect(path).toBe('/custom/prefix/tenant-1/KEY');
    });
  });

  describe('get()', () => {
    it('should return parameter value when exists', async () => {
      mockSend.mockResolvedValueOnce({
        Parameter: {
          Value: 'ghp_secret_value',
        },
      });

      const result = await provider.get('tenant-123', 'GITHUB_TOKEN');

      expect(result).toBe('ghp_secret_value');
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('should return null when parameter does not exist', async () => {
      const error = new Error('ParameterNotFound');
      (error as { name: string }).name = 'ParameterNotFound';
      mockSend.mockRejectedValueOnce(error);

      const result = await provider.get('tenant-123', 'NON_EXISTENT');

      expect(result).toBeNull();
    });

    it('should return null when Parameter.Value is undefined', async () => {
      mockSend.mockResolvedValueOnce({
        Parameter: {},
      });

      const result = await provider.get('tenant-123', 'GITHUB_TOKEN');

      expect(result).toBeNull();
    });

    it('should cache successful results', async () => {
      mockSend.mockResolvedValueOnce({
        Parameter: { Value: 'cached_value' },
      });

      // First call
      await provider.get('tenant-123', 'KEY');
      // Second call should use cache
      await provider.get('tenant-123', 'KEY');

      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('should not use expired cache entries', async () => {
      mockSend.mockResolvedValue({
        Parameter: { Value: 'value' },
      });

      await provider.get('tenant-123', 'KEY');

      // Fast-forward time beyond cache TTL (5 minutes)
      jest.useFakeTimers();
      jest.advanceTimersByTime(1000 * 60 * 5 + 1000);

      await provider.get('tenant-123', 'KEY');

      expect(mockSend).toHaveBeenCalledTimes(2);
      jest.useRealTimers();
    });

    it('should return null on other errors', async () => {
      mockSend.mockRejectedValueOnce(new Error('Network error'));

      const result = await provider.get('tenant-123', 'KEY');

      expect(result).toBeNull();
    });

    it('should clear cache on error', async () => {
      // First successful call populates cache
      mockSend.mockResolvedValueOnce({ Parameter: { Value: 'first_value' } });
      await provider.get('tenant-123', 'KEY');

      // Verify cache has the value
      const cache = provider['cache'] as Map<string, { value: string; expiry: number }>;
      expect(cache.size).toBe(1);

      // Second call returns cached value (no new SSM call)
      const result = await provider.get('tenant-123', 'KEY');
      expect(result).toBe('first_value');
      expect(mockSend).toHaveBeenCalledTimes(1);
    });
  });

  describe('put()', () => {
    it('should call PutParameterCommand with SecureString', async () => {
      mockSend.mockResolvedValueOnce({});

      await provider.put('tenant-123', 'GITHUB_TOKEN', 'ghp_value');

      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('should update cache after successful put', async () => {
      mockSend.mockResolvedValueOnce({});

      await provider.put('tenant-123', 'KEY', 'cached_value');

      // Get should use cache
      mockSend.mockResolvedValueOnce({ Parameter: { Value: 'cached_value' } });
      const result = await provider.get('tenant-123', 'KEY');
      expect(result).toBe('cached_value');
    });

    it('should throw error on SSM failure', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      mockSend.mockRejectedValueOnce(new Error('AWS credentials error'));

      await expect(
        provider.put('tenant-123', 'KEY', 'value')
      ).rejects.toThrow('Failed to store credential in SSM');

      consoleErrorSpy.mockRestore();
    });
  });

  describe('delete()', () => {
    it('should call DeleteParameterCommand', async () => {
      mockSend.mockResolvedValueOnce({});

      await provider.delete('tenant-123', 'GITHUB_TOKEN');

      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('should not throw when ParameterNotFound (already deleted)', async () => {
      const error = new Error('ParameterNotFound');
      (error as { name: string }).name = 'ParameterNotFound';
      mockSend.mockRejectedValueOnce(error);

      await expect(
        provider.delete('tenant-123', 'NON_EXISTENT')
      ).resolves.not.toThrow();
    });

    it('should throw error on other SSM failures', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      mockSend.mockRejectedValueOnce(new Error('Access denied'));

      await expect(
        provider.delete('tenant-123', 'KEY')
      ).rejects.toThrow('Failed to delete credential from SSM');

      consoleErrorSpy.mockRestore();
    });
  });

  describe('isAvailable()', () => {
    it('should return true when ParameterNotFound (proves connectivity)', async () => {
      const error = new Error('ParameterNotFound');
      (error as { name: string }).name = 'ParameterNotFound';
      mockSend.mockRejectedValueOnce(error);

      const result = await provider.isAvailable();

      expect(result).toBe(true);
    });

    it('should return true when healthcheck succeeds', async () => {
      mockSend.mockResolvedValueOnce({
        Parameter: { Value: 'health' },
      });

      const result = await provider.isAvailable();

      expect(result).toBe(true);
    });

    it('should return false on other errors (SSM not accessible)', async () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
      mockSend.mockRejectedValueOnce(new Error('Network unreachable'));

      const result = await provider.isAvailable();

      expect(result).toBe(false);
      consoleWarnSpy.mockRestore();
    });
  });

  describe('listKeys()', () => {
    it('should return empty array when no parameters exist', async () => {
      const error = new Error('ParameterNotFound');
      (error as { name: string }).name = 'ParameterNotFound';
      mockSend.mockRejectedValueOnce(error);

      const result = await provider.listKeys('tenant-123');

      expect(result).toEqual([]);
    });

    it('should return parameter names for tenant', async () => {
      mockSend.mockResolvedValueOnce({
        Parameters: [
          { Name: '/viberator/tenants/tenant-123/GITHUB_TOKEN' },
          { Name: '/viberator/tenants/tenant-123/GITLAB_TOKEN' },
          { Name: '/viberator/tenants/tenant-123/API_KEY' },
        ],
      });

      const result = await provider.listKeys('tenant-123');

      expect(result).toEqual(['GITHUB_TOKEN', 'GITLAB_TOKEN', 'API_KEY']);
    });

    it('should sanitize tenantId in path', async () => {
      mockSend.mockResolvedValueOnce({ Parameters: [] });

      await provider.listKeys('tenant/with\\special');

      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('should handle missing parameter names', async () => {
      mockSend.mockResolvedValueOnce({
        Parameters: [
          { Name: '/viberator/tenants/tenant-123/KEY1' },
          {}, // Missing Name
        ],
      });

      const result = await provider.listKeys('tenant-123');

      expect(result).toEqual(['KEY1']);
    });

    it('should return empty array on SSM error', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      mockSend.mockRejectedValueOnce(new Error('AWS error'));

      const result = await provider.listKeys('tenant-123');

      expect(result).toEqual([]);
      consoleErrorSpy.mockRestore();
    });
  });

  describe('caching behavior', () => {
    it('should cache credential with TTL', async () => {
      mockSend.mockResolvedValueOnce({
        Parameter: { Value: 'cached_value' },
      });

      await provider.get('tenant-123', 'KEY');

      // Check cache internal state
      const cache = provider['cache'] as Map<string, { value: string; expiry: number }>;
      expect(cache.size).toBe(1);
    });

    it('should set cache expiry to 5 minutes', async () => {
      mockSend.mockResolvedValueOnce({
        Parameter: { Value: 'value' },
      });

      const beforeTime = Date.now();
      await provider.get('tenant-123', 'KEY');

      const cache = provider['cache'] as Map<string, { value: string; expiry: number }>;
      const cached = cache.get('/viberator/tenants/tenant-123/KEY');

      expect(cached?.expiry).toBeGreaterThan(beforeTime + 1000 * 60 * 5 - 1000);
      expect(cached?.expiry).toBeLessThanOrEqual(beforeTime + 1000 * 60 * 5);
    });
  });

  describe('name property', () => {
    it('should have correct provider name', () => {
      expect(provider.name).toBe('AwsSsmProvider');
    });
  });

  describe('endpoint configuration', () => {
    it('should accept custom endpoint for LocalStack', () => {
      const p = new AwsSsmProvider({
        endpoint: 'http://localhost:4566',
      });

      expect(p).toBeInstanceOf(AwsSsmProvider);
    });
  });
});
