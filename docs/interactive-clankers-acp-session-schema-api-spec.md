# Interactive Clankers ACP Session Schema And API Spec

## Summary

This document defines the concrete persistence model and API surface for adding ACP-style interactive sessions on top of the current one-shot job system.

The design keeps:
- `jobs` as execution attempts
- `agent_sessions` as the durable interaction container
- `agent_turns` as conversational units
- `agent_session_events` as the replay stream
- `agent_pending_requests` as explicit human-blocking state

Related planning artifact:
- [Interactive Clankers ACP Implementation Plan](./interactive-clankers-acp-implementation-plan.md)

## Assumptions

- The current `jobs` table and callback flow remain in place.
- A user reply should create a new turn and a new job rather than reattaching to an old worker.
- Research and planning will adopt the model before execution.
- Interactive execution will need session-scoped branch ownership.

## Persistence Model

## 1. `agent_sessions`

Purpose:
- durable container for an interactive clanker conversation

Suggested columns:

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` | primary key |
| `tenant_id` | `uuid` | aligns with ticket and job tenancy |
| `project_id` | `uuid` | denormalized for list queries |
| `ticket_id` | `uuid` | owning ticket |
| `clanker_id` | `varchar` | selected clanker |
| `mode` | `varchar(20)` | `research`, `planning`, `execution` |
| `status` | `varchar(32)` | see status enum below |
| `title` | `varchar(255)` nullable | optional user-facing summary |
| `repository` | `varchar(512)` nullable | repo slug or URL for execution context |
| `base_branch` | `varchar(255)` nullable | execution-only |
| `workspace_branch` | `varchar(255)` nullable | owned by the session once execution is interactive |
| `draft_pull_request_url` | `varchar(2048)` nullable | optional reusable draft PR |
| `head_commit_hash` | `varchar(64)` nullable | latest known workspace head |
| `last_job_id` | `varchar(255)` nullable | latest execution attempt |
| `last_turn_id` | `uuid` nullable | latest turn |
| `latest_pending_request_id` | `uuid` nullable | current blocked request, if any |
| `metadata_json` | `jsonb` nullable | mode-specific extras |
| `created_by` | `uuid` nullable | initiating user |
| `created_at` | `timestamptz` | not null |
| `updated_at` | `timestamptz` | not null |
| `completed_at` | `timestamptz` nullable | terminal timestamp |

Recommended statuses:
- `active`
- `waiting_on_user`
- `waiting_on_approval`
- `completed`
- `failed`
- `cancelled`

Recommended constraints and indexes:
- primary key on `id`
- index on `(ticket_id, created_at desc)`
- index on `(project_id, status, updated_at desc)`
- partial unique index for one active session per ticket/mode:
  - unique `(ticket_id, mode)`
  - where `status in ('active', 'waiting_on_user', 'waiting_on_approval')`

Reason for the partial unique index:
- it prevents multiple live sessions from competing over the same ticket workflow
- it still allows historical completed sessions to accumulate

## 2. `agent_turns`

Purpose:
- persist user, assistant, and system turns separately from jobs

Suggested columns:

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` | primary key |
| `session_id` | `uuid` | foreign key to `agent_sessions.id` |
| `role` | `varchar(20)` | `user`, `assistant`, `system` |
| `status` | `varchar(20)` | see status enum below |
| `sequence` | `integer` | monotonic per session |
| `content_markdown` | `text` nullable | normalized display text |
| `content_json` | `jsonb` nullable | structured rich content if needed |
| `job_id` | `varchar(255)` nullable | linked execution attempt |
| `started_at` | `timestamptz` nullable | assistant-turn execution start |
| `completed_at` | `timestamptz` nullable | terminal timestamp |
| `created_at` | `timestamptz` | not null |
| `updated_at` | `timestamptz` | not null |

Recommended statuses:
- `queued`
- `running`
- `blocked`
- `completed`
- `failed`
- `cancelled`

Recommended constraints and indexes:
- foreign key on `session_id`
- unique `(session_id, sequence)`
- index on `(session_id, created_at)`
- index on `(job_id)` where `job_id is not null`

## 3. `agent_session_events`

Purpose:
- durable replay stream for UI rendering, SSE delivery, and ACP mapping

