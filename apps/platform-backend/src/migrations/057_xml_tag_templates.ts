import { Kysely } from "kysely";
import type { Database } from "../persistence/types/database";

// --- New XML-tagged templates ---

const TICKET_RESEARCH_TEMPLATE = `Create a research document for this ticket.

<ticket>
<title>{{ticketTitle}}</title>
<description>{{ticketDescription}}</description>
{{#externalTicketId}}<external-ticket-id>{{externalTicketId}}</external-ticket-id>
{{/externalTicketId}}</ticket>

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
- Recommended Next Steps`;

const TICKET_RESEARCH_REVISION_TEMPLATE = `{{initialMessage}}
{{#researchDocument}}
<current-research-document>
{{researchDocument}}
</current-research-document>
{{/researchDocument}}{{#openComments}}
<open-review-comments>
{{openComments}}
</open-review-comments>
{{/openComments}}
Please update the research document to address the feedback above and rewrite RESEARCH.md.`;

const TICKET_RESEARCH_REVISION_TASK_TEMPLATE = `Revise the existing research document.

<feedback>
{{#revisionMessage}}<revision-message>
{{revisionMessage}}
</revision-message>
{{/revisionMessage}}{{#openComments}}<inline-comments>
{{openComments}}
</inline-comments>
{{/openComments}}</feedback>

<ticket>
<title>{{ticketTitle}}</title>
<description>{{ticketDescription}}</description>
{{#externalTicketId}}<external-ticket-id>{{externalTicketId}}</external-ticket-id>
{{/externalTicketId}}</ticket>

{{#researchDocument}}<current-research-document>
{{researchDocument}}
</current-research-document>
{{/researchDocument}}{{^researchDocument}}<current-research-document>(No existing research document found)</current-research-document>
{{/researchDocument}}
### Requirements:
1. Read and follow repository instructions from AGENTS.md and any provided instruction files.
2. Carefully review the current research document and all provided feedback (revision message and inline comments).
3. Apply the revisions and improvements requested. YOU MUST ADDRESS ALL INLINE COMMENTS.
4. Do not create a branch, commit changes, push changes, or open a pull request.
5. Write the revised document to RESEARCH.md.`;

const TICKET_PLANNING_WITH_RESEARCH_TEMPLATE = `Create a planning document for this ticket based on the research findings.

<ticket>
<title>{{ticketTitle}}</title>
<description>{{ticketDescription}}</description>
{{#externalTicketId}}<external-ticket-id>{{externalTicketId}}</external-ticket-id>
{{/externalTicketId}}</ticket>

<research-document>
{{researchDocument}}
</research-document>

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
- Risks and Mitigations`;

const TICKET_PLANNING_WITHOUT_RESEARCH_TEMPLATE = `Create a planning document for this ticket.

<ticket>
<title>{{ticketTitle}}</title>
<description>{{ticketDescription}}</description>
{{#externalTicketId}}<external-ticket-id>{{externalTicketId}}</external-ticket-id>
{{/externalTicketId}}</ticket>

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
- Risks and Mitigations`;

const TICKET_PLANNING_REVISION_TEMPLATE = `{{initialMessage}}
{{#researchDocument}}
<approved-research-document>
{{researchDocument}}
</approved-research-document>
{{/researchDocument}}{{#planDocument}}
<current-planning-document>
{{planDocument}}
</current-planning-document>
{{/planDocument}}{{#openComments}}
<open-review-comments>
{{openComments}}
</open-review-comments>
{{/openComments}}
Please update the planning document to address the feedback above and rewrite PLAN.md.`;

const TICKET_PLANNING_REVISION_TASK_TEMPLATE = `Revise the existing planning document.

<feedback>
{{#revisionMessage}}<revision-message>
{{revisionMessage}}
</revision-message>
{{/revisionMessage}}{{#openComments}}<inline-comments>
{{openComments}}
</inline-comments>
{{/openComments}}</feedback>

<ticket>
<title>{{ticketTitle}}</title>
<description>{{ticketDescription}}</description>
{{#externalTicketId}}<external-ticket-id>{{externalTicketId}}</external-ticket-id>
{{/externalTicketId}}</ticket>

{{#researchDocument}}<research-document>
{{researchDocument}}
</research-document>
{{/researchDocument}}{{^researchDocument}}<research-document>(No research document available)</research-document>
{{/researchDocument}}{{#planDocument}}<current-planning-document>
{{planDocument}}
</current-planning-document>
{{/planDocument}}{{^planDocument}}<current-planning-document>(No existing planning document found)</current-planning-document>
{{/planDocument}}
### Requirements:
1. Read and follow repository instructions from AGENTS.md and any provided instruction files.
2. Carefully review the research document, current planning document, and all provided feedback (revision message and inline comments).
3. Apply the revisions and improvements requested. YOU MUST ADDRESS ALL INLINE COMMENTS.
4. Do not create a branch, commit changes, push changes, or open a pull request.
5. Write the revised document to PLAN.md.`;

