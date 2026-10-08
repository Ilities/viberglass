import { Kysely, sql } from "kysely";
import { TASK_TURN_COLD_START_TEMPLATE as COLD_START_BEFORE, TASK_TURN_TEMPLATE as TURN_BEFORE } from "./112_intent_in_plain_words";

// A plan's part can be marked done or skipped when that's known some other
// way than its pull request merging, so later parts can be built and the task
// can finish. A build can also add the next part to the open pull request.
const ANCHOR = "{{/buildParts}}";
const ADD_PARTS =
  "{{#addParts}}This build adds {{addParts}} of the plan to the open pull request, which already builds {{addedTo}}: build only the part added, on top of what's there, and leave the other parts for later builds.\n{{/addParts}}";

export const TASK_TURN_TEMPLATE = TURN_BEFORE.replace(ANCHOR, `${ANCHOR}${ADD_PARTS}`);
export const TASK_TURN_COLD_START_TEMPLATE = COLD_START_BEFORE;

async function replaceIn(db: Kysely<any>, from: string, to: string): Promise<void> {
  await sql`UPDATE prompt_templates SET template = replace(template, ${from}, ${to}) WHERE prompt_type = 'task_turn'`.execute(db);
}

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("task_plan_part_marks")
    .addColumn("ticket_id", "uuid", (col) => col.notNull().references("tickets.id").onDelete("cascade"))
    .addColumn("part_number", "integer", (col) => col.notNull())
    .addColumn("mark", "varchar(16)", (col) => col.notNull().check(sql`mark IN ('done', 'skipped')`))
    .addColumn("marked_by", "uuid", (col) => col.references("users.id").onDelete("set null"))
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addPrimaryKeyConstraint("pk_task_plan_part_marks", ["ticket_id", "part_number"])
    .execute();
  await replaceIn(db, ANCHOR, `${ANCHOR}${ADD_PARTS}`);
}

export async function down(db: Kysely<any>): Promise<void> {
  await replaceIn(db, ADD_PARTS, "");
  await db.schema.dropTable("task_plan_part_marks").execute();
}
