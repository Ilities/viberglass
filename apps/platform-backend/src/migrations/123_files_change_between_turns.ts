import { Kysely, sql } from "kysely";
import { TASK_TURN_COLD_START_TEMPLATE as COLD_START_BEFORE, TASK_TURN_TEMPLATE as TURN_BEFORE } from "./122_artifact_turn_prompt";

// A Files space's files are shared: people and other tasks change them between
// an agent's turns, so what it remembers of a file may be out of date.
const BEFORE = "Leave files nobody asked about as they are.\n{{/filesSpace}}";
const AFTER =
  "Leave files nobody asked about as they are. People and other tasks change these files between your turns, so read a file again before you rely on what it says.\n{{/filesSpace}}";

export const TASK_TURN_TEMPLATE = TURN_BEFORE.replace(BEFORE, AFTER);
export const TASK_TURN_COLD_START_TEMPLATE = COLD_START_BEFORE;

async function replaceIn(db: Kysely<any>, from: string, to: string): Promise<void> {
  await sql`UPDATE prompt_templates SET template = replace(template, ${from}, ${to}) WHERE prompt_type = 'task_turn'`.execute(db);
}

export async function up(db: Kysely<any>): Promise<void> {
  await replaceIn(db, BEFORE, AFTER);
}

export async function down(db: Kysely<any>): Promise<void> {
  await replaceIn(db, AFTER, BEFORE);
}
