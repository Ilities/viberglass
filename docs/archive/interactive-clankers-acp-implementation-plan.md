# Interactive Clankers ACP Implementation Plan

## Summary

Introduce interactive clankers by adding a session layer above the current one-shot job model.

The key decision is:
- keep `jobs` as execution attempts
- add `agent_sessions` as the durable conversation container
- let each user reply start a new turn and a new job
- stop workers when they need input instead of keeping them attached to a browser session

This keeps the current worker architecture intact while adding ACP-compatible session semantics.

Related persistent planning artifact:
- [Interactive Clankers ACP Session Schema And API Spec](./interactive-clankers-acp-session-schema-api-spec.md)

## Current State

The current clanker flow is one-shot:
- the UI collects one instruction payload and launches a run
- the backend creates a job and invokes a worker once
- the worker runs from start to finish without pausing for user input
- the result is a pull request, a research markdown file, or a planning markdown file
- the UI polls a read-only job status view

This is a poor fit for ACP's session and turn model unless we add durable session state above jobs.

## Goals

- Let research, planning, and later execution clankers ask follow-up questions.
- Let users reply and continue the same clanker session later.
- Preserve a full transcript and event history across refreshes and worker restarts.
- Reuse as much of the existing job/bootstrap/callback pipeline as possible.
- Keep current one-shot flows working during rollout.

## Non-Goals

- Do not replace the existing job model.
- Do not keep Docker or ECS workers alive waiting on a human response.
- Do not require every agent adapter to become fully streaming and ACP-native in the first phase.
- Do not redesign the existing job detail page into a chat product.

## Architectural Decision

Implement ACP as a platform session layer, not as a live wrapper around a single long-running worker process.

The core runtime model should be:

`Session -> Turn -> Job -> Event`

With one additional concept for human interruptions:

`Pending Request`

Definitions:
- `Session`: the durable container for one interactive clanker conversation
- `Turn`: one user or assistant exchange within the session
- `Job`: one worker execution attempt for an assistant turn
- `Event`: durable progress, transcript, tool, and artifact records
- `Pending Request`: a structured record that the assistant is blocked on user input or approval

## Why Stop And Resume Instead Of Waiting

Keeping a worker alive while waiting for a human creates the wrong operational shape for the current platform:
- workers are launched as isolated runs today
- job status is persisted and polled, not attached interactively
- infrastructure cost and failure handling get worse if a worker waits on a browser
- browser disconnects should not terminate agent state

Stop and resume is the safer model:
- the worker runs until completion or until it needs input
- if it needs input, it emits a structured event and exits cleanly
- the backend marks the session as waiting
- the next user reply creates a new turn and launches a new job

This is compatible with ACP semantics and with the current backend architecture.

## Core Domain Model

### Session

The session owns:
- ticket
- clanker
- mode: `research`, `planning`, or `execution`
- durable status
- transcript and event history
- execution workspace references when applicable

One session should be reusable across multiple turns.

### Turn

Turns should be persisted separately from jobs.

Reasons:
- a user turn can exist before any worker launches
- an assistant turn can fail and be retried with a new job
- a turn is conversational state, not execution state

### Job

Jobs remain the execution primitive:
- they are the unit launched into Docker or ECS
- they still own bootstrap payloads, callback tokens, heartbeats, logs, and results
- they become linked to a session and a turn instead of being the entire interaction model

### Event

Events should be the durable replay stream for the UI and ACP transport:
- user messages
- assistant messages
- progress updates
- tool activity
- document or PR artifact updates
- blocked-on-input or blocked-on-approval requests

### Pending Request

A pending request is the explicit record that a session is blocked on a human action.

Examples:
- "Please choose between option A and option B"
- "I need approval to continue with repo writes"
- "Provide the missing environment variable name"

This should be stored separately from free-form events so the backend can enforce valid reply transitions.

## Session-Scoped Workspace Decision

For interactive execution, branch and PR ownership must move from job scope to session scope.

If each resumed turn creates a new branch, the interaction fragments into unrelated pull requests. A better model is:
- one interactive execution session owns one workspace branch
- that session may also own one reusable draft pull request
- later turns continue working on the same branch

