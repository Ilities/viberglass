import db from "../config/database";
import type { UserRole } from "../types/user";

export interface InviteRecord {
  id: string;
  email: string;
  role: UserRole;
  /** Spaces the invitee joins as a member on accepting. */
  spaceIds: string[];
  invitedByName: string | null;
  createdAt: Date;
  expiresAt: Date;
}

export interface NewInvite {
  email: string;
  role: UserRole;
  spaceIds: string[];
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
        .returning(["id", "email", "role", "space_ids"])
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
      if (invite.space_ids.length > 0) {
        await trx
          .insertInto("space_members")
          .values(invite.space_ids.map((projectId) => ({ project_id: projectId, user_id: created.id, role: "member" as const, added_by: null })))
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
  created_at: Date;
  expires_at: Date;
  invited_by_name: string | null;
}): InviteRecord {
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    spaceIds: row.space_ids,
    invitedByName: row.invited_by_name,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  };
}
