# Surgical Delivery Plan For Ticket Research and Planning Phases

## Summary

Split the feature into small end-to-end slices that each deliver a usable capability and keep schema, API, worker, and UI changes tightly scoped.

The sequence below is designed to avoid building a large generic subsystem up front. Each chunk should be shippable on its own, with clear rollback boundaries and minimal cross-chunk coupling.

## Chunk 1: Ticket Workflow Skeleton

### Goal

Introduce ticket workflow phases without yet adding document generation, approvals, comments, or worker changes.

### Scope

Backend:
- Add `workflow_phase` to tickets with values:
  - `research`
  - `planning`
  - `execution`
- Default new tickets to `research`
- Add a small `TicketWorkflowService` for:
  - reading current phase
  - manually advancing phase
  - validating allowed transitions
- Add API endpoints:
  - `GET /api/tickets/:id/phases`
  - `POST /api/tickets/:id/phases/:phase/advance`
- Update shared ticket types to include `workflowPhase`

Frontend:
- Show the three phases on ticket detail page
- Highlight current phase
- Show placeholder empty-state cards for research and planning
- Hide phase actions behind simple manual advance buttons for now

### Acceptance

- Newly created tickets start in `research`
- Existing tickets migrate to `execution`
- Ticket detail page shows current workflow phase
- Users can manually move `research -> planning -> execution`

### Purpose

This creates the phase backbone first, with nearly no product complexity.

## Chunk 2: Research Document MVP

### Goal

Add a single editable research document for tickets, stored durably and visible in UI, but without approvals or comments yet.

### Scope

Backend:
- Add `ticket_phase_documents` for `research` only
- Add a `TicketPhaseDocumentService` for:
  - create-or-get research doc
  - save current content
  - read current content
- Store latest content in DB and S3
- Add endpoints:
  - `GET /api/tickets/:id/phases/research`
  - `PUT /api/tickets/:id/phases/research/document`

Frontend:
- Add research document panel to ticket detail
- Plain textarea edit mode
- Markdown preview mode
- Save button and updated timestamp
- Planning/execution UI remains read-only placeholders

### Acceptance

- Users can create and edit a research markdown doc on a ticket
- Content persists and reloads correctly
- Ticket still remains in `research` until advanced manually

### Purpose

This proves the document model and S3 storage before involving agents.

## Chunk 3: Research Agent Run

### Goal

Let users generate the research document via a clanker, but only for research.

### Scope

Backend:
- Add `job_kind = 'research' | 'execution'`
- Add `ticket_phase_runs` for research only
- Add `POST /api/tickets/:id/phases/research/run`
- Add research payload construction using:
  - ticket data
  - project repo info
  - instruction files
- Add research callback handling that writes returned markdown into the research document

Worker:
- Add document-job execution path for `research`
- Research jobs:
  - clone repo
  - run agent
  - read `RESEARCH.md`
  - return `documentContent`
  - no branch, commit, push, or PR

Frontend:
- Add `Run Research` action
- Reuse current clanker selection flow
- Show latest research run status on ticket
- Show research job kind on jobs list/detail

### Acceptance

- User can run research from a ticket
- Research job completes without creating a PR
- Generated markdown appears in the research document editor/view

### Purpose

This isolates the first non-execution agent workflow and validates the worker contract.

## Chunk 4: Research Approval And Auto-Advance

### Goal

Add review workflow for research and use it to advance into planning.

### Scope

Backend:
- Extend research document with approval state:
  - `draft`
  - `approval_requested`
  - `approved`
- Add `ticket_phase_approvals`
- Add endpoints:
  - `POST /api/tickets/:id/phases/research/request-approval`
  - `POST /api/tickets/:id/phases/research/approve`
  - `POST /api/tickets/:id/phases/research/revoke-approval`
- When research becomes approved, automatically set ticket workflow phase to `planning`

Frontend:
- Add approval badges and buttons for research
- Show approver and timestamp
- Replace manual advance from research to planning with approval-driven transition

External feedback:
- Post external comment when research is approved

### Acceptance

- Research approval changes ticket phase to `planning`
- UI clearly shows approval status
- External comment is posted only on approval

### Purpose

This completes research end to end before planning exists.

## Chunk 5: Planning Document MVP

### Goal

Mirror the research document capability for planning, but still without planning agent runs.

### Scope

Backend:
- Extend `ticket_phase_documents` to support `planning`
- Add endpoints:
  - `GET /api/tickets/:id/phases/planning`
  - `PUT /api/tickets/:id/phases/planning/document`

Frontend:
- Add planning document editor/preview
- Only accessible when ticket is in `planning` or later
- Execution card remains gated placeholder

### Acceptance

- Once ticket is in `planning`, users can edit the planning document manually
- Planning document persists correctly

### Purpose

This keeps planning document concerns separate from planning agent generation.

## Chunk 6: Planning Agent Run

### Goal

Generate the planning document from the latest research document.

### Scope

Backend:
- Extend `job_kind` with `planning`
- Add `POST /api/tickets/:id/phases/planning/run`
- Planning payload includes:
  - ticket data
  - latest live research markdown
- Persist planning phase runs and write generated markdown into planning document

Worker:
- Extend document-job path for `planning`
- Planning jobs output `PLAN.md`

Frontend:
- Add `Run Plan` action
- Show planning job status and latest generation timestamp

### Acceptance

- User can run planning from a planning-phase ticket
- Generated plan appears in planning document
- Planning jobs do not create PRs