Suggested columns:

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` | primary key |
| `session_id` | `uuid` | foreign key |
| `turn_id` | `uuid` nullable | event may or may not belong to a turn |
| `job_id` | `varchar(255)` nullable | source execution attempt |
| `sequence` | `bigint` | monotonic per session |
| `event_type` | `varchar(64)` | see event types below |
| `payload_json` | `jsonb` | structured event body |
| `created_at` | `timestamptz` | not null |

Recommended event types for MVP:
- `session_started`
- `turn_started`
- `user_message`
- `assistant_message`
- `progress`
- `reasoning`
- `tool_call_started`
- `tool_call_completed`
- `needs_input`
- `needs_approval`
- `approval_resolved`
- `artifact_updated`
- `turn_completed`
- `turn_failed`
- `session_completed`
- `session_failed`

Recommended constraints and indexes:
- unique `(session_id, sequence)`
- index on `(session_id, created_at)`
- index on `(job_id, created_at)`

Why sequence matters:
- SSE resume is simpler with a monotonic sequence
- browser reconnects can request `after=<sequence>`
- ACP event replay does not depend on wall-clock ordering alone

## 4. `agent_pending_requests`

Purpose:
- explicit record of the current user action required to continue the session

Suggested columns:

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` | primary key |
| `session_id` | `uuid` | foreign key |
| `turn_id` | `uuid` nullable | originating turn |
| `job_id` | `varchar(255)` nullable | originating job |
| `request_type` | `varchar(32)` | `input`, `approval`, or another structured subtype |
| `status` | `varchar(20)` | `open`, `resolved`, `expired`, `cancelled` |
| `prompt_markdown` | `text` | human-readable prompt |
| `request_json` | `jsonb` nullable | structured fields or options |
| `response_json` | `jsonb` nullable | resolved answer or approval result |
| `resolved_by` | `uuid` nullable | user id |
| `resolved_at` | `timestamptz` nullable | resolution timestamp |
| `created_at` | `timestamptz` | not null |
| `updated_at` | `timestamptz` | not null |

Recommended constraints and indexes:
- index on `(session_id, status, created_at desc)`
- partial unique index on `(session_id)` where `status = 'open'`

Reason:
- the MVP should allow at most one open blocking request per session

## 5. `jobs` Table Extension

Purpose:
- link the existing execution system to the new session model

Suggested new nullable columns on `jobs`:

| Column | Type | Notes |
| --- | --- | --- |
| `agent_session_id` | `uuid` nullable | current owning session |
| `agent_turn_id` | `uuid` nullable | assistant turn being executed |

Recommended indexes:
- index on `(agent_session_id, created_at desc)`
- index on `(agent_turn_id)`

These columns should be nullable so existing one-shot jobs keep working unchanged.

## Artifact Ownership

Canonical artifacts should remain where they already belong:
- research markdown continues to live in the existing phase-document model
- planning markdown continues to live in the existing phase-document model

The session layer should reference them through events and metadata rather than duplicating content ownership.

Execution-specific mutable artifacts should live on the session:
- `workspace_branch`
- `draft_pull_request_url`
- `head_commit_hash`

## Session Lifecycle

Example research session flow:

1. User creates session with an initial message.
2. Backend creates:
   - session
   - user turn
   - assistant turn in `queued`
   - job linked to the assistant turn
3. Worker starts and emits session events through a callback endpoint.
4. Worker determines more information is needed.
5. Worker emits `needs_input`.
6. Backend creates an open pending request and marks:
   - assistant turn `blocked`
   - session `waiting_on_user`
7. Worker exits cleanly.
8. User responds through the session API.
9. Backend resolves the pending request, creates the next turns, and launches a new job.
10. Worker completes and emits:
    - `assistant_message`
    - `artifact_updated`
    - `turn_completed`
11. Backend marks the session `completed` or keeps it `active` if more turns are allowed.

## API Surface

## 1. Create Session

`POST /api/tickets/:ticketId/agent-sessions`

Purpose:
- create a session and launch the first assistant turn

Request body:

```json
{
  "clankerId": "codex",
  "mode": "research",
  "initialMessage": "Investigate the current architecture and propose an approach.",
  "instructionFileIds": ["file_123"]
}
```

Response:

```json
{
  "success": true,
  "data": {
    "session": {
      "id": "b8c6b4d4-6c15-45e0-8b8b-3f1fce7f2d6b",
      "ticketId": "6c6d3d5b-f108-4b2d-94d0-7a7f70a2c0de",
      "mode": "research",
      "status": "active"
    },
    "currentTurn": {
      "id": "7fc6f43c-cbed-44f4-9d8b-66a0ab4a1c4f",
      "role": "assistant",
      "status": "queued"
    },
    "job": {
      "id": "job_123",
      "status": "pending"
    }
  }
}
```

Behavior:
- validate ticket and clanker
- enforce the one-active-session-per-ticket/mode rule
- create an initial user turn from `initialMessage`
- create the queued assistant turn
- create and launch the job

## 2. List Sessions For Ticket

`GET /api/tickets/:ticketId/agent-sessions`

Purpose:
- show current and historical sessions for a ticket

Suggested query params:
- `mode`
- `status`
- `limit`

Response should include enough summary data for a ticket sidebar or session picker.

## 3. Get Session Detail

`GET /api/agent-sessions/:sessionId`

Purpose:
- load the current session snapshot

Suggested response shape:

```json
{
  "success": true,
  "data": {
    "session": {
      "id": "b8c6b4d4-6c15-45e0-8b8b-3f1fce7f2d6b",
      "ticketId": "6c6d3d5b-f108-4b2d-94d0-7a7f70a2c0de",
      "mode": "research",
      "status": "waiting_on_user",
      "workspaceBranch": null,
      "draftPullRequestUrl": null
    },
    "turns": [],
    "latestEvents": [],
    "pendingRequest": {
      "id": "8d6bb0c3-1d2f-43cf-8d41-88fc91d4d9f6",
      "requestType": "input",
      "promptMarkdown": "Which environment should I target?"
    }
  }
}
```

