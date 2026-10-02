import { Kysely, sql } from "kysely";
import { TASK_TURN_COLD_START_TEMPLATE as COLD_START_BEFORE, TASK_TURN_TEMPLATE as TURN_BEFORE } from "./087_task_summaries";

// Agents ask people questions with the ask_human tool. A question is an open
// input request addressed to someone on the task, blocking or not, with the
// options it offered; it's answered by a message in the thread, and reminds
// its addressee, then the task's owner, when nobody answers. A session can have
// several open. The seeded templates tell agents to ask, and who is on the task.

const ASK_ANCHOR = "- Don't create branches, commit, push or open pull requests. Viberglass does that.\n";
const ASK_LINE =
  "- When you need a decision or a fact only a person can give, ask with the ask_human tool instead of guessing or writing \"needs confirmation\" into a document. Ask whoever can answer: the requester, the owner, a reviewer, or someone on the task by name.\n";
const PEOPLE_ANCHOR = "{{/externalTicketId}}</task>";
const PEOPLE_SECTION = "{{/externalTicketId}}{{#people}}<people>\n{{people}}\n</people>\n{{/people}}</task>";

export const TASK_TURN_TEMPLATE = TURN_BEFORE.replace(ASK_ANCHOR, `${ASK_ANCHOR}${ASK_LINE}`);
export const TASK_TURN_COLD_START_TEMPLATE = COLD_START_BEFORE.replace(PEOPLE_ANCHOR, PEOPLE_SECTION);

async function replaceIn(db: Kysely<any>, promptType: string, from: string, to: string): Promise<void> {
  await sql`UPDATE prompt_templates SET template = replace(template, ${from}, ${to}) WHERE prompt_type = ${promptType}`.execute(db);
}

export async function up(db: Kysely<any>): Promise<void> {
  await sql`DROP INDEX IF EXISTS uq_agent_pending_requests_session_open`.execute(db);
  await db.schema
    .alterTable("agent_pending_requests")
    .addColumn("addressee_user_id", "uuid", (col) => col.references("users.id").onDelete("set null"))
    .addColumn("addressee_role", "varchar(20)")
    .addColumn("blocking", "boolean", (col) => col.notNull().defaultTo(true))
    .addColumn("options_json", "jsonb")
    .addColumn("due_at", "timestamptz")
    .addColumn("reminded_at", "timestamptz")
    .addColumn("escalated_at", "timestamptz")
    .addColumn("answer_message_id", "uuid", (col) => col.references("task_messages.id").onDelete("set null"))
    .execute();
  // The reminder sweep reads open questions by when they fall due.
  await db.schema
    .createIndex("idx_agent_pending_requests_open_due")
    .on("agent_pending_requests")
    .columns(["status", "due_at"])
    .execute();

  await db.schema
    .alterTable("projects")
    .addColumn("question_reminder_hours", "integer", (col) => col.notNull().defaultTo(4))
    .execute();

  await replaceIn(db, "task_turn", ASK_ANCHOR, `${ASK_ANCHOR}${ASK_LINE}`);
  await replaceIn(db, "task_turn_cold_start", PEOPLE_ANCHOR, PEOPLE_SECTION);
}

export async function down(db: Kysely<any>): Promise<void> {
  await replaceIn(db, "task_turn_cold_start", PEOPLE_SECTION, PEOPLE_ANCHOR);
  await replaceIn(db, "task_turn", `${ASK_ANCHOR}${ASK_LINE}`, ASK_ANCHOR);
  await db.schema.alterTable("projects").dropColumn("question_reminder_hours").execute();
  await db.schema.dropIndex("idx_agent_pending_requests_open_due").execute();
  await db.schema
    .alterTable("agent_pending_requests")
    .dropColumn("addressee_user_id")
    .dropColumn("addressee_role")
    .dropColumn("blocking")
    .dropColumn("options_json")
    .dropColumn("due_at")
    .dropColumn("reminded_at")
    .dropColumn("escalated_at")
    .dropColumn("answer_message_id")
    .execute();
  // Only one open request per session again: close all but each session's latest.
  await sql`
    UPDATE agent_pending_requests r SET status = 'cancelled'
    WHERE r.status = 'open' AND EXISTS (
      SELECT 1 FROM agent_pending_requests n
      WHERE n.session_id = r.session_id AND n.status = 'open' AND n.created_at > r.created_at
    )
  `.execute(db);
  await sql`
    CREATE UNIQUE INDEX uq_agent_pending_requests_session_open
    ON agent_pending_requests (session_id)
    WHERE status = 'open'
  `.execute(db);
}
