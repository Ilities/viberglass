import { Kysely, sql } from "kysely";
import { TASK_TURN_COLD_START_TEMPLATE as COLD_START_BEFORE, TASK_TURN_TEMPLATE as TURN_BEFORE } from "./102_turn_writes_what_it_was_asked_for";

// Research is no longer its own artifact: the plan starts with what the agent
// found in the code. Research documents, their comments, turns and runs are
// deleted, not folded into plans.

const WRITE_RESEARCH = `{{#writeResearch}}Write the research: read the code that matters for this task and write RESEARCH.md in the repository root, with a summary, the relevant code areas, the root cause, constraints and risks, and recommended next steps.
{{/writeResearch}}{{#reviseResearch}}Revise the research in RESEARCH.md to take in what's new above, and address every new comment. Rewrite the file in full.
{{/reviseResearch}}`;

const WRITE_PLAN_BEFORE =
  "Write the plan: write PLAN.md in the repository root, with a summary of the problem, the proposed solution, the implementation steps, the files to change, how to test it, and the risks.";
const WRITE_PLAN_AFTER =
  "Write the plan: read the code that matters for this task, then write PLAN.md in the repository root. Start with what you found: a summary of the problem, the relevant code areas, the root cause, and the constraints and risks. Then the proposed solution, the implementation steps, the files to change, and how to test it.";

const REPLY_BEFORE = "If someone asked for the research or the plan to change, rewrite that document as well.";
const REPLY_AFTER = "If someone asked for the plan to change, rewrite it as well.";

const FILES_BEFORE =
  "The research, the plan and the summary of the conversation live in RESEARCH.md, PLAN.md and SUMMARY.md in the repository root";
const FILES_AFTER = "The plan and the summary of the conversation live in PLAN.md and SUMMARY.md in the repository root";

const COLD_START_RESEARCH = `{{#researchDocument}}
<current-research>
{{researchDocument}}
</current-research>
{{/researchDocument}}`;

const TURN_EDITS: Array<[string, string]> = [
  [WRITE_RESEARCH, ""],
  [WRITE_PLAN_BEFORE, WRITE_PLAN_AFTER],
  [REPLY_BEFORE, REPLY_AFTER],
  [FILES_BEFORE, FILES_AFTER],
];

export const TASK_TURN_TEMPLATE = TURN_EDITS.reduce((template, [from, to]) => template.replace(from, to), TURN_BEFORE);
export const TASK_TURN_COLD_START_TEMPLATE = COLD_START_BEFORE.replace(COLD_START_RESEARCH, "");

const PHASES_BEFORE = "'research', 'planning', 'execution'";
const PHASES_AFTER = "'planning', 'execution'";
const JOB_KINDS_BEFORE = "'research', 'planning', 'execution', 'reply', 'claw', 'agent_login'";
const JOB_KINDS_AFTER = "'planning', 'execution', 'reply', 'claw', 'agent_login'";
const ACTIONS_BEFORE = "'research', 'plan', 'code', 'reply', 'summarise'";
const ACTIONS_AFTER = "'plan', 'code', 'reply', 'summarise'";

const CHECKS: Array<{ table: string; column: string; name: string; before: string; after: string }> = [
  { table: "tickets", column: "workflow_phase", name: "tickets_workflow_phase_check", before: PHASES_BEFORE, after: PHASES_AFTER },
  { table: "ticket_phase_documents", column: "phase", name: "ticket_phase_documents_phase_check", before: PHASES_BEFORE, after: PHASES_AFTER },
  { table: "ticket_phase_document_revisions", column: "phase", name: "ticket_phase_document_revisions_phase_check", before: PHASES_BEFORE, after: PHASES_AFTER },
  { table: "ticket_phase_document_comments", column: "phase", name: "ticket_phase_document_comments_phase_check", before: "'research', 'planning'", after: "'planning'" },
  { table: "ticket_phase_runs", column: "phase", name: "ticket_phase_runs_phase_check", before: "'research', 'planning'", after: "'planning'" },
  { table: "agent_sessions", column: "mode", name: "agent_sessions_mode_check", before: PHASES_BEFORE, after: PHASES_AFTER },
  { table: "jobs", column: "job_kind", name: "jobs_job_kind_check", before: JOB_KINDS_BEFORE, after: JOB_KINDS_AFTER },
  { table: "agent_turns", column: "action", name: "agent_turns_action_check", before: ACTIONS_BEFORE, after: ACTIONS_AFTER },
];

async function setCheck(db: Kysely<any>, check: (typeof CHECKS)[number], values: string): Promise<void> {
  await sql.raw(`ALTER TABLE ${check.table} DROP CONSTRAINT IF EXISTS ${check.name}`).execute(db);
  await sql.raw(`ALTER TABLE ${check.table} ADD CONSTRAINT ${check.name} CHECK (${check.column} IN (${values}))`).execute(db);
}

async function replaceIn(db: Kysely<any>, promptType: string, from: string, to: string): Promise<void> {
  await sql`UPDATE prompt_templates SET template = replace(template, ${from}, ${to}) WHERE prompt_type = ${promptType}`.execute(db);
}

export async function up(db: Kysely<any>): Promise<void> {
  await sql`DELETE FROM ticket_phase_document_comments WHERE phase = 'research'`.execute(db);
  await sql`DELETE FROM ticket_phase_document_revisions WHERE phase = 'research'`.execute(db);
  await sql`DELETE FROM ticket_phase_documents WHERE phase = 'research'`.execute(db);
  await sql`DELETE FROM ticket_phase_runs WHERE phase = 'research'`.execute(db);
  await sql`DELETE FROM agent_turns WHERE action = 'research'`.execute(db);
  await sql`DELETE FROM jobs WHERE job_kind = 'research'`.execute(db);
  await sql`DELETE FROM task_activity WHERE payload_json->>'step' = 'research'`.execute(db);
  // A session is the agent's on the task, whatever it was first asked for.
  await sql`UPDATE agent_sessions SET mode = 'planning' WHERE mode = 'research'`.execute(db);
  await sql`UPDATE tickets SET workflow_phase = 'planning' WHERE workflow_phase = 'research'`.execute(db);
  await sql`ALTER TABLE tickets ALTER COLUMN workflow_phase SET DEFAULT 'planning'`.execute(db);

  for (const check of CHECKS) await setCheck(db, check, check.after);

  for (const [from, to] of TURN_EDITS) await replaceIn(db, "task_turn", from, to);
  await replaceIn(db, "task_turn_cold_start", COLD_START_RESEARCH, "");
}

export async function down(db: Kysely<any>): Promise<void> {
  await replaceIn(db, "task_turn", `{{#writePlan}}${WRITE_PLAN_AFTER}`, `${WRITE_RESEARCH}{{#writePlan}}${WRITE_PLAN_BEFORE}`);
  for (const [from, to] of TURN_EDITS.slice(2)) await replaceIn(db, "task_turn", to, from);
  await replaceIn(db, "task_turn_cold_start", "{{/summaryDocument}}{{#planDocument}}", `{{/summaryDocument}}${COLD_START_RESEARCH}{{#planDocument}}`);

  for (const check of CHECKS) await setCheck(db, check, check.before);
  await sql`ALTER TABLE tickets ALTER COLUMN workflow_phase SET DEFAULT 'research'`.execute(db);
}
