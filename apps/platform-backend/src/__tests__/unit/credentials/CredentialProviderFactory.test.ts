/**
 * Unit tests for CredentialProviderFactory
 *
 * Tests:
 * - Fallback chain behavior (Environment -> File -> AWS)
 * - First success wins behavior
 * - Provider failure handling
 * - Logging which provider served request
 * - Write operations skip read-only providers
 * - listKeys uses first available provider
 * - Configuration error handling
 */

import { CredentialProviderFactory } from '../../../credentials/CredentialProviderFactory';
import { CredentialProvider } from '../../../credentials/CredentialProvider';
import { resetCredentialFactory } from '../../../config/credentials';

describe('CredentialProviderFactory', () => {
  // Reset singleton before each test
  beforeEach(() => {
    resetCredentialFactory();
    jest.clearAllMocks();
  });

  // Create mock provider helper
  function createMockProvider(name: string, available: boolean = true): CredentialProvider {
    const mockProvider = {
      name,
      isAvailable: jest.fn().mockResolvedValue(available),
      get: jest.fn().mockResolvedValue(null),
      put: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined),
      listKeys: jest.fn().mockResolvedValue([]),
    } as unknown as CredentialProvider;

    return mockProvider;
  }

  describe('constructor', () => {
    it('should throw when no providers are configured', () => {
      expect(() => {
        new CredentialProviderFactory({ environment: { enabled: false } });
      }).toThrow('No credential providers configured');
    });

    it('should initialize with only Environment provider', () => {
      const factory = new CredentialProviderFactory({
        environment: { enabled: true },
      });

      const providers = factory.getProviders();
      expect(providers).toHaveLength(1);
      expect(providers[0].name).toBe('EnvironmentProvider');
    });

    it('should initialize with File provider when encryption key is provided', () => {
      // Set environment variable for FileProvider
      const originalKey = process.env.CREDENTIALS_ENCRYPTION_KEY;
      process.env.CREDENTIALS_ENCRYPTION_KEY = '0'.repeat(64);

      try {
        const factory = new CredentialProviderFactory({
          environment: { enabled: true },
          file: {
            enabled: true,
            filePath: '/tmp/test-credentials.json',
            encryptionKey: '0'.repeat(64),
          },
        });

        const providers = factory.getProviders();
        expect(providers.length).toBeGreaterThanOrEqual(1);
        // Should have Environment and File providers
        expect(providers.some((p) => p.name === 'EnvironmentProvider')).toBe(true);
        expect(providers.some((p) => p.name === 'FileProvider')).toBe(true);
      } finally {
        if (originalKey === undefined) {
          delete process.env.CREDENTIALS_ENCRYPTION_KEY;
        } else {
          process.env.CREDENTIALS_ENCRYPTION_KEY = originalKey;
        }
      }
    });
  });

  describe('get()', () => {
    it('should try providers in order', async () => {
      const provider1 = createMockProvider('Provider1');
      const provider2 = createMockProvider('Provider2');

      const factory = new CredentialProviderFactory({ environment: { enabled: true } });
      factory['providers'] = [provider1, provider2];

      await factory.get('tenant-123', 'KEY');

      expect(provider1.get).toHaveBeenCalledTimes(1);
    });

    it('should return value from first provider that has it', async () => {
      const provider1 = createMockProvider('Provider1');
      (provider1.get as jest.Mock).mockResolvedValue('value1');

      const provider2 = createMockProvider('Provider2');

      const factory = new CredentialProviderFactory({ environment: { enabled: true } });
      factory['providers'] = [provider1, provider2];

      const result = await factory.get('tenant-123', 'KEY');

      expect(result).toBe('value1');
      expect(provider1.get).toHaveBeenCalledTimes(1);
      expect(provider2.get).not.toHaveBeenCalled();
    });

    it('should try next provider when first returns null', async () => {
      const provider1 = createMockProvider('Provider1');
      (provider1.get as jest.Mock).mockResolvedValue(null);

      const provider2 = createMockProvider('Provider2');
      (provider2.get as jest.Mock).mockResolvedValue('value2');

      const factory = new CredentialProviderFactory({ environment: { enabled: true } });
      factory['providers'] = [provider1, provider2];

      const result = await factory.get('tenant-123', 'KEY');

      expect(result).toBe('value2');
      expect(provider1.get).toHaveBeenCalledTimes(1);
      expect(provider2.get).toHaveBeenCalledTimes(1);
    });

    it('should try all providers and return null if none have value', async () => {
      const provider1 = createMockProvider('Provider1');
      (provider1.get as jest.Mock).mockResolvedValue(null);

      const provider2 = createMockProvider('Provider2');
      (provider2.get as jest.Mock).mockResolvedValue(null);

      const provider3 = createMockProvider('Provider3');
      (provider3.get as jest.Mock).mockResolvedValue(null);

      const factory = new CredentialProviderFactory({ environment: { enabled: true } });
      factory['providers'] = [provider1, provider2, provider3];

      const result = await factory.get('tenant-123', 'KEY');

      expect(result).toBeNull();
      expect(provider1.get).toHaveBeenCalledTimes(1);
      expect(provider2.get).toHaveBeenCalledTimes(1);
      expect(provider3.get).toHaveBeenCalledTimes(1);
    });

    it('should continue to next provider when one throws error', async () => {
      const provider1 = createMockProvider('Provider1');
      (provider1.get as jest.Mock).mockRejectedValue(new Error('Network error'));

      const provider2 = createMockProvider('Provider2');
      (provider2.get as jest.Mock).mockResolvedValue('value2');

      const factory = new CredentialProviderFactory({ environment: { enabled: true } });
      factory['providers'] = [provider1, provider2];

      const result = await factory.get('tenant-123', 'KEY');

      expect(result).toBe('value2');
    });

    it('should return null when all providers throw errors', async () => {
      const provider1 = createMockProvider('Provider1');
      (provider1.get as jest.Mock).mockRejectedValue(new Error('Error 1'));

      const provider2 = createMockProvider('Provider2');
      (provider2.get as jest.Mock).mockRejectedValue(new Error('Error 2'));

      const factory = new CredentialProviderFactory({ environment: { enabled: true } });
      factory['providers'] = [provider1, provider2];

      const result = await factory.get('tenant-123', 'KEY');

      expect(result).toBeNull();
    });
  });

  describe('put()', () => {
    it('should skip providers that throw read-only error', async () => {
      const provider1 = createMockProvider('Provider1');
      (provider1.put as jest.Mock).mockRejectedValue(new Error('read-only'));

      const provider2 = createMockProvider('Provider2');
      (provider2.put as jest.Mock).mockResolvedValue(undefined);

      const factory = new CredentialProviderFactory({ environment: { enabled: true } });
      factory['providers'] = [provider1, provider2];

      await factory.put('tenant-123', 'KEY', 'value');

      expect(provider2.put).toHaveBeenCalledWith('tenant-123', 'KEY', 'value');
    });

    it('should use first writable provider', async () => {
      const provider1 = createMockProvider('Provider1');
      (provider1.put as jest.Mock).mockRejectedValue(new Error('read-only'));

      const provider2 = createMockProvider('Provider2');
      (provider2.put as jest.Mock).mockResolvedValue(undefined);

      const factory = new CredentialProviderFactory({ environment: { enabled: true } });
      factory['providers'] = [provider1, provider2];

      await factory.put('tenant-123', 'KEY', 'value');

      expect(provider2.put).toHaveBeenCalledTimes(1);
    });

    it('should throw when no writable provider available', async () => {
      const provider1 = createMockProvider('Provider1');
      (provider1.put as jest.Mock).mockRejectedValue(new Error('read-only'));

      const factory = new CredentialProviderFactory({ environment: { enabled: true } });
      factory['providers'] = [provider1];

      await expect(factory.put('tenant-123', 'KEY', 'value')).rejects.toThrow(
        'No writable credential provider available'
      );
    });

    it('should throw on non-read-only errors', async () => {
      const provider1 = createMockProvider('Provider1');
      (provider1.put as jest.Mock).mockRejectedValue(new Error('Network error'));

      const factory = new CredentialProviderFactory({ environment: { enabled: true } });
      factory['providers'] = [provider1];

      await expect(factory.put('tenant-123', 'KEY', 'value')).rejects.toThrow('Network error');
    });
  });

  describe('delete()', () => {
    it('should skip providers that throw read-only error', async () => {
      const provider1 = createMockProvider('Provider1');
      (provider1.delete as jest.Mock).mockRejectedValue(new Error('read-only'));

      const provider2 = createMockProvider('Provider2');
      (provider2.delete as jest.Mock).mockResolvedValue(undefined);

      const factory = new CredentialProviderFactory({ environment: { enabled: true } });
      factory['providers'] = [provider1, provider2];

      await factory.delete('tenant-123', 'KEY');

      expect(provider2.delete).toHaveBeenCalledWith('tenant-123', 'KEY');
    });

    it('should use first writable provider', async () => {
      const provider1 = createMockProvider('Provider1');
      (provider1.delete as jest.Mock).mockRejectedValue(new Error('read-only'));

      const provider2 = createMockProvider('Provider2');
      (provider2.delete as jest.Mock).mockResolvedValue(undefined);

      const factory = new CredentialProviderFactory({ environment: { enabled: true } });
      factory['providers'] = [provider1, provider2];

      await factory.delete('tenant-123', 'KEY');

      expect(provider2.delete).toHaveBeenCalledTimes(1);
    });

    it('should throw when no writable provider available', async () => {
      const provider1 = createMockProvider('Provider1');
      (provider1.delete as jest.Mock).mockRejectedValue(new Error('read-only'));

      const factory = new CredentialProviderFactory({ environment: { enabled: true } });
      factory['providers'] = [provider1];

      await expect(factory.delete('tenant-123', 'KEY')).rejects.toThrow(
        'No writable credential provider available'
      );
    });

    it('should throw on non-read-only errors', async () => {
      const provider1 = createMockProvider('Provider1');
      (provider1.delete as jest.Mock).mockRejectedValue(new Error('Network error'));

      const factory = new CredentialProviderFactory({ environment: { enabled: true } });
      factory['providers'] = [provider1];

      await expect(factory.delete('tenant-123', 'KEY')).rejects.toThrow('Network error');
    });
  });

  describe('isAvailable()', () => {
    it('should return true when at least one provider is available', async () => {
      const provider1 = createMockProvider('Provider1');
      (provider1.isAvailable as jest.Mock).mockResolvedValue(false);

      const provider2 = createMockProvider('Provider2');
      (provider2.isAvailable as jest.Mock).mockResolvedValue(true);

      const factory = new CredentialProviderFactory({ environment: { enabled: true } });
      factory['providers'] = [provider1, provider2];

      const result = await factory.isAvailable();

      expect(result).toBe(true);
    });

    it('should return false when no providers are available', async () => {
      const provider1 = createMockProvider('Provider1');
      (provider1.isAvailable as jest.Mock).mockResolvedValue(false);

      const provider2 = createMockProvider('Provider2');
      (provider2.isAvailable as jest.Mock).mockResolvedValue(false);

      const factory = new CredentialProviderFactory({ environment: { enabled: true } });
      factory['providers'] = [provider1, provider2];

      const result = await factory.isAvailable();

      expect(result).toBe(false);
    });

    it('should return true when first provider is available', async () => {
      const provider1 = createMockProvider('Provider1');
      (provider1.isAvailable as jest.Mock).mockResolvedValue(true);

      const factory = new CredentialProviderFactory({ environment: { enabled: true } });
      factory['providers'] = [provider1];

      const result = await factory.isAvailable();

      expect(result).toBe(true);
      expect(provider1.isAvailable).toHaveBeenCalledTimes(1);
    });

    it('should stop checking when finding available provider', async () => {
      const provider1 = createMockProvider('Provider1');
      (provider1.isAvailable as jest.Mock).mockResolvedValue(true);

      const provider2 = createMockProvider('Provider2');
      (provider2.isAvailable as jest.Mock).mockResolvedValue(true);

      const factory = new CredentialProviderFactory({ environment: { enabled: true } });
      factory['providers'] = [provider1, provider2];

      const result = await factory.isAvailable();

      expect(result).toBe(true);
      expect(provider1.isAvailable).toHaveBeenCalledTimes(1);
      expect(provider2.isAvailable).not.toHaveBeenCalled();
    });
  });

  describe('listKeys()', () => {
    it('should use first provider that returns non-empty keys', async () => {
      const provider1 = createMockProvider('Provider1');
      (provider1.listKeys as jest.Mock).mockResolvedValue(['KEY1', 'KEY2']);

      const provider2 = createMockProvider('Provider2');
      (provider2.listKeys as jest.Mock).mockResolvedValue(['KEY3']);

      const factory = new CredentialProviderFactory({ environment: { enabled: true } });
      factory['providers'] = [provider1, provider2];

      const result = await factory.listKeys('tenant-123');

      expect(result).toEqual(['KEY1', 'KEY2']);
      expect(provider1.listKeys).toHaveBeenCalledWith('tenant-123');
      expect(provider2.listKeys).not.toHaveBeenCalled();
    });

    it('should try next provider if first returns empty array', async () => {
      const provider1 = createMockProvider('Provider1');
      (provider1.listKeys as jest.Mock).mockResolvedValue([]);

      const provider2 = createMockProvider('Provider2');
      (provider2.listKeys as jest.Mock).mockResolvedValue(['KEY1']);

      const factory = new CredentialProviderFactory({ environment: { enabled: true } });
      factory['providers'] = [provider1, provider2];

      const result = await factory.listKeys('tenant-123');

      expect(result).toEqual(['KEY1']);
      expect(provider1.listKeys).toHaveBeenCalledWith('tenant-123');
      expect(provider2.listKeys).toHaveBeenCalledWith('tenant-123');
    });

    it('should handle provider that does not support listKeys', async () => {
      const provider1 = createMockProvider('Provider1');
      delete (provider1 as any).listKeys;

      const provider2 = createMockProvider('Provider2');
      (provider2.listKeys as jest.Mock).mockResolvedValue(['KEY1']);

      const factory = new CredentialProviderFactory({ environment: { enabled: true } });
      factory['providers'] = [provider1, provider2];

      const result = await factory.listKeys('tenant-123');

      expect(result).toEqual(['KEY1']);
    });

    it('should return empty array when no providers support listKeys', async () => {
      const provider1 = createMockProvider('Provider1');
      delete (provider1 as any).listKeys;

      const factory = new CredentialProviderFactory({ environment: { enabled: true } });
      factory['providers'] = [provider1];

      const result = await factory.listKeys('tenant-123');

      expect(result).toEqual([]);
    });

    it('should continue to next provider on listKeys error', async () => {
      const provider1 = createMockProvider('Provider1');
      (provider1.listKeys as jest.Mock).mockRejectedValue(new Error('Error'));

      const provider2 = createMockProvider('Provider2');
      (provider2.listKeys as jest.Mock).mockResolvedValue(['KEY1']);

      const factory = new CredentialProviderFactory({ environment: { enabled: true } });
      factory['providers'] = [provider1, provider2];

      const result = await factory.listKeys('tenant-123');

      expect(result).toEqual(['KEY1']);
    });
  });

  describe('getProviders()', () => {
    it('should return copy of providers array', async () => {
      const factory = new CredentialProviderFactory({ environment: { enabled: true } });
      const providers1 = factory.getProviders();
      const providers2 = factory.getProviders();

      expect(providers1).not.toBe(providers2);
      expect(providers1).toEqual(providers2);
    });

    it('should return all registered providers', () => {
      const factory = new CredentialProviderFactory({ environment: { enabled: true } });
      const providers = factory.getProviders();

      expect(providers.length).toBeGreaterThan(0);
      expect(providers[0].name).toBe('EnvironmentProvider');
    });
  });

  describe('name property', () => {
    it('should have correct factory name', () => {
      const factory = new CredentialProviderFactory({ environment: { enabled: true } });
      expect(factory.name).toBe('CredentialProviderFactory');
    });
  });
});
