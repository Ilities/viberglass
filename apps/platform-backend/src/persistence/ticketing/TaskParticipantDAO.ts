import type { TaskParticipant, TaskParticipantRole } from "@viberglass/types";
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

  /** Who drives each task when nobody else is asked: its owner, else its requester. */
  async listDrivers(ticketIds: string[]): Promise<Map<string, { id: string; name: string }>> {
    if (ticketIds.length === 0) return new Map();
    const rows = await db
      .selectFrom("task_participants")
      .innerJoin("users", "users.id", "task_participants.user_id")
      .select(["task_participants.ticket_id", "task_participants.role", "users.id", "users.name"])
      .where("task_participants.ticket_id", "in", ticketIds)
      .where("task_participants.role", "in", ["owner", "requester"])
      .execute();
    const drivers = new Map<string, { id: string; name: string }>();
    for (const row of rows) {
      if (row.role === "owner" || !drivers.has(row.ticket_id)) drivers.set(row.ticket_id, { id: row.id, name: row.name });
    }
    return drivers;
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
