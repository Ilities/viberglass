import { Kysely, sql } from "kysely";

// The task turn engine (docs/ux/task-conversation-handover.md, S2): a task has
// one session per agent rather than per step, each turn records what it was
// asked for, a turn started from the thread links to the message that started
// it, and document revisions are numbered versions that know their turn.

export const TASK_TURN_TEMPLATE = `{{#threadMessages}}<thread>
{{threadMessages}}
</thread>

{{/threadMessages}}{{#newComments}}<new-comments>
{{newComments}}
</new-comments>

{{/newComments}}{{#editedArtifacts}}<edited-by-people>
{{editedArtifacts}}
</edited-by-people>

{{/editedArtifacts}}{{#pullRequestComments}}<pull-request-comments>
{{pullRequestComments}}
</pull-request-comments>

{{/pullRequestComments}}<what-to-do>
{{#writeResearch}}Write the research: read the code that matters for this task and write RESEARCH.md in the repository root, with a summary, the relevant code areas, the root cause, constraints and risks, and recommended next steps.
{{/writeResearch}}{{#reviseResearch}}Revise the research in RESEARCH.md to take in what's new above, and address every new comment. Rewrite the file in full.
{{/reviseResearch}}{{#writePlan}}Write the plan: write PLAN.md in the repository root, with a summary of the problem, the proposed solution, the implementation steps, the files to change, how to test it, and the risks.
{{/writePlan}}{{#revisePlan}}Revise the plan in PLAN.md to take in what's new above, and address every new comment. Rewrite the file in full.
{{/revisePlan}}{{#buildIt}}Build it: make the change in the code, following the plan if there is one. Run the tests that cover it if you can.
{{/buildIt}}{{#continuesPullRequest}}This continues the task's branch and pull request ({{pullRequestUrl}}): build on the commits already there.
{{/continuesPullRequest}}{{#reply}}Answer what was asked above. If someone asked for the research or the plan to change, rewrite that document as well.
{{/reply}}{{#summarise}}Summarise the conversation so far: the decisions, who agreed to them, and the open questions.
{{/summarise}}</what-to-do>

How to work:
- Start your reply with one line that says what you're about to do, such as "Revising the plan: adding the point about the packing slip". Then do it.
- The research and the plan live in RESEARCH.md and PLAN.md in the repository root, which hold their current versions. Write a new version by rewriting the file.
- Don't create branches, commit, push or open pull requests. Viberglass does that.
{{#allowCode}}- Change the code as needed. Viberglass commits your changes to the task's branch and its pull request.
{{/allowCode}}{{^allowCode}}- Don't change any other file in the repository: nobody asked for code this time, and code changes are thrown away.
{{/allowCode}}`;

export const TASK_TURN_COLD_START_TEMPLATE = `You're working on a task in Viberglass with the people on it. Each turn you get what's new in the task's thread. This is your first turn on it, so here's the task so far.

<task>
<title>{{ticketTitle}}</title>
<description>{{ticketDescription}}</description>
{{#externalTicketId}}<external-ticket-id>{{externalTicketId}}</external-ticket-id>
{{/externalTicketId}}</task>
{{#researchDocument}}
<current-research>
{{researchDocument}}
</current-research>
{{/researchDocument}}{{#planDocument}}
<current-plan>
{{planDocument}}
</current-plan>
{{/planDocument}}{{#pullRequestUrl}}
<pull-request>{{pullRequestUrl}}</pull-request>
{{/pullRequestUrl}}{{#earlierMessages}}
<earlier-messages>
{{earlierMessages}}
</earlier-messages>
{{/earlierMessages}}{{#earlierComments}}
<open-comments>
{{earlierComments}}
</open-comments>
{{/earlierComments}}
Read and follow the repository's instructions in AGENTS.md and any instruction files.`;

const TEMPLATES = [
  { prompt_type: "task_turn", template: TASK_TURN_TEMPLATE },
  { prompt_type: "task_turn_cold_start", template: TASK_TURN_COLD_START_TEMPLATE },
];

