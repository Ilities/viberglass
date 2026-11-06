import { Kysely, sql } from "kysely";
import { CLAW_SCHEDULED_TASK_TEMPLATE as SCHEDULED_BEFORE } from "./126_files_scheduled_task_prompt";
import {
  TASK_TURN_COLD_START_TEMPLATE as COLD_START_BEFORE,
  TASK_TURN_TEMPLATE as TURN_BEFORE,
} from "./127_files_turns_declare_artifacts";

const BEFORE = "Viberglass keeps a version of exactly those files.";
const AFTER = "Viberglass keeps a version of exactly those files. Your reply is for people, so don't mention the declaration or its file.";

export const TASK_TURN_TEMPLATE = TURN_BEFORE.split(BEFORE).join(AFTER);
export const TASK_TURN_COLD_START_TEMPLATE = COLD_START_BEFORE;
export const CLAW_SCHEDULED_TASK_TEMPLATE = SCHEDULED_BEFORE.split(BEFORE).join(AFTER);

async function replaceIn(db: Kysely<any>, from: string, to: string): Promise<void> {
  await sql`UPDATE prompt_templates SET template = replace(template, ${from}, ${to}) WHERE prompt_type IN ('task_turn', 'claw_scheduled_task')`.execute(db);
}

export async function up(db: Kysely<any>): Promise<void> {
  await replaceIn(db, BEFORE, AFTER);
}

export async function down(db: Kysely<any>): Promise<void> {
  await replaceIn(db, AFTER, BEFORE);
}