Research and planning can adopt the session model first because they do not mutate the repository.

## Delivery Plan

## Chunk 1: Session Foundation

### Scope

- add session, turn, event, and pending-request persistence
- link jobs to sessions and turns
- add backend APIs to create sessions, post replies, fetch state, and stream events
- add a session detail page with transcript and live updates
- keep existing one-shot runs unchanged

### Acceptance

- a session can be created for a ticket and clanker mode
- the backend can persist turns and events independently of jobs
- a job can emit session events through the existing callback auth model
- the frontend can render a durable event timeline from session state

## Chunk 2: Interactive Research And Planning

### Scope

- allow research and planning clankers to stop for user input
- store document revisions as session artifacts
- let the user reply and continue the same session
- keep the current markdown document outputs as the canonical artifacts

### Acceptance

- a research or planning run can emit `needs_input`
- the session transitions to `waiting_on_user`
- a user reply starts the next assistant turn and resumes work
- transcript and artifact history survive page refresh and worker restart

## Chunk 3: Interactive Execution

### Scope

- add session-scoped branch ownership
- optionally attach a draft PR to the session
- let execution turns continue on the same branch across multiple jobs

### Acceptance

- one session can produce multiple execution turns without opening a new branch every time
- the UI shows current branch and PR state for the session
- a resumed execution turn continues from the session workspace reference

## Chunk 4: Richer ACP And Agent-Native Features

### Scope

- align more of the event model with canonical ACP event types
- evaluate richer streaming or agent-native ACP support inside adapters
- add more structured approval and tool-invocation UX once the session model is stable

### Acceptance

- the platform can expose session activity with minimal translation to ACP semantics
- adapters can evolve incrementally without changing the session contract

## ACP Wire-Level Client Architecture

All supported coding CLIs (Claude Code, Codex, Gemini CLI, Qwen, Kimi, Mistral Vibe,
OpenCode) speak ACP natively as JSON-RPC 2.0 servers over stdio. The worker is the
ACP client — this gives session loading, structured permissions, and streaming for free
instead of reinventing them.

### Transport

JSON-RPC 2.0 over stdio. Worker spawns CLI as subprocess, sends JSON-RPC
requests on stdin, reads responses and notifications on stdout.

### Worker-to-CLI Requests

| Method | Purpose |
|--------|---------|
| `initialize` | Negotiate protocol version and capabilities |
| `session/new` | Create session, returns `{ sessionId: "sess_abc123" }` |
| `session/load` | Resume prior session by sessionId (streams history, then ready) |
| `session/prompt` | Send user message; triggers streaming session/update notifications |
| `session/cancel` | Abort current operation |

### CLI-to-Worker (Handled By Worker)

| Method | Purpose |
|--------|---------|
| `session/update` | Streaming notification during a turn — see subtypes |
| `session/request_permission` | Agent asks client to approve a sensitive action |

### session/update Subtypes → Platform Events

| ACP subtype | Platform event |
|-------------|---------------|
| `agent_message_chunk` | `assistant_message` |
| `tool_call_update` (started) | `tool_call_started` |
| `tool_call_update` (completed) | `tool_call_completed` |
| `plan` | `needs_approval` |

### New Components

**`apps/viberator/src/acp/AcpClient.ts`**

Harness-agnostic ACP JSON-RPC client over stdio. Manages subprocess, request/response
correlation by JSON-RPC id, session lifecycle (initialize → new/load → prompt), and
notification routing to a platform event callback.

One instance per job execution. Stateless across jobs. Does NOT implement fs/ or
terminal/ capabilities — the CLI has direct repo access in the worker environment.

**`apps/viberator/src/acp/acpEventMapper.ts`**

Pure functions mapping ACP notifications to platform session event shapes:
- `mapSessionUpdate(params)` — maps session/update subtypes to platform events
- `mapPermissionRequest(params)` — maps session/request_permission to needs_approval
- `detectsNeedsInput(text)` — heuristic for open-question turn endings

### Modified Agent Layer

