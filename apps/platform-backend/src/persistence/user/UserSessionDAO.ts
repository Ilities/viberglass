import db from "../config/database";

export interface UserSessionRecord {
  id: string;
  userId: string;
  tokenHash: string;
  createdAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
}

export class UserSessionDAO {
  async createSession(input: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<UserSessionRecord> {
    const timestamp = new Date();
    const row = await db
      .insertInto("user_sessions")
      .values({
        user_id: input.userId,
        token_hash: input.tokenHash,
        expires_at: input.expiresAt,
        created_at: timestamp,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return this.mapSession(row);
  }

  async findValidSession(tokenHash: string): Promise<UserSessionRecord | null> {
    const now = new Date();
    const row = await db
      .selectFrom("user_sessions")
      .selectAll()
      .where("token_hash", "=", tokenHash)
      .where("revoked_at", "is", null)
      .where("expires_at", ">", now)
      .executeTakeFirst();

    if (!row) return null;

    return this.mapSession(row);
  }

  async revokeSession(tokenHash: string): Promise<void> {
    await db
      .updateTable("user_sessions")
      .set({ revoked_at: new Date() })
      .where("token_hash", "=", tokenHash)
      .execute();
  }

  private mapSession(row: any): UserSessionRecord {
    return {
      id: row.id,
      userId: row.user_id,
      tokenHash: row.token_hash,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      revokedAt: row.revoked_at ?? null,
    };
  }
}
