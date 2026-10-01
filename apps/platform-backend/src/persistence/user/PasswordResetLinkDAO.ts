import db from "../config/database";

export interface OpenResetLink {
  userId: string;
  email: string;
  name: string;
}

export class PasswordResetLinkDAO {
  /** Creates a link and retires the user's earlier open ones, so only the newest works. */
  async create(input: { userId: string; tokenHash: string; expiresAt: Date; createdBy: string }): Promise<void> {
    await db.transaction().execute(async (trx) => {
      await trx
        .updateTable("password_reset_links")
        .set({ used_at: new Date() })
        .where("user_id", "=", input.userId)
        .where("used_at", "is", null)
        .execute();
      await trx
        .insertInto("password_reset_links")
        .values({
          user_id: input.userId,
          token_hash: input.tokenHash,
          expires_at: input.expiresAt,
          created_by: input.createdBy,
        })
        .execute();
    });
  }

  async findOpen(tokenHash: string): Promise<OpenResetLink | null> {
    const row = await db
      .selectFrom("password_reset_links")
      .innerJoin("users", "users.id", "password_reset_links.user_id")
      .select(["users.id as user_id", "users.email", "users.name"])
      .where("password_reset_links.token_hash", "=", tokenHash)
      .where("password_reset_links.used_at", "is", null)
      .where("password_reset_links.expires_at", ">", new Date())
      .where("users.deactivated_at", "is", null)
      .executeTakeFirst();
    return row ? { userId: row.user_id, email: row.email, name: row.name } : null;
  }

  /**
   * Uses up the link, sets the new password and ends the user's other
   * sessions, in one transaction. Null when the link is no longer open.
   */
  async resetPassword(tokenHash: string, passwordHash: string): Promise<{ userId: string } | null> {
    return db.transaction().execute(async (trx) => {
      const now = new Date();
      const link = await trx
        .updateTable("password_reset_links")
        .set({ used_at: now })
        .where("token_hash", "=", tokenHash)
        .where("used_at", "is", null)
        .where("expires_at", ">", now)
        .returning("user_id")
        .executeTakeFirst();
      if (!link) return null;

      const user = await trx
        .updateTable("users")
        .set({ password_hash: passwordHash, updated_at: now })
        .where("id", "=", link.user_id)
        .where("deactivated_at", "is", null)
        .returning("id")
        .executeTakeFirst();
      if (!user) return null;

      await trx
        .updateTable("user_sessions")
        .set({ revoked_at: now })
        .where("user_id", "=", user.id)
        .where("revoked_at", "is", null)
        .execute();
      return { userId: user.id };
    });
  }
}
