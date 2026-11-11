import { Kysely, sql } from "kysely";
import {
  TASK_TURN_COLD_START_TEMPLATE as COLD_START_BEFORE,
  TASK_TURN_TEMPLATE as TURN_BEFORE,
} from "./148_artifact_declaration_unmentioned";

// A task the browser extension created carries the page's details, console and
// failed requests; the agent gets them with the task, next to the screenshot.
const BEFORE = "{{/people}}</task>";
const AFTER =
  "{{/people}}{{#browserCapture}}<captured-by-browser-extension>\n{{browserCapture}}\n</captured-by-browser-extension>\n{{/browserCapture}}</task>";

export const TASK_TURN_TEMPLATE = TURN_BEFORE;
export const TASK_TURN_COLD_START_TEMPLATE = COLD_START_BEFORE.replace(BEFORE, AFTER);

async function replaceIn(db: Kysely<any>, from: string, to: string): Promise<void> {
  await sql`UPDATE prompt_templates SET template = replace(template, ${from}, ${to}) WHERE prompt_type = 'task_turn_cold_start'`.execute(db);
}

export async function up(db: Kysely<any>): Promise<void> {
  await replaceIn(db, BEFORE, AFTER);
}

export async function down(db: Kysely<any>): Promise<void> {
  await replaceIn(db, AFTER, BEFORE);
}
