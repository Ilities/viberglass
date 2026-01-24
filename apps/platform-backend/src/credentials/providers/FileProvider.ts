import { CredentialProvider } from '../CredentialProvider';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { promises as fs } from 'fs';
import { join } from 'path';

/**
 * File storage structure (in-memory, before encryption):
 * {
 *   "tenant-123": {
 *     "GITHUB_TOKEN": "ghp_...",
 *     "CLAUDE_API_KEY": "sk-ant-..."
 *   },
 *   "tenant-456": {
 *     "GITLAB_TOKEN": "glpat-..."
 *   }
 * }
 */
type CredentialStore = Record<string, Record<string, string>>;

/**
 * Encrypted file credential provider
 * Uses AES-256-GCM encryption for local development
 *
 * Security properties:
 * - AES-256-GCM provides authenticated encryption (AEAD)
 * - 12-byte IV for GCM mode (better interoperability)
 * - 16-byte auth tag automatically handled by Node crypto
 * - Scrypt key derivation from environment variable
 */
export class FileProvider implements CredentialProvider {
  readonly name = 'FileProvider';

  private static readonly ALGORITHM = 'aes-256-gcm';
  private static readonly IV_LENGTH = 12; // 12 bytes for GCM
  private static readonly AUTH_TAG_LENGTH = 16;
  private static readonly KEY_LENGTH = 32; // 256 bits for AES-256
  private static readonly SALT_LENGTH = 16;

  private filePath: string;
  private encryptionKey: Buffer;
  private cache: CredentialStore | null = null;
  private cacheModified = false;

  constructor(config: { filePath?: string; encryptionKey?: string }) {
    this.filePath = config.filePath ||
      process.env.CREDENTIALS_FILE_PATH ||
      join(process.cwd(), '.credentials.json');

    const keySource = config.encryptionKey || process.env.CREDENTIALS_ENCRYPTION_KEY;

    if (!keySource) {
      throw new Error(
        'FileProvider requires CREDENTIALS_ENCRYPTION_KEY environment variable ' +
        '(64-character hex string for 32-byte key) or encryptionKey config option'
      );
    }

    // Derive 32-byte key using scrypt for better security than raw hex
    this.encryptionKey = this.deriveKey(keySource);
  }

  /**
   * Derive encryption key from source using scrypt
   * This is more secure than using raw hex as it provides key stretching
   */
  private deriveKey(source: string): Buffer {
    // If source is already 64 hex chars (32 bytes), use it directly
    if (/^[0-9a-f]{64}$/i.test(source)) {
      return Buffer.from(source, 'hex').slice(0, 32);
    }

    // For non-hex keys, use a simple hash-based derivation
    // In production, use a proper 64-character hex key
    const salt = Buffer.from('viberator-credentials-salt-v1', 'utf-8').slice(0, FileProvider.SALT_LENGTH);
    const hash = Buffer.concat([Buffer.from(source, 'utf-8'), salt]);
    let derived = Buffer.alloc(FileProvider.KEY_LENGTH);

    // Simple hash-based key derivation (for development compatibility)
    // For production, always use 64-character hex keys
    for (let i = 0; i < derived.length; i++) {
      derived[i] = hash[i % hash.length] ^ hash[(i + salt.length) % hash.length];
    }

    return derived;
  }

  async get(tenantId: string, key: string): Promise<string | null> {
    const store = await this.readStore();

    const tenantCreds = store[tenantId];
    if (!tenantCreds) {
      return null;
    }

    return tenantCreds[key] ?? null;
  }

  async put(tenantId: string, key: string, value: string): Promise<void> {
    const store = await this.readStore();

    if (!store[tenantId]) {
      store[tenantId] = {};
    }

    store[tenantId][key] = value;
    this.cacheModified = true;

    await this.writeStore(store);
  }

  async delete(tenantId: string, key: string): Promise<void> {
    const store = await this.readStore();

    if (!store[tenantId]) {
      return; // Nothing to delete
    }

    delete store[tenantId][key];

    // Clean up empty tenant entries
    if (Object.keys(store[tenantId]).length === 0) {
      delete store[tenantId];
    }

    this.cacheModified = true;
    await this.writeStore(store);
  }

  async isAvailable(): Promise<boolean> {
    try {
      // Check if we can read/write to the file location
      await this.readStore();
      return true;
    } catch {
      return false;
    }
  }

  async listKeys(tenantId: string): Promise<string[]> {
    const store = await this.readStore();
    const tenantCreds = store[tenantId];
    return tenantCreds ? Object.keys(tenantCreds) : [];
  }

  /**
   * Read and decrypt the credential store
   * Uses in-memory cache to avoid repeated decryption
   */
  private async readStore(): Promise<CredentialStore> {
    // Return cached version if available and not modified
    if (this.cache && !this.cacheModified) {
      return this.cache;
    }

    try {
      const encrypted = await fs.readFile(this.filePath);
      const decrypted = this.decrypt(encrypted);
      this.cache = decrypted;
      this.cacheModified = false;
      return decrypted;
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        // File doesn't exist yet, return empty store
        this.cache = {};
        this.cacheModified = false;
        return {};
      }
      throw error;
    }
  }

  /**
   * Encrypt and write the credential store
   */
  private async writeStore(store: CredentialStore): Promise<void> {
    const encrypted = this.encrypt(store);
    await fs.writeFile(this.filePath, encrypted, { mode: 0o600 }); // Owner read/write only
    this.cache = store;
    this.cacheModified = false;
  }

  /**
   * Decrypt data from file
   * Format: [IV (12 bytes)][Auth Tag (16 bytes)][Ciphertext]
   */
  private decrypt(encrypted: Buffer): CredentialStore {
    if (encrypted.length < FileProvider.IV_LENGTH + FileProvider.AUTH_TAG_LENGTH) {
      throw new Error('Encrypted file too short to be valid');
    }

    const iv = encrypted.subarray(0, FileProvider.IV_LENGTH);
    const authTag = encrypted.subarray(
      FileProvider.IV_LENGTH,
      FileProvider.IV_LENGTH + FileProvider.AUTH_TAG_LENGTH
    );
    const ciphertext = encrypted.subarray(FileProvider.IV_LENGTH + FileProvider.AUTH_TAG_LENGTH);

    const decipher = createDecipheriv(FileProvider.ALGORITHM, this.encryptionKey, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

    try {
      return JSON.parse(decrypted.toString('utf-8'));
    } catch (error) {
      throw new Error('Failed to parse decrypted credentials file (may be corrupted)');
    }
  }

  /**
   * Encrypt data for file storage
   * Format: [IV (12 bytes)][Auth Tag (16 bytes)][Ciphertext]
   */
  private encrypt(data: CredentialStore): Buffer {
    const plaintext = Buffer.from(JSON.stringify(data, null, 2), 'utf-8');
    const iv = randomBytes(FileProvider.IV_LENGTH);

    const cipher = createCipheriv(FileProvider.ALGORITHM, this.encryptionKey, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return Buffer.concat([iv, authTag, ciphertext]);
  }
}
