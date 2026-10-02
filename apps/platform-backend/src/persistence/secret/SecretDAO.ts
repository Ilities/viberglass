import { randomUUID } from "crypto";
import { isModelProviderId, type ModelProviderId } from "@viberglass/types";
import db from "../config/database";

export type SecretLocation = "env" | "database" | "ssm";

export interface SecretRecord {
  id: string;
  name: string;
  secretLocation: SecretLocation;
  secretPath: string | null;
  secretValueEncrypted: string | null;
  sourceEnvVar: string | null;
  provider: ModelProviderId | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateSecretDTO {
  /** Set when the SSM path is derived from the id, which must be known before the insert. */
  id?: string;
  name: string;
  secretLocation: SecretLocation;
  secretPath?: string | null;
  secretValueEncrypted?: string | null;
  sourceEnvVar?: string | null;
  provider?: ModelProviderId | null;
}

export interface UpdateSecretDTO {
  name?: string;
  secretLocation?: SecretLocation;
  secretPath?: string | null;
  secretValueEncrypted?: string | null;
  sourceEnvVar?: string | null;
  provider?: ModelProviderId | null;
}

export class SecretDAO {
  async createSecret(dto: CreateSecretDTO): Promise<SecretRecord> {
    const id = dto.id ?? randomUUID();
    const timestamp = new Date();

    const result = await db
      .insertInto("secrets")
      .values({
        id,
        name: dto.name,
        secret_location: dto.secretLocation,
        secret_path: dto.secretPath ?? null,
        secret_value_encrypted: dto.secretValueEncrypted ?? null,
        source_env_var: dto.sourceEnvVar ?? null,
        provider: dto.provider ?? null,
        created_at: timestamp,
        updated_at: timestamp,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return this.mapRowToSecret(result);
  }

  async getSecret(id: string): Promise<SecretRecord | null> {
    const row = await db
      .selectFrom("secrets")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();

    if (!row) return null;

    return this.mapRowToSecret(row);
  }

  async getSecretsByIds(ids: string[]): Promise<SecretRecord[]> {
    if (ids.length === 0) return [];
    const rows = await db
      .selectFrom("secrets")
      .selectAll()
      .where("id", "in", ids)
      .execute();

    return rows.map((row) => this.mapRowToSecret(row));
  }

  /** The first secret with this label. Labels repeat, so only for labels the platform itself owns. */
  async getSecretByName(name: string): Promise<SecretRecord | null> {
    const row = await db
      .selectFrom("secrets")
      .selectAll()
      .where("name", "=", name)
      .orderBy("created_at", "asc")
      .executeTakeFirst();

    if (!row) return null;

    return this.mapRowToSecret(row);
  }

  /** The most recently updated key from this provider. */
  async getLatestSecretForProvider(provider: ModelProviderId): Promise<SecretRecord | null> {
    const row = await db
      .selectFrom("secrets")
      .selectAll()
      .where("provider", "=", provider)
      .orderBy("updated_at", "desc")
      .executeTakeFirst();

    if (!row) return null;

    return this.mapRowToSecret(row);
  }

  async listSecrets(limit = 50, offset = 0): Promise<SecretRecord[]> {
    const rows = await db
      .selectFrom("secrets")
      .selectAll()
      .orderBy("created_at", "desc")
      .limit(limit)
      .offset(offset)
      .execute();

    return rows.map((row) => this.mapRowToSecret(row));
  }

  async updateSecret(
    id: string,
    updates: UpdateSecretDTO
  ): Promise<SecretRecord | null> {
    const updateData: Record<string, unknown> = {
      updated_at: new Date(),
    };

    if (updates.name !== undefined) {
      updateData.name = updates.name;
    }
    if (updates.secretLocation !== undefined) {
      updateData.secret_location = updates.secretLocation;
    }
    if (updates.secretPath !== undefined) {
      updateData.secret_path = updates.secretPath;
    }
    if (updates.secretValueEncrypted !== undefined) {
      updateData.secret_value_encrypted = updates.secretValueEncrypted;
    }
    if (updates.sourceEnvVar !== undefined) {
      updateData.source_env_var = updates.sourceEnvVar;
    }
    if (updates.provider !== undefined) {
      updateData.provider = updates.provider;
    }

    const result = await db
      .updateTable("secrets")
      .set(updateData)
      .where("id", "=", id)
      .returningAll()
      .executeTakeFirst();

    if (!result) return null;

    return this.mapRowToSecret(result);
  }

  async deleteSecret(id: string): Promise<boolean> {
    const result = await db
      .deleteFrom("secrets")
      .where("id", "=", id)
      .executeTakeFirst();

    return (result.numDeletedRows ?? 0) > 0;
  }

  private mapRowToSecret(row: Record<string, unknown>): SecretRecord {
    return {
      id: String(row.id),
      name: String(row.name),
      secretLocation: row.secret_location as SecretLocation,
      secretPath: row.secret_path ? String(row.secret_path) : null,
      secretValueEncrypted: row.secret_value_encrypted
        ? String(row.secret_value_encrypted)
        : null,
      sourceEnvVar: row.source_env_var ? String(row.source_env_var) : null,
      provider: typeof row.provider === "string" && isModelProviderId(row.provider) ? row.provider : null,
      createdAt: row.created_at as Date,
      updatedAt: row.updated_at as Date,
    };
  }
}
