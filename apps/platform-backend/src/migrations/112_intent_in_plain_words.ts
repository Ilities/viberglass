import { Kysely, sql } from "kysely";
import { TASK_TURN_COLD_START_TEMPLATE as COLD_START_BEFORE, TASK_TURN_TEMPLATE as TURN_BEFORE } from "./107_build_plan_parts";

// The reply's first line is shown to the people on the task, who know the plan
// and the summary, not the files the agent keeps them in.

const INTENT_BEFORE = `such as "Revising the plan: adding the point about the packing slip". Then do it.`;
const INTENT_AFTER = `such as "Revising the plan: adding the point about the packing slip". Say it in the words the people on the task use: "the plan", not file names like PLAN.md or paths in your working copy. Then do it.`;

export const TASK_TURN_TEMPLATE = TURN_BEFORE.replace(INTENT_BEFORE, INTENT_AFTER);
export const TASK_TURN_COLD_START_TEMPLATE = COLD_START_BEFORE;

async function replaceIn(db: Kysely<any>, from: string, to: string): Promise<void> {
  await sql`UPDATE prompt_templates SET template = replace(template, ${from}, ${to}) WHERE prompt_type = 'task_turn'`.execute(db);
}

export async function up(db: Kysely<any>): Promise<void> {
  await replaceIn(db, INTENT_BEFORE, INTENT_AFTER);
}

export async function down(db: Kysely<any>): Promise<void> {
  await replaceIn(db, INTENT_AFTER, INTENT_BEFORE);
}
