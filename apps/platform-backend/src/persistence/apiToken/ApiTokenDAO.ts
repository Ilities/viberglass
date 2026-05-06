import { randomBytes, createHash } from "node:crypto";
import { v4 as uuidv4 } from "uuid";
import db from "../config/database";
import type { Selectable } from "kysely";
import type { Database } from "../types/database";

type ApiTokensRow = Selectable<Database["api_tokens"]>;

const TOKEN_PREFIX = "vibe_";
const TOKEN_RANDOM_BYTES = 32;

export interface ApiTokenRecord {
  id: string;
  userId: string;
  name: string;
  tokenHash: string;
  tokenPrefix: string;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ApiTokenListItem {
  id: string;
  name: string;
  tokenPrefix: string;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
}

export interface CreateApiTokenResult {
  id: string;
  name: string;
  token: string;
  tokenPrefix: string;
  expiresAt: Date | null;
  createdAt: Date;
}

export function generateApiToken(): { token: string; tokenHash: string; tokenPrefix: string } {
  const random = randomBytes(TOKEN_RANDOM_BYTES).toString("hex");
  const token = `${TOKEN_PREFIX}${random}`;
  const tokenHash = hashToken(token);
  const tokenPrefix = token.slice(0, 12);
  return { token, tokenHash, tokenPrefix };
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function isApiToken(token: string): boolean {
  return token.startsWith(TOKEN_PREFIX);
}

export class ApiTokenDAO {
  async create(input: {
    userId: string;
    name: string;
    tokenHash: string;
    tokenPrefix: string;
    expiresAt?: Date | null;
  }): Promise<ApiTokenRecord> {
    const id = uuidv4();
    const timestamp = new Date();

    const row = await db
      .insertInto("api_tokens")
      .values({
        id,
        user_id: input.userId,
        name: input.name,
        token_hash: input.tokenHash,
        token_prefix: input.tokenPrefix,
        expires_at: input.expiresAt ?? null,
        created_at: timestamp,
        updated_at: timestamp,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return this.mapRecord(row);
  }

  async findByHash(tokenHash: string): Promise<ApiTokenRecord | null> {
    const row = await db
      .selectFrom("api_tokens")
      .selectAll()
      .where("token_hash", "=", tokenHash)
      .executeTakeFirst();

    if (!row) return null;
    return this.mapRecord(row);
  }

  async findValidByHash(tokenHash: string): Promise<ApiTokenRecord | null> {
    const row = await db
      .selectFrom("api_tokens")
      .selectAll()
      .where("token_hash", "=", tokenHash)
      .where((eb) =>
        eb.or([eb("expires_at", "is", null), eb("expires_at", ">", new Date())]),
      )
      .executeTakeFirst();

    if (!row) return null;
    return this.mapRecord(row);
  }

  async listByUser(userId: string): Promise<ApiTokenListItem[]> {
    const rows = await db
      .selectFrom("api_tokens")
      .select([
        "id",
        "name",
        "token_prefix",
        "last_used_at",
        "expires_at",
        "created_at",
      ])
      .where("user_id", "=", userId)
      .orderBy("created_at", "desc")
      .execute();

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      tokenPrefix: row.token_prefix,
      lastUsedAt: row.last_used_at ?? null,
      expiresAt: row.expires_at ?? null,
      createdAt: row.created_at,
    }));
  }

  async deleteById(id: string, userId: string): Promise<boolean> {
    const result = await db
      .deleteFrom("api_tokens")
      .where("id", "=", id)
      .where("user_id", "=", userId)
      .executeTakeFirst();

    return (result.numDeletedRows ?? 0) > 0;
  }

  async touchLastUsed(id: string): Promise<void> {
    await db
      .updateTable("api_tokens")
      .set({ last_used_at: new Date() })
      .where("id", "=", id)
      .execute();
  }

  private mapRecord(row: ApiTokensRow): ApiTokenRecord {
    return {
      id: row.id,
      userId: row.user_id,
      name: row.name,
      tokenHash: row.token_hash,
      tokenPrefix: row.token_prefix,
      lastUsedAt: row.last_used_at ?? null,
      expiresAt: row.expires_at ?? null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
