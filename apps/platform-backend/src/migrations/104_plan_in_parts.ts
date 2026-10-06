import { Kysely, sql } from "kysely";
import { TASK_TURN_COLD_START_TEMPLATE as COLD_START_BEFORE, TASK_TURN_TEMPLATE as TURN_BEFORE } from "./103_plan_includes_research";

// A plan is written in parts, each built and reviewed as one pull request, and
// revising it keeps the parts' numbers so a part means the same thing throughout.

const WRITE_PLAN_BEFORE = "Then the proposed solution, the implementation steps, the files to change, and how to test it.";
const WRITE_PLAN_AFTER =
  "Then the proposed solution, and the implementation split into parts: each part is a `## Part 1: <title>` section, in the order they're built, with its steps and the files it changes, and small enough to review as one pull request. A small change is one part. End with how to test it.";

const REVISE_PLAN_BEFORE = "Revise the plan in PLAN.md to take in what's new above, and address every new comment. Rewrite the file in full.";
const REVISE_PLAN_AFTER =
  "Revise the plan in PLAN.md to take in what's new above, and address every new comment. Keep each part's number: don't renumber or merge parts, and add new parts after the last one. Rewrite the file in full.";

const TURN_EDITS: Array<[string, string]> = [
  [WRITE_PLAN_BEFORE, WRITE_PLAN_AFTER],
  [REVISE_PLAN_BEFORE, REVISE_PLAN_AFTER],
];

export const TASK_TURN_TEMPLATE = TURN_EDITS.reduce((template, [from, to]) => template.replace(from, to), TURN_BEFORE);
export const TASK_TURN_COLD_START_TEMPLATE = COLD_START_BEFORE;

async function replaceIn(db: Kysely<any>, from: string, to: string): Promise<void> {
  await sql`UPDATE prompt_templates SET template = replace(template, ${from}, ${to}) WHERE prompt_type = 'task_turn'`.execute(db);
}

export async function up(db: Kysely<any>): Promise<void> {
  for (const [from, to] of TURN_EDITS) await replaceIn(db, from, to);
}

export async function down(db: Kysely<any>): Promise<void> {
  for (const [from, to] of TURN_EDITS) await replaceIn(db, to, from);
}
