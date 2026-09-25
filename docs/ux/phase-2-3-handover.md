# Handover: Phase 2 (people) and Phase 3 (agent ↔ human)

Status as of 2026-09-25 · Phase 1 is complete in code (Step C in [`next-steps-handover.md`](./next-steps-handover.md)); its exit waits on the AWS walkthrough ([`docs/operations/aws-first-run-walkthrough.md`](../operations/aws-first-run-walkthrough.md)) · Owner of decisions: Jussi

This is the plan for the next two phases, written for whoever picks them up. For each phase it lists:
- what the plan asks for;
- what already exists in the code (with paths);
- what's broken on the way;
- a proposed design, the order to build it in, and how to test it.

Read it with:
- [`user-journeys-and-personas.md`](./user-journeys-and-personas.md): the spec. §4 has the role matrix, §5 the domain model, §7 journeys J3–J12 and J17, §8 notifications, §9 the status model, §12 the roadmap.
- [`next-steps-handover.md`](./next-steps-handover.md): how to work on this repo (§2), known issues (§1.3) and Phase 1's record.
- The ADRs in [`docs/adr/`](../adr/README.md), especially 0003 (product leader first) and 0004 (Space and Task).

"Verified" means I read the code myself. "Reported" means a code survey found it and it should be confirmed before building on it.

---

## 0. What Phase 1 leaves you to build on

- **Setup** (`/setup`, `api/routes/setup.ts`, `services/setup/`): model key → repository → space → default agent → first task. It resumes through `GET /api/setup/status`. The first admin comes from the existing registration.
- **Providers and harnesses**:
  - `MODEL_PROVIDERS` lives in `packages/types/src/modelProviders.ts`.
  - Each agent plugin declares `providers`; `npm run generate:catalog` writes `agentProviderCatalog.json`.
  - Adding a provider is data only.
- **Settings → Advanced** (`layouts/WorkspaceSettingsLayout.tsx`): General is Members and API tokens. Advanced is runners, connections, secrets and prompt templates, for admins only. The main nav is Dashboard · Pulse · Settings.
- **Readiness** (`services/ProjectReadinessService.ts`, `services/readiness/`): lists what's missing in setup's order, and offers a first task on a space with no runs (FR7).
- **Demo workspace** (`services/demo/`, migration 068): removable sample data, loaded from setup.
- **Status truth and failure copy** (Phase 0 quick wins):
  - Task status is derived by `TicketLifecycleStatusService`.
  - Failures carry `JOB_FAILURE_CODE` from the worker, described by `describeJobFailure`.