The detail response should be a snapshot, not the entire session history if that would be too large.

## 4. Fetch Event History

`GET /api/agent-sessions/:sessionId/events`

Suggested query params:
- `after` as the last seen sequence
- `limit`

Behavior:
- returns ordered events strictly after `after`
- used by browser refresh and SSE fallback logic

## 5. Stream Events

`GET /api/agent-sessions/:sessionId/stream`

Transport:
- Server-Sent Events for the MVP

Behavior:
- emit an initial snapshot event on connect
- emit subsequent session events as they are persisted
- support reconnection with `Last-Event-ID` or `after`

Why SSE first:
- the frontend already consumes status updates in a simple request model
- SSE is enough for one-way event delivery
- the browser does not need full bidirectional sockets for the MVP

## 6. Post User Message

`POST /api/agent-sessions/:sessionId/messages`

Purpose:
- continue a waiting session with a free-form user reply

Request body:

```json
{
  "message": "Use the GitHub app path, not the personal token path."
}
```

Behavior:
- require session status `waiting_on_user`
- resolve the open pending request
- create the next user turn
- create the next assistant turn
- launch a new job linked to that assistant turn

Recommended conflict behavior:
- return `409` if the session is not waiting on user input

## 7. Resolve Structured Request

`POST /api/agent-sessions/:sessionId/requests/:requestId/respond`

Purpose:
- resolve approvals or structured requests that are not just free-form chat replies

Request body example:

```json
{
  "action": "approve",
  "payload": {
    "scope": "repo_write"
  }
}
```

Behavior:
- validate that the request is open and belongs to the session
- resolve it
- create the next assistant turn and job if the response unblocks execution

## 8. Cancel Session

`POST /api/agent-sessions/:sessionId/cancel`

Purpose:
- explicitly stop future turns for the session

Behavior:
- mark open pending requests as cancelled
- mark session as cancelled
- leave historical jobs and turns unchanged

## Worker Callback API

## 9. Batch Session Events From Worker

`POST /api/jobs/:jobId/session-events/batch`

Purpose:
- let a worker emit structured session events through the existing callback auth model

Authentication:
- reuse the current callback token header pattern already used by job progress and result callbacks

Suggested request shape:

```json
{
  "events": [
    {
      "eventType": "progress",
      "payload": {
        "message": "Running architecture scan"
      }
    },
    {
      "eventType": "needs_input",
      "payload": {
        "promptMarkdown": "Should I target the research flow first or execution first?",
        "requestType": "input",
        "options": [
          "research",
          "execution"
        ]
      }
    }
  ]
}
```

Behavior:
- backend resolves `jobId -> turn -> session`
- persist events with a monotonic session sequence
- create or resolve pending requests when the event type requires it
- update turn and session status in the same transaction when possible

Backward compatibility:
- keep the existing `progress`, `logs`, `result`, and auth-cache callbacks
- new session event callbacks should complement them rather than replacing them immediately

## Service And DAO Split

To stay within repo architecture rules, split responsibilities into focused components.

Suggested persistence classes:
- `AgentSessionDAO`
- `AgentTurnDAO`
- `AgentSessionEventDAO`
- `AgentPendingRequestDAO`

Suggested backend services:
- `AgentSessionLaunchService`
  - validates launch requests
  - creates session and initial turns
  - creates the initial job
- `AgentSessionQueryService`
  - returns session snapshots and event history
- `AgentSessionResponseService`
  - resolves user messages and structured requests
  - launches follow-up assistant turns
- `AgentSessionWorkerEventService`
  - translates worker callbacks into events, pending requests, and status changes

Avoid:
- expanding `JobService` into the owner of conversation state
- expanding `TicketExecutionService` into a mixed session and execution coordinator

## Worker Contract Changes

The worker bootstrap payload for interactive turns should add:
- `agentSessionId`
- `agentTurnId`
- `sessionMode`
- `workspaceRef`
- prior session context needed by the agent

Worker runtime behavior for interactive mode:
- emit structured session events
- stop cleanly when a blocking request is emitted
- do not wait for the user's browser response

This is especially important for execution sessions because current branch creation is job-oriented and must become session-oriented.

## Frontend Consumption Model

The frontend session view should load:
- session snapshot from `GET /api/agent-sessions/:sessionId`
- incremental events from SSE

The page should render:
- transcript from turns and `assistant_message` / `user_message` events
- a blocking card from the open pending request
- artifacts from `artifact_updated` events and session fields
- links to raw jobs for debugging

The job detail page should remain the lower-level execution view.

## MVP Decisions

- transport: SSE, not websockets
- one open pending request per session
- one active session per `ticket + mode`
- research and planning first
- execution second, after branch ownership is moved to the session

## Open Design Questions

- Should a completed session be reopenable, or should a user always create a new session?
- Should execution sessions reuse one draft PR automatically or only after explicit user opt-in?
- How much of the agent's internal reasoning should be persisted as events versus kept as raw logs only?

These questions do not block the MVP schema or endpoint design above.
