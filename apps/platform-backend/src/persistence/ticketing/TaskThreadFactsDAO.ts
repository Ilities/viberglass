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

/** What many tasks' threads hold, at once, for their situations and Home (S4). */
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

  /** The agent's unanswered questions on each task, asked of whoever opened the session. */
  async openQuestions(ticketIds: string[]): Promise<Map<string, { askedOf: TaskPerson[]; since: Date }>> {
    if (ticketIds.length === 0) return new Map();
    const rows = await db
      .selectFrom("agent_pending_requests as r")
      .innerJoin("agent_sessions as s", "s.id", "r.session_id")
      .leftJoin("users as u", "u.id", "s.created_by")
      .distinctOn("s.ticket_id")
      .select(["s.ticket_id", "r.created_at", "u.id as user_id", "u.name as user_name"])
      .where("s.ticket_id", "in", ticketIds)
      .where("r.status", "=", "open")
      .orderBy("s.ticket_id")
      .orderBy("r.created_at", "asc")
      .execute();
    return new Map(
      rows.map((row) => [
        row.ticket_id,
        { askedOf: row.user_id && row.user_name ? [{ id: row.user_id, name: row.user_name }] : [], since: row.created_at },
      ]),
    );
  }
}
