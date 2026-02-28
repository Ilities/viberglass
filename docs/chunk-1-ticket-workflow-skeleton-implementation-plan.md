# Chunk 1 Implementation Plan: Ticket Workflow Skeleton

## Summary

Implement the minimum ticket workflow backbone required to introduce `research`, `planning`, and `execution` as explicit workflow phases without adding documents, approvals, comments, or worker changes.

This chunk is intentionally narrow:
- add workflow phase storage to tickets
- expose read and manual transition APIs
- surface the workflow on the ticket detail page
- leave execution behavior unchanged

## Goal

After this chunk:
- every new ticket starts in `research`
- all pre-existing tickets are treated as already being in `execution`
- the ticket detail page shows the three workflow phases
- users can manually advance a ticket from `research -> planning -> execution`
- no other feature behavior changes

## Out Of Scope

Do not implement any of the following in this chunk:
- research or planning documents
- S3 document storage
- approvals or review requests
- inline comments
- execution gating
- worker/job-kind changes
- external feedback comments

## Required Data Model Changes

## Ticket workflow phase enum

Add a new shared constant and type in [ticket.ts](/home/jussi/Development/viberator/packages/types/src/ticket.ts):

- `TICKET_WORKFLOW_PHASE`
  - `RESEARCH: 'research'`
  - `PLANNING: 'planning'`
  - `EXECUTION: 'execution'`
- `TicketWorkflowPhase`

Add `workflowPhase: TicketWorkflowPhase` to:
- `Ticket`
- `TicketListItem`

Do not add workflow phase to `CreateTicketRequest` or `UpdateTicketRequest`.

Reason:
- creation should always default server-side to `research`
- transitioning phases should happen through dedicated workflow endpoints, not generic ticket update

## Database schema

Add a new backend migration file in [src/migrations](/home/jussi/Development/viberator/apps/platform-backend/src/migrations).

Migration behavior:
- alter `tickets`
- add column `workflow_phase varchar(20) not null default 'research'`
- backfill all existing rows to `execution`
- add a check constraint limiting values to:
  - `research`
  - `planning`
  - `execution`
- add an index for project-scoped listing and filtering:
  - `(project_id, workflow_phase, created_at)`

Use the same migration style as [033_add_ticket_status_and_archived_at.ts](/home/jussi/Development/viberator/apps/platform-backend/src/migrations/033_add_ticket_status_and_archived_at.ts).

Down migration:
- drop the new index
- drop the new check constraint
- drop the `workflow_phase` column

## Kysely database types

Update [database.ts](/home/jussi/Development/viberator/apps/platform-backend/src/persistence/types/database.ts):

Add to `TicketsTable`:
- `workflow_phase: Generated<'research' | 'planning' | 'execution'>`

## Backend Implementation

## DAO changes

Update [TicketDAO.ts](/home/jussi/Development/viberator/apps/platform-backend/src/persistence/ticketing/TicketDAO.ts).

Required changes:
- when inserting a ticket, persist `workflow_phase: 'research'`
- include `workflow_phase` in:
  - `getTicket`
  - `findLatestShortcutStoryTicketByStoryId`
  - list queries
  - any select used by `mapRowToTicket`
- map DB value to shared `workflowPhase`

Add two focused DAO methods:
- `updateWorkflowPhase(id: string, workflowPhase: TicketWorkflowPhase): Promise<void>`
- `getWorkflowPhase(id: string): Promise<TicketWorkflowPhase | null>`

Do not fold workflow changes into `updateTicket()`.

Reason:
- `updateTicket()` currently owns lifecycle status and autofix state
- workflow transitions should remain explicit and isolated

## Backend service

Add a new service file:
- [TicketWorkflowService.ts](/home/jussi/Development/viberator/apps/platform-backend/src/services/TicketWorkflowService.ts)

Service responsibilities:
- fetch ticket
- validate current phase
- validate target phase
- perform manual transition

Allowed transitions:
- `research -> planning`
- `planning -> execution`

Disallowed transitions:
- `research -> execution`
- `planning -> research`
- `execution -> planning`
- `execution -> research`
- any no-op transition to the same phase

Suggested public methods:
- `getTicketWorkflow(ticketId: string): Promise<{ ticketId: string; workflowPhase: TicketWorkflowPhase; phases: Array<{ phase: TicketWorkflowPhase; status: 'completed' | 'current' | 'upcoming' }> }>`
- `advancePhase(ticketId: string, targetPhase: TicketWorkflowPhase): Promise<{ ticketId: string; workflowPhase: TicketWorkflowPhase }>`

