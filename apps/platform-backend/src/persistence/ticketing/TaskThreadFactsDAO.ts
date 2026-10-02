import { sql } from "kysely";
import type { TaskPerson, TicketWorkflowPhase } from "@viberglass/types";
import db from "../config/database";

export interface LatestRevisionFact {
  phase: TicketWorkflowPhase;
  version: number;
  at: Date;
}

export interface LastMessageFact {
  author: TaskPerson | null;
  body: string;
  at: Date;
}

/** What many tasks' threads hold, at once, for their situations and Home. */
export class TaskThreadFactsDAO {
  /** Each task's newest document version. */
  async latestRevisions(ticketIds: string[]): Promise<Map<string, LatestRevisionFact>> {
    if (ticketIds.length === 0) return new Map();
    const rows = await db
      .selectFrom("ticket_phase_document_revisions")
      .distinctOn("ticket_id")
      .select(["ticket_id", "phase", "version", "created_at"])
      .where("ticket_id", "in", ticketIds)
      .orderBy("ticket_id")
      .orderBy("created_at", "desc")
      .execute();
    return new Map(rows.map((row) => [row.ticket_id, { phase: row.phase, version: row.version, at: row.created_at }]));
  }

  /** Each task's latest thread message. */
  async lastMessages(ticketIds: string[]): Promise<Map<string, LastMessageFact>> {
    if (ticketIds.length === 0) return new Map();
    const rows = await db
      .selectFrom("task_messages as m")
      .leftJoin("users as u", "u.id", "m.author_id")
      .distinctOn("m.ticket_id")
      .select(["m.ticket_id", "m.body_markdown", "m.created_at", "u.id as author_id", "u.name as author_name"])
      .where("m.ticket_id", "in", ticketIds)
      .orderBy("m.ticket_id")
      .orderBy("m.created_at", "desc")
      .execute();
    return new Map(
      rows.map((row) => [
        row.ticket_id,
        {
          author: row.author_id && row.author_name ? { id: row.author_id, name: row.author_name } : null,
          body: row.body_markdown,
          at: row.created_at,
        },
      ]),
    );
  }

  /** The agents' unanswered questions on each task: the people they're for, and since when the oldest waits. */
  async openQuestions(ticketIds: string[]): Promise<Map<string, { askedOf: TaskPerson[]; since: Date }>> {
    const open = new Map<string, { askedOf: TaskPerson[]; since: Date }>();
    if (ticketIds.length === 0) return open;
    const rows = await db
      .selectFrom("agent_pending_requests as r")
      .innerJoin("agent_sessions as s", "s.id", "r.session_id")
      .leftJoin("users as u", "u.id", "r.addressee_user_id")
      .select(["s.ticket_id", "r.created_at", "u.id as user_id", "u.name as user_name"])
      .where("s.ticket_id", "in", ticketIds)
      .where("r.status", "=", "open")
      .orderBy("r.created_at", "asc")
      .execute();
    for (const row of rows) {
      const entry = open.get(row.ticket_id) ?? { askedOf: [], since: row.created_at };
      if (row.user_id && row.user_name && !entry.askedOf.some((person) => person.id === row.user_id)) {
        entry.askedOf.push({ id: row.user_id, name: row.user_name });
      }
      open.set(row.ticket_id, entry);
    }
    return open;
  }

  /** Who merged each task's pull request, from the line the merge left in the thread. */
  async mergedBy(ticketIds: string[]): Promise<Map<string, string>> {
    if (ticketIds.length === 0) return new Map();
    const rows = await db
      .selectFrom("task_activity")
      .distinctOn("ticket_id")
      .select(["ticket_id", sql<string | null>`payload_json->>'mergedBy'`.as("merged_by")])
      .where("ticket_id", "in", ticketIds)
      .where("kind", "=", "pull_request_merged")
      .orderBy("ticket_id")
      .orderBy("created_at", "desc")
      .execute();
    return new Map(rows.flatMap((row) => (row.merged_by ? [[row.ticket_id, row.merged_by]] : [])));
  }
}
