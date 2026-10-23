import { TICKET_WORKFLOW_PHASE } from "@viberglass/types";
import db from "../config/database";

/** A task as it was at one moment, read for forking it, and copied onto the fork. */
export class TaskForkDAO {
  /** When the task's agent turn `turnId` finished; null when it isn't one of the task's finished turns. */
  async turnFinishedAt(ticketId: string, turnId: string): Promise<Date | null> {
    const row = await db
      .selectFrom("agent_turns")
      .innerJoin("agent_sessions", "agent_sessions.id", "agent_turns.session_id")
      .select("agent_turns.completed_at")
      .where("agent_turns.id", "=", turnId)
      .where("agent_turns.role", "=", "assistant")
      .where("agent_sessions.ticket_id", "=", ticketId)
      .executeTakeFirst();
    return row?.completed_at ?? null;
  }

  /** The last commit a run pushed for the task by `at`, and the branch it went to. */
  async lastCommitBy(ticketId: string, at: Date): Promise<{ branch: string; commit: string } | null> {
    const row = await db
      .selectFrom("job_run_manifests")
      .select(["branch", "commit_sha"])
      .where("ticket_id", "=", ticketId)
      .where("commit_sha", "is not", null)
      .where("branch", "is not", null)
      .where("finished_at", "<=", at)
      .orderBy("finished_at", "desc")
      .limit(1)
      .executeTakeFirst();
    return row?.branch && row.commit_sha ? { branch: row.branch, commit: row.commit_sha } : null;
  }

  async planAt(ticketId: string, at: Date): Promise<string | null> {
    const row = await db
      .selectFrom("ticket_phase_document_revisions")
      .select("content")
      .where("ticket_id", "=", ticketId)
      .where("phase", "=", TICKET_WORKFLOW_PHASE.PLANNING)
      .where("created_at", "<=", at)
      .orderBy("created_at", "desc")
      .limit(1)
      .executeTakeFirst();
    return row?.content ?? null;
  }

  async summaryAt(ticketId: string, at: Date): Promise<string | null> {
    const row = await db
      .selectFrom("task_summaries")
      .select("content")
      .where("ticket_id", "=", ticketId)
      .where("created_at", "<=", at)
      .orderBy("version", "desc")
      .limit(1)
      .executeTakeFirst();
    return row?.content ?? null;
  }

  /** Writes what people said to an agent in the original's live sessions into the fork's thread, as of when they said it. */
  async addMessages(ticketId: string, messages: Array<{ authorId: string | null; body: string; at: Date }>): Promise<void> {
    if (messages.length === 0) return;
    await db
      .insertInto("task_messages")
      .values(messages.map((message) => ({ ticket_id: ticketId, author_id: message.authorId, body_markdown: message.body, created_at: message.at })))
      .execute();
  }

  /**
   * Copies what people wrote in the thread by `at`, with its images and when
   * it was written, the task's reviewers and watchers, and the plan parts
   * marked finished. The fork has its own owner and requester already.
   */
  async copyThread(fromTicketId: string, toTicketId: string, at: Date): Promise<void> {
    await db.transaction().execute(async (trx) => {
      const messages = await trx
        .selectFrom("task_messages")
        .selectAll()
        .where("ticket_id", "=", fromTicketId)
        .where("created_at", "<=", at)
        .orderBy("created_at", "asc")
        .execute();
      for (const message of messages) {
        const copy = await trx
          .insertInto("task_messages")
          .values({
            ticket_id: toTicketId,
            author_id: message.author_id,
            body_markdown: message.body_markdown,
            external_author_name: message.external_author_name,
            external_source: message.external_source,
            created_at: message.created_at,
            edited_at: message.edited_at,
          })
          .returning("id")
          .executeTakeFirstOrThrow();
        const images = await trx.selectFrom("task_message_images").selectAll().where("message_id", "=", message.id).execute();
        if (images.length > 0) {
          await trx
            .insertInto("task_message_images")
            .values(images.map((image) => ({ message_id: copy.id, media_id: image.media_id, position: image.position })))
            .execute();
        }
      }

      const participants = await trx
        .selectFrom("task_participants")
        .selectAll()
        .where("ticket_id", "=", fromTicketId)
        .where("role", "in", ["reviewer", "watcher"])
        .execute();
      if (participants.length > 0) {
        await trx
          .insertInto("task_participants")
          .values(participants.map((p) => ({ ticket_id: toTicketId, user_id: p.user_id, role: p.role, added_by: p.added_by })))
          .onConflict((oc) => oc.doNothing())
          .execute();
      }

      const marks = await trx
        .selectFrom("task_plan_part_marks")
        .selectAll()
        .where("ticket_id", "=", fromTicketId)
        .where("created_at", "<=", at)
        .execute();
      if (marks.length > 0) {
        await trx
          .insertInto("task_plan_part_marks")
          .values(marks.map((mark) => ({ ticket_id: toTicketId, part_number: mark.part_number, mark: mark.mark, marked_by: mark.marked_by })))
          .execute();
      }
    });
  }
}
