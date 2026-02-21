import crypto from "node:crypto";
import {
  SecretDAO,
  SecretLocation,
  SecretRecord,
} from "../persistence/secret/SecretDAO";
import {
  DeleteParameterCommand,
  GetParameterCommand,
  PutParameterCommand,
  SSMClient,
} from "@aws-sdk/client-ssm";
import { createChildLogger } from "../config/logger";

const logger = createChildLogger({ service: "SecretService" });

const IV_LENGTH = 12;
const MAX_SSM_SECRET_SIZE_BYTES = 3900;

export interface SecretInput {
  name: string;
  secretLocation: SecretLocation;
  secretPath?: string | null;
  secretValue?: string;
}

export interface SecretUpdate {
  name?: string;
  secretLocation?: SecretLocation;
  secretPath?: string | null;
  secretValue?: string;
}

export interface SecretMetadata {
  id: string;
  name: string;
  secretLocation: SecretLocation;
  secretPath: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export class SecretService {
  private secretDao = new SecretDAO();
  private ssmClient?: SSMClient;
  private encryptionKey?: Buffer;
  private ssmPrefix: string;

  constructor() {
    this.ssmPrefix = process.env.SECRETS_SSM_PREFIX || "/viberator/secrets";
    if (this.ssmPrefix.endsWith("/")) {
      this.ssmPrefix = this.ssmPrefix.slice(0, -1);
    }
  }

  async listSecrets(limit = 50, offset = 0): Promise<SecretMetadata[]> {
    const secrets = await this.secretDao.listSecrets(limit, offset);
    return secrets.map((secret) => this.toMetadata(secret));
  }

  async getSecret(id: string): Promise<SecretMetadata | null> {
    const secret = await this.secretDao.getSecret(id);
    if (!secret) return null;
    return this.toMetadata(secret);
  }

  async createSecret(input: SecretInput): Promise<SecretMetadata> {
    const name = input.name.trim();
    if (!name) {
      throw new Error("Secret name is required");
    }

    const existing = await this.secretDao.getSecretByName(name);
    if (existing) {
      throw new Error("Secret name already exists");
    }

    const secretLocation = input.secretLocation;
    const normalizedPath = this.normalizePath(input.secretPath);

    let secretPath: string | null = normalizedPath;
    let secretValueEncrypted: string | null = null;

    if (secretLocation === "env") {
      secretPath = null;
    }

    if (secretLocation === "database") {
      if (input.secretValue === undefined) {
        throw new Error("Secret value is required for database storage");
      }
      secretValueEncrypted = await this.encryptSecret(input.secretValue);
      secretPath = null;
    }

    if (secretLocation === "ssm") {
      if (input.secretValue === undefined) {
        throw new Error("Secret value is required for SSM storage");
      }
      secretPath = this.buildSsmPath(name, normalizedPath);
      await this.putSsmSecret(secretPath, input.secretValue);
    }

    const record = await this.secretDao.createSecret({
      name,
      secretLocation,
      secretPath,
      secretValueEncrypted,
    });

    return this.toMetadata(record);
  }

  async updateSecret(
    id: string,
    updates: SecretUpdate,
  ): Promise<SecretMetadata> {
    const existing = await this.secretDao.getSecret(id);
    if (!existing) {
      throw new Error("Secret not found");
    }

    const nextName = updates.name?.trim() || existing.name;
    const nextLocation = updates.secretLocation || existing.secretLocation;
    const normalizedPath =
      updates.secretPath !== undefined
        ? this.normalizePath(updates.secretPath)
        : existing.secretPath;

    let nextPath: string | null = null;
    let nextEncrypted: string | null = null;

    if (nextLocation === "database") {
      if (updates.secretValue !== undefined) {
        nextEncrypted = await this.encryptSecret(updates.secretValue);
      } else if (existing.secretLocation === "database") {
        nextEncrypted = existing.secretValueEncrypted;
      }

      if (!nextEncrypted) {
        throw new Error("Secret value is required for database storage");
      }
    }

    if (nextLocation === "ssm") {
      nextPath = this.buildSsmPath(nextName, normalizedPath);
      const ssmValue = await this.getSsmUpdateValue(
        existing,
        updates.secretValue,
        nextPath,
      );

      await this.putSsmSecret(nextPath, ssmValue);

      if (
        existing.secretLocation === "ssm" &&
        existing.secretPath &&
        existing.secretPath !== nextPath
      ) {
        await this.deleteSsmSecret(existing.secretPath);
      }
    }

    if (existing.secretLocation === "ssm" && nextLocation !== "ssm") {
      if (existing.secretPath) {
        await this.deleteSsmSecret(existing.secretPath);
      }
    }

    if (nextLocation === "env") {
      nextPath = null;
      nextEncrypted = null;
    }

    if (nextLocation === "database") {
      nextPath = null;
    }

    const record = await this.secretDao.updateSecret(id, {
      name: nextName,
      secretLocation: nextLocation,
      secretPath: nextPath,
      secretValueEncrypted: nextEncrypted,
    });

    if (!record) {
      throw new Error("Secret not found");
    }

    return this.toMetadata(record);
  }

  async deleteSecret(id: string): Promise<boolean> {
    const existing = await this.secretDao.getSecret(id);
    if (!existing) return false;

    if (existing.secretLocation === "ssm" && existing.secretPath) {
      await this.deleteSsmSecret(existing.secretPath);
    }

    return this.secretDao.deleteSecret(id);
  }

  async resolveSecrets(): Promise<Record<string, string>> {
    const secrets = await this.secretDao.listSecrets(200, 0);
    const entries = await Promise.all(
      secrets.map(async (secret) => {
        const value = await this.resolveSecretValue(secret);
        return [secret.name, value] as const;
      }),
    );

    return Object.fromEntries(entries);
  }

  async upsertWorkerAuthCache(
    name: string,
    authJson: string,
  ): Promise<SecretMetadata> {
    const normalizedName = name.trim();
    if (!normalizedName) {
      throw new Error("Secret name is required");
    }
    if (!authJson || authJson.trim().length === 0) {
      throw new Error("Auth cache payload is required");
    }

    const payloadBytes = Buffer.byteLength(authJson, "utf-8");
    if (payloadBytes > MAX_SSM_SECRET_SIZE_BYTES) {
      throw new Error(
        `Codex auth cache exceeds SSM size limit (${payloadBytes} bytes)`,
      );
    }

    const existing = await this.secretDao.getSecretByName(normalizedName);
    if (existing) {
      return this.updateSecret(existing.id, {
        secretLocation: "ssm",
        secretValue: authJson,
        secretPath: existing.secretPath,
      });
    }

    return this.createSecret({
      name: normalizedName,
      secretLocation: "ssm",
      secretValue: authJson,
    });
  }

  private async resolveSecretValue(secret: SecretRecord): Promise<string> {
    if (secret.secretLocation === "env") {
      const value = process.env[secret.name];
      if (!value) {
        throw new Error(
          `Environment variable ${secret.name} is not set for secret resolution`,
        );
      }
      return value;
    }

    if (secret.secretLocation === "database") {
      if (!secret.secretValueEncrypted) {
        throw new Error(
          `Database secret ${secret.name} is missing encrypted value`,
        );
      }
      return this.decryptSecret(secret.secretValueEncrypted);
    }

    if (secret.secretLocation === "ssm") {
      const path = this.buildSsmPath(secret.name, secret.secretPath);
      const value = await this.getSsmSecret(path);
      if (!value) {
        throw new Error(`SSM secret not found at path ${path}`);
      }
      return value;
    }

    throw new Error(`Unsupported secret location: ${secret.secretLocation}`);
  }

  private normalizePath(path?: string | null): string | null {
    if (!path) return null;
    const trimmed = path.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private buildSsmPath(name: string, path?: string | null): string {
    if (path) {
      return path;
    }

    const normalizedName = name.replace(/^\/+/, "");
    return `${this.ssmPrefix}/${normalizedName}`;
  }

  private getSsmClient(): SSMClient {
    if (!this.ssmClient) {
      this.ssmClient = new SSMClient({
        region: process.env.AWS_REGION || "eu-west-1",
      });
    }
    return this.ssmClient;
  }

  private async getSsmSecret(path: string): Promise<string | null> {
    try {
      const response = await this.getSsmClient().send(
        new GetParameterCommand({
          Name: path,
          WithDecryption: true,
        }),
      );
      return response.Parameter?.Value || null;
    } catch (error) {
      const errorName = (error as { name?: string }).name;
      if (errorName === "ParameterNotFound") {
        return null;
      }
      logger.error("Failed to read SSM secret", {
        path,
        error: (error as Error).message,
      });
      throw new Error(`Failed to read SSM secret at ${path}`);
    }
  }

  private async putSsmSecret(path: string, value: string): Promise<void> {
    try {
      await this.getSsmClient().send(
        new PutParameterCommand({
          Name: path,
          Value: value,
          Type: "SecureString",
          Overwrite: true,
        }),
      );
    } catch (error) {
      logger.error("Failed to write SSM secret", {
        path,
        error: (error as Error).message,
      });
      throw new Error(`Failed to store secret in SSM at ${path}`);
    }
  }

  private async deleteSsmSecret(path: string): Promise<void> {
    try {
      await this.getSsmClient().send(
        new DeleteParameterCommand({
          Name: path,
        }),
      );
    } catch (error) {
      const errorName = (error as { name?: string }).name;
      if (errorName === "ParameterNotFound") {
        return;
      }
      logger.error("Failed to delete SSM secret", {
        path,
        error: (error as Error).message,
      });
      throw new Error(`Failed to delete SSM secret at ${path}`);
    }
  }

  private async getSsmUpdateValue(
    existing: SecretRecord,
    nextValue: string | undefined,
    nextPath: string,
  ): Promise<string> {
    if (nextValue !== undefined) {
      return nextValue;
    }

    if (existing.secretLocation === "ssm" && existing.secretPath) {
      const currentValue = await this.getSsmSecret(existing.secretPath);
      if (currentValue) {
        return currentValue;
      }
    }

    throw new Error(`Secret value is required for SSM storage at ${nextPath}`);
  }

  private getEncryptionKey(): Buffer {
    if (!this.encryptionKey) {
      const key = process.env.SECRETS_ENCRYPTION_KEY;
      if (!key) {
        throw new Error(
          "SECRETS_ENCRYPTION_KEY environment variable must be set",
        );
      }
      this.encryptionKey = crypto.createHash("sha256").update(key).digest();
    }
    return this.encryptionKey;
  }

  private async encryptSecret(secret: string): Promise<string> {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(
      "aes-256-gcm",
      this.getEncryptionKey(),
      iv,
    );

    let ciphertext = cipher.update(secret, "utf8", "binary");
    ciphertext += cipher.final("binary");
    const authTag = cipher.getAuthTag();

    return [
      iv.toString("base64"),
      Buffer.from(ciphertext, "binary").toString("base64"),
      authTag.toString("base64"),
    ].join(":");
  }

  private decryptSecret(encrypted: string): string {
    const parts = encrypted.split(":");
    if (parts.length !== 3) {
      throw new Error(
        "Invalid encrypted secret format. Expected: iv:ciphertext:authTag",
      );
    }

    const [ivBase64, ciphertextBase64, authTagBase64] = parts;
    const iv = Buffer.from(ivBase64, "base64");
    const ciphertext = Buffer.from(ciphertextBase64, "base64");
    const authTag = Buffer.from(authTagBase64, "base64");

    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      this.getEncryptionKey(),
      iv,
    );
    decipher.setAuthTag(authTag);

    let plaintext = decipher.update(ciphertext);
    plaintext = Buffer.concat([plaintext, decipher.final()]);

    return plaintext.toString("utf8");
  }

  private toMetadata(secret: SecretRecord): SecretMetadata {
    return {
      id: secret.id,
      name: secret.name,
      secretLocation: secret.secretLocation,
      secretPath: secret.secretPath,
      createdAt: secret.createdAt,
      updatedAt: secret.updatedAt,
    };
  }
}