- **Test harness**:
  - The fake agent (`packages/agents/agent-fake`) with `[fake:sleep=N]`, `[fake:no-document]` and `[fake:fail]`.
  - A test-only "Fake provider (tests)", switched on by `VIBERGLASS_FAKE_PROVIDER_URL`.
  - `FirstRunScenario` (a second backend on an empty database, with the page's API calls rerouted to it) and `SetupStubServer` (GitHub and provider stubs).
  - 16 smoke journeys (`TESTING.md` → E2E Tests).

Two things for anyone continuing:
- Run one test suite at a time, with `jest --maxWorkers=2`. Running suites in parallel overloads Jussi's machine.
- The dev frontend container bakes `packages/types` into its image. After changing it, run `docker compose build frontend && docker compose up -d frontend`.

---

## 1. Decisions needed before starting

Only these block work. Each has a recommendation; decide, then record the answer as an ADR or in §13 of the plan.

| # | Decision | Needed before | Recommendation |
|---|---|---|---|
| D1 | **Workspace roles** | Phase 2, step 2 | Keep **Admin** and **Member**, add **Guest**. Guests get a limited account: invited to specific spaces, can comment, answer questions and approve when they're a reviewer, but see no plumbing and can't create spaces. Matches the §4 matrix. |
| D2 | **Space roles** | Phase 2, step 3 | Two per space: **Maintainer** (defaults, policies, space members) and **Member**. Workspace admins are maintainers everywhere. "Reviewer" is not a role: it's per task, set by the approval policy (D4). |
| D3 | **Space visibility** | Phase 2, step 3 | **Open by default** (every member sees every space; membership sets defaults and notifications), with an optional **Private** flag that limits a space to its members. This keeps a small company's first days frictionless. The alternative, members-only everywhere, makes every new space an admin chore. |
| D4 | **Default approval policy** | Phase 2, step 7 | Research: any participant. Plan: one reviewer from the space's reviewers, falling back to the owner. Build: the PR review in GitHub is the gate. Editable per space. |
| D5 | **Notification defaults** | Phase 2, step 6 | The §8 table as written. Email only when SMTP is configured; digests off until asked for. Slack DM once a person links their Slack account. |
| D6 | **Guests in Phase 2 or later** | Phase 2, step 2 | Invite guests in Phase 2 (it's the same invite flow). Leave intake-only guests with no account (P8 reporting from Slack or a form) to Phase 4 with J15. |
| D7 | **How an agent asks a question** | Phase 3, step 2 | An **`ask_human` tool** offered to the agent through ACP `mcpServers`, with question, options, addressee (role or person) and blocking yes/no. It's explicit, works the same across every harness that supports MCP, and replaces today's "ends with ?" guess. Forward ACP elicitation to the same path where a harness uses it instead. |
| D8 | **How a blocked turn waits** | Phase 3, step 2 | **End the job and resume** with `session/load` when answered. That's today's model (each turn is its own job and clone), so nothing holds a worker while a person thinks. Keeping the process alive and long-polling is faster to answer but ties up compute for hours. |
| D9 | **Take over: where the work lives** | Phase 3, step 5 | One **session branch** per live session, pushed after every turn. Take over is `git checkout` of that branch plus a `viberglass checkout <task>` helper. Hand back resumes from the pushed head. |

---

## 2. Phase 2: people primitives

**Goal (plan §12):** J3, J4, J5, J7, J10, J17. **Exit:** J9 steps 1, 3, 4 and 7 work with at least three humans. That means:
- a PM asks;
- a designer is @mentioned and contributes;
- a reviewer comments on the rendered plan, requests a change and approves;
- the PR arrives.

Every step is attributed and notifies the right person.

**Order and dependencies:**

```
1 Naming ─┐
2 Roles & invites ─┬─ 3 Space membership ─┬─ 4 Participants & keys ─┬─ 5 Discussion & Activity ─┬─ 6 Inbox & notifications
                   │                      │                         └─ 7 Approval policy ────────┤
                   └──────────────────────┴───────────────────────── 8 Rendered-doc comments ───┘
9 Audit log: alongside 2–7 (each action writes an entry as it's built)
```

Rough size: 4–6 weeks. The naming migration and notifications are the biggest items.

### 2.1 Naming: Space and Task in routes, API and copy (ADR 0004)

- **Exists:**
  - UI copy says "Space" in most places, about 148 hits.
  - "Project" (about 53) and "Ticket" (about 81) remain.
  - Routes are still `/project/:project/...`: 12 frontend routes in `routes.tsx`, with no redirects.
  - The API is `/api/projects` (21 handlers) and `/api/tickets` (about 33 handlers across `tickets.ts` and `tickets/*Routes.ts`).
  - Other public surfaces: the MCP tools (`packages/mcp-server/src/tools/*`: project_list, ticket_*), the Chrome extension (`apps/chrome-extension/src/api/`), and Slack links (`chat/platformLinks.ts`). *(Reported.)*
- **Design:**
  - New routes `/spaces/:space/...` and `/spaces/:space/tasks/:key`, plus redirects from every `/project/...` path.
  - A new API under `/api/spaces` and `/api/tasks` that reuses the same services, with the old paths kept as aliases for one release. Remove them in Phase 4.
  - MCP tools get `space_*` and `task_*` names; keep the old names as aliases.
  - Database and internal names stay. ADR 0004 allows moving them gradually.
  - Do the rename in one focused PR per surface (frontend routes, API, MCP, extension, Slack links), each behind green e2e.
- **Tests:** the smoke journeys use `/project/...` URLs today. Switch them to the new ones and add one journey that follows an old link and gets redirected.

### 2.2 Workspace roles and invites (J3, J4; D1, D6)

- **Exists** (reported, file paths checked):
  - `users` (migrations 014 and 015) with `password_hash NOT NULL` and `role` admin|member.
  - Admins create users with a password: `POST /api/users` and `UsersPage.tsx`.
  - There's no invite, deactivate, delete or reset. `forgot-password` only logs and returns 202 (`api/routes/auth.ts`).
  - Server-side role checks: `requireRole` and `requirePolicy` in `api/middleware/authentication.ts`, plus `adminOnlyChanges.ts`.
- **Design:**
  - An `invites` table: single-use token hash, email, role, optional spaces, expiry, created_by, accepted_at, revoked_at.
  - `POST /api/invites` returns a **link** (works without SMTP, ADR 0002). It's emailed too when SMTP is configured.
  - `/invite/:token` lets the invitee choose a name and password, and signs them in.
  - Members → Invite, with a pending list (copy link, revoke).
  - Add **Guest** to `UserRole` and to every `requireRole`/`requirePolicy` decision; guests see no plumbing and no admin pages.
  - **Deactivate** instead of delete: `deactivated_at`, sessions revoked. It keeps attribution and prepares J21.
  - Reset links use the same token mechanism, so an admin can hand out a reset link without SMTP.
  - Replace the "create user with password" form with Invite. Keep the API for the demo seed and tests.
- **Tests:** a journey where the admin invites and the invitee accepts in a second browser context and lands on the member home, then a revoked link fails. A unit test that tokens are single-use and expire.

### 2.3 Space membership and visibility (J17; D2, D3)

- **Exists** (verified):
  - `api/middleware/projectAuthorization.ts` exports `requireProjectAccess`, `requireProjectAdmin` and `requireTicketProjectAccess`, **mounted nowhere**.
  - It reads `req.user.id`, but authentication sets `req.user` to the `AuthContext` (`api/auth/context.ts`), so the id is at `req.user.user.id`. As written, it would deny everyone. Fix and unit-test it before mounting.
  - *(Reported)* `requireProjectAdmin` calls `requireProjectAccess` with a no-op `next`.
  - `user_projects` (migration 019) was backfilled once for every user × project, and **nothing writes it** since. Newer users and spaces have no rows.
- **Design:**
  - `space_members(space_id, user_id, role maintainer|member, added_by)`. Reuse `user_projects` with a migration that renames or reshapes it, since its data is stale anyway.
  - A `private` flag on spaces (D3).
  - Creating a space adds the creator as maintainer; setup's space step does the same.
  - Mount the fixed middleware on space- and task-scoped routes.
  - Filter lists (spaces, tasks, runs, Pulse or Inbox) by visibility: open spaces for all members, private ones for their members.
  - A members UI in space settings, open to maintainers and admins.
  - The demo seed adds its members to the demo space.
- **Watch for:**
  - Worker callback routes (`/api/jobs/:id/...`) use callback tokens, not users. Keep them outside the membership check.
  - MCP and API tokens act as their user, so they get the same filtering.
- **Tests:** a member can't see or open a private space (UI and API return 403 or 404); maintainers can add members; the list filtering has unit tests.

### 2.4 Task participants and task keys (J5; plan §9)

- **Exists:** tickets have none of requester, owner, created_by, reviewers or watchers. The only person on a ticket is a string, `workflow_overridden_by`. There's no per-space key; tickets are addressed by UUID, and `external_ticket_id` holds a tracker's key. *(Reported.)*
- **Design:**
  - `task_participants(task_id, user_id, role requester|owner|reviewer|watcher)`, with requester set automatically.
  - Owner comes from a space default (new setting: default owner, falling back to the creator).
  - Reviewers come from the approval policy (§2.7). Watchers are added with @ or a button.
  - **Keys:**
    - A `key_prefix` on spaces, defaulted from the name (`WEB`).
    - A per-space counter, incremented in a transaction (a `space_task_counters` row, `UPDATE … RETURNING`).
    - Backfill existing tasks in creation order. URLs use the key (`/spaces/web/tasks/WEB-42`); the UUID stays internal.
  - Show participants on the task page and cards. The status line uses §9's "waiting on" ("Plan awaiting Tomi's approval").
  - The create form (and later the composer) sets owner and watchers.
- **Tests:** keys are unique and sequential under concurrent creation (a real-database test, like the phase-document race fixed in Phase 1); a created task has a requester and an owner.

### 2.5 Discussion thread, @mentions and Activity (J9; §5.1)

- **Exists:**
  - Line comments on the markdown **source** of research and plan documents: `ticket_phase_document_comments` (migration 042), `TicketPhaseDocumentCommentService` and `phase-document-comments.tsx`, with resolve and apply-suggestion.
  - There's no general thread, no mentions and no activity log. *(Reported.)*
- **Design:**
  - `task_messages(task_id, author_id, body_markdown, created_at, edited_at)`, with @mentions parsed to user ids into `task_message_mentions`. A mention notifies (§2.6) and adds the person as a watcher.
  - **Activity:** an append-only `task_activity(task_id, actor_type human|agent|system, actor_id, kind, payload_json, created_at)`.
    - Write it from the services that already know about each change: task created, participants changed, step started, run finished or failed, document approved or changed, comment added, cancel.
    - Build it as a small `TaskActivityRecorder` used by those services. Don't bolt it onto routes.
  - The task page gets Discussion and Activity tabs (plan §6.2 task page).
- **Tests:** mention parsing; each recorded activity has actor and time; a journey where the PM @mentions the designer, the designer replies, and both appear in Activity.

### 2.6 Inbox and notifications (J10; §8; D5)

- **Exists:**
  - No notification, inbox or email code. *(Reported: no nodemailer or SMTP anywhere.)*
  - Pulse (`pages/sessions/SessionsPulsePage.tsx`, `/sessions`) is a status board that polls tasks every 15 s. It isn't personal.
  - Slack (`packages/chat-slack`, `apps/platform-backend/src/chat/`) handles the `/viberator` command, thread replies, @mentions in threads and approval buttons. It has **no DMs and no Slack ↔ Viberglass user link**.
- **Design:**
  - `notifications(recipient_id, kind, task_id, subject_id, payload_json, created_at, read_at, done_at, snoozed_until)`.
  - A `NotificationService.notify(event)` that resolves recipients from the §8 table and participants, then fans out to **channels**:
    - in-app, always;
    - Slack DM when the person has linked Slack;
    - email when SMTP is configured.
  - Channels are small classes behind one interface (AGENTS.md: no per-channel if/else in the service).
  - **Inbox page:** groups from J10 (Questions for you · Review requests · Mentions · Failures you own · Updates), mark done, snooze, one primary action each. **My tasks**, grouped by who it's waiting on. Inbox replaces Pulse as the landing page for members; keep Pulse as "Live" for sessions.
  - **Slack user link:** match by email through `users.lookupByEmail` on first contact, confirmed once by the person. Store `slack_user_id` on users.
    - That also fixes attribution: Slack thread replies are passed on without a user id today, and approvals are credited to a Slack display name (reported).
  - **Email:** optional SMTP settings (env or admin settings), nodemailer, plain templates. It's skipped cleanly when unset.
- **Tests:**
  - The recipient-resolution table as unit tests.
  - An e2e journey: a review request appears in the reviewer's Inbox, and marking it done clears it.
  - Slack and email channels with fake transports.

### 2.7 Approval policy (J7; D4)

- **Exists** (reported):
  - Approval exists for **planning only**: `POST /api/tickets/:id/phases/planning/{request-approval,approve,revoke-approval}` (`tickets/workflowPhaseRoutes.ts`), `TicketPlanningApprovalService` and `ticket_phase_approvals` (migration 038).
  - Research moves on through `/:id/phases/:phase/advance` with no approval record.
  - **Any signed-in user can approve.** The actor is stored as an email string.
  - Slack approve and reject buttons are credited to a Slack display name.
  - Phase 0 left this open deliberately (handover §1.2): locking approval to admins would lock out product leaders.
- **Design:**
  - A per-space policy per step: who may approve (any participant, the reviewers, maintainers, or named people) and how many approvals.
  - Enforce it in one `ApprovalPolicyService.canApprove(user, task, step)` used by the routes and the Slack buttons.
  - Record approvals with a user id. The Activity entry and the step header say "Approved by Tomi, 10:42".
  - "Request review from…" assigns reviewers, who then get a notification.
  - Only eligible people see Approve; others see "Request approval from…".
  - Research gets the same request-and-approve path, so every gate is recorded.
- **Tests:** policy unit tests per rule; the API refuses an ineligible approver (403); the J7 e2e journey (request → comment → request changes → approve).

### 2.8 Comments on the rendered document (J7)

- **Exists:** comments are anchored to markdown **source line numbers** (the service checks the line count), and the documents are shown as source. Rendering them is also recorded as future work.
- **Design:**
  - Render research and plan documents with the app's markdown renderer (check quick win #7, bold inside list items, while doing it).
  - Anchor comments to a **text quote** (exact text plus some prefix and suffix context, the W3C "text quote selector" approach), with the source line kept as a fallback.
  - Existing line comments migrate to anchors built from the text on their line.
  - Select text → comment or suggest a change. "Request changes" sends the open comments to the agent as a revision, as it does today.
  - Re-anchor after a revision by searching for the quote. Comments whose text is gone are shown as "outdated" rather than lost.
- **Tests:** anchoring and re-anchoring unit tests; the revision still receives the open comments (an existing journey covers the revision flow).

### 2.9 Audit log (J17)

- **Exists:** nothing.
- **Design:**
  - An append-only `audit_log(actor_id, actor_kind, action, target_type, target_id, details_json, ip, created_at)`, written by a small `AuditRecorder`.
  - Record: runs started or cancelled, approvals, connection, secret and runner changes, member and role changes, invites, deactivation, and space deletion.
  - An admin page under Settings → Advanced with filters.
  - Task Activity (§2.5) is for everyone working on a task. The audit log is for admins and covers the whole workspace. Where both record the same action, write both from the same call.

**Phase 2 exit test:** a single e2e journey with three people (admin PM, member designer, member reviewer) invited through links:
- the PM creates a task;
- @mentions the designer, who replies;
- the plan is requested from the reviewer, who comments on the rendered plan, requests a change and then approves;
- the Inbox shows each person the right item at each point, and Activity attributes every step.

The fake agent writes the documents.

---

## 3. Phase 3: agent ↔ human collaboration

**Goal (plan §12):** J6, J8, J11, J12. **Exit:** the whole J9 hero journey runs end to end.

**Order:**

```
1 Session correctness ─┬─ 2 Questions (needs Phase 2 Inbox) ─┐
                       ├─ 3 Readable transcripts              ├─ 6 Failure recovery ─ 7 Cancel-safe runs
                       └─ 4 Steer / pause ─ 5 Take over / hand back ┘
```

Rough size: 3–5 weeks. Questions and take over are the big items.

### 3.0 How sessions work today

Reported, with key points verified:
- **Tables** (migrations 046, 047, 059, 060, 062, 065):
  - `agent_sessions`: mode, and status active | waiting_on_user | waiting_on_approval | completed | failed | cancelled, one non-terminal session per (ticket, mode). `workspace_branch`, `head_commit_hash` and `draft_pull_request_url` exist but are never written.
  - `agent_turns`: role, status, `user_id`, and `consumed_by_turn_id`, which drives message queueing.
  - `agent_session_events`: per-session sequence, typed events including needs_input, needs_approval and approval_resolved.
  - `agent_pending_requests`: input or approval, one open per session, no addressee, no deadline.
- **Each turn is its own worker job** with a fresh clone and a new ACP process. Continuity comes from `session/load` of the stored `acpSessionId` plus a restored harness home directory (`apps/viberator/src/workers/core/runSessionTurnJob.ts`). A running turn has **no live channel** from the platform: messages sent mid-turn queue up and start the next turn (`SessionTurnContinuationService`).
- **Nothing emits `needs_input` or `needs_approval` events** (verified: they exist only as a turn-outcome type).
  - The mapper guesses a question when the last assistant text ends with "?" (`packages/agent-core/src/acp/acpEventMapper.ts`). That guess only skips the PR step and feeds telemetry.
  - So `waiting_on_user`, `POST /api/agent-sessions/:id/reply` and `PendingRequestCard.tsx` are built but never reached.
- **The ACP client auto-approves every permission request** (`AcpClient.handleCliRequest`), and ignores other agent→client requests (file system, terminal, elicitation). *(Reported: its reply `{action:"allow_once"}` may not match the ACP spec's `{outcome:{outcome:"selected",optionId}}`. Check this first, since a wrong shape can stall a harness that waits for the answer.)* It never sends `session/cancel`, and passes no MCP servers.
- **Frontend:**
  - `SessionPage.tsx` and `phase-session-panel.tsx` offer only Cancel, plus presence, participants and "your message will be queued".
  - `TranscriptPanel.tsx` merges chunks, shows "Tool call: X" rows and a collapsed Reasoning block, with "View full prompt" on the opening message.
  - *(Reported)* `InlineSessionPanel.tsx` looks unused.

### 3.1 Session correctness first

Small fixes. Do them before building on sessions:
- **A follow-up turn that ends without writing the document leaves the session `active` forever.** In the session-turn branch of the result callback (`api/routes/jobs.ts`), only `TURN_COMPLETED` is emitted. Make it a clear state: either waiting on the person ("the agent answered; reply or approve") or a turn failure with a readable reason. Pick one with the J8 design.
- **Slack threads never show the agent's replies** (verified). `ChatSessionBridgeService` reads `payload.content` for assistant messages, but the worker sends `payload.text`, and ingest doesn't rename it.
- **The ACP permission reply shape:** confirm it against the ACP spec and the harnesses in use.
- **Session routes check no roles:** any member can cancel any session (reported). Add the Phase 2 membership and participant checks: cancel for driver, owner and admins.
- **Startup resumes ticket and session bridges before migrations** have created their tables (seen on fresh databases; next-steps-handover §1.3). Resume after migrating.

### 3.2 Agent questions (J6, P9; D7, D8)

- **Design:**
  - **Asking:** an `ask_human` MCP tool, served by the worker or the platform and offered to the agent through `mcpServers` in the ACP session. Arguments: `question`, `options[]`, `addressee` (a role such as requester, owner, reviewer, or a person) and `blocking`.
    - Where a harness supports ACP elicitation instead, forward it to the same path.
    - The system prompt tells agents to ask instead of writing "needs PM confirmation" into the document (the original LC2 finding).
  - **Recording:** extend `agent_pending_requests`:
    - `addressee_user_id` / `addressee_role`, `blocking`, `options_json`, `due_at`, `escalated_at`;
    - allow several open requests per session (drop the unique index);
    - one-shot runs need it too, via `job_id`, so a question can come from automatic research, not only live sessions.
  - **Waiting** (D8):
    - Blocking: the worker stops the turn, reports `needs_input` with the request, and the job ends. On an answer, `reply` starts a new turn with the answer, and `session/load` restores the conversation. That's today's continuation model.
    - Non-blocking: the tool returns "carry on with your stated assumption", and the answer arrives later as a message.
  - **Routing:** resolve the addressee to a person (Phase 2 participants), notify them (Inbox, Slack DM, email per §8), and let them answer in place from the Inbox, the task page or Slack buttons. Record the question and answer in Activity.
  - **Escalation:** after N hours with no answer (space setting, default 4), remind the addressee, then notify the task owner. Run it as a periodic job, like the existing heartbeat checks.
  - **Status:** the task reads "Question for Maria" (plan §9 "Needs input · waiting on").
  - **Fake agent:** add `[fake:ask=…]` so it calls `ask_human` and continues with the answer. That's what the e2e journeys need.
- **Acceptance** (J6): any agent question reaches a named human within a minute; answers are traceable; a blocked step resumes when answered.
- **Tests:** an e2e journey where research asks the requester a question; it shows in their Inbox; answering resumes the run and the answer appears in the document. Escalation timing is unit-tested with a fake clock.

### 3.3 Readable transcripts (J8)

- **Design:**
  - **Coalesce** chunk events per message when they're ingested or read. Each `agent_message_chunk` is its own event today.
  - A **narrative layer:** per step, one plain-language line with the tool calls folded under it ("Looked at 14 files · Details"). Start without a model: summarise from the tool calls themselves (reads, edits, commands run, tests run).
  - An optional model-written summary per turn, and an **end-of-session summary** posted to the task Discussion (§2.5).
  - Map ACP `plan` updates to a visible plan block instead of `progress`.
  - Keep the raw view behind "Details" for engineers.
- **Acceptance:** someone who isn't an engineer can say what happened after reading a session (J8).
- **Tests:** the coalescing and summary rules as unit tests over recorded event fixtures (capture a few real sessions as fixtures).

### 3.4 Steer, pause and resume (J8, J12)

- **Design:**
  - **Driver and observers:** the session has one driver (whoever started it, or someone it's handed to). The driver's messages **interrupt**; observers' messages queue as **suggestions** the driver can accept. Today every message queues.
  - **Interrupt:** today a running turn can't hear the platform. Two options, and the second is recommended:
    - A control channel into the worker (a long-poll the worker checks). On an interrupt, send ACP `session/cancel`, then `session/prompt` with the new message.
    - Cancel the running job, then start the next turn at once with the message. The turn's partial work is kept by the session branch (§3.5).
  - **Pause / Resume:**
    - A new `paused` session status (the check constraint needs a migration). Pause stops the job and keeps the conversation state; Resume starts a turn with "continue".
    - On ECS and Lambda this needs §3.7, since those runs can't be stopped today.
  - Controls live on the session page and the embedded panel, limited to driver, owner and admins.
- **Tests:** a journey where the driver interrupts a `[fake:sleep=30]` turn with a new instruction, and the next turn has it; pause, then resume, continues the session.

### 3.5 Take over and hand back (J8, D9)

- **Design:**
  - **Session branch:** every turn commits and pushes to one branch per session (use `workspace_branch` and `head_commit_hash`). Today execution turns make a new branch per completed turn, and research and planning push nothing.
  - **Take over:** marks the session "driven by Dev locally", pauses the agent, and shows the branch and a command.
    - A small CLI, `viberglass checkout <task>`, fetches the branch. Put it in `packages/mcp-server` or a new `packages/cli`.
  - **Hand back:** the person pushes, clicks Hand back, and the next turn starts from the pushed head, told what changed (the diff since the last agent commit).
  - End & summarise closes the session and posts the summary (§3.3).
- **Tests:** a journey against the git fixture: take over, push a commit from the test, hand back, and the next turn sees the commit.

### 3.6 Failure recovery (J11)

- **Exists:** failure codes and audience-specific copy (Phase 0); readiness names what's wrong (Phase 1).
- **Design:**
  - **Setup failures pause instead of fail:** credential, credit or runner problems. The run is kept "Paused · GitHub connection expired (Maria notified)", and "Retry all paused runs" appears after the fix.
  - The owner or admin gets an Inbox item with Fix, linking to the exact connection.
  - Agent and work failures give the task owner Retry, Retry with instructions, or Take over.
  - **Proactive warnings:** tokens with an expiry warn before they expire. Credit-low warnings where the provider reports it: the key checker's model list can't, so this may wait on a usage endpoint per provider.
- **Tests:** the existing failure-copy journeys extended to pause and resume after a fix.

### 3.7 Cancel-safe runs (J12)

- **Exists:** cancel stops Docker runs and stays cancelled (Phase 0).
- **Design:**
  - **ECS and Lambda can't be stopped:** store the invoker's execution id on the job, and add `EcsWorkerStopper` (StopTask) next to `DockerWorkerStopper` (next-steps-handover §1.2). Lambda can't be stopped mid-invocation; mark it and ignore its late result, as today.
  - Show who cancelled (`cancelledBy` is stored and never shown; quick win #6/16).
  - Confirm long runs ("going for 2h, stop and keep partial results?").
  - Keep partial documents and the branch.
- **Tests:** unit tests for the stopper with a fake ECS client; the AWS walkthrough re-run covers the real stop.

### 3.8 Preview environments ("if feasible")

Out of scope unless a space defines a preview command. Record it as Phase 5 if it doesn't fit.

**Phase 3 exit test:** the full J9 journey as one e2e run:
- the agent asks the PM a question and she answers from her Inbox;
- the designer is @mentioned;
- the reviewer requests changes on the rendered plan, then approves;
- the builder starts a live session, interrupts once, takes over and hands back;
- a PR opens and every step appears in Activity.

---

## 4. Working notes for both phases

- **Migrations:**
  - One per change, numbered after 068.
  - Tables that will grow (notifications, activity, audit, events) need indexes on their read paths (recipient + unread, task + created_at).
  - Backfills (task keys, the membership reshape) go in the migration, with a `down`.
- **Design rules (AGENTS.md):**
  - Small single-purpose classes; constructor injection with defaults; no `as` casts; narrow interfaces.
  - Channels, stoppers and policies are strategies, not if/else.
  - Several files are already over the size limits (next-steps-handover §1.3). Split them when you touch them.
- **Tests:**
  - Every item gets unit tests plus a smoke journey.
  - Multi-person journeys need a second (and third) signed-in browser context, which the `adminPage`/`memberPage` fixtures already show how to build.
  - Journeys that need an empty workspace use `FirstRunScenario`.
  - Outside services (Slack, SMTP) get stub servers like `SetupStubServer`, configured through real settings, never test-only code paths.
- **Security:** membership and approval policy are server-side decisions. Hiding things in the UI is only a convenience.
- **Keep the plan current:** mark items done in §12 of the plan and in this doc as they land, with the date and how they were verified.

## 5. Carried over and still open

From `next-steps-handover.md` §1.3, still relevant here:
- **Tickets and sessions:**
  - Project deletion still hard-deletes tasks and sessions (F31; Phase 4).
  - `ticketSystem = "custom"` still means both Viberglass-native and Custom Webhook (PG3).
  - Anyone can edit a space's prompt templates (PG17). Fix it with §2.3, since maintainers are the natural owners.
- **Agents:**
  - Replace Gemini CLI with Antigravity CLI.
  - Pinned default models (OpenCode providers, Moonshot) will age.
- **UI:**
  - Research and plan documents should render as markdown (with §2.8).
  - Demo task cards say "3m ago" (tasks are stamped at load time).
  - Slugs drop dots, and the breadcrumb shows the slug instead of the space name (fold into §2.1).
- **Remaining quick wins:**
  - #14: execution confirmation naming the branch and repository.
  - #6/16: names instead of emails. Largely solved by attributed users in §2.4, §2.5 and §2.7.
  - #8: a "● Live" badge on tasks (§3.4).
  - #2: glossary copy (§2.1).
  - #3: the SCM dropdown placeholder.
  - #11: the duplicate GitHub token field.
  - #17: deleting branches of failed or cancelled runs.