const JOB_KINDS_BEFORE = "'research', 'planning', 'execution', 'claw'";
const JOB_KINDS_AFTER = "'research', 'planning', 'execution', 'reply', 'claw'";

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable("agent_turns")
    .addColumn("action", "varchar(20)", (col) =>
      col.check(sql`action IN ('research', 'plan', 'code', 'reply', 'summarise')`),
    )
    .addColumn("task_message_id", "uuid", (col) => col.references("task_messages.id").onDelete("set null"))
    .execute();

  // One open session per agent on a task. Older duplicates (one per step) are closed.
  await sql`DROP INDEX IF EXISTS uq_agent_sessions_ticket_mode_active`.execute(db);
  await sql`
    UPDATE agent_sessions SET status = 'cancelled', completed_at = now(), updated_at = now()
    WHERE status IN ('active', 'waiting_on_user', 'waiting_on_approval')
      AND id NOT IN (
        SELECT DISTINCT ON (ticket_id, clanker_id) id FROM agent_sessions
        WHERE status IN ('active', 'waiting_on_user', 'waiting_on_approval')
        ORDER BY ticket_id, clanker_id, created_at DESC
      )
  `.execute(db);
  await sql`
    CREATE UNIQUE INDEX uq_agent_sessions_ticket_clanker_open
    ON agent_sessions (ticket_id, clanker_id)
    WHERE status IN ('active', 'waiting_on_user', 'waiting_on_approval')
  `.execute(db);

  await db.schema
    .alterTable("ticket_phase_document_revisions")
    .addColumn("version", "integer")
    .addColumn("agent_turn_id", "uuid", (col) => col.references("agent_turns.id").onDelete("set null"))
    .execute();
  await sql`
    UPDATE ticket_phase_document_revisions r SET version = numbered.version
    FROM (
      SELECT id, row_number() OVER (PARTITION BY ticket_id, phase ORDER BY created_at, id) AS version
      FROM ticket_phase_document_revisions
    ) numbered
    WHERE r.id = numbered.id
  `.execute(db);
  await sql`ALTER TABLE ticket_phase_document_revisions ALTER COLUMN version SET NOT NULL`.execute(db);

  await sql`ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_job_kind_check`.execute(db);
  await sql.raw(`ALTER TABLE jobs ADD CONSTRAINT jobs_job_kind_check CHECK (job_kind IN (${JOB_KINDS_AFTER}))`).execute(db);

  await db.insertInto("prompt_templates").values(TEMPLATES).execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db
    .deleteFrom("prompt_templates")
    .where("prompt_type", "in", TEMPLATES.map((t) => t.prompt_type))
    .execute();

  await db.deleteFrom("jobs").where("job_kind", "=", "reply").execute();
  await sql`ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_job_kind_check`.execute(db);
  await sql.raw(`ALTER TABLE jobs ADD CONSTRAINT jobs_job_kind_check CHECK (job_kind IN (${JOB_KINDS_BEFORE}))`).execute(db);

  await db.schema.alterTable("ticket_phase_document_revisions").dropColumn("agent_turn_id").dropColumn("version").execute();

  await sql`DROP INDEX IF EXISTS uq_agent_sessions_ticket_clanker_open`.execute(db);
  // Per (task, step) again: keep the newest open session of each.
  await sql`
    UPDATE agent_sessions SET status = 'cancelled', completed_at = now(), updated_at = now()
    WHERE status IN ('active', 'waiting_on_user', 'waiting_on_approval')
      AND id NOT IN (
        SELECT DISTINCT ON (ticket_id, mode) id FROM agent_sessions
        WHERE status IN ('active', 'waiting_on_user', 'waiting_on_approval')
        ORDER BY ticket_id, mode, created_at DESC
      )
  `.execute(db);
  await sql`
    CREATE UNIQUE INDEX uq_agent_sessions_ticket_mode_active
    ON agent_sessions (ticket_id, mode)
    WHERE status IN ('active', 'waiting_on_user', 'waiting_on_approval')
  `.execute(db);

  await db.schema.alterTable("agent_turns").dropColumn("task_message_id").dropColumn("action").execute();
}