Validation behavior:
- throw `Ticket not found` if ticket is missing
- throw a workflow-specific validation error for disallowed transitions

Keep the class under repo size limits. Do not combine this logic into `TicketExecutionService`.

## API changes

Update [tickets.ts](/home/jussi/Development/viberator/apps/platform-backend/src/api/routes/tickets.ts).

Add two new routes:

### `GET /api/tickets/:id/phases`

Response shape:

```json
{
  "success": true,
  "data": {
    "ticketId": "uuid",
    "workflowPhase": "research",
    "phases": [
      { "phase": "research", "status": "current" },
      { "phase": "planning", "status": "upcoming" },
      { "phase": "execution", "status": "upcoming" }
    ]
  }
}
```

### `POST /api/tickets/:id/phases/:phase/advance`

Request body:
- empty object or no body

Path param:
- `phase` must be one of:
  - `planning`
  - `execution`

Response shape:

```json
{
  "success": true,
  "data": {
    "ticketId": "uuid",
    "workflowPhase": "planning"
  }
}
```

Error behavior:
- `404` if ticket not found
- `400` if target phase is invalid
- `409` if transition is not allowed from current phase

Implementation notes:
- keep `PUT /api/tickets/:id` unchanged
- keep `POST /api/tickets/:id/run` unchanged
- reuse existing `validateUuidParam("id")`
- add a small path-param validator for `phase` in route logic or shared validation

## Frontend Implementation

## API client changes

Update [ticket-api.ts](/home/jussi/Development/viberator/apps/platform-frontend/src/service/api/ticket-api.ts).

Add:
- `getTicketWorkflow(ticketId: string)`
- `advanceTicketWorkflowPhase(ticketId: string, phase: TicketWorkflowPhase)`

Add matching frontend interfaces:
- `TicketWorkflowPhaseState`
- `TicketWorkflowResponse`

Use the existing `ApiResponse<T>` wrapper pattern.

## Data helper changes

Update [data.ts](/home/jussi/Development/viberator/apps/platform-frontend/src/data.ts) only if needed for convenience exports.

Do not create a new data abstraction layer unless required.

## Ticket detail UI

Update [TicketDetailPage.tsx](/home/jussi/Development/viberator/apps/platform-frontend/src/pages/project/tickets/TicketDetailPage.tsx).

Because this file is already large, extract the new workflow UI into a dedicated component to stay within repo limits:

Add:
- [ticket-workflow-panel.tsx](/home/jussi/Development/viberator/apps/platform-frontend/src/pages/project/tickets/ticket-workflow-panel.tsx)

`TicketWorkflowPanel` responsibilities:
- render the three phases in order
- show phase status:
  - `completed`
  - `current`
  - `upcoming`
- show the ticket's current `workflowPhase`
- show empty-state copy for research and planning
- render manual advance action only for the current phase when allowed

Display rules:
- if current phase is `research`, show button `Move to Planning`
- if current phase is `planning`, show button `Move to Execution`
- if current phase is `execution`, show no advance button

Interaction rules:
- clicking advance calls the new API
- on success, update local ticket state so `workflowPhase` changes immediately
- show a toast on success
- show an error toast on failure

Visual structure:
- place the workflow panel above the existing Description card in the main content column
- keep the left sidebar unchanged except optionally add `Workflow Phase` as an info item under ticket metadata

## Shared UI copy

Use the following phase descriptions:
- `Research`: "Explore the codebase and gather implementation context."
- `Planning`: "Define the approach before execution starts."
- `Execution`: "Run the implementation workflow for this ticket."

Use the following empty-state copy:
- Research: "Research artifacts will appear here in a later chunk."
- Planning: "Planning artifacts will appear here after research is completed."
- Execution: "Execution remains unchanged in this chunk."

## Exact File List

Files to modify:
- [ticket.ts](/home/jussi/Development/viberator/packages/types/src/ticket.ts)
- [database.ts](/home/jussi/Development/viberator/apps/platform-backend/src/persistence/types/database.ts)
- [TicketDAO.ts](/home/jussi/Development/viberator/apps/platform-backend/src/persistence/ticketing/TicketDAO.ts)
- [tickets.ts](/home/jussi/Development/viberator/apps/platform-backend/src/api/routes/tickets.ts)
- [ticket-api.ts](/home/jussi/Development/viberator/apps/platform-frontend/src/service/api/ticket-api.ts)
- [TicketDetailPage.tsx](/home/jussi/Development/viberator/apps/platform-frontend/src/pages/project/tickets/TicketDetailPage.tsx)

