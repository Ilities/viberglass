import { Kysely, sql } from "kysely";
import {
  TASK_TURN_COLD_START_TEMPLATE as COLD_START_BEFORE,
  TASK_TURN_TEMPLATE as TURN_BEFORE,
} from "./123_files_change_between_turns";

// A build's pull request is read by people outside Viberglass, so the agent
// writes its title and description from what it actually changed, rather
// than Viberglass guessing from the task.
const BEFORE = "Run the tests that cover it if you can.\n{{/buildIt}}";
const AFTER =
  "Run the tests that cover it if you can. Then write PR_TITLE.md, one line under 72 characters naming the change, and PR_DESCRIPTION.md, a short Markdown description for reviewers: what changed and why, and how you tested it. Viberglass uses them for the pull request and doesn't commit them.\n{{/buildIt}}";

export const TASK_TURN_TEMPLATE = TURN_BEFORE.replace(BEFORE, AFTER);
export const TASK_TURN_COLD_START_TEMPLATE = COLD_START_BEFORE.replace(BEFORE, AFTER);

async function replaceIn(db: Kysely<any>, from: string, to: string): Promise<void> {
  await sql`UPDATE prompt_templates SET template = replace(template, ${from}, ${to}) WHERE prompt_type IN ('task_turn', 'task_turn_cold_start')`.execute(db);
}

export async function up(db: Kysely<any>): Promise<void> {
  await replaceIn(db, BEFORE, AFTER);
}

export async function down(db: Kysely<any>): Promise<void> {
  await replaceIn(db, AFTER, BEFORE);
}
