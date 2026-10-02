import crypto from "node:crypto";
import { ENV_VAR_NAME_PATTERN, type ModelProviderId } from "@viberglass/types";
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
import { gzipSync } from "node:zlib";
import { createChildLogger } from "../config/logger";
import {
  SECRET_SERVICE_ERROR_CODE,
  SecretServiceError,
} from "./errors/SecretServiceError";
import { secretsSsmPrefix } from "./secretStorageDefaults";

const logger = createChildLogger({ service: "SecretService" });

const IV_LENGTH = 12;
const MAX_SSM_SECRET_SIZE_BYTES = 3900;
const CODEX_AUTH_GZIP_PREFIX = "gz+b64:";

export function compactJsonForStorage(jsonContent: string): string {
  const trimmed = jsonContent.trim();
  if (!trimmed) {
    return "";
  }

  try {
    const parsed = JSON.parse(trimmed);
    return JSON.stringify(parsed);
  } catch {
    return trimmed;
  }
}

export function encodeCodexAuthForSsm(authJson: string): string {
  const compacted = compactJsonForStorage(authJson);
  if (!compacted) {
    return "";
  }

  const compactedBytes = Buffer.byteLength(compacted, "utf-8");
  if (compactedBytes <= MAX_SSM_SECRET_SIZE_BYTES) {
    return compacted;
  }

  const gzipped = gzipSync(Buffer.from(compacted, "utf-8"), { level: 9 });
  return `${CODEX_AUTH_GZIP_PREFIX}${gzipped.toString("base64")}`;
}

export interface SecretInput {
  name: string;
  secretLocation: SecretLocation;
  secretPath?: string | null;
  sourceEnvVar?: string | null;
  provider?: ModelProviderId | null;
  secretValue?: string;
}

export interface SecretUpdate {
  name?: string;
  secretLocation?: SecretLocation;
  secretPath?: string | null;
  sourceEnvVar?: string | null;
  provider?: ModelProviderId | null;
  secretValue?: string;
}

export interface SecretMetadata {
  id: string;
  name: string;
  secretLocation: SecretLocation;
  secretPath: string | null;
  sourceEnvVar: string | null;
  provider: ModelProviderId | null;
  createdAt: Date;
  updatedAt: Date;
}

export class SecretService {
  private secretDao = new SecretDAO();
  private ssmClient?: SSMClient;
  private encryptionKey?: Buffer;
  private ssmPrefix: string;

  constructor() {
    this.ssmPrefix = secretsSsmPrefix();
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
      throw new SecretServiceError(
        SECRET_SERVICE_ERROR_CODE.SECRET_NAME_REQUIRED,
        "Secret name is required",
      );
    }

    const id = crypto.randomUUID();
    const secretLocation = input.secretLocation;
    const normalizedPath = this.normalizePath(input.secretPath);

    let secretPath: string | null = normalizedPath;
    let secretValueEncrypted: string | null = null;
    let sourceEnvVar: string | null = null;

    if (secretLocation === "env") {
      sourceEnvVar = this.requireSourceEnvVar(input.sourceEnvVar);
      secretPath = null;
    }

    if (secretLocation === "database") {
      if (input.secretValue === undefined) {
        throw new SecretServiceError(
          SECRET_SERVICE_ERROR_CODE.SECRET_VALUE_REQUIRED,
          "Secret value is required for database storage",
        );
      }
      secretValueEncrypted = await this.encryptSecret(input.secretValue);
      secretPath = null;
    }

    if (secretLocation === "ssm") {
      if (input.secretValue === undefined) {
        throw new SecretServiceError(
          SECRET_SERVICE_ERROR_CODE.SECRET_VALUE_REQUIRED,
          "Secret value is required for SSM storage",
        );
      }
      secretPath = normalizedPath ?? this.defaultSsmPath(id);
      await this.putSsmSecret(secretPath, input.secretValue);
    }

    const record = await this.secretDao.createSecret({
      id,
      name,
      secretLocation,
      secretPath,
      secretValueEncrypted,
      sourceEnvVar,
      provider: input.provider ?? null,
    });

