import type { WorkspaceRole } from "@viberglass/types";
import db from "../config/database";

export interface AppSessionUser {
  id: string;
  email: string;
  name: string;
  role: WorkspaceRole;
}

/**
 * Handoff codes and the gateway sessions they become. Tokens are stored
 * hashed. Both belong to an app, or to one of its previews when `previewId` is set.
 */
export class AppSignInDAO {
  async createCode(input: {
    codeHash: string;
    stateHash: string;
    projectId: string;
    previewId: string | null;
    sessionId: string;
    returnPath: string;
    expiresAt: Date;
  }): Promise<void> {
    await db
      .insertInto("app_handoff_codes")
      .values({
        code_hash: input.codeHash,
        project_id: input.projectId,
        preview_id: input.previewId,
        session_id: input.sessionId,
        return_path: input.returnPath,
        state_hash: input.stateHash,
        expires_at: input.expiresAt,
      })
      .execute();
  }

  /** Uses the code up; null when it's unknown, used, expired, for another app or for another browser's sign-in. */
  async redeemCode(codeHash: string, stateHash: string, projectId: string, previewId: string | null): Promise<{ sessionId: string; returnPath: string } | null> {
    const row = await db
      .updateTable("app_handoff_codes")
      .set({ used_at: new Date() })
      .where("code_hash", "=", codeHash)
      .where("state_hash", "=", stateHash)
      .where("project_id", "=", projectId)
      .where("preview_id", previewId === null ? "is" : "=", previewId)
      .where("used_at", "is", null)
      .where("expires_at", ">", new Date())
      .returning(["session_id", "return_path"])
      .executeTakeFirst();
    return row ? { sessionId: row.session_id, returnPath: row.return_path } : null;
  }

  async createSession(input: { tokenHash: string; projectId: string; previewId: string | null; sessionId: string; expiresAt: Date }): Promise<void> {
    await db
      .insertInto("app_sessions")
      .values({
        token_hash: input.tokenHash,
        project_id: input.projectId,
        preview_id: input.previewId,
        session_id: input.sessionId,
        expires_at: input.expiresAt,
      })
      .execute();
  }

  /** The person behind a gateway session for this app or preview, while it and their Viberglass session are both valid. */
  async findSessionUser(tokenHash: string, projectId: string, previewId: string | null): Promise<AppSessionUser | null> {
    const now = new Date();
    const row = await db
      .selectFrom("app_sessions")
      .innerJoin("user_sessions", "user_sessions.id", "app_sessions.session_id")
      .innerJoin("users", "users.id", "user_sessions.user_id")
      .select(["users.id", "users.email", "users.name", "users.role"])
      .where("app_sessions.token_hash", "=", tokenHash)
      .where("app_sessions.project_id", "=", projectId)
      .where("app_sessions.preview_id", previewId === null ? "is" : "=", previewId)
      .where("app_sessions.expires_at", ">", now)
      .where("user_sessions.revoked_at", "is", null)
      .where("user_sessions.expires_at", ">", now)
      .where("users.deactivated_at", "is", null)
      .executeTakeFirst();
    return row ? { id: row.id, email: row.email, name: row.name, role: row.role } : null;
  }

  /** The Viberglass session's own expiry, which a gateway session never outlives. */
  async userSessionExpiry(sessionId: string): Promise<Date | null> {
    const row = await db.selectFrom("user_sessions").select("expires_at").where("id", "=", sessionId).executeTakeFirst();
    return row?.expires_at ?? null;
  }

  async deleteExpired(before: Date): Promise<void> {
    await db.deleteFrom("app_handoff_codes").where("expires_at", "<", before).execute();
    await db.deleteFrom("app_sessions").where("expires_at", "<", before).execute();
  }
}
