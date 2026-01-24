import { v4 as uuidv4 } from "uuid";
import db from "../config/database";

export type SecretLocation = "env" | "database" | "ssm";

export interface SecretRecord {
  id: string;
  name: string;
  secretLocation: SecretLocation;
  secretPath: string | null;
  secretValueEncrypted: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateSecretDTO {
  name: string;
  secretLocation: SecretLocation;
  secretPath?: string | null;
  secretValueEncrypted?: string | null;
}

export interface UpdateSecretDTO {
  name?: string;
  secretLocation?: SecretLocation;
  secretPath?: string | null;
  secretValueEncrypted?: string | null;
}

export class SecretDAO {
  async createSecret(dto: CreateSecretDTO): Promise<SecretRecord> {
    const id = uuidv4();
    const timestamp = new Date();

    const result = await db
      .insertInto("secrets")
      .values({
        id,
        name: dto.name,
        secret_location: dto.secretLocation,
        secret_path: dto.secretPath ?? null,
        secret_value_encrypted: dto.secretValueEncrypted ?? null,
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

  async getSecretByName(name: string): Promise<SecretRecord | null> {
    const row = await db
      .selectFrom("secrets")
      .selectAll()
      .where("name", "=", name)
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
      createdAt: row.created_at as Date,
      updatedAt: row.updated_at as Date,
    };
  }
}