    return this.toMetadata(record);
  }

  async updateSecret(
    id: string,
    updates: SecretUpdate,
  ): Promise<SecretMetadata> {
    const existing = await this.secretDao.getSecret(id);
    if (!existing) {
      throw new SecretServiceError(
        SECRET_SERVICE_ERROR_CODE.SECRET_NOT_FOUND,
        "Secret not found",
      );
    }

    const nextName = updates.name?.trim() || existing.name;
    const nextLocation = updates.secretLocation || existing.secretLocation;
    const normalizedPath =
      updates.secretPath !== undefined
        ? this.normalizePath(updates.secretPath)
        : existing.secretPath;

    let nextSourceEnvVar: string | null = null;
    if (nextLocation === "env") {
      const requested = updates.sourceEnvVar !== undefined ? updates.sourceEnvVar : existing.sourceEnvVar;
      // An env secret already pointing at this variable stays editable without re-checking it.
      const unchanged = existing.secretLocation === "env" && requested === existing.sourceEnvVar;
      nextSourceEnvVar = unchanged ? existing.sourceEnvVar : this.requireSourceEnvVar(requested);
    }

    let nextPath: string | null = null;
    let nextEncrypted: string | null = null;

    if (nextLocation === "database") {
      if (updates.secretValue !== undefined) {
        nextEncrypted = await this.encryptSecret(updates.secretValue);
      } else if (existing.secretLocation === "database") {
        nextEncrypted = existing.secretValueEncrypted;
      }

      if (!nextEncrypted) {
        throw new SecretServiceError(
          SECRET_SERVICE_ERROR_CODE.SECRET_VALUE_REQUIRED,
          "Secret value is required for database storage",
        );
      }
    }

    if (nextLocation === "ssm") {
      // The stored path stays put on a rename: the id, not the label, places the parameter.
      nextPath = normalizedPath ?? this.defaultSsmPath(existing.id);
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
      sourceEnvVar: nextSourceEnvVar,
      ...(updates.provider !== undefined ? { provider: updates.provider } : {}),
    });

    if (!record) {
      throw new SecretServiceError(
        SECRET_SERVICE_ERROR_CODE.SECRET_NOT_FOUND,
        "Secret not found",
      );
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

  /** Values for these secrets, by secret id. Unknown ids are left out. */
  async resolveSecretValues(ids: string[]): Promise<Map<string, string>> {
    const secrets = await this.secretDao.getSecretsByIds(Array.from(new Set(ids)));
    const entries = await Promise.all(
      secrets.map(async (secret) => [secret.id, await this.resolveSecretValue(secret)] as const),
    );
    return new Map(entries);
  }

  /** The value of the first secret with this label, for configs that name a secret. */
  async resolveSecretValueByName(name: string): Promise<string | null> {
    const secret = await this.secretDao.getSecretByName(name);
    return secret ? this.resolveSecretValue(secret) : null;
  }

  async upsertWorkerAuthCache(
    name: string,
    authJson: string,
  ): Promise<SecretMetadata> {
    const normalizedName = name.trim();
    if (!normalizedName) {
      throw new SecretServiceError(
        SECRET_SERVICE_ERROR_CODE.SECRET_NAME_REQUIRED,
        "Secret name is required",
      );
    }
    if (!authJson || authJson.trim().length === 0) {
      throw new SecretServiceError(
        SECRET_SERVICE_ERROR_CODE.AUTH_CACHE_PAYLOAD_REQUIRED,
        "Auth cache payload is required",
      );
    }

    const preparedAuthJson = encodeCodexAuthForSsm(authJson);
    const payloadBytes = Buffer.byteLength(preparedAuthJson, "utf-8");
    if (payloadBytes > MAX_SSM_SECRET_SIZE_BYTES) {
      throw new SecretServiceError(
        SECRET_SERVICE_ERROR_CODE.AUTH_CACHE_TOO_LARGE,
        `Codex auth cache exceeds SSM size limit (${payloadBytes} bytes)`,
      );
    }

    const existing = await this.secretDao.getSecretByName(normalizedName);
    if (existing) {
      return this.updateSecret(existing.id, {
        secretLocation: "ssm",
        secretValue: preparedAuthJson,
        secretPath: existing.secretPath,
      });
    }

    // Codex workers read the shared cache at the prefix plus this name.
    return this.createSecret({
      name: normalizedName,
      secretLocation: "ssm",
      secretPath: `${this.ssmPrefix}/${normalizedName}`,
      secretValue: preparedAuthJson,
    });
  }

  /**
   * An env secret only names a variable; the value is read from this server's
   * environment at run time. Refuse to save one that cannot resolve, rather
   * than letting runs fail later.
   */
  private requireSourceEnvVar(value: string | null | undefined): string {
    const name = value?.trim() ?? "";
    if (!ENV_VAR_NAME_PATTERN.test(name)) {
      throw new SecretServiceError(
        SECRET_SERVICE_ERROR_CODE.SOURCE_ENV_VAR_INVALID,
        "Name the server environment variable that holds the value, e.g. ANTHROPIC_API_KEY.",
      );
    }
    if (process.env[name]) return name;
    throw new SecretServiceError(
      SECRET_SERVICE_ERROR_CODE.ENV_VARIABLE_NOT_SET,
      `${name} is not set on the Viberglass server, so this secret would have no value. ` +
        "Store the value in the database instead, or set the variable and restart the server.",
    );
  }

  private async resolveSecretValue(secret: SecretRecord): Promise<string> {
    if (secret.secretLocation === "env") {
      const value = secret.sourceEnvVar ? process.env[secret.sourceEnvVar] : undefined;
      if (!value) {
        throw new Error(
          `Environment variable ${secret.sourceEnvVar ?? "(none)"} is not set for secret ${secret.name}`,
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
      const path = secret.secretPath ?? this.defaultSsmPath(secret.id);
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

  private defaultSsmPath(id: string): string {
    return `${this.ssmPrefix}/${id}`;
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

    throw new SecretServiceError(
      SECRET_SERVICE_ERROR_CODE.SECRET_VALUE_REQUIRED,
      `Secret value is required for SSM storage at ${nextPath}`,
    );
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
      sourceEnvVar: secret.sourceEnvVar,
      provider: secret.provider,
      createdAt: secret.createdAt,
      updatedAt: secret.updatedAt,
    };
  }
}
