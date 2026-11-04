import { sql } from "kysely";
import db from "../config/database";
import type { UserRole } from "../types/user";

export interface InviteRecord {
  id: string;
  email: string;
  role: UserRole;
  /** Spaces the invitee joins as a member on accepting. */
  spaceIds: string[];
  /** Apps whose access lists the invitee joins on accepting. */
  appIds: string[];
  invitedByName: string | null;
  createdAt: Date;
  expiresAt: Date;
}

export interface NewInvite {
  email: string;
  role: UserRole;
  spaceIds: string[];
  appIds: string[];
  tokenHash: string;
  expiresAt: Date;
  createdBy: string;
}

export interface AcceptedInvite {
  userId: string;
}

export class InviteDAO {
  /** Creates the invite and revokes any other open one for the same email, so only the newest link works. */
  async create(input: NewInvite): Promise<InviteRecord> {
    const id = await db.transaction().execute(async (trx) => {
      await trx
        .updateTable("invites")
        .set({ revoked_at: new Date() })
        .where("email", "=", input.email)
        .where("accepted_at", "is", null)
        .where("revoked_at", "is", null)
        .execute();
      const row = await trx
        .insertInto("invites")
        .values({
          email: input.email,
          role: input.role,
          space_ids: input.spaceIds,
          app_ids: input.appIds,
          token_hash: input.tokenHash,
          expires_at: input.expiresAt,
          created_by: input.createdBy,
        })
        .returning("id")
        .executeTakeFirstOrThrow();
      return row.id;
    });
    const invite = await this.findOpen((qb) => qb.where("invites.id", "=", id));
    if (!invite) throw new Error(`Invite ${id} disappeared after it was created`);
    return invite;
  }

  async listOpen(): Promise<InviteRecord[]> {
    return this.selectOpen().orderBy("invites.created_at", "desc").execute().then((rows) => rows.map(toInviteRecord));
  }

  async findOpenByTokenHash(tokenHash: string): Promise<InviteRecord | null> {
    return this.findOpen((qb) => qb.where("invites.token_hash", "=", tokenHash));
  }

  async findOpenByEmail(email: string): Promise<InviteRecord | null> {
    return this.findOpen((qb) => qb.where("invites.email", "=", email));
  }

  async listOpenForApp(projectId: string): Promise<InviteRecord[]> {
    const rows = await this.selectOpen()
      .where(sql<boolean>`${projectId}::uuid = ANY(invites.app_ids)`)
      .orderBy("invites.created_at", "desc")
      .execute();
    return rows.map(toInviteRecord);
  }

  /** Adds an app to an open invite; null when the invite is no longer open. */
  async addApp(id: string, projectId: string): Promise<InviteRecord | null> {
    const result = await this.updateOpen(id)
      .set({ app_ids: sql<string[]>`array_append(array_remove(app_ids, ${projectId}::uuid), ${projectId}::uuid)` })
      .executeTakeFirst();
    return Number(result.numUpdatedRows) > 0 ? this.findOpen((qb) => qb.where("invites.id", "=", id)) : null;
  }

  /** Takes an app off an open invite; null when the invite is no longer open or isn't for that app. */
  async removeApp(id: string, projectId: string): Promise<InviteRecord | null> {
    const result = await this.updateOpen(id)
      .set({ app_ids: sql<string[]>`array_remove(app_ids, ${projectId}::uuid)` })
      .where(sql<boolean>`${projectId}::uuid = ANY(app_ids)`)
      .executeTakeFirst();
    return Number(result.numUpdatedRows) > 0 ? this.findOpen((qb) => qb.where("invites.id", "=", id)) : null;
  }

  private updateOpen(id: string) {
    return db
      .updateTable("invites")
      .where("id", "=", id)
      .where("accepted_at", "is", null)
      .where("revoked_at", "is", null)
      .where("expires_at", ">", new Date());
  }

  /** True when an open invite was revoked. */
  async revoke(id: string): Promise<boolean> {
    const result = await db
      .updateTable("invites")
      .set({ revoked_at: new Date() })
      .where("id", "=", id)
      .where("accepted_at", "is", null)
      .where("revoked_at", "is", null)
      .executeTakeFirst();
    return Number(result.numUpdatedRows) > 0;
  }

  /**
   * Uses up the invite and creates its user in one transaction. The
   * conditional update is what makes a link single-use when two people open
   * it at once. Null when the link is no longer open.
   */
  async accept(tokenHash: string, user: { name: string; passwordHash: string }): Promise<AcceptedInvite | null> {
    return db.transaction().execute(async (trx) => {
      const now = new Date();
      const invite = await trx
        .updateTable("invites")
        .set({ accepted_at: now })
        .where("token_hash", "=", tokenHash)
        .where("accepted_at", "is", null)
        .where("revoked_at", "is", null)
        .where("expires_at", ">", now)
        .returning(["id", "email", "role", "space_ids", "app_ids", "created_by"])
        .executeTakeFirst();
      if (!invite) return null;

      const created = await trx
        .insertInto("users")
        .values({
          email: invite.email,
          name: user.name,
          password_hash: user.passwordHash,
          avatar_url: null,
          role: invite.role,
          created_at: now,
          updated_at: now,
        })
        .returning("id")
        .executeTakeFirstOrThrow();
      await trx.updateTable("invites").set({ accepted_user_id: created.id }).where("id", "=", invite.id).execute();
      // Spaces and apps deleted since the invite was sent are skipped.
      const named = [...invite.space_ids, ...invite.app_ids];
      const existing = new Set(
        named.length > 0 ? (await trx.selectFrom("projects").select("id").where("id", "in", named).execute()).map((row) => row.id) : [],
      );
      const spaceIds = invite.space_ids.filter((id) => existing.has(id));
      const appIds = invite.app_ids.filter((id) => existing.has(id));
      if (spaceIds.length > 0) {
        await trx
          .insertInto("space_members")
          .values(spaceIds.map((projectId) => ({ project_id: projectId, user_id: created.id, role: "member" as const, added_by: null })))
          .execute();
      }
      if (appIds.length > 0) {
        await trx
          .insertInto("app_access")
          .values(appIds.map((projectId) => ({ project_id: projectId, user_id: created.id, added_by: invite.created_by })))
          .onConflict((oc) => oc.doNothing())
          .execute();
      }
      return { userId: created.id };
    });
  }

  private selectOpen() {
    return db
      .selectFrom("invites")
      .leftJoin("users", "users.id", "invites.created_by")
      .select([
        "invites.id",
        "invites.email",
        "invites.role",
        "invites.space_ids",
        "invites.app_ids",
        "invites.created_at",
        "invites.expires_at",
        "users.name as invited_by_name",
      ])
      .where("invites.accepted_at", "is", null)
      .where("invites.revoked_at", "is", null)
      .where("invites.expires_at", ">", new Date());
  }

  private async findOpen(
    filter: (qb: ReturnType<InviteDAO["selectOpen"]>) => ReturnType<InviteDAO["selectOpen"]>,
  ): Promise<InviteRecord | null> {
    const row = await filter(this.selectOpen()).executeTakeFirst();
    return row ? toInviteRecord(row) : null;
  }
}

function toInviteRecord(row: {
  id: string;
  email: string;
  role: UserRole;
  space_ids: string[];
  app_ids: string[];
  created_at: Date;
  expires_at: Date;
  invited_by_name: string | null;
}): InviteRecord {
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    spaceIds: row.space_ids,
    appIds: row.app_ids,
    invitedByName: row.invited_by_name,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  };
}
