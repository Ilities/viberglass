import type { Selectable } from "kysely";
import db from "../config/database";
import type { Database } from "../types/database";

type AppDataGrantRow = Selectable<Database["app_data_grants"]>;

export interface AppDataGrantRecord {
  id: string;
  projectId: string;
  ticketId: string;
  grantedBy: string | null;
  copiedAt: Date;
  objectKey: string;
  bytes: number;
  turnId: string | null;
  takenAt: Date | null;
}

export interface NewAppDataGrant {
  id: string;
  projectId: string;
  ticketId: string;
  grantedBy: string;
  copiedAt: Date;
  objectKey: string;
  bytes: number;
}

const ENDED_JOB = ["completed", "failed", "cancelled"] as const;
const ENDED_TURN = ["completed", "failed", "cancelled"] as const;

export class AppDataGrantDAO {
  /** The copy waiting for the task's next turn, if there is one. */
  async untaken(ticketId: string): Promise<AppDataGrantRecord | null> {
    const row = await db
      .selectFrom("app_data_grants")
      .selectAll()
      .where("ticket_id", "=", ticketId)
      .where("taken_at", "is", null)
      .where("removed_at", "is", null)
      .executeTakeFirst();
    return row ? toGrant(row) : null;
  }

  /** Every copy in the space still waiting for a turn. */
  async listUntakenForProject(projectId: string): Promise<AppDataGrantRecord[]> {
    const rows = await db
      .selectFrom("app_data_grants")
      .selectAll()
      .where("project_id", "=", projectId)
      .where("taken_at", "is", null)
      .where("removed_at", "is", null)
      .execute();
    return rows.map(toGrant);
  }

  async insert(grant: NewAppDataGrant): Promise<AppDataGrantRecord> {
    const row = await db
      .insertInto("app_data_grants")
      .values({
        id: grant.id,
        project_id: grant.projectId,
        ticket_id: grant.ticketId,
        granted_by: grant.grantedBy,
        copied_at: grant.copiedAt,
        object_key: grant.objectKey,
        bytes: grant.bytes,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toGrant(row);
  }

  /** Gives the waiting copy to a turn; only one turn can take it. */
  async take(ticketId: string, turnId: string): Promise<AppDataGrantRecord | null> {
    const row = await db
      .updateTable("app_data_grants")
      .set({ turn_id: turnId, taken_at: new Date() })
      .where("ticket_id", "=", ticketId)
      .where("taken_at", "is", null)
      .where("removed_at", "is", null)
      .returningAll()
      .executeTakeFirst();
    return row ? toGrant(row) : null;
  }

  async markRemoved(id: string): Promise<void> {
    await db.updateTable("app_data_grants").set({ removed_at: new Date() }).where("id", "=", id).execute();
  }

  /** Copies no turn needs any more: their turn ended, or they're older than `createdBefore` either way. */
  async listDone(createdBefore: Date): Promise<AppDataGrantRecord[]> {
    const rows = await db
      .selectFrom("app_data_grants as grant")
      .leftJoin("agent_turns as turn", "turn.id", "grant.turn_id")
      .leftJoin("jobs as job", "job.id", "turn.job_id")
      .selectAll("grant")
      .where("grant.removed_at", "is", null)
      .where((eb) =>
        eb.or([
          eb("grant.created_at", "<", createdBefore),
          eb.and([
            eb("grant.taken_at", "is not", null),
            eb.or([
              eb("grant.turn_id", "is", null),
              eb("job.status", "in", ENDED_JOB),
              eb.and([eb("turn.job_id", "is", null), eb("turn.status", "in", ENDED_TURN)]),
            ]),
          ]),
        ]),
      )
      .orderBy("grant.created_at")
      .execute();
    return rows.map(toGrant);
  }
}

function toGrant(row: AppDataGrantRow): AppDataGrantRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    ticketId: row.ticket_id,
    grantedBy: row.granted_by,
    copiedAt: new Date(row.copied_at),
    objectKey: row.object_key,
    bytes: Number(row.bytes),
    turnId: row.turn_id,
    takenAt: row.taken_at ? new Date(row.taken_at) : null,
  };
}
