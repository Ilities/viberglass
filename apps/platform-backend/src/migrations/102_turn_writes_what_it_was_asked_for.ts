import { Kysely, sql } from "kysely";
import { TASK_TURN_COLD_START_TEMPLATE as COLD_START_BEFORE, TASK_TURN_TEMPLATE as TURN_BEFORE } from "./088_agent_questions";

// A turn keeps only the documents it was asked for, and the seeded template
// tells the agent so instead of inviting it to rewrite all three.

const FILES_BEFORE =
  "which hold their current versions. Write a new version by rewriting the file.";
const FILES_AFTER =
  "which hold their current versions. Rewrite only the one you were asked for, in full: Viberglass keeps no other changes to them.";

export const TASK_TURN_TEMPLATE = TURN_BEFORE.replace(FILES_BEFORE, FILES_AFTER);
export const TASK_TURN_COLD_START_TEMPLATE = COLD_START_BEFORE;

async function replaceIn(db: Kysely<any>, from: string, to: string): Promise<void> {
  await sql`UPDATE prompt_templates SET template = replace(template, ${from}, ${to}) WHERE prompt_type = 'task_turn'`.execute(db);
}

export async function up(db: Kysely<any>): Promise<void> {
  await replaceIn(db, FILES_BEFORE, FILES_AFTER);
}

export async function down(db: Kysely<any>): Promise<void> {
  await replaceIn(db, FILES_AFTER, FILES_BEFORE);
}
