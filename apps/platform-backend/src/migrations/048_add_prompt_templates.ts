import { Kysely, sql } from "kysely";
import { Database } from "../persistence/types/database";

const TICKET_RESEARCH_TEMPLATE = `Create a research document for this ticket.

Requirements:
- Read and follow repository instructions from AGENTS.md and any provided instruction files.
- Analyze the repository and relevant code paths for this ticket.
- Do not create a branch, commit changes, push changes, or open a pull request.
- Do not modify application code unless it is strictly necessary to produce RESEARCH.md.
- Write your output to RESEARCH.md in the repository root.

RESEARCH.md should include:
- Summary
- Relevant Code Areas
- Root Cause Analysis
- Constraints and Risks
- Recommended Next Steps

---

{{#externalTicketId}}External Ticket ID: {{externalTicketId}}

{{/externalTicketId}}{{ticketTitle}}

{{ticketDescription}}`;

const TICKET_RESEARCH_REVISION_TEMPLATE = `{{initialMessage}}{{#researchDocument}}

---

## Current Research Document

{{researchDocument}}{{/researchDocument}}{{#openComments}}

---

## Open Review Comments

{{openComments}}{{/openComments}}

---

Please update the research document to address the feedback above and rewrite RESEARCH.md.`;

const TICKET_PLANNING_WITH_RESEARCH_TEMPLATE = `Create a planning document for this ticket based on the research findings.

Requirements:
- Read and follow repository instructions from AGENTS.md and any provided instruction files.
- Analyze the research document to understand the problem.
- Create a detailed implementation plan.
- Do not create a branch, commit changes, push changes, or open a pull request.
- Do not modify application code unless it is strictly necessary to produce PLAN.md.
- Write your output to PLAN.md in the repository root.

PLAN.md should include:
- Summary of the Problem
- Proposed Solution
- Implementation Steps
- Files to Modify
- Testing Strategy
- Risks and Mitigations

---

{{#externalTicketId}}External Ticket ID: {{externalTicketId}}

{{/externalTicketId}}{{ticketTitle}}

{{ticketDescription}}

---

Research Document:
{{researchDocument}}`;

const TICKET_PLANNING_WITHOUT_RESEARCH_TEMPLATE = `Create a planning document for this ticket.

Requirements:
- Read and follow repository instructions from AGENTS.md and any provided instruction files.
- Analyze the ticket to understand the problem.
- Create a detailed implementation plan.
- Do not create a branch, commit changes, push changes, or open a pull request.
- Do not modify application code unless it is strictly necessary to produce PLAN.md.
- Write your output to PLAN.md in the repository root.

PLAN.md should include:
- Summary of the Problem
- Proposed Solution
- Implementation Steps
- Files to Modify
- Testing Strategy
- Risks and Mitigations

---

{{#externalTicketId}}External Ticket ID: {{externalTicketId}}

{{/externalTicketId}}{{ticketTitle}}

{{ticketDescription}}`;

const TICKET_PLANNING_REVISION_TEMPLATE = `{{initialMessage}}{{#researchDocument}}

---

## Approved Research Document

{{researchDocument}}{{/researchDocument}}{{#planDocument}}

---

## Current Planning Document

{{planDocument}}{{/planDocument}}{{#openComments}}

---

## Open Review Comments

{{openComments}}{{/openComments}}

---

Please update the planning document to address the feedback above and rewrite PLAN.md.`;

const TICKET_DEVELOPING_TEMPLATE = `You are an expert software engineer tasked with fixing a bug or implementing a feature.

Requirements:
- Read and follow repository instructions from AGENTS.md and any provided instruction files.
- Analyze the codebase to understand the context.
- Implement a minimal, focused solution.
- Write tests if required by project settings.

---

{{#externalTicketId}}External Ticket ID: {{externalTicketId}}

{{/externalTicketId}}{{ticketTitle}}

{{ticketDescription}}{{#researchDocument}}

---

## Research Document

{{researchDocument}}{{/researchDocument}}{{#planDocument}}

---

## Planning Document

{{planDocument}}{{/planDocument}}

---

IMPORTANT: After completing your work, you MUST output pull request metadata files in the repository root:

1) \`PR_TITLE.md\` containing only the PR title on a single line.
   - Use a concise, specific title describing the change.
   - Prefer conventional commit style: \`fix: ...\` for bug fixes, \`feat: ...\` for features.

2) \`PR_DESCRIPTION.md\` using the following format:

## Summary
[Brief description of what this PR does]

## Problem
[Description of the issue being fixed or feature being added]

## Solution
[Explanation of how you solved it]

## Changes Made
[List of key changes]

## Testing
[How the changes were verified]

Please proceed.`;