Each agent gains an abstract `getAcpServerCommand(): string[]` in `BaseAgent` that
returns the harness-specific CLI invocation for ACP server mode. Concrete agents that
have confirmed ACP server flags call `AcpClient` directly inside `executeAgentCLI()`.

The existing `agentStreamNormalizer` stays as fallback for harnesses that do not
support ACP; each concrete agent chooses which path to use.

### ACP Session ID Lifecycle

| ACP concept | Platform concept |
|-------------|-----------------|
| ACP `sessionId` (`sess_abc123`) | Stored in `agent_sessions.metadata_json.acpSessionId` |
| `session/new` response | Called on first assistant turn for a session |
| `session/load { sessionId }` | Called on every subsequent assistant turn |
| `session/prompt { content }` | Sends the current user message |
| `session/request_permission` | `needs_approval` event + open pending request |

### Open Design Questions

**Q1 — CLI ACP server invocation flags** (blocks `getAcpServerCommand()` wiring):
Each harness must have its ACP server mode flag(s) confirmed before `executeAgentCLI()`
is switched from the stream path to the ACP path. Placeholder values are in place.
Start with the strongest harnesses first, not Claude Code.

**Q2 — session/load after permission denial**: When `session/request_permission` is
suspended, resume by delivering the permission decision via `session/prompt` in a new
turn with the decision as context (treat as a `blocked` turn, not a failed one).

**Q3 — agentStreamNormalizer fallback**: BaseAgent supports both execution paths.
Concrete agents pick one. Remove the normalizer only after all harnesses are verified
ACP-capable.

**Q4 — acpSessionId storage**: `agent_sessions.metadata_json.acpSessionId` — no
schema change needed, `metadata_json` is already JSONB nullable.

**Q5 — one-shot jobs**: `agentSessionId` absent in payload → worker skips ACP session
semantics and runs in legacy mode. Existing one-shot flows stay unchanged.

## Backend Design Principles

- Keep session orchestration in small dedicated services.
- Do not expand `JobService` or `TicketExecutionService` into session "god objects".
- Persist transcript state in dedicated DAOs, not inside opaque job payload blobs.
- Reuse existing callback-token authentication for worker-to-backend session event delivery.

Suggested collaborator split:
- `AgentSessionDAO`
- `AgentTurnDAO`
- `AgentSessionEventDAO`
- `AgentPendingRequestDAO`
- `AgentSessionLaunchService`
- `AgentSessionWorkerEventService`
- `AgentSessionResponseService`
- `AgentSessionQueryService`

## Frontend Design Principles

- Add a dedicated interactive session view instead of overloading the job detail page.
- Keep the current job detail page as the low-level execution and debugging surface.
- Reuse existing structured event rendering patterns from the job log timeline.
- Use SSE first for live session updates.

Suggested session page sections:
- transcript
- agent timeline and tool activity
- pending request card when blocked
- current artifacts such as markdown docs, branch, and PR
- links to raw jobs for debugging

## Risks And Mitigations

## Risk: Session And Job Concerns Get Mixed

Mitigation:
- keep separate persistence tables
- keep job callbacks as execution plumbing
- map job outputs into session events in a dedicated service

## Risk: Execution Resume Semantics Become Fragile

Mitigation:
- delay interactive execution until the session model is proven with research and planning
- move workspace references to the session before adding multi-turn execution

## Risk: UI Complexity Jumps Too Fast

Mitigation:
- ship transcript plus pending-request UI first
- keep advanced ACP-specific components out of the initial slice

## Validation Criteria

The session layer is successful when:
- a research or planning clanker can ask a follow-up question and stop
- the backend marks the session as waiting and stores the request durably
- the user can answer later and continue the same session
- all session history survives refreshes and worker restarts
- existing one-shot runs still work without ACP participation

Interactive execution is successful when:
- one session can span multiple execution turns
- those turns reuse the same workspace branch
- the session can expose branch and PR state clearly in the UI

## Follow-Up Documents

This file is the long-lived implementation plan.

The concrete schema and endpoint contract live in:
- [Interactive Clankers ACP Session Schema And API Spec](./interactive-clankers-acp-session-schema-api-spec.md)
