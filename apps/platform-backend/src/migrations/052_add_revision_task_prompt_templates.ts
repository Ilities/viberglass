import { Kysely, sql } from "kysely";
import type { Database } from "../persistence/types/database";

const TICKET_RESEARCH_REVISION_TASK_TEMPLATE = `Revise the existing research document based on user feedback.

Requirements:
- Read and follow repository instructions from AGENTS.md and any provided instruction files.
- Read the current RESEARCH.md and the user's requested changes in the conversation.
- Apply the revisions and improvements requested.
- Do not create a branch, commit changes, push changes, or open a pull request.
- Rewrite RESEARCH.md with the changes applied.`;

const TICKET_PLANNING_REVISION_TASK_TEMPLATE = `Revise the existing planning document based on user feedback.

Requirements:
- Read and follow repository instructions from AGENTS.md and any provided instruction files.
- Read the current PLAN.md and the user's requested changes in the conversation.
- Apply the revisions and improvements requested.
- Do not create a branch, commit changes, push changes, or open a pull request.
- Rewrite PLAN.md with the changes applied.`;

export async function up(db: Kysely<Database>): Promise<void> {
  // Insert two new task-directive templates for revision sessions
  await db
    .insertInto("prompt_templates")
    .values({
      prompt_type: "ticket_research_revision_task",
      project_id: null,
      template: TICKET_RESEARCH_REVISION_TASK_TEMPLATE,
    })
    .execute();

  await db
    .insertInto("prompt_templates")
    .values({
      prompt_type: "ticket_planning_revision_task",
      project_id: null,
      template: TICKET_PLANNING_REVISION_TASK_TEMPLATE,
    })
    .execute();

  // Fix footer wording in existing revision user-turn templates
  await sql`
    UPDATE prompt_templates
    SET template = replace(
      template,
      'Please update the research document to address the feedback above and rewrite RESEARCH.md.',
      'Please update the research document based on the above and rewrite RESEARCH.md.'
    )
    WHERE prompt_type = 'ticket_research_revision'
      AND project_id IS NULL
  `.execute(db);

  await sql`
    UPDATE prompt_templates
    SET template = replace(
      template,
      'Please update the planning document to address the feedback above and rewrite PLAN.md.',
      'Please update the planning document based on the above and rewrite PLAN.md.'
    )
    WHERE prompt_type = 'ticket_planning_revision'
      AND project_id IS NULL
  `.execute(db);
}

export async function down(db: Kysely<Database>): Promise<void> {
  // Restore original footer wording
  await sql`
    UPDATE prompt_templates
    SET template = replace(
      template,
      'Please update the research document based on the above and rewrite RESEARCH.md.',
      'Please update the research document to address the feedback above and rewrite RESEARCH.md.'
    )
    WHERE prompt_type = 'ticket_research_revision'
      AND project_id IS NULL
  `.execute(db);

  await sql`
    UPDATE prompt_templates
    SET template = replace(
      template,
      'Please update the planning document based on the above and rewrite PLAN.md.',
      'Please update the planning document to address the feedback above and rewrite PLAN.md.'
    )
    WHERE prompt_type = 'ticket_planning_revision'
      AND project_id IS NULL
  `.execute(db);

  await db
    .deleteFrom("prompt_templates")
    .where("prompt_type", "in", [
      "ticket_research_revision_task",
      "ticket_planning_revision_task",
    ])
    .where("project_id", "is", null)
    .execute();
}
