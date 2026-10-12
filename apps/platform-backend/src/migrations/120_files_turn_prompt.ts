import { Kysely, sql } from "kysely";
import { TASK_TURN_COLD_START_TEMPLATE as COLD_START_BEFORE, TASK_TURN_TEMPLATE as TURN_BEFORE } from "./115_plan_part_marks";

// In a Files space the agent works in the space's shared files, which are
// saved after every turn, so it isn't told its changes are thrown away. The
// renderer doesn't nest sections, so each rule gets a flag of its own.
const GIT_FILES_RULE =
  "{{#allowCode}}- Change the code as needed. Viberglass commits your changes to the task's branch and its pull request.\n{{/allowCode}}{{^allowCode}}- Don't change any other file in the repository: nobody asked for code this time, and code changes are thrown away.\n{{/allowCode}}";
const EITHER_RULE =
  "{{#allowCode}}- Change the code as needed. Viberglass commits your changes to the task's branch and its pull request.\n{{/allowCode}}{{#discardCode}}- Don't change any other file in the repository: nobody asked for code this time, and code changes are thrown away.\n{{/discardCode}}{{#filesSpace}}- Your working directory holds this space's shared files, not a repository. Create, change or remove files there as the request needs: Viberglass saves them after your turn, for later turns and the space's other tasks. Leave files nobody asked about as they are.\n{{/filesSpace}}";

export const TASK_TURN_TEMPLATE = TURN_BEFORE.replace(GIT_FILES_RULE, EITHER_RULE);
export const TASK_TURN_COLD_START_TEMPLATE = COLD_START_BEFORE;

async function replaceIn(db: Kysely<any>, from: string, to: string): Promise<void> {
  await sql`UPDATE prompt_templates SET template = replace(template, ${from}, ${to}) WHERE prompt_type = 'task_turn'`.execute(db);
}

export async function up(db: Kysely<any>): Promise<void> {
  await replaceIn(db, GIT_FILES_RULE, EITHER_RULE);
}

export async function down(db: Kysely<any>): Promise<void> {
  await replaceIn(db, EITHER_RULE, GIT_FILES_RULE);
}
