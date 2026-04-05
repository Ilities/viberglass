import { Kysely, sql } from "kysely";
import type { Database } from "../persistence/types/database";

const TICKET_RESEARCH_REVISION_TASK_TEMPLATE = `Revise the existing research document based on user feedback.

Requirements:
- Read and follow repository instructions from AGENTS.md and any provided instruction files.
- The current research document content is provided below. Revise it according to the user's requested changes.
- Apply the revisions and improvements requested.
- Do not create a branch, commit changes, push changes, or open a pull request.
- Write the revised document to RESEARCH.md.`;

const TICKET_PLANNING_REVISION_TASK_TEMPLATE = `Revise the existing planning document based on user feedback.

Requirements:
- Read and follow repository instructions from AGENTS.md and any provided instruction files.
- The current planning document content is provided below. Revise it according to the user's requested changes.
- Apply the revisions and improvements requested.
- Do not create a branch, commit changes, push changes, or open a pull request.
- Write the revised document to PLAN.md.`;

export async function up(db: Kysely<Database>): Promise<void> {
  // Update the research revision task template to reference inline content
  await db
    .updateTable("prompt_templates")
    .set({ template: TICKET_RESEARCH_REVISION_TASK_TEMPLATE })
    .where("prompt_type", "=", "ticket_research_revision_task")
    .where("project_id", "is", null)
    .execute();

  // Update the planning revision task template to reference inline content
  await db
    .updateTable("prompt_templates")
    .set({ template: TICKET_PLANNING_REVISION_TASK_TEMPLATE })
    .where("prompt_type", "=", "ticket_planning_revision_task")
    .where("project_id", "is", null)
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  // Restore original research revision task template
  await db
    .updateTable("prompt_templates")
    .set({
      template: `Revise the existing research document based on user feedback.

Requirements:
- Read and follow repository instructions from AGENTS.md and any provided instruction files.
- Read the current RESEARCH.md and the user's requested changes in the conversation.
- Apply the revisions and improvements requested.
- Do not create a branch, commit changes, push changes, or open a pull request.
- Rewrite RESEARCH.md with the changes applied.`,
    })
    .where("prompt_type", "=", "ticket_research_revision_task")
    .where("project_id", "is", null)
    .execute();

  // Restore original planning revision task template
  await db
    .updateTable("prompt_templates")
    .set({
      template: `Revise the existing planning document based on user feedback.

Requirements:
- Read and follow repository instructions from AGENTS.md and any provided instruction files.
- Read the current PLAN.md and the user's requested changes in the conversation.
- Apply the revisions and improvements requested.
- Do not create a branch, commit changes, push changes, or open a pull request.
- Rewrite PLAN.md with the changes applied.`,
    })
    .where("prompt_type", "=", "ticket_planning_revision_task")
    .where("project_id", "is", null)
    .execute();
}