Files to add:
- a new migration under [src/migrations](/home/jussi/Development/viberator/apps/platform-backend/src/migrations)
- [TicketWorkflowService.ts](/home/jussi/Development/viberator/apps/platform-backend/src/services/TicketWorkflowService.ts)
- [ticket-workflow-panel.tsx](/home/jussi/Development/viberator/apps/platform-frontend/src/pages/project/tickets/ticket-workflow-panel.tsx)

## Testing Requirements

## Backend unit tests

Add:
- [TicketWorkflowService.test.ts](/home/jussi/Development/viberator/apps/platform-backend/src/__tests__/unit/services/TicketWorkflowService.test.ts)

Required cases:
- returns current phase for a ticket
- allows `research -> planning`
- allows `planning -> execution`
- rejects `research -> execution`
- rejects backward transitions
- rejects no-op transitions
- throws when ticket is missing

## Backend route tests

Add:
- [tickets.routes.test.ts](/home/jussi/Development/viberator/apps/platform-backend/src/__tests__/unit/api/routes/tickets.routes.test.ts)

Required cases:
- `GET /api/tickets/:id/phases` returns workflow state
- `POST /api/tickets/:id/phases/planning/advance` succeeds from research
- `POST /api/tickets/:id/phases/execution/advance` succeeds from planning
- invalid `phase` path param returns `400`
- disallowed transition returns `409`
- missing ticket returns `404`

## Frontend tests

Add:
- [ticket-workflow-panel.test.tsx](/home/jussi/Development/viberator/apps/platform-frontend/src/pages/project/tickets/ticket-workflow-panel.test.tsx)

Required cases:
- renders all three phases in order
- marks the current phase correctly
- shows `Move to Planning` only in research
- shows `Move to Execution` only in planning
- hides advance action in execution
- calls API and updates UI on success
- shows error state/toast on failure

## Migration Verification

After implementation, verify:
- running migrations on an existing DB sets legacy tickets to `execution`
- creating a new ticket through current API stores `workflow_phase = 'research'`
- fetching a ticket includes `workflowPhase`

## Implementation Sequence

1. Add shared workflow types in [ticket.ts](/home/jussi/Development/viberator/packages/types/src/ticket.ts).
2. Add the backend migration for `tickets.workflow_phase`.
3. Update Kysely DB types in [database.ts](/home/jussi/Development/viberator/apps/platform-backend/src/persistence/types/database.ts).
4. Update [TicketDAO.ts](/home/jussi/Development/viberator/apps/platform-backend/src/persistence/ticketing/TicketDAO.ts) selects, mapping, insert behavior, and dedicated workflow update methods.
5. Add [TicketWorkflowService.ts](/home/jussi/Development/viberator/apps/platform-backend/src/services/TicketWorkflowService.ts).
6. Add the two workflow routes in [tickets.ts](/home/jussi/Development/viberator/apps/platform-backend/src/api/routes/tickets.ts).
7. Extend frontend ticket API helpers in [ticket-api.ts](/home/jussi/Development/viberator/apps/platform-frontend/src/service/api/ticket-api.ts).
8. Build [ticket-workflow-panel.tsx](/home/jussi/Development/viberator/apps/platform-frontend/src/pages/project/tickets/ticket-workflow-panel.tsx) and wire it into [TicketDetailPage.tsx](/home/jussi/Development/viberator/apps/platform-frontend/src/pages/project/tickets/TicketDetailPage.tsx).
9. Add backend and frontend tests.

## Acceptance Criteria

This chunk is complete when all of the following are true:

- New tickets created through `POST /api/tickets` are returned with `workflowPhase: 'research'`.
- Existing tickets after migration resolve to `workflowPhase: 'execution'`.
- `GET /api/tickets/:id` includes `workflowPhase`.
- `GET /api/tickets/:id/phases` returns ordered phase status data.
- `POST /api/tickets/:id/phases/:phase/advance` enforces only adjacent forward transitions.
- Ticket detail page shows the workflow panel and current phase.
- Manual advance works from the UI for `research -> planning -> execution`.
- Existing execution route and ticket lifecycle status behavior remain unchanged.