const TICKET_DEVELOPING_TEMPLATE = `You are an expert software engineer tasked with fixing a bug or implementing a feature.

<ticket>
{{#externalTicketId}}<external-ticket-id>{{externalTicketId}}</external-ticket-id>
{{/externalTicketId}}<title>{{ticketTitle}}</title>
<description>{{ticketDescription}}</description>
</ticket>

{{#researchDocument}}<research-document>
{{researchDocument}}
</research-document>
{{/researchDocument}}{{#planDocument}}<planning-document>
{{planDocument}}
</planning-document>
{{/planDocument}}Requirements:
- Read and follow repository instructions from AGENTS.md and any provided instruction files.
- Analyze the codebase to understand the context.
- Implement a minimal, focused solution.
- Write tests if required by project settings.

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

<task-instructions>
{{taskInstructions}}
</task-instructions>

Requirements:
- Read and follow repository instructions from AGENTS.md and any provided instruction files.
- Implement the task with minimal, focused changes.

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

// --- Pre-057 templates (restored by down()) ---

const OLD_TICKET_RESEARCH_TEMPLATE = `Create a research document for this ticket.

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

const OLD_TICKET_RESEARCH_REVISION_TEMPLATE = `{{initialMessage}}{{#researchDocument}}

---

## Current Research Document

{{researchDocument}}{{/researchDocument}}{{#openComments}}

---

## Open Review Comments

{{openComments}}{{/openComments}}

---

Please update the research document based on the above and rewrite RESEARCH.md.`;

const OLD_TICKET_RESEARCH_REVISION_TASK_TEMPLATE = `Revise the existing research document.

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

const OLD_TICKET_PLANNING_WITH_RESEARCH_TEMPLATE = `Create a planning document for this ticket based on the research findings.

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

const OLD_TICKET_PLANNING_WITHOUT_RESEARCH_TEMPLATE = `Create a planning document for this ticket.

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

const OLD_TICKET_PLANNING_REVISION_TEMPLATE = `{{initialMessage}}{{#researchDocument}}

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

Please update the planning document based on the above and rewrite PLAN.md.`;

const OLD_TICKET_PLANNING_REVISION_TASK_TEMPLATE = `Revise the existing planning document.

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

const OLD_TICKET_DEVELOPING_TEMPLATE = `You are an expert software engineer tasked with fixing a bug or implementing a feature.

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

const OLD_CLAW_SCHEDULED_TASK_TEMPLATE = `You are an expert software engineer. Complete the scheduled task described below.

Requirements:
- Read and follow repository instructions from AGENTS.md and any provided instruction files.
- Implement the task with minimal, focused changes.

---

{{taskInstructions}}

---

Please proceed with the task.`;

const NEW_TEMPLATES: Array<{ prompt_type: string; template: string }> = [
  { prompt_type: "ticket_research", template: TICKET_RESEARCH_TEMPLATE },
  {
    prompt_type: "ticket_research_revision",
    template: TICKET_RESEARCH_REVISION_TEMPLATE,
  },
  {
    prompt_type: "ticket_research_revision_task",
    template: TICKET_RESEARCH_REVISION_TASK_TEMPLATE,
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
  {
    prompt_type: "ticket_planning_revision_task",
    template: TICKET_PLANNING_REVISION_TASK_TEMPLATE,
  },
  { prompt_type: "ticket_developing", template: TICKET_DEVELOPING_TEMPLATE },
  {
    prompt_type: "claw_scheduled_task",
    template: CLAW_SCHEDULED_TASK_TEMPLATE,
  },
];

const OLD_TEMPLATES: Array<{ prompt_type: string; template: string }> = [
  { prompt_type: "ticket_research", template: OLD_TICKET_RESEARCH_TEMPLATE },
  {
    prompt_type: "ticket_research_revision",
    template: OLD_TICKET_RESEARCH_REVISION_TEMPLATE,
  },
  {
    prompt_type: "ticket_research_revision_task",
    template: OLD_TICKET_RESEARCH_REVISION_TASK_TEMPLATE,
  },
  {
    prompt_type: "ticket_planning_with_research",
    template: OLD_TICKET_PLANNING_WITH_RESEARCH_TEMPLATE,
  },
  {
    prompt_type: "ticket_planning_without_research",
    template: OLD_TICKET_PLANNING_WITHOUT_RESEARCH_TEMPLATE,
  },
  {
    prompt_type: "ticket_planning_revision",
    template: OLD_TICKET_PLANNING_REVISION_TEMPLATE,
  },
  {
    prompt_type: "ticket_planning_revision_task",
    template: OLD_TICKET_PLANNING_REVISION_TASK_TEMPLATE,
  },
  {
    prompt_type: "ticket_developing",
    template: OLD_TICKET_DEVELOPING_TEMPLATE,
  },
  {
    prompt_type: "claw_scheduled_task",
    template: OLD_CLAW_SCHEDULED_TASK_TEMPLATE,
  },
];

export async function up(db: Kysely<Database>): Promise<void> {
  for (const row of NEW_TEMPLATES) {
    await db
      .updateTable("prompt_templates")
      .set({ template: row.template })
      .where("prompt_type", "=", row.prompt_type)
      .where("project_id", "is", null)
      .execute();
  }
}

export async function down(db: Kysely<Database>): Promise<void> {
  for (const row of OLD_TEMPLATES) {
    await db
      .updateTable("prompt_templates")
      .set({ template: row.template })
      .where("prompt_type", "=", row.prompt_type)
      .where("project_id", "is", null)
      .execute();
  }
}
