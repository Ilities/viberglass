# Handover: Phase 2 (people) and Phase 3 (agent ↔ human)

Status as of 2026-10-01 · Phase 2 is done and its exit journey passes (§2); Phase 1 is done and confirmed on AWS (Jussi, 2026-09-30); Phase 0's quick wins are done (§5; #17 dropped) · Owner of decisions: Jussi

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

**All answered 2026-09-29** and recorded in [ADR 0005](../adr/0005-roles-and-space-visibility.md) (D1–D3, D6), [ADR 0006](../adr/0006-agent-questions-and-session-continuity.md) (D7–D9) and plan §13 (D4, D5). Every recommendation was accepted except D1, which adds a **Viewer** role: read-only across the workspace (sees every open space and task, can't create, comment, approve or run). Also decided: a follow-up session turn that writes no document leaves the session waiting on the person (§3.1). The table keeps the original options for reference.

| # | Decision | Needed before | Recommendation |
|---|---|---|---|
| D1 | **Workspace roles** · *Decided: Admin, Member, Guest and Viewer* | Phase 2, step 2 | Keep **Admin** and **Member**, add **Guest**. Guests get a limited account: invited to specific spaces, can comment, answer questions and approve when they're a reviewer, but see no plumbing and can't create spaces. Matches the §4 matrix. |
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

**Done (2026-09-30), without redirects or aliases** (Jussi: nobody uses the app yet, so old links and API paths simply go):
- **UI routes:** `/spaces/:space/{tasks,tasks/new,tasks/:id,runs,runs/:id,sessions/:id,schedules,settings/{general,connections,prompt-templates}}`, `/spaces/new`, `/pulse`, and workspace settings at `/settings/{agents,secrets,connections,members,…}`. The route param is still `:project` internally.
- **API:** `/api/spaces`, `/api/tasks`, `/api/integrations/space/:id/…`. `/api/jobs` and `/api/clankers` keep their names: published worker images call the jobs callbacks.
- **MCP tools:** `space_list`, `agent_list`, `task_{list,create,get,trigger,review,review_approve,review_revoke,review_comment}`, with `spaceId` / `taskId` / `agentId` parameters.
- **Also:** the Chrome extension (its "open task" link pointed at a `/tickets/:id` route that never existed), Slack task links, readiness fix links, and visible copy (Project → Space, Ticket → Task, Job → Run, Clanker → Agent; other tools' "Jira project" or "Shortcut project" keep their names). The Slack command and bot are still `/viberator` and `@Viberator`: renaming them is a change in Slack's app settings.
- Not changed: database and internal code names, and JSON field names such as `projectId` and `ticketId` (ADR 0004 allows moving them gradually).
- Verified: backend 837 and frontend 146 unit tests, the full smoke suite (18/18), and the renamed pages in the dev stack.
- Known: `packages/mcp-server` already failed `tsc` with TS2589 (deep zod types in the MCP SDK) before this change; it builds with tsup.

The original plan follows.


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

**Done (2026-09-30).** What landed:
- **Roles:** `WORKSPACE_ROLES` (admin, member, guest, viewer) in `@viberglass/types`, with `RUNNER_ROLES` (admin, member) and `PLUMBING_READER_ROLES` (admin, member, viewer).
  - **Viewers** are refused on every mutating request by one middleware mounted after the auth context (`refuseViewerChanges`); only sign-out is allowed. Requests with no signed-in user (worker callbacks, webhooks) pass through.
  - **Guests** can't read plumbing (`adminOnlyChanges` reads need a plumbing reader), start or cancel runs, launch sessions, run schedules, change spaces (`runnerOnlyChanges` on `/api/spaces`) or use MCP. They can still comment and reply in sessions. Guests aren't invitable or assignable yet: without §2.3 they would see every space.
  - MCP is admins and members only for now (`refuseNonRunnerRoles`), since it authenticates with API tokens.
- **Invites** (migration 071): an admin makes a link under Settings → Members (`POST /api/invites`), shown once; only its hash is stored. Seven days, single use (a conditional update in the same transaction that creates the user), and inviting the same email again retires the old link. Pending invites can be revoked. The invitee opens `/invite/:token`, picks a name and password, and is signed in. The "create user with password" form is gone; `POST /api/users` stays for seeds and tests. Email delivery waits for SMTP (§2.6); the page says the link isn't emailed.
- **Deactivate** (migration 072): `users.deactivated_at`; deactivating ends every session, and login, sessions and API tokens all refuse a deactivated user. Admins can't deactivate themselves or the last active admin. Reactivate restores access.
- **Reset links** (migration 073): an admin makes a 24-hour single-use link (`POST /api/users/:id/reset-link`); `/reset-password/:token` sets the password, signs the person in and ends their other sessions. Self-service "forgot password" still only logs until SMTP.
- **Home checklist:** admins' dashboard shows *Invite your team · Connect Slack · Connect your tracker*, ticked from real state (`GET /api/setup/next-steps`), dismissible, hidden once done.
- Verified: backend 948 and frontend 187 unit tests; the smoke suite (22/22) including `invites-and-roles.e2e.test.ts` (invite in a second browser, link works once, revoked link fails, viewer refused, deactivation ends the session, reset link works once); the Members page in the dev stack.
- **Left for later:** the UI still shows actions a viewer can't take (the server refuses them); role-aware screens belong to Phase 2½. Pages that load plumbing will need to cope with guests' 403s when §2.3 makes guests invitable.

The original plan follows.

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
  - Add **Guest** and **Viewer** to `UserRole` and to every `requireRole`/`requirePolicy` decision (ADR 0005); guests see no plumbing and no admin pages, and viewers are refused on every mutating route.
  - **Deactivate** instead of delete: `deactivated_at`, sessions revoked. It keeps attribution and prepares J21.
  - Reset links use the same token mechanism, so an admin can hand out a reset link without SMTP.
  - Replace the "create user with password" form with Invite. Keep the API for the demo seed and tests.
- **Home checklist** (J1 step 7, moved from Phase 1 on 2026-09-29): a short, dismissible checklist on the admin's home after setup: *Invite your team · Connect Slack · Connect your tracker*, each ticked from real state (a pending or accepted invite, a Slack connection, a tracker integration). Advanced settings are mentioned once: "Engineers can fine-tune agents and connections in Settings → Advanced."
- **Tests:** a journey where the admin invites and the invitee accepts in a second browser context and lands on the member home, then a revoked link fails. A unit test that tokens are single-use and expire.

### 2.3 Space membership and visibility (J17; D2, D3)

**Done (2026-09-30).** What landed:
- **Data** (migration 074): `space_members(project_id, user_id, role maintainer|member, added_by)` replaces the stale `user_projects`; `projects.is_private`; `invites.space_ids`. The dead `projectAuthorization.ts` (and its test) is gone.
- **One rule** (`canSeeSpace` / `canMaintainSpace` in `@viberglass/types`): admins see everything and maintain every space; guests see only spaces they belong to; everyone else sees open spaces plus private ones they belong to. `SpaceAccessService` applies it on the server; a space someone can't see answers **404**, so a private space's name doesn't leak.
- **Enforced by `router.param`**, so every route with the parameter is covered without touching handlers: `:id`/`:projectId`/`:name` on `/api/spaces` (reads need visibility, any change needs a maintainer, which also makes space prompt templates maintainer-only, PG17), `:projectId` on `/api/integrations/space/…`, `:id` on `/api/tasks`, `:sessionId` on `/api/agent-sessions`, `:jobId` on `/api/jobs` (worker callbacks carry no user and pass through). Bulk archive checks every task. Scheduled runs (`/api/claw`) check the schedule's, template's or execution's space, and non-admin lists must name a visible space.
- **Lists are filtered**: spaces, tasks, task stats, runs, live sessions (Pulse) and MCP (`createMcpToolServices(scope)`, built per request from the token's user).
- **Membership**: creating a space (and setup's space step) makes the creator its first maintainer; the demo seed adds its people. Settings → Members in a space lists members, lets maintainers add people, change roles and remove them, and holds the **Private space** switch. People who can see settings but not change them get a note saying so (`viewerAccess` on the space response).
- **Guests are invitable**: an invite can name spaces to join (required for a guest), and accepting adds them as members in the same transaction. Guests' pages treat the forbidden agent list as empty.
- Verified: backend and frontend unit tests (188 frontend), the smoke suite (25/25) including `space-visibility.e2e.test.ts` (a private space and its tasks are hidden until the member is added; only maintainers change settings; a guest sees only their space, can't read plumbing or run, and can open their task in the browser); Settings → Members in the dev stack.
- **Left for later:** plumbing reads outside the agent list may still 403 for guests on pages they can reach (found by the Phase 2½ walkthrough); MCP stays admins and members only.

The original plan follows.

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

**Done (2026-09-30).** What landed:
- **Keys** (migration 075): each space has a fixed `key_prefix`, unique across spaces and derived from its name (`deriveKeyPrefix`: initials of several words, else the first three letters; "UX Walkthrough" → UW, "Web" → WEB, with a number added on a clash), and a `next_task_number` counter. A task's number and key (`UW-7`) are assigned in the creating transaction by an `UPDATE … RETURNING` on the space row, which serialises concurrent creation. Existing tasks were numbered in creation order.
  - URLs show the key where the link has the task (board, table, dashboard, sidebar, Pulse, space home, setup's first task, run and revision dialogs). The task page resolves a key through `GET /api/tasks/by-key/:key` (guarded like `:id`); links built from a bare task id (runs, sessions, run records, webhook deliveries) still use the id, which keeps working. The API stays on ids.
- **Participants** (migration 076): `task_participants(ticket_id, user_id, role requester|owner|reviewer|watcher)`, one owner and one requester per task. Every creation path goes through `TicketDAO.createTicket`, which records the requester (the signed-in person), the owner (the one picked, else the space's `default_owner_id`, else the requester) and any watchers in the same transaction. Webhook tasks get the default owner. Tasks made before this have none.
  - Routes on the task: list; change the owner (admins and members); add or remove reviewers (admins and members); watch and unwatch (anyone but viewers, for themselves). Only people who can see the task's space can be put on it.
  - The task sidebar shows the key and a People section (requester, owner picker, reviewers, Watch). Board cards and the table show the key and owner. The create form has an owner picker. Space settings → Members has the default owner.
- Verified: backend 960 and frontend 188 unit tests; the smoke suite (28/28) including `task-keys-and-people.e2e.test.ts` (8 tasks created at once get keys 1–8; requester and owner on create; the default owner wins; the page opens by key and Watch works); the task page in the dev stack.
- **Left for later:** the create form doesn't pick watchers (add them on the task); the §9 "waiting on" status line needs reviewers from the approval policy (§2.7).

The original plan follows.

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

**Done (2026-09-30).** What landed:
- **Discussion** (migration 077): `task_messages` and `task_message_mentions`. A mention is stored in the body as `@[Name](user:<id>)` (`mentionToken` / `parseMentionedUserIds` / `splitMentions` in `@viberglass/types`), so the server reads ids, not names. Posting refuses a mention of someone who can't see the task, and makes each mentioned person a watcher. Guests can post; viewers can't (global guard).
- **Activity** (migration 078): append-only `task_activity(ticket_id, actor_type human|agent|system, actor_id, kind, payload_json)`. Written by `TaskActivityRecorder` from the services that make each change; a failed write is logged and never fails the change:
  - task created (in `createTicket`'s transaction), owner changed, reviewer and watcher added or removed (`TaskParticipantService`), message posted;
  - run started (`JobService.submitJob`), finished or failed (`JobService.updateJobStatus`, which also covers sweepers and failed invokes), cancelled (`JobCancellationService`, with who cancelled);
  - research approved (moving on from research in `TicketWorkflowService.advancePhase`), plan approved (`TicketPlanningApprovalService`), a document edited by hand (`TicketPhaseDocumentService.saveDocument`, not the agent's own writes), a line comment added.
  - **Who did it** comes from a request-scoped actor (`api/auth/requestActor.ts`, `AsyncLocalStorage` set after authentication, and for MCP after the API token), so none of the run, approval or comment paths needed a new parameter. Changes with no signed-in person (worker callbacks, sweepers, webhooks) are recorded as the system or the agent.
- **Task page:** Discussion and Activity tabs below the steps. The composer suggests people after `@` and sends mention tokens; Activity is one plain sentence per entry ("Maria approved the plan", "The research run failed: Credential expired").
- Verified: backend 964 and frontend 191 unit tests; the smoke suite (29/29) including `discussion-and-activity.e2e.test.ts` (a mention makes the member a watcher, they reply in the browser, Activity names both); the task page in the dev stack.
- **Left for later:** notifications for mentions are §2.6; Activity entries written before this don't exist (history starts now); messages can't be edited yet (`edited_at` is in place); on a task with a long document the Discussion sits far down the page (Phase 2½).

The original plan follows.

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

**Done (2026-10-01).** What landed:
- **Data** (migration 079): `notifications(recipient_id, kind, ticket_id, actor_id, payload_json, read_at, done_at, snoozed_until)`, indexed for one person's open items; `users.slack_user_id`.
- **From Activity to people:** `TaskActivityRecorder` tells its listeners about every entry; `NotificationService` is the listener. `resolveNotifications` is the §8 table as a pure function (unit-tested row by row): reviewer added → review request; owner changed → assigned; mentions → mention; run finished → requester, owner and watchers; run failed → admins for setup and platform failures, else the owner (the requester when there's none); task marked done → requester. Nobody is told about their own action, and one change gives one item per person.
- **Channels** behind one `NotificationChannel` interface: the Inbox (always); a Slack DM for review requests, mentions, assignments and failures, to people who linked Slack (`SlackWebApi`, with `SLACK_API_URL` for stubs; the app manifest now asks for `im:write` and `users:read.email`); email for setup failures and finished tasks (`createEmailSender`: `EMAIL_FROM` plus `EMAIL_PROVIDER=ses` on AWS, signed with the backend's task role, or `SMTP_URL` when self-hosted via `nodemailer`). Invite links are emailed too when email and `PLATFORM_FRONTEND_URL` are set. **AWS:** setting the platform stack's `emailDomain` creates the SES domain identity with Easy DKIM (the CNAMEs go in `route53ZoneId` when set, else they're the `emailDkimRecords` output), grants the backend task role `ses:SendEmail` on it, and sets `EMAIL_PROVIDER`/`EMAIL_FROM` (`infra/platform/components/email.ts`). A new SES account stays in the sandbox, delivering only to verified addresses, until production access is requested in the SES console. `pulumi up` checks both with SES (live DKIM status, `GetAccount` for production access) and warns about whichever step is still open, with the console link and, for DNS outside Route 53, the records to add; the same list is the `emailSetupSteps` stack output. Not yet run against a real AWS account. A failing channel is logged and the others still deliver; a failure never touches the change that caused it.
- **Inbox page** (`/inbox`, in the nav with an unread count, also from inside a space): *Needs you* grouped as J10 (Questions for you · Review requests · Mentions · Failures you own · Updates), each item opens its task by key and is marked read; Done and Snooze (24 h); a Done tab. **My tasks** groups tasks you asked for, own or review into Waiting on you · Agent working · Waiting on others · Done (`myTaskGroup`).
- **Settings → Notifications** (everyone): link or unlink Slack (found by your Viberglass email), and whether email is on. Admins get **Send test email** (`POST /api/me/test-email`), which emails them and shows the transport's own error if it fails, e.g. SES refusing an unverified address while the account is in the sandbox.
- Viewers can use their own Inbox and notification settings (the viewer guard allows `/api/inbox/` and `/api/me/`).
- Verified: backend 988 and frontend 195 unit tests; the smoke suite (32/32) including `inbox.e2e.test.ts` (a review request reaches the reviewer's Inbox and Done clears it; a finished run notifies the requester but not whoever started it; My tasks shows an owned task under Waiting on you); the Inbox in the dev stack. Slack was then checked by Jussi against a real workspace (2026-10-01): URL verification, linking, and a DM for a mention; that also found the manifests were missing `app_mentions:read` for the `app_mention` event (added). Email was checked locally through Mailpit; SES hasn't been tried against a real AWS account.
- **Not done here:** making the Inbox the members' landing page is left to the Phase 2½ research; agent questions (Phase 3.2) and expiry warnings (3.6) will add their own kinds; "PR merged" isn't a notification yet (the outcome sweeper sees merges and could record it); no digests (D5: off until asked for). A task's first owner, set at creation, isn't notified.
- **Dev stack:** a new backend dependency needs `docker compose build backend && docker compose up -d backend`; the dev backend container has its own `node_modules` and crashes on a missing package until rebuilt.

The original plan follows.

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

**Done (2026-10-01).** Decided by Jussi the same day, refining D4: "the space's reviewers" is a new **default reviewers** setting on the space; workspace admins and the space's maintainers can always approve; one approval per step; every shortcut is checked against the policy for the person acting. What landed:
- **The rule** (`canApproveStep` / `namedApprovers` in `@viberglass/types`, one rule per step in a table): research by any participant; the plan by the task's reviewers, else its owner; admins and the space's maintainers always; viewers never. Guests approve when they're the reviewer. The build has no in-app gate: the PR review in GitHub is the gate.
- **One check** (`ApprovalPolicyService.assertCanApprove`) inside the services that approve, so every caller goes through it. It also refuses someone who can no longer see the space or was deactivated, since Slack approvals don't pass the routes' space guard. A refusal is a 403 that names who can approve ("Only Tomi, this space's maintainers or a workspace admin can approve the plan. Ask one of them, or add yourself as a reviewer.").
  - **Research** has its own approval (`TicketResearchApprovalService`, `POST /api/tasks/:id/phases/research/approve`): approval record, Activity entry, then on to the plan. `PUT /workflow/phase` (which the task page used to approve research, recording nothing) and `POST /phases/:phase/advance` are gone.
  - **The plan:** approve and revoke check the policy (`TicketPlanningApprovalService`).
  - **Shortcuts:** `TicketPhaseOrchestrationService.approveUpTo` takes every approval between the task's step and the target as the person moving it on. Slack, MCP `task_trigger` and chains use it. **Skip to the build** needs the right to approve the plan, and is only offered to those who have it.
  - **Live sessions:** a session in execution mode now needs an approved plan, the same rule as a batch build (`assertPlanCleared`). Before this it needed nothing.
- **Who acted:** approvals store user ids. Migration 080 converts `ticket_phase_documents.approved_by` and `ticket_phase_approvals.actor` (now `actor_id`) from emails; an unknown email becomes null. Routes pass the signed-in user; MCP the token's user.
  - **Slack** acts as the person who linked that Slack account (`users.slack_user_id`, §2.6): the Approve button, "lgtm"/"ship it" mentions and live-session advances. An unlinked user is told to link their account under Settings → Notifications. A chain remembers who started it (`chainedBy` in both bridges) and continues as them, so it stops at the plan unless they may approve it.
- **Default reviewers** (`projects.default_reviewer_ids`): set in a space's Settings → Members by its maintainers, and only to people who can see the space. They join each new task as reviewers when it's created, silently, like the default owner. Tasks made before keep their reviewers as they are.
  - **When a plan run finishes**, the people it waits on get a **review request** ("The plan for “X” is ready for your review"); the rest hear it's ready as before.
- **Task page:** the banner shows Approve only to people who may approve (`GET /api/tasks/:id/approvals`, loaded with the task). Everyone else sees "Waiting on Tomi to approve." and **Request approval from…** (`POST /phases/:step/request-approval`), which adds the person as a reviewer and sends them a review request. Guests may only ask for themselves.
  - Asking for yourself makes you a reviewer, who may then approve. That's J7's "Reassign reviewer", and Activity records it.
- **Also fixed:** the `Select` component dropped `aria-label` (JSX doesn't type-check hyphenated props), so no labelled select in the app had an accessible name. MCP's unused `actor` parameters are gone.
- Verified: backend 1015 and frontend 199 unit tests; the smoke suite (34/34) including `approval-policy.e2e.test.ts`. That journey checks that a member not on the task gets no Approve or Skip to the build, that the API refuses them with the reason, that they ask for themselves and then approve, and that the approval is credited in the plan and in Activity. A second journey sets a default reviewer in settings and checks they review the next task's plan. Migration 080 ran on the dev database; both existing approvals now name a user.
- **Not checked:** the Slack paths have unit coverage only up to `approveUpTo`; they weren't tried against a real workspace.
- **Left for later:**
  - per-space rule settings: the defaults are fixed;
  - the J7 journey's comment-and-request-changes half, which needs §2.8;
  - a default reviewer who later loses access to a private space, or is deactivated, is still added to new tasks (the policy refuses their approval);
  - a planning-mode live session doesn't need the research approved;
  - Slack's Reject button still only posts in the thread.

The original plan follows.

- **Exists** (verified 2026-10-01):
  - Approval exists for **planning only**: `POST /api/tasks/:id/phases/planning/{request-approval,approve,revoke-approval}` (`tickets/workflowPhaseRoutes.ts`), `TicketPlanningApprovalService` and `ticket_phase_approvals` (migration 038). `ticket_phase_documents.approved_by` and `ticket_phase_approvals.actor` hold the approver's **email** (`req.authContext.user.email`).
  - Research moves on through `POST /:id/phases/:phase/advance`, which writes a `document_approved` Activity entry (`TicketWorkflowService.advancePhase`) but no approval record.
  - **Anyone who isn't a viewer can approve.** Phase 0 left this open deliberately: locking approval to admins would lock out product leaders.
  - **Other paths that approve the plan or skip its gate.** Most go through `TicketPhaseOrchestrationService.advanceAndRun`, which calls `approve()` when the target is the build:
    - the Slack **Approve** button (`chat-slack/src/handlers/ticketApprovalAction.ts`), which passes **no actor**; the Slack display name only appears in the thread post;
    - Slack mentions such as "lgtm", "ship it" and "go" (`sessionAdvance.ts` → `threadMention.ts`), also with no actor;
    - **chained runs**: "ship it" during research runs the plan, then `TicketJobBridge.chainAdvance` continues to the build, approving a plan nobody has read;
    - MCP `task_trigger` with `targetPhase: execution`;
    - `POST /:id/workflow/override-to-execution` ("skip to the build"), which the build's check accepts in place of an approval (`workflowOverriddenAt` in `TicketExecutionService`), and `PUT /:id/workflow/phase`, which sets the step directly.
  - Session approvals (`AgentSessionInteractionService.approve`, `NEEDS_APPROVAL`) are the agent asking permission for a tool. They aren't step approvals and are out of scope.
- **Design:**
  - **Policy:** one `ApprovalPolicyService.canApprove(user, task, step)` with a rule per step, chosen by strategy rather than if/else. Research: any participant. Plan: the task's reviewers, else the owner. Build: no in-app gate; the PR review in GitHub is the gate, so the status line says "Waiting on PR review". Admins and the space's maintainers pass every rule. Rules are per space with these defaults; ship the defaults first and add the setting UI once they're in use.
  - **Every path calls it:** the approve and advance routes, `advanceAndRun` (for Slack, MCP and chains), the chain's continuation (checked for whoever started the chain), override-to-execution, and `PUT /workflow/phase`. Refuse with 403 and a reason the UI and Slack can show.
  - **Who acted:** routes take the user from the request-scoped actor (`requestActor`); Slack resolves `event.user` through `users.slack_user_id`.
  - **Data:** a migration converts `actor` and `approved_by` from emails to user ids (unknown emails become null), and adds `projects.default_reviewer_ids` (or a small `space_default_reviewers` table).
  - **Research** gets the same request-and-approve path and approval records as the plan, so every gate is recorded. "Approved by Tomi, 10:42" in Activity and the step header.
  - **Request review from…** adds reviewers (`TaskParticipantService`), which already sends a review request (§2.6). Requesting the plan's approval adds the space's default reviewers.
  - **UI:** only people who may approve see Approve; others see "Request approval from…". The task response carries `canApprove` per step so the UI doesn't repeat the rule.
- **Tests:** a unit test per rule, covering admins, maintainers and guests who are reviewers; the API refuses an ineligible approver (403); a Slack Approve from an ineligible or unlinked user is refused; a chain started by someone who can't approve the plan stops at the plan; the J7 e2e journey (request → comment → request changes → approve).

### 2.8 Comments on the rendered document (J7)

**Done (2026-10-01).** What landed:
- **Rendering:** research and plan documents are parsed with `mdast-util-from-markdown` and GFM (tables, task lists, strikethrough, autolinks) and rendered by our own small renderer (`tickets/markdown/markdown-document.tsx`). Raw HTML shows as text and only `http(s)`, `mailto`, relative and `#` links are links, so a document can't inject markup. Every piece of rendered text carries its offsets in the markdown source (`data-src-start`/`data-src-end`). The old line-by-line `DocumentReader` and the line-comment view are gone; `renderInline` stays for the Discussion. Jest runs CommonJS, so the parser's ES modules go through a small esbuild transform (`jest.esm-transform.cjs`).
- **Anchors** (`documentAnchor.ts` in `@viberglass/types`): a comment stores a W3C text quote (`quote_exact`, `quote_prefix`, `quote_suffix`, migration 081), cut from the markdown source a selection covers (`selectionToSource`). Each read finds the quote again in the document as it reads now (`locateQuote`: context decides between repeats, then nearness to the original line), so a revision or an edit can't strand a comment. A comment whose text is gone is **outdated**: shown on the Comments tab, not lost. The source line stays as a fallback: existing line comments got a quote from their line's text (blank lines keep only the line), and MCP's `task_review_comment` still places comments by line.
- **Document view:** select text → **Comment** opens a composer under the selection (comment, or *Suggest a change*, which replaces the quoted text when applied). Open comments are highlighted; clicking one shows what was said, with Resolve and Apply suggestion. Viewers read but don't comment. The **Comments** tab lists every comment with the text it's on, outdated ones marked, resolved ones folded.
- **The agent** gets each open comment with the text it's on ("On “button label** on mobile” (line 5) (by …): …"), from one formatter (`formatCommentsForAgent`) that replaced four copies. "Ask for changes" sends them, as before. Activity says "Tomi commented on the plan: “…”".
- Verified: backend and frontend unit tests (anchoring and re-anchoring, the renderer, selection mapping); `rendered-document-comments.e2e.test.ts` (comment on bold text in the rendered plan, the highlight survives text added above it, the revision prompt quotes it, and it's outdated once its text is removed); also driven by the Phase 2 exit journey below.
- **Left for later:** replies to a comment and editing one; a comment spanning text whose source differs from what's shown (escapes, entities) snaps to that text's edges; a quote shown in the composer drops markdown marks (`readableQuote`), but a suggestion's before/after shows the source it replaces.

The original plan follows.

- **Exists:** comments are anchored to markdown **source line numbers** (the service checks the line count), and the documents are shown as source. Rendering them is also recorded as future work.
- **Design:**
  - Render research and plan documents with the app's markdown renderer (check quick win #7, bold inside list items, while doing it).
  - Anchor comments to a **text quote** (exact text plus some prefix and suffix context, the W3C "text quote selector" approach), with the source line kept as a fallback.
  - Existing line comments migrate to anchors built from the text on their line.
  - Select text → comment or suggest a change. "Request changes" sends the open comments to the agent as a revision, as it does today.
  - Re-anchor after a revision by searching for the quote. Comments whose text is gone are shown as "outdated" rather than lost.
- **Tests:** anchoring and re-anchoring unit tests; the revision still receives the open comments (an existing journey covers the revision flow).

### 2.9 Audit log (J17)

**Done (2026-10-01).** What landed:
- **Data** (migration 082): append-only `audit_log(actor_id, actor_kind human|system, action, target_type, target_id, details_json, ip, created_at)`, indexed by time, person and area. The actions and their sentences are one list in `@viberglass/types` (`AUDIT_ACTION_TEXT`).
- **Written three ways, none by hand in a handler:**
  - **Runs started and cancelled, and approvals,** by an Activity listener (`AuditActivityListener`), so they come from the same call that writes the task's Activity and can't disagree with it. Slack approvals are credited to the linked person (§2.7).
  - **Connections, secrets, runners, members and roles, invites, and space settings, membership and deletion,** by `auditRequests`: middleware in front of each router with a table of its routes (`auditRules.ts`). After a successful response it records the action, the target (route parameter, or a created thing's `id` from the response), who and from where. Details are listed facts only (a name, a role, which fields changed); request bodies carry passwords and secret values and are never logged.
  - **Accepting an invite** by `InviteService`, with the new person as the actor, since nobody is signed in yet.
  - Recording never fails the change: a failed write is logged.
- **Who and where:** the request-scoped actor (`requestActor`) now carries the IP too (`trust proxy` is already set for the load balancer).
- **Settings → Advanced → Audit log** (admins; `GET /api/audit-log`, refused for everyone else): newest first, filtered by person and area, "Show older" pages back. Each row reads "Jussi changed someone's workspace role · as viewer".
- Verified: unit tests (the middleware records successes by route and never a secret value; the listener; the route's filters); `audit-log.e2e.test.ts` (a secret, a role change and an approval appear; the secret's value isn't in the log; a member gets 403; the page filters by area).
- **Slack** (added the same day, Jussi): every Slack action that starts or continues a run (the launch form, revisions, approvals and "ship it" chains, live sessions, and replies, messages and tool approvals in them) runs as the person who linked that Slack account (`runAsActor` in `requestActor`, from `asSlackUser` in `chat/index.ts`). Runs, Activity, session events and the audit log credit them, and audit entries add `via: slack` with the Slack user id, so an action from an unlinked account reads "Slack user U123 started a run" instead of "The system". A task created from the Slack launch form has that person as its requester (and so its owner when the space has no default owner), with the Inbox items that brings; the form lists only the spaces that person can see (`SpaceAccessService.visibleProjectIds`; every space for an unlinked account, as before), and creating a task in a space they can't see is still refused, for a form opened before a permission change. Unit-tested; not tried against a real Slack workspace.
- **Left for later:** API tokens, prompt templates, deployment strategies, sign-ins and space creation aren't recorded; no retention or export; paging is by time, so two entries in the same millisecond could straddle a page.

The original plan follows.

- **Exists:** nothing.
- **Design:**
  - An append-only `audit_log(actor_id, actor_kind, action, target_type, target_id, details_json, ip, created_at)`, written by a small `AuditRecorder`.
  - Record: runs started or cancelled, approvals, connection, secret and runner changes, member and role changes, invites, deactivation, and space deletion.
  - An admin page under Settings → Advanced with filters.
  - Task Activity (§2.5) is for everyone working on a task. The audit log is for admins and covers the whole workspace. Where both record the same action, write both from the same call.

**Phase 2 exit test: passing (2026-10-01),** as `phase-2-exit.e2e.test.ts`. A designer and a reviewer are invited by link and accept; the PM (the admin) asks and the agent researches; the PM @mentions the designer, who sees it in their Inbox and replies; the PM approves the research, the agent plans, and the PM asks the reviewer, who gets a review request (and the designer is refused if they try to approve); the reviewer comments on the rendered plan, asks for changes, the agent's revision gets the comment, and the reviewer approves; Activity names each person for each step. The plan as written:

**Phase 2 exit test (plan):** a single e2e journey with three people (admin PM, member designer, member reviewer) invited through links:
- the PM creates a task;
- @mentions the designer, who replies;
- the plan is requested from the reviewer, who comments on the rendered plan, requests a change and then approves;
- the Inbox shows each person the right item at each point, and Activity attributes every step.

The fake agent writes the documents.

---

## 2½. Returning-visit UX (between Phase 2 and Phase 3)

Added by Jussi on 2026-09-30; see plan §12, Phase 2½. Research first (a walkthrough of every returning-visit screen as each persona and role, with screenshots), then a redesign plan in `docs/ux` for Jussi's review, then the build. It waits for Phase 2 so the landings can be designed around roles, participants, Activity and the Inbox (§2.6 already plans the Inbox as the member landing page; the research may change that).

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
- ~~**A follow-up turn that ends without writing the document leaves the session `active` forever.**~~ **Done (2026-09-29).** It applied to any live turn without a document, the first included. When a turn completes, the session isn't ended and no queued message starts another turn, `AgentSessionWorkerEventService` moves it to `waiting_on_user` (ADR 0006); a reply starts the next turn. The session page and the phase panel read the live status from the event stream through one helper (`liveSessionStatus`), which now counts `turn_completed`; the unused `InlineSessionPanel` is gone. A failed turn still leaves the session `active` for a retry. Verified by `session-waits-on-person.e2e.test.ts` (fails before the fix, passes after) and the full smoke suite (17/17).
  - **Note for Phase 3 tests:** a resumed turn's prompt is only the new message (a real agent restores the conversation with `session/load`), and the fake agent has no memory, so it doesn't know which document to write on a later turn unless the message names it. Journeys with several turns, and `[fake:ask=…]`, will want the fake to keep per-session state in a harness state directory that the worker archives, like real agents.
- ~~**Slack threads never show the agent's replies**~~ **Done (2026-09-29).** The bridge read `payload.content`, but the worker sends `payload.text`, one event per streamed chunk. `AssistantMessageCoalescer` joins consecutive chunks into one post, flushed on the next other event. Unit-tested; a recorded planning session's 98 chunks replay as 5 posts. Not checked against a real Slack workspace.
- ~~**The ACP permission reply shape:** confirm it against the ACP spec and the harnesses in use.~~ **Done (2026-09-29).** It was wrong: the client answered `{ action: "allow_once" }`, while the spec's answer is `{ outcome: { outcome: "selected", optionId } }` with an id from the offered `options`. OpenCode 1.18 (read from the binary in the worker image) reads `outcome.outcome` and accepts only its own ids `once`/`always`, so every permission request failed while the transcript said "auto-approved". `approvePermissionRequest` (`packages/agent-core/src/acp/permissionReply.ts`) now picks the offered option by kind (allow once, then allow always, else `cancelled`), and the transcript line names the tool call from `toolCall.title`. Verified by unit tests, an `AcpClient` test over real stdio against a scripted agent with OpenCode's option ids (fails on the old reply), and the smoke suite on a rebuilt fake worker (17/17). Not verified against a live OpenCode run with a model. Local worker images need a rebuild; GHCR images republish on the push to `main`.
- **Session routes check no roles:** any member can cancel any session (reported). Add the Phase 2 membership and participant checks: cancel for driver, owner and admins.
- ~~**Startup resumes ticket and session bridges before migrations**~~ **Done (2026-09-30).** The chat module resumed both on a `setTimeout(0)` at import, while `startServer()` was still migrating, so a fresh database logged `relation … does not exist` and a restart with a late database lost its Slack bridges for good. `resumeChatBridges()` (`chat/index.ts`) now runs from `startServer()` after migrations. Verified in the first-run backend log (both errors gone), on the dev backend's restart, and by the full smoke suite (17/17).

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
  - **Proactive warnings** (the "connection health and expiry warnings" moved from Phase 1 on 2026-09-29; today readiness only flags a credential after it has expired, `ProjectReadinessService`): tokens with an expiry warn before they expire. Credit-low warnings where the provider reports it: the key checker's model list can't, so this may wait on a usage endpoint per provider.
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
  - ~~Anyone can edit a space's prompt templates (PG17).~~ Maintainer-only since §2.3 (2026-09-30).
- **Agents:**
  - Replace Gemini CLI with Antigravity CLI.
  - Pinned default models (OpenCode providers, Moonshot) will age.
- **UI:**
  - ~~Research and plan documents should render as markdown (with §2.8).~~ Done with §2.8 (2026-10-01).
  - Demo task cards say "3m ago" (tasks are stamped at load time).
  - Slugs drop dots, and the breadcrumb shows the slug instead of the space name (fold into §2.1).
- **Done (2026-09-30), UI pass:**
  - Quick win #2: the dashboard, space home, agents page and sidebar use plain copy and the Space/Task names (URLs unchanged until §2.1). The dashboard gives each space one next step ("View tasks", "Connect repository"…); ASCII art and Hitchhiker's copy are gone from working screens (loading messages kept). FR3's competing CTAs are gone.
  - Quick win #3: the SCM dropdown says "Select a connection…" when connections exist.
  - **Run page redesigned** (`pages/project/jobs/`): the task's title, an Activity view in three steps (preparing, agent working with its work folded into chips such as "read 14 files", finishing), and a "your move" card at the end that makes the next move from the run page: cancel while running; approve research and start planning; approve the plan; try again or run again; the build stays on the task, where its target is confirmed. Prompt and raw log are tabs; a right column has the run's facts and the task's other runs. Job detail now returns `agentSessionId` (from the turn; `jobs.agent_session_id` is never written) and the task's current `workflowPhase`. Journey: `run-page-next-steps.e2e.test.ts`.
- **Done (2026-09-30): task and run screens merged.** The task page is where runs live: each phase shows its document, then its runs (`tickets/phase-run.tsx`: a run switcher, the three-step Activity, Prompt and Raw log, and the "your move" card), with the task's facts, "Runs on this task" and past sessions in a sticky right column. A run link (`/runs/:id`) for a task's run opens the task at `?run=:id`, scrolled to it; the standalone run page is left for runs without a task (schedules). Approval moved onto the run's card (`ApprovePhaseButton`, so open comments still warn); a phase without runs (a hand-written document) keeps the old approve button. Removed as dead: `phase-logs.tsx`, `research-document-panel.tsx`, `planning-document-panel.tsx` and unused `phase-document-ui` helpers. Verified by the smoke suite (18/18) and in the dev stack.
- **Done (2026-09-30): task page redesigned after a UX walkthrough** (screenshots of every state: not started, failed, plan in review, PR open). The walkthrough found the next move at the bottom of the page, one status worded five ways, up to five nested boxes, and the same actions in several places under different names. Now:
  - **The next move is a banner under the title**, with one primary action (`task-next-move.ts` decides it from the task, its runs, documents and live session; `task-next-move-banner.tsx` shows it). It replaces the run card, the PR banner and the document-header run buttons.
  - **A stepper, Research · Plan · Build**, shows one step at a time (`?step=`); its labels come from the same next move, so they can't disagree with the banner.
  - **Each step has three views, Document · Runs · Comments** (`?view=`), so a long document never buries the runs (Jussi, 2026-09-30). Runs are one-line entries that open to what the agent did, the prompt and the raw log; a run's link (and the banner's "See what happened") opens Runs with that run open. Comments is the line-by-line view for comments and suggested wording, with the open count on its tab. The work summary under "Agent working" is plain text with one link to the raw log, since its chips looked like links to things they didn't open.
  - **"Actions ▾"**, a visible outline button, replaces the "⋯" icon.
  - **The right column** has Details and one History of runs and sessions. The "⋯" menu holds housekeeping only (edit details, copy ID, skip to the build, mark as done or reopen, delete). The task page no longer repeats the demo notice.
  - Manual "Submit for review" and "Mark as open" are gone: task status is derived (Phase 0), so setting it by hand only fought that. Mark as done and Reopen stay.
  - Removed: `TicketPhaseView`, `phase-section`, `phase-header`, `phase-run`, `phase-activity`, `jobs/task-runs`. Still unused and kept for a decision: `phase-document-revision-history.tsx` (earlier versions of a document).
- **Remaining quick wins:**
  - ~~#11: the duplicate GitHub token under outbound feedback.~~ **Done (2026-09-30).** GitHub feedback posts with the connection's default token credential (`IntegrationCredentialTokenSource`, chosen per provider by `FeedbackProviderBehavior.usesIntegrationCredential()`); a token stored on older feedback settings is still used when the connection has no default token credential. The field is gone from the GitHub feedback section, and its dead copy in the app was removed (its tests now render the package's section; the frontend Jest config maps workspace UI packages to their source). Unit-tested; not checked against a real GitHub issue. The dev database's `GITHUB_TOKEN` credential isn't marked default, so it would still fall back.
  - ~~#14: execution confirmation naming the branch and repository.~~ **Done (2026-09-30).** The build dialog says "Pushes branch `x` to `repo`, then opens a pull request against `base`", and that an earlier build's branch is added to. The branch name comes from the worker's own `buildFeatureBranchName`, moved to `@viberglass/types` so both use one rule; a template with `{{ jobId }}` or `{{ timestamp }}` is shown as written, since those are only known once the run exists (`components/run-target-summary.tsx`).
  - ~~#6/16: names instead of emails.~~ **Done (2026-09-30)** for comment authors, approvers, session starters ("Started by …") and cancellers ("Cancelled by …"). Actors are stored as an email or a user id depending on the route, so the frontend resolves either through `GET /api/users/directory` (any signed-in user; id, name, email, avatar) and `usePersonName()`. §2.4–2.7 should store user ids everywhere; when Guests arrive (§2.2) the directory must be limited to people the viewer shares a space with.
  - ~~#8: a "● Live" badge on tasks.~~ **Done (2026-09-30).** Task lists carry `liveSessionId` for a task with an open session; board cards and table rows show "Live · Join", linking into the session. The task page already had "Open the live session" in its banner.
  - ~~#7: bold inside list items.~~ **Done (2026-09-30).** The document reader renders inline `**bold**`, `*italic*` and `` `code` `` in headings, list items and paragraphs (`tickets/document-inline.tsx`); underscores only at word edges, so snake_case stays. A full markdown renderer is still §2.8's (react-markdown is ESM-only, which this Jest setup doesn't transform, and line comments need source positions).
  - ~~#2: glossary copy beyond the dashboard, space home and nav.~~ **Done**: §2.1 covered it; the task list's page title still said "Tickets" and was fixed. Backend error messages ("Ticket not found", "Project not found") can still surface in toasts.
  - ~~#17: deleting branches of failed or cancelled runs.~~ **Dropped (Jussi, 2026-09-30): branches stay in GitHub, no action.** The 90 stale branches came from the old per-run branch names; a task now has one branch (`viberator/<task id>`) that later builds continue.
- **Done (2026-09-30): PG3.** Tasks and spaces made in Viberglass are `native` (`NATIVE_TICKET_ORIGIN`, type `TicketOrigin` = integration systems plus `native`); `custom` now only means the Custom Webhook. Migration 070 re-labels existing rows: a task is `custom` only if a webhook delivery created it, a space only if its primary ticketing connection is the Custom Webhook. The space home had shown every native task as "Custom Webhook"; it now says "Viberglass". MCP-created tasks defaulted to `github`; they're `native` now.
- **Done (2026-09-30): secret storage defaults.** New secrets default to where setup stores them (`SSM` when agents run on ECS, else the database), from `GET /api/secrets/storage-defaults`. All storage options stay in the dropdown. For SSM, the form shows the path the secret will get (`<prefix>/<NAME>`) and moves a custom path under "Advanced: use a custom path", explaining that ECS and Lambda agents only look secrets up at the default path and may read nothing outside the prefix. Same in the connection credential form.
- **Done (2026-09-30): page titles.** Signed-in pages all said "Viberglass": `react-helmet-async` 2.0.5 doesn't support React 19, so `PageMeta` never reached the head. It now renders `<title>` and `<meta>` directly, which React 19 hoists into the head, and the dependency is gone. Checked in the dev stack ("ux-walkthrough | Tasks | Viberglass").
- **Done (2026-09-30): "Starting the agent sandbox".** A run is `active` from before the worker is invoked, so until the worker's first progress report its Activity says "Starting the agent sandbox… A fresh sandbox can take a minute or two to start, longer on AWS" (a queued run now shows Preparing as current too). The task banner's "Agent working" card says each run starts in a fresh sandbox.
