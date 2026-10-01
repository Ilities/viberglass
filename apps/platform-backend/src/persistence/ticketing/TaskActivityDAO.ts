import { isObjectRecord, type TaskActivityActorType, type TaskActivityEntry, type TaskActivityKind, TASK_ACTIVITY_KINDS } from "@viberglass/types";
import db from "../config/database";

export interface NewTaskActivity {
  ticketId: string;
  actorType: TaskActivityActorType;
  actorId: string | null;
  kind: TaskActivityKind;
  payload?: Record<string, unknown>;
}

function isKind(value: string): value is TaskActivityKind {
  return TASK_ACTIVITY_KINDS.some((kind) => kind === value);
}

export class TaskActivityDAO {
  async record(entry: NewTaskActivity): Promise<void> {
    await db
      .insertInto("task_activity")
      .values({
        ticket_id: entry.ticketId,
        actor_type: entry.actorType,
        actor_id: entry.actorId,
        kind: entry.kind,
        payload_json: JSON.stringify(entry.payload ?? {}),
      })
      .execute();
  }

  async list(ticketId: string): Promise<TaskActivityEntry[]> {
    const rows = await db
      .selectFrom("task_activity")
      .leftJoin("users", "users.id", "task_activity.actor_id")
      .select([
        "task_activity.id",
        "task_activity.ticket_id",
        "task_activity.actor_type",
        "task_activity.kind",
        "task_activity.payload_json",
        "task_activity.created_at",
        "users.id as actor_id",
        "users.name as actor_name",
      ])
      .where("task_activity.ticket_id", "=", ticketId)
      .orderBy("task_activity.created_at", "asc")
      .execute();
    return rows.flatMap((row) =>
      isKind(row.kind)
        ? [
            {
              id: row.id,
              ticketId: row.ticket_id,
              actorType: row.actor_type,
              actor: row.actor_id && row.actor_name ? { id: row.actor_id, name: row.actor_name } : null,
              kind: row.kind,
              payload: isObjectRecord(row.payload_json) ? row.payload_json : {},
              createdAt: row.created_at.toISOString(),
            },
          ]
        : [],
    );
  }
}