### Purpose

This reuses the research job pattern with one extra dependency: research content input.

## Chunk 7: Planning Approval And Execution Gate

### Goal

Make planning approval the gate into execution and block normal execution until satisfied.

### Scope

Backend:
- Add planning approval endpoints matching research
- Approving planning automatically moves ticket workflow phase to `execution`
- Update execution run validation:
  - allow only when planning approved
- Update execution payload construction to include:
  - latest live research markdown
  - latest live planning markdown

Frontend:
- Add planning approval controls
- Disable normal execution button until planning approved
- Show blocking reason on ticket detail page

External feedback:
- Post external comment when planning is approved

### Acceptance

- Planning approval moves ticket to `execution`
- Existing execution flow still works
- Execution agent receives research and plan context
- Execution is blocked before planning approval

### Purpose

This is the first point where the existing execution path is actually upgraded.

## Chunk 8: Execution Override Path

### Goal

Add the explicit bypass path without changing the default gate.

### Scope

Backend:
- Add workflow override fields on ticket:
  - `workflow_override_reason`
  - `workflow_overridden_at`
  - `workflow_overridden_by`
- Add endpoint:
  - `POST /api/tickets/:id/workflow/override-to-execution`
- Allow execution when either:
  - planning approved
  - execution override recorded

Frontend:
- Add `Override to Execution` action with required reason input
- Show override badge and audit info on ticket detail page

### Acceptance

- User can bypass the gate explicitly
- Ticket records override metadata
- Execution remains blocked unless approval or override exists

### Purpose

This keeps override logic out of the main approval chunk.

## Chunk 9: Document Revision History

### Goal

Add revision history for research and planning without changing approval semantics.

### Scope

Backend:
- Add `ticket_phase_document_revisions`
- Create revision on every manual save and every agent generation
- Add endpoints:
  - `GET /api/tickets/:id/phases/:phase/revisions`
  - optional `POST /api/tickets/:id/phases/:phase/revisions/:revisionId/restore`

Frontend:
- Show revision list for research/planning
- Allow viewing old revisions
- Optional restore action only if you want it in this chunk; otherwise read-only history

### Acceptance

- Every save creates a revision
- Users can inspect prior versions
- Current content remains separate from historical revisions

### Purpose

History is valuable, but not necessary to make research/planning functional, so it comes later.

## Chunk 10: Inline Comments

### Goal

Add annotatable discussion to documents after the core workflow already works.

### Scope

Backend:
- Add `ticket_phase_document_comments`
- Add endpoints:
  - `GET /api/tickets/:id/phases/:phase/comments`
  - `POST /api/tickets/:id/phases/:phase/comments`
  - `PUT /api/tickets/:id/phases/:phase/comments/:commentId`

Frontend:
- Add line-based comment anchors in document view
- Add comment thread panel
- Support open/resolved status

### Acceptance

- Users can add inline comments on research/planning docs
- Comments persist and can be resolved

### Purpose

This is collaborative polish, not required for the core phase workflow.

## Important Interface Changes

These should be introduced only in the chunk where first needed:

### Shared types

Chunk 1:
- `Ticket.workflowPhase`

Chunk 3:
- `Job.jobKind = 'research' | 'execution'`

Chunk 6:
- `Job.jobKind = 'research' | 'planning' | 'execution'`

Chunk 7:
- execution job context gains:
  - `researchDocument`
  - `planDocument`

Chunk 8:
- ticket override audit fields

## Testing Strategy By Chunk

### Chunk 1
- migration for existing tickets
- default phase on new tickets
- allowed/disallowed manual transitions
- ticket detail phase rendering

### Chunk 2
- research document create/save/load
- S3 persistence path
- editor save/reload

### Chunk 3
- research job submission
- worker document mode for research
- callback updates research doc
- no PR created for research jobs

### Chunk 4
- request approval / approve / revoke
- auto-transition to planning
- external comment on approval only

### Chunk 5
- planning doc create/save/load

### Chunk 6
- planning job uses latest research content
- `PLAN.md` output captured
- no PR created for planning jobs

### Chunk 7
- planning approval auto-transitions to execution
- execution blocked before approval
- execution payload includes latest live docs

### Chunk 8
- override audit persisted
- execution allowed after override
- UI reason required

### Chunk 9
- revision created on manual and agent saves
- revision listing works

### Chunk 10
- comment create/list/resolve
- line anchors persisted correctly

## Defaults And Constraints

- Each chunk must be independently deployable.
- No chunk should introduce unused generic abstractions for later chunks.
- Research should be fully end-to-end before planning starts.
- Planning should be fully end-to-end before execution gating changes.
- Revisions and comments are intentionally delayed until after core workflow works.
- Approval drift semantics stay unchanged:
  - approval remains after edits
  - latest live docs are used downstream
- External sync remains comments-only and approval-only.

## Recommended Delivery Order

1. Chunk 1
2. Chunk 2
3. Chunk 3
4. Chunk 4
5. Chunk 5
6. Chunk 6
7. Chunk 7
8. Chunk 8
9. Chunk 9
10. Chunk 10

## Suggested First Implementation Target

Start with Chunks 1 through 4 as the first milestone.

That gives you:
- real workflow phases
- real research documents
- real research generation
- real research approval
- automatic handoff into planning

It is the smallest slice that proves the product direction without yet touching planning generation, execution gating, revision history, or comments.
