import { Kysely, sql } from "kysely";
import { TASK_TURN_COLD_START_TEMPLATE as COLD_START_BEFORE, TASK_TURN_TEMPLATE as TURN_BEFORE } from "./104_plan_in_parts";

// A build covers some of the plan's parts, in a pull request of its own, and
// the parts already built keep their scope when the plan is revised.

const BUILD_ANCHOR = "{{/buildIt}}";
const BUILD_PARTS =
  "{{#buildParts}}This build is {{buildParts}} of the plan, in a pull request of its own: build only that, and leave the other parts for later builds.\n{{/buildParts}}";

const REVISE_ANCHOR = "{{/revisePlan}}";
const BUILT_PARTS =
  "{{#builtParts}}Built already, each in a pull request: {{builtParts}}. If you change the plan, keep those parts as they are and change only the parts that aren't built.\n{{/builtParts}}";

export const TASK_TURN_TEMPLATE = TURN_BEFORE.replace(BUILD_ANCHOR, `${BUILD_ANCHOR}${BUILD_PARTS}`).replace(REVISE_ANCHOR, `${REVISE_ANCHOR}${BUILT_PARTS}`);
export const TASK_TURN_COLD_START_TEMPLATE = COLD_START_BEFORE;

async function replaceIn(db: Kysely<any>, from: string, to: string): Promise<void> {
  await sql`UPDATE prompt_templates SET template = replace(template, ${from}, ${to}) WHERE prompt_type = 'task_turn'`.execute(db);
}

export async function up(db: Kysely<any>): Promise<void> {
  // The parts a build was asked for; no first part means it continues the open pull request.
  await db.schema.alterTable("agent_turns").addColumn("build_first_part", "integer").addColumn("build_last_part", "integer").execute();
  await replaceIn(db, BUILD_ANCHOR, `${BUILD_ANCHOR}${BUILD_PARTS}`);
  await replaceIn(db, REVISE_ANCHOR, `${REVISE_ANCHOR}${BUILT_PARTS}`);
}

export async function down(db: Kysely<any>): Promise<void> {
  await replaceIn(db, BUILT_PARTS, "");
  await replaceIn(db, BUILD_PARTS, "");
  await db.schema.alterTable("agent_turns").dropColumn("build_first_part").dropColumn("build_last_part").execute();
}
