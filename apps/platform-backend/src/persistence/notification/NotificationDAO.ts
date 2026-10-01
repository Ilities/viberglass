import { INBOX_GROUP_OF, isNotificationKind, isObjectRecord, notificationText, type InboxItem, type NotificationKind } from "@viberglass/types";
import db from "../config/database";

export interface NewNotification {
  recipientId: string;
  kind: NotificationKind;
  ticketId: string | null;
  actorId: string | null;
  payload: Record<string, unknown>;
}

export type InboxState = "open" | "done";

export class NotificationDAO {
  async create(input: NewNotification): Promise<void> {
    await db
      .insertInto("notifications")
      .values({
        recipient_id: input.recipientId,
        kind: input.kind,
        ticket_id: input.ticketId,
        actor_id: input.actorId,
        payload_json: JSON.stringify(input.payload),
      })
      .execute();
  }

  /** Open items are not done and not snoozed into the future; done items are the recent history. */
  async list(recipientId: string, state: InboxState, limit = 100): Promise<InboxItem[]> {
    const now = new Date();
    let query = db
      .selectFrom("notifications as n")
      .leftJoin("tickets as t", "t.id", "n.ticket_id")
      .leftJoin("projects as p", "p.id", "t.project_id")
      .leftJoin("users as a", "a.id", "n.actor_id")
      .select([
        "n.id",
        "n.kind",
        "n.payload_json",
        "n.created_at",
        "n.read_at",
        "n.done_at",
        "n.snoozed_until",
        "t.id as ticket_id",
        "t.task_key",
        "t.title as ticket_title",
        "p.slug as space_slug",
        "a.id as actor_id",
        "a.name as actor_name",
      ])
      .where("n.recipient_id", "=", recipientId);
    query =
      state === "open"
        ? query
            .where("n.done_at", "is", null)
            .where((eb) => eb.or([eb("n.snoozed_until", "is", null), eb("n.snoozed_until", "<=", now)]))
        : query.where("n.done_at", "is not", null);
    const rows = await query.orderBy("n.created_at", "desc").limit(limit).execute();
    return rows.flatMap((row) => {
      if (!isNotificationKind(row.kind)) return [];
      const payload = isObjectRecord(row.payload_json) ? row.payload_json : {};
      return [
        {
          id: row.id,
          kind: row.kind,
          group: INBOX_GROUP_OF[row.kind],
          text: notificationText(row.kind, row.actor_name, row.ticket_title ?? "a task", payload),
          task:
            row.ticket_id && row.task_key && row.ticket_title && row.space_slug
              ? { id: row.ticket_id, key: row.task_key, title: row.ticket_title, spaceSlug: row.space_slug }
              : null,
          actor: row.actor_id && row.actor_name ? { id: row.actor_id, name: row.actor_name } : null,
          createdAt: row.created_at.toISOString(),
          readAt: row.read_at?.toISOString() ?? null,
          doneAt: row.done_at?.toISOString() ?? null,
          snoozedUntil: row.snoozed_until?.toISOString() ?? null,
        },
      ];
    });
  }

  async countUnread(recipientId: string): Promise<number> {
    const now = new Date();
    const row = await db
      .selectFrom("notifications")
      .select((eb) => eb.fn.countAll<string>().as("count"))
      .where("recipient_id", "=", recipientId)
      .where("read_at", "is", null)
      .where("done_at", "is", null)
      .where((eb) => eb.or([eb("snoozed_until", "is", null), eb("snoozed_until", "<=", now)]))
      .executeTakeFirstOrThrow();
    return Number(row.count);
  }

  /** Updates one of the recipient's own items; false when it isn't theirs. */
  async update(
    recipientId: string,
    id: string,
    change: { read?: boolean; done?: boolean; snoozedUntil?: Date | null },
  ): Promise<boolean> {
    const now = new Date();
    const result = await db
      .updateTable("notifications")
      .set({
        ...(change.read !== undefined && { read_at: change.read ? now : null }),
        ...(change.done !== undefined && { done_at: change.done ? now : null, read_at: now }),
        ...(change.snoozedUntil !== undefined && { snoozed_until: change.snoozedUntil }),
      })
      .where("id", "=", id)
      .where("recipient_id", "=", recipientId)
      .executeTakeFirst();
    return Number(result.numUpdatedRows) > 0;
  }
}
