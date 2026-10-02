import { Kysely, sql } from "kysely";
import { TASK_TURN_COLD_START_TEMPLATE as COLD_START_BEFORE, TASK_TURN_TEMPLATE as TURN_BEFORE } from "./083_task_turns";

// Compaction and more than one agent (task-conversation-handover S6). A
// summarise turn writes SUMMARY.md: the decisions, who agreed to them and the
// open questions. Each is a numbered version, pinned in the thread, and every
// cold start reads the latest. The seeded templates gain the summary by
// replacing only the lines that change, so edits elsewhere in them survive.

const SUMMARISE_BEFORE = "{{#summarise}}Summarise the conversation so far: the decisions, who agreed to them, and the open questions.\n";
const SUMMARISE_AFTER =
  "{{#summarise}}Summarise the conversation so far in SUMMARY.md: the decisions, who agreed to them, and the open questions. Rewrite the file in full; it replaces the earlier summary, so keep what still holds.\n";
const FILES_BEFORE = "- The research and the plan live in RESEARCH.md and PLAN.md in the repository root, which hold their current versions.";
const FILES_AFTER =
  "- The research, the plan and the summary of the conversation live in RESEARCH.md, PLAN.md and SUMMARY.md in the repository root, which hold their current versions.";
const COLD_START_ANCHOR = "</task>\n{{#researchDocument}}";
const COLD_START_WITH_SUMMARY =
  "</task>\n{{#summaryDocument}}\n<summary-so-far>\n{{summaryDocument}}\n</summary-so-far>\n{{/summaryDocument}}{{#researchDocument}}";

export const TASK_TURN_TEMPLATE = TURN_BEFORE.replace(SUMMARISE_BEFORE, SUMMARISE_AFTER).replace(FILES_BEFORE, FILES_AFTER);
export const TASK_TURN_COLD_START_TEMPLATE = COLD_START_BEFORE.replace(COLD_START_ANCHOR, COLD_START_WITH_SUMMARY);

async function replaceIn(db: Kysely<any>, promptType: string, from: string, to: string): Promise<void> {
  await sql`UPDATE prompt_templates SET template = replace(template, ${from}, ${to}) WHERE prompt_type = ${promptType}`.execute(db);
}

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("task_summaries")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("ticket_id", "uuid", (col) => col.notNull().references("tickets.id").onDelete("cascade"))
    .addColumn("version", "integer", (col) => col.notNull())
    .addColumn("content", "text", (col) => col.notNull())
    .addColumn("agent_turn_id", "uuid", (col) => col.references("agent_turns.id").onDelete("set null"))
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addUniqueConstraint("task_summaries_ticket_version", ["ticket_id", "version"])
    .execute();

  await replaceIn(db, "task_turn", SUMMARISE_BEFORE, SUMMARISE_AFTER);
  await replaceIn(db, "task_turn", FILES_BEFORE, FILES_AFTER);
  await replaceIn(db, "task_turn_cold_start", COLD_START_ANCHOR, COLD_START_WITH_SUMMARY);
}

export async function down(db: Kysely<any>): Promise<void> {
  await replaceIn(db, "task_turn_cold_start", COLD_START_WITH_SUMMARY, COLD_START_ANCHOR);
  await replaceIn(db, "task_turn", FILES_AFTER, FILES_BEFORE);
  await replaceIn(db, "task_turn", SUMMARISE_AFTER, SUMMARISE_BEFORE);
  await db.schema.dropTable("task_summaries").execute();
}
