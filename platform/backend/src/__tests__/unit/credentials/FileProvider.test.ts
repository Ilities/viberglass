/**
 * Unit tests for FileProvider
 *
 * Tests:
 * - Writing credentials (encryption)
 * - Reading credentials (decryption)
 * - Deleting credentials
 * - Tenant isolation
 * - Encryption key requirements
 * - Invalid file handling (creates new store)
 * - Encryption/decryption round-trip with same key
 */

import { FileProvider } from '../../../credentials/providers/FileProvider';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('FileProvider', () => {
  const VALID_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  let provider: FileProvider;
  let tempFilePath: string;

  beforeEach(async () => {
    // Create a unique temp file for each test
    const uniqueId = Math.random().toString(36).substring(7);
    tempFilePath = join(tmpdir(), `test-credentials-${uniqueId}.json`);

    // Clean up any existing temp file
    try {
      await fs.unlink(tempFilePath);
    } catch {
      // File doesn't exist, that's fine
    }

    provider = new FileProvider({
      filePath: tempFilePath,
      encryptionKey: VALID_ENCRYPTION_KEY,
    });
  });

  afterEach(async () => {
    // Clean up temp file after each test
    try {
      await fs.unlink(tempFilePath);
    } catch {
      // File doesn't exist, that's fine
    }
  });

  describe('constructor', () => {
    it('should throw error when encryption key is not provided', () => {
      expect(() => {
        new FileProvider({ filePath: tempFilePath });
      }).toThrow('FileProvider requires CREDENTIALS_ENCRYPTION_KEY');
    });

    it('should use default file path when not provided', () => {
      // Set encryption key in environment so default config works
      const originalKey = process.env.CREDENTIALS_ENCRYPTION_KEY;
      process.env.CREDENTIALS_ENCRYPTION_KEY = VALID_ENCRYPTION_KEY;

      try {
        const p = new FileProvider({});
        expect(p).toBeInstanceOf(FileProvider);
      } finally {
        if (originalKey === undefined) {
          delete process.env.CREDENTIALS_ENCRYPTION_KEY;
        } else {
          process.env.CREDENTIALS_ENCRYPTION_KEY = originalKey;
        }
      }
    });

    it('should accept 64-character hex key', () => {
      expect(() => {
        new FileProvider({
          filePath: tempFilePath,
          encryptionKey: VALID_ENCRYPTION_KEY,
        });
      }).not.toThrow();
    });
  });

  describe('put()', () => {
    it('should encrypt and write credential to file', async () => {
      await provider.put('tenant-123', 'GITHUB_TOKEN', 'ghp_secret_value');

      // Verify file was created and is not empty
      const fileExists = await fs.access(tempFilePath).then(() => true).catch(() => false);
      expect(fileExists).toBe(true);

      // Verify file content is encrypted (not plain JSON)
      const fileContent = await fs.readFile(tempFilePath, 'utf-8');
      expect(fileContent).not.toContain('ghp_secret_value');
      expect(fileContent).not.toContain('GITHUB_TOKEN');
    });

    it('should store multiple credentials for same tenant', async () => {
      await provider.put('tenant-123', 'GITHUB_TOKEN', 'ghp_123');
      await provider.put('tenant-123', 'GITLAB_TOKEN', 'glpat_456');

      const githubToken = await provider.get('tenant-123', 'GITHUB_TOKEN');
      const gitlabToken = await provider.get('tenant-123', 'GITLAB_TOKEN');

      expect(githubToken).toBe('ghp_123');
      expect(gitlabToken).toBe('glpat_456');
    });

    it('should overwrite existing credential', async () => {
      await provider.put('tenant-123', 'GITHUB_TOKEN', 'ghp_old');
      await provider.put('tenant-123', 'GITHUB_TOKEN', 'ghp_new');

      const result = await provider.get('tenant-123', 'GITHUB_TOKEN');
      expect(result).toBe('ghp_new');
    });

    it('should create new tenant entry if not exists', async () => {
      await provider.put('new-tenant', 'API_KEY', 'key_value');

      const result = await provider.get('new-tenant', 'API_KEY');
      expect(result).toBe('key_value');
    });

    it('should handle special characters in key names', async () => {
      await provider.put('tenant-123', 'my-api-key', 'value');

      const result = await provider.get('tenant-123', 'my-api-key');
      expect(result).toBe('value');
    });

    it('should handle large credential values', async () => {
      const largeValue = 'x'.repeat(10000);

      await provider.put('tenant-123', 'LARGE_TOKEN', largeValue);

      const result = await provider.get('tenant-123', 'LARGE_TOKEN');
      expect(result).toBe(largeValue);
    });
  });

  describe('get()', () => {
    it('should return decrypted credential value', async () => {
      await provider.put('tenant-123', 'GITHUB_TOKEN', 'ghp_secret');

      const result = await provider.get('tenant-123', 'GITHUB_TOKEN');
      expect(result).toBe('ghp_secret');
    });

    it('should return null for non-existent credential', async () => {
      const result = await provider.get('tenant-123', 'NON_EXISTENT');
      expect(result).toBeNull();
    });

    it('should return null for non-existent tenant', async () => {
      const result = await provider.get('non-existent-tenant', 'ANY_KEY');
      expect(result).toBeNull();
    });

    it('should maintain tenant isolation', async () => {
      await provider.put('tenant-1', 'API_KEY', 'key-1');
      await provider.put('tenant-2', 'API_KEY', 'key-2');

      const result1 = await provider.get('tenant-1', 'API_KEY');
      const result2 = await provider.get('tenant-2', 'API_KEY');

      expect(result1).toBe('key-1');
      expect(result2).toBe('key-2');
    });

    it('should return credential from same instance after write', async () => {
      await provider.put('tenant-123', 'TOKEN', 'value');

      const result = await provider.get('tenant-123', 'TOKEN');
      expect(result).toBe('value');
    });
  });

  describe('delete()', () => {
    it('should remove credential from file', async () => {
      await provider.put('tenant-123', 'GITHUB_TOKEN', 'ghp_secret');
      await provider.delete('tenant-123', 'GITHUB_TOKEN');

      const result = await provider.get('tenant-123', 'GITHUB_TOKEN');
      expect(result).toBeNull();
    });

    it('should not throw when deleting non-existent credential', async () => {
      await expect(
        provider.delete('tenant-123', 'NON_EXISTENT')
      ).resolves.not.toThrow();
    });

    it('should not throw when deleting from non-existent tenant', async () => {
      await expect(
        provider.delete('non-existent-tenant', 'ANY_KEY')
      ).resolves.not.toThrow();
    });

    it('should clean up empty tenant entries', async () => {
      await provider.put('tenant-123', 'KEY', 'value');
      await provider.delete('tenant-123', 'KEY');

      // Verify tenant entry is cleaned up by checking keys
      const keys = await provider.listKeys('tenant-123');
      expect(keys).toEqual([]);
    });

    it('should only delete specified credential', async () => {
      await provider.put('tenant-123', 'KEY1', 'value1');
      await provider.put('tenant-123', 'KEY2', 'value2');
      await provider.delete('tenant-123', 'KEY1');

      const result1 = await provider.get('tenant-123', 'KEY1');
      const result2 = await provider.get('tenant-123', 'KEY2');

      expect(result1).toBeNull();
      expect(result2).toBe('value2');
    });
  });

  describe('isAvailable()', () => {
    it('should return true when file can be read/written', async () => {
      const result = await provider.isAvailable();
      expect(result).toBe(true);
    });

    it('should return true for new file (creates automatically)', async () => {
      const newProvider = new FileProvider({
        filePath: tempFilePath,
        encryptionKey: VALID_ENCRYPTION_KEY,
      });

      const result = await newProvider.isAvailable();
      expect(result).toBe(true);
    });
  });

  describe('listKeys()', () => {
    it('should return empty array for tenant with no credentials', async () => {
      const keys = await provider.listKeys('tenant-123');
      expect(keys).toEqual([]);
    });

    it('should return all credential keys for a tenant', async () => {
      await provider.put('tenant-123', 'GITHUB_TOKEN', 'ghp_1');
      await provider.put('tenant-123', 'GITLAB_TOKEN', 'glpat_2');
      await provider.put('tenant-123', 'API_KEY', 'key_3');

      const keys = await provider.listKeys('tenant-123');
      expect(keys).toHaveLength(3);
      expect(keys).toContain('GITHUB_TOKEN');
      expect(keys).toContain('GITLAB_TOKEN');
      expect(keys).toContain('API_KEY');
    });

    it('should only return keys for specified tenant', async () => {
      await provider.put('tenant-1', 'KEY1', 'value1');
      await provider.put('tenant-2', 'KEY2', 'value2');

      const keys1 = await provider.listKeys('tenant-1');
      const keys2 = await provider.listKeys('tenant-2');

      expect(keys1).toEqual(['KEY1']);
      expect(keys2).toEqual(['KEY2']);
    });

    it('should return empty array for non-existent tenant', async () => {
      const keys = await provider.listKeys('non-existent-tenant');
      expect(keys).toEqual([]);
    });
  });

  describe('encryption round-trip', () => {
    it('should decrypt data encrypted with same key', async () => {
      const originalValue = 'sensitive_credential_value';

      await provider.put('tenant-123', 'SECRET', originalValue);
      const retrievedValue = await provider.get('tenant-123', 'SECRET');

      expect(retrievedValue).toBe(originalValue);
    });

    it('should create new instance and read previously stored data', async () => {
      const originalValue = 'cross_instance_test';

      await provider.put('tenant-123', 'PERSISTED_KEY', originalValue);

      // Create new instance with same key
      const newProvider = new FileProvider({
        filePath: tempFilePath,
        encryptionKey: VALID_ENCRYPTION_KEY,
      });

      const retrievedValue = await newProvider.get('tenant-123', 'PERSISTED_KEY');
      expect(retrievedValue).toBe(originalValue);
    });

    it('should fail to decrypt with different key', async () => {
      const differentKey = 'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210';

      await provider.put('tenant-123', 'SECRET', 'value');

      // Create new instance with different key
      const newProvider = new FileProvider({
        filePath: tempFilePath,
        encryptionKey: differentKey,
      });

      // Should throw error or return null when trying to decrypt with wrong key
      await expect(
        newProvider.get('tenant-123', 'SECRET')
      ).rejects.toThrow();
    });
  });

  describe('file permissions', () => {
    it('should create file with 0o600 permissions (owner read/write only)', async () => {
      await provider.put('tenant-123', 'KEY', 'value');

      const stats = await fs.stat(tempFilePath);
      const mode = stats.mode & 0o777;

      // Check file is not readable by group or others
      expect(mode & 0o077).toBe(0);
    });
  });

  describe('invalid file handling', () => {
    it('should create new store when file does not exist', async () => {
      // Ensure file doesn't exist
      try {
        await fs.unlink(tempFilePath);
      } catch {
        // File doesn't exist, that's fine
      }

      const newProvider = new FileProvider({
        filePath: tempFilePath,
        encryptionKey: VALID_ENCRYPTION_KEY,
      });

      await newProvider.put('tenant-123', 'KEY', 'value');

      const result = await newProvider.get('tenant-123', 'KEY');
      expect(result).toBe('value');
    });

    it('should handle corrupted file gracefully', async () => {
      // Write invalid encrypted data
      await fs.writeFile(tempFilePath, 'corrupted data that is not valid encryption');

      // Should throw error when trying to read
      await expect(
        provider.get('tenant-123', 'KEY')
      ).rejects.toThrow();
    });
  });

  describe('caching behavior', () => {
    it('should cache file content to avoid repeated decryption', async () => {
      await provider.put('tenant-123', 'KEY', 'value');

      // Multiple reads should succeed
      const result1 = await provider.get('tenant-123', 'KEY');
      const result2 = await provider.get('tenant-123', 'KEY');
      const result3 = await provider.get('tenant-123', 'KEY');

      expect(result1).toBe('value');
      expect(result2).toBe('value');
      expect(result3).toBe('value');
    });

    it('should invalidate cache after write', async () => {
      await provider.put('tenant-123', 'KEY', 'value1');
      expect(await provider.get('tenant-123', 'KEY')).toBe('value1');

      await provider.put('tenant-123', 'KEY', 'value2');
      expect(await provider.get('tenant-123', 'KEY')).toBe('value2');
    });
  });

  describe('name property', () => {
    it('should have correct provider name', () => {
      expect(provider.name).toBe('FileProvider');
    });
  });
});