const CLAW_SCHEDULED_TASK_TEMPLATE = `You are an expert software engineer. Complete the scheduled task described below.

Requirements:
- Read and follow repository instructions from AGENTS.md and any provided instruction files.
- Implement the task with minimal, focused changes.

---

{{taskInstructions}}

---

IMPORTANT: After completing the task, you MUST output pull request metadata files in the repository root:

1) \`PR_TITLE.md\` containing only the PR title on a single line.
   - Use a concise, specific title describing what was done.
   - Prefer conventional commit style: \`feat: ...\`, \`fix: ...\`, etc.

2) \`PR_DESCRIPTION.md\` using the following format:

## Summary
[Brief description of what this PR does]

## Changes Made
[List of key changes]

## Testing
[How the changes were verified]

Please proceed with the task.`;

const SYSTEM_DEFAULTS: Array<{ prompt_type: string; template: string }> = [
  { prompt_type: "ticket_research", template: TICKET_RESEARCH_TEMPLATE },
  {
    prompt_type: "ticket_research_revision",
    template: TICKET_RESEARCH_REVISION_TEMPLATE,
  },
  {
    prompt_type: "ticket_planning_with_research",
    template: TICKET_PLANNING_WITH_RESEARCH_TEMPLATE,
  },
  {
    prompt_type: "ticket_planning_without_research",
    template: TICKET_PLANNING_WITHOUT_RESEARCH_TEMPLATE,
  },
  {
    prompt_type: "ticket_planning_revision",
    template: TICKET_PLANNING_REVISION_TEMPLATE,
  },
  { prompt_type: "ticket_developing", template: TICKET_DEVELOPING_TEMPLATE },
  {
    prompt_type: "claw_scheduled_task",
    template: CLAW_SCHEDULED_TASK_TEMPLATE,
  },
];

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .createTable("prompt_templates")
    .addColumn("id", "uuid", (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn("prompt_type", "varchar(100)", (col) => col.notNull())
    .addColumn("project_id", "uuid", (col) =>
      col.references("projects.id").onDelete("cascade"),
    )
    .addColumn("template", "text", (col) => col.notNull())
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn("updated_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  await sql`
    CREATE UNIQUE INDEX uq_prompt_templates_system
    ON prompt_templates (prompt_type)
    WHERE project_id IS NULL
  `.execute(db);

  await sql`
    CREATE UNIQUE INDEX uq_prompt_templates_project
    ON prompt_templates (prompt_type, project_id)
    WHERE project_id IS NOT NULL
  `.execute(db);

  await sql`
    CREATE OR REPLACE FUNCTION update_prompt_templates_updated_at()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = now();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `.execute(db);

  await sql`
    CREATE TRIGGER prompt_templates_updated_at
    BEFORE UPDATE ON prompt_templates
    FOR EACH ROW EXECUTE FUNCTION update_prompt_templates_updated_at()
  `.execute(db);

  for (const row of SYSTEM_DEFAULTS) {
    await db
      .insertInto("prompt_templates")
      .values({
        prompt_type: row.prompt_type,
        project_id: null,
        template: row.template,
      })
      .execute();
  }
}

export async function down(db: Kysely<Database>): Promise<void> {
  await sql`DROP TRIGGER IF EXISTS prompt_templates_updated_at ON prompt_templates`.execute(db);
  await sql`DROP FUNCTION IF EXISTS update_prompt_templates_updated_at`.execute(db);
  await db.schema.dropTable("prompt_templates").execute();
}
