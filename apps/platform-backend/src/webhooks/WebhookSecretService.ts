import * as crypto from "node:crypto";
import type { CredentialProvider } from "../credentials/CredentialProvider";
import type { SecretLocation, WebhookProviderConfig } from "./WebhookProvider";

/**
 * Webhook secret service
 *
 * Manages webhook secrets from multiple storage locations:
 * - database: Encrypted at rest in webhook_provider_configs table
 * - ssm: AWS Systems Manager Parameter Store via CredentialProvider
 * - env: Environment variables
 *
 * Provides AES-256-GCM encryption for database-stored secrets.
 */

const ENCRYPTION_KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 12; // 96 bits for GCM
const AUTH_TAG_LENGTH = 16; // 128 bits for GCM

export class WebhookSecretService {
  private encryptionKey: Buffer;

  constructor(private credentialProvider: CredentialProvider) {
    // Get encryption key from environment or generate
    const key = process.env.WEBHOOK_SECRET_ENCRYPTION_KEY;

    if (!key) {
      throw new Error(
        "WEBHOOK_SECRET_ENCRYPTION_KEY environment variable must be set"
      );
    }

    // Derive a 32-byte key from the environment variable
    this.encryptionKey = crypto
      .createHash("sha256")
      .update(key)
      .digest();
  }

  /**
   * Get webhook secret from configured storage location
   * @param config - Webhook provider configuration
   * @param projectId - Optional project/tenant ID for SSM lookups
   * @returns The plaintext webhook secret
   */
  async getSecret(
    config: WebhookProviderConfig,
    projectId?: string
  ): Promise<string> {
    const location = config.secretLocation ?? "database";

    switch (location) {
      case "database": {
        if (!config.webhookSecret) {
          throw new Error(
            "Webhook secret not found in configuration (database storage requested)"
          );
        }
        return config.webhookSecret;
      }

      case "ssm": {
        if (!config.secretPath) {
          throw new Error(
            "SSM secret path not configured (secretPath required for SSM storage)"
          );
        }
        if (!projectId) {
          throw new Error(
            "Project ID required for SSM secret lookup"
          );
        }

        const secret = await this.credentialProvider.get(
          projectId,
          config.secretPath
        );

        if (!secret) {
          throw new Error(
            `Secret not found in SSM at path: ${config.secretPath}`
          );
        }

        return secret;
      }

      case "env": {
        const envVar = config.secretPath || "WEBHOOK_SECRET";
        const secret = process.env[envVar];

        if (!secret) {
          throw new Error(
            `Environment variable ${envVar} not set (env storage requested)`
          );
        }

        return secret;
      }

      default:
        throw new Error(
          `Unsupported secret location: ${(location as string).toString()}`
        );
    }
  }

  /**
   * Get API token from configuration (for outbound calls)
   * @param config - Webhook provider configuration
   * @param projectId - Optional project/tenant ID for SSM lookups
   * @returns The plaintext API token
   */
  async getApiToken(
    config: WebhookProviderConfig,
    projectId?: string
  ): Promise<string> {
    if (!config.apiToken) {
      throw new Error("API token not configured");
    }
    return config.apiToken;
  }

  /**
   * Encrypt a secret for database storage
   * Uses AES-256-GCM with authenticated encryption
   * @param secret - Plaintext secret to encrypt
   * @returns Encrypted secret in format: base64(iv):base64(ciphertext):base64(authTag)
   */
  async encryptSecret(secret: string): Promise<string> {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(
      "aes-256-gcm",
      this.encryptionKey,
      iv
    );

    let ciphertext = cipher.update(secret, "utf8", "binary");
    ciphertext += cipher.final("binary");

    const authTag = cipher.getAuthTag();

    // Format: iv:ciphertext:authTag (all base64 encoded)
    return [
      iv.toString("base64"),
      Buffer.from(ciphertext, "binary").toString("base64"),
      authTag.toString("base64"),
    ].join(":");
  }

  /**
   * Decrypt a secret from database storage
   * @param encrypted - Encrypted secret in format: base64(iv):base64(ciphertext):base64(authTag)
   * @returns Decrypted plaintext secret
   */
  async decryptSecret(encrypted: string): Promise<string> {
    const parts = encrypted.split(":");

    if (parts.length !== 3) {
      throw new Error(
        "Invalid encrypted secret format. Expected: iv:ciphertext:authTag"
      );
    }

    const [ivBase64, ciphertextBase64, authTagBase64] = parts;

    const iv = Buffer.from(ivBase64, "base64");
    const ciphertext = Buffer.from(ciphertextBase64, "base64");
    const authTag = Buffer.from(authTagBase64, "base64");

    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      this.encryptionKey,
      iv
    );

    decipher.setAuthTag(authTag);

    let plaintext = decipher.update(ciphertext);
    plaintext = Buffer.concat([plaintext, decipher.final()]);

    return plaintext.toString("utf8");
  }

  /**
   * Generate a cryptographically secure random webhook secret
   * @returns Random secret suitable for webhook signing
   */
  generateSecret(length = 32): string {
    return crypto.randomBytes(length).toString("base64");
  }

  /**
   * Verify if a secret matches an encrypted value
   * Useful for validation before updating configuration
   */
  async verifySecret(
    plaintext: string,
    encrypted: string
  ): Promise<boolean> {
    try {
      const decrypted = await this.decryptSecret(encrypted);
      return crypto.timingSafeEqual(
        Buffer.from(plaintext),
        Buffer.from(decrypted)
      );
    } catch {
      return false;
    }
  }
}
