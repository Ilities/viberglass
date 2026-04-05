import { Kysely } from "kysely";
import type { Database } from "../persistence/types/database";

const TICKET_RESEARCH_REVISION_TASK_TEMPLATE = `Revise the existing research document.

### CRITICAL FEEDBACK TO ADDRESS:
{{#revisionMessage}}
**User Revision Message:**
{{revisionMessage}}
{{/revisionMessage}}

{{#openComments}}
**Inline Comments to Address:**
{{openComments}}
{{/openComments}}

### Ticket Information:
- **Title:** {{ticketTitle}}
- **Description:** {{ticketDescription}}
{{#externalTicketId}}- **External Ticket ID:** {{externalTicketId}}{{/externalTicketId}}

### Current Research Document:
{{#researchDocument}}
\`\`\`markdown
{{researchDocument}}
\`\`\`
{{/researchDocument}}
{{^researchDocument}}
(No existing research document found)
{{/researchDocument}}

### Requirements:
1. Read and follow repository instructions from AGENTS.md and any provided instruction files.
2. Carefully review the current research document and all provided feedback (revision message and inline comments).
3. Apply the revisions and improvements requested. YOU MUST ADDRESS ALL INLINE COMMENTS.
4. Do not create a branch, commit changes, push changes, or open a pull request.
5. Write the revised document to RESEARCH.md.`;

const TICKET_PLANNING_REVISION_TASK_TEMPLATE = `Revise the existing planning document.

### CRITICAL FEEDBACK TO ADDRESS:
{{#revisionMessage}}
**User Revision Message:**
{{revisionMessage}}
{{/revisionMessage}}

{{#openComments}}
**Inline Comments to Address:**
{{openComments}}
{{/openComments}}

### Ticket Information:
- **Title:** {{ticketTitle}}
- **Description:** {{ticketDescription}}
{{#externalTicketId}}- **External Ticket ID:** {{externalTicketId}}{{/externalTicketId}}

### Research Document Context:
{{#researchDocument}}
\`\`\`markdown
{{researchDocument}}
\`\`\`
{{/researchDocument}}
{{^researchDocument}}
(No research document available)
{{/researchDocument}}

### Current Planning Document:
{{#planDocument}}
\`\`\`markdown
{{planDocument}}
\`\`\`
{{/planDocument}}
{{^planDocument}}
(No existing planning document found)
{{/planDocument}}

### Requirements:
1. Read and follow repository instructions from AGENTS.md and any provided instruction files.
2. Carefully review the research document, current planning document, and all provided feedback (revision message and inline comments).
3. Apply the revisions and improvements requested. YOU MUST ADDRESS ALL INLINE COMMENTS.
4. Do not create a branch, commit changes, push changes, or open a pull request.
5. Write the revised document to PLAN.md.`;

export async function up(db: Kysely<Database>): Promise<void> {
  await db
    .updateTable("prompt_templates")
    .set({ template: TICKET_RESEARCH_REVISION_TASK_TEMPLATE })
    .where("prompt_type", "=", "ticket_research_revision_task")
    .where("project_id", "is", null)
    .execute();

  await db
    .updateTable("prompt_templates")
    .set({ template: TICKET_PLANNING_REVISION_TASK_TEMPLATE })
    .where("prompt_type", "=", "ticket_planning_revision_task")
    .where("project_id", "is", null)
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  // Restore to 053 state
  await db
    .updateTable("prompt_templates")
    .set({
      template: `Revise the existing research document based on user feedback.

Requirements:
- Read and follow repository instructions from AGENTS.md and any provided instruction files.
- The current research document content is provided below. Revise it according to the user's requested changes.
- Apply the revisions and improvements requested.
- Do not create a branch, commit changes, push changes, or open a pull request.
- Write the revised document to RESEARCH.md.`,
    })
    .where("prompt_type", "=", "ticket_research_revision_task")
    .where("project_id", "is", null)
    .execute();

  await db
    .updateTable("prompt_templates")
    .set({
      template: `Revise the existing planning document based on user feedback.

Requirements:
- Read and follow repository instructions from AGENTS.md and any provided instruction files.
- The current planning document content is provided below. Revise it according to the user's requested changes.
- Apply the revisions and improvements requested.
- Do not create a branch, commit changes, push changes, or open a pull request.
- Write the revised document to PLAN.md.`,
    })
    .where("prompt_type", "=", "ticket_planning_revision_task")
    .where("project_id", "is", null)
    .execute();
}
