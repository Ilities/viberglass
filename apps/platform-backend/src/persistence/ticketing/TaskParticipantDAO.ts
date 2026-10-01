import { sql } from "kysely";
import { isTaskParticipantRole, type TaskParticipant, type TaskParticipantRole, type TicketLifecycleStatus, type TicketWorkflowPhase } from "@viberglass/types";

export interface MyTaskRow {
  id: string;
  key: string;
  title: string;
  status: TicketLifecycleStatus;
  workflowPhase: TicketWorkflowPhase;
  updatedAt: string;
  spaceSlug: string;
  roles: TaskParticipantRole[];
}
import db from "../config/database";

export class TaskParticipantDAO {
  async list(ticketId: string): Promise<TaskParticipant[]> {
    const rows = await db
      .selectFrom("task_participants")
      .innerJoin("users", "users.id", "task_participants.user_id")
      .select(["task_participants.user_id", "task_participants.role", "task_participants.created_at", "users.name", "users.email"])
      .where("task_participants.ticket_id", "=", ticketId)
      .orderBy("task_participants.created_at", "asc")
      .execute();
    return rows.map((row) => ({
      userId: row.user_id,
      name: row.name,
      email: row.email,
      role: row.role,
      addedAt: row.created_at.toISOString(),
    }));
  }

  /** Open and recent tasks someone is the requester, owner or reviewer of, with their roles on each. */
  async listTasksFor(userId: string, projectIds: string[] | null, limit = 200): Promise<MyTaskRow[]> {
    if (projectIds && projectIds.length === 0) return [];
    let query = db
      .selectFrom("task_participants as tp")
      .innerJoin("tickets as t", "t.id", "tp.ticket_id")
      .innerJoin("projects as p", "p.id", "t.project_id")
      .select([
        "t.id",
        "t.task_key",
        "t.title",
        "t.ticket_status",
        "t.workflow_phase",
        "t.updated_at",
        "p.slug",
        sql<string[]>`array_agg(tp.role)`.as("roles"),
      ])
      .where("tp.user_id", "=", userId)
      .where("tp.role", "in", ["requester", "owner", "reviewer"])
      .where("t.archived_at", "is", null);
    if (projectIds) query = query.where("t.project_id", "in", projectIds);
    const rows = await query
      .groupBy(["t.id", "t.task_key", "t.title", "t.ticket_status", "t.workflow_phase", "t.updated_at", "p.slug"])
      .orderBy("t.updated_at", "desc")
      .limit(limit)
      .execute();
    return rows.map((row) => ({
      id: row.id,
      key: row.task_key,
      title: row.title,
      status: row.ticket_status,
      workflowPhase: row.workflow_phase,
      updatedAt: row.updated_at.toISOString(),
      spaceSlug: row.slug,
      roles: row.roles.filter(isTaskParticipantRole),
    }));
  }

  /** Each task's owner, for task lists. */
  async listOwners(ticketIds: string[]): Promise<Map<string, { id: string; name: string }>> {
    if (ticketIds.length === 0) return new Map();
    const rows = await db
      .selectFrom("task_participants")
      .innerJoin("users", "users.id", "task_participants.user_id")
      .select(["task_participants.ticket_id", "users.id", "users.name"])
      .where("task_participants.ticket_id", "in", ticketIds)
      .where("task_participants.role", "=", "owner")
      .execute();
    return new Map(rows.map((row) => [row.ticket_id, { id: row.id, name: row.name }]));
  }

  /** A task has one owner: this replaces the current one. */
  async setOwner(ticketId: string, userId: string, addedBy: string): Promise<void> {
    await db.transaction().execute(async (trx) => {
      await trx.deleteFrom("task_participants").where("ticket_id", "=", ticketId).where("role", "=", "owner").execute();
      await trx.insertInto("task_participants").values({ ticket_id: ticketId, user_id: userId, role: "owner", added_by: addedBy }).execute();
    });
  }

  async add(ticketId: string, userId: string, role: Exclude<TaskParticipantRole, "owner" | "requester">, addedBy: string): Promise<void> {
    await db
      .insertInto("task_participants")
      .values({ ticket_id: ticketId, user_id: userId, role, added_by: addedBy })
      .onConflict((oc) => oc.doNothing())
      .execute();
  }

  async remove(ticketId: string, userId: string, role: TaskParticipantRole): Promise<boolean> {
    const result = await db
      .deleteFrom("task_participants")
      .where("ticket_id", "=", ticketId)
      .where("user_id", "=", userId)
      .where("role", "=", role)
      .executeTakeFirst();
    return Number(result.numDeletedRows) > 0;
  }
}
