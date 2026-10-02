# Handover: the task as a conversation (build plan)

Status: **plan, 2026-10-01** · Decisions: [ADR 0008](../adr/0008-tasks-are-conversations.md) (accepted by Jussi the same day, including "who may ask for code") · Product design: [`returning-visit-redesign.md`](./returning-visit-redesign.md) and [`information-architecture.md`](./information-architecture.md) · How to work on the repo: [`next-steps-handover.md`](./next-steps-handover.md) §2 and [`phase-2-3-handover.md`](./phase-2-3-handover.md) §4.

This is how to build ADR 0008 on the code as it is. It replaces the build order in the redesign's §9 with slices that each ship on their own, behind green unit tests and smoke journeys (run one suite at a time, `jest --maxWorkers=2`).

---

## 1. What exists, and what's in the way

From a code survey on 2026-10-01 (file:line in the survey; paths below are the main ones).

**Already a conversation engine, mostly:**
- **Sessions resume.** Each turn is its own job. The worker restores the harness's home state from an archive and calls ACP `session/load` with the stored `acpSessionId` (`apps/viberator/src/workers/core/runSessionTurnJob.ts`, `packages/agent-core/src/acp/AcpClient.ts:124-143`).
- **Messages queue** while a turn runs and start the next turn when it ends (`agent_turns.consumed_by_turn_id`; `SessionTurnContinuationService.launchForPendingMessages`).
- **A turn that writes no document leaves the session waiting on the person** (§3.1 of the Phase 2–3 handover).
- **The build continues one branch** per task, and creating the PR again finds the existing one (ADR 0007; `taskBranch.ts`, `GitService.createPullRequest`).
- **Threads already exist in pieces:** `task_messages` with `@[Name](user:<id>)` mentions, `task_activity` with human, agent and system actors, document revisions as full snapshots (`ticket_phase_document_revisions`), and comments anchored to quoted text.
- **Notifications** fan out from Activity to the Inbox, Slack DMs and email.

**In the way:**
1. **Two run paths.**
   - One-shot runs (`TicketResearchService`, `TicketPlanningService`, `TicketExecutionService`) use the harness CLI with no memory and no state capture.
   - Sessions use ACP and resume.
   - The two duplicate their document, comment and template loading. They split in the worker at `isOneShot = !params.agentSessionId`.
2. **A session is bound to one step**: a unique index on `(ticket_id, mode)` for open sessions, and the mode chooses the template.
3. **Every later turn resends the whole template** (ticket, documents, all open comments, then the new messages) into a session that already has them. That costs tokens and repeats context the harness already holds.
4. **The Discussion is disconnected:** nothing links `task_messages` to sessions or jobs. Mentions can only name users, not agents.
5. **What a turn produces is fixed by its mode:** research and plan turns read `RESEARCH.md` or `PLAN.md`; execution turns commit and open a PR.
6. **Approval gates are wired into running:** `assertPlanCleared`, `approveUpTo` and the workflow phase.
7. **A merged PR changes nothing on the task.** `PullRequestOutcomeSweeper` records outcomes for run records only.
8. **Resume is assumed, never checked.**
   - No harness plugin declares that it supports `session/load`; only the fake agent does.
   - `AcpClient` silently falls back to `session/new`, so a "resumed" turn can start cold without anyone knowing.
   - There's no compaction anywhere.
9. **Size limits:** most files this touches are already over 350 lines:
   - `jobs.ts` 824, `JobService` 872, `TicketDAO` 885, `workflowPhaseRoutes` 678;
   - the three session services, 395–428 each;
   - `runSessionTurnJob` 437.

   Split them as they're touched.

## 2. The target, technically

**One engine: the task turn.** Every agent run on a task is a turn in a session, started by `TaskTurnService.ask(taskId, actor, { message, action?, agentId? })`:
1. It posts the person's message to the thread.
2. It finds the task's session for that agent, or creates one (a cold start).
3. It builds a **delta prompt**: what's new since the agent's last turn (messages, comments, human edits to artifacts, the action asked for). A cold start adds the summary and the current artifacts.
4. It launches the turn through the existing session launch and continuation machinery.

One-shot runs for tasks go away. Scheduled runs (claws) keep their own path.

**Sessions per (task, agent), not per mode.** Replace the `(ticket_id, mode)` uniqueness with `(ticket_id, clanker_id)`. Mode moves to the turn: `agent_turns.action` (`research | plan | code | reply | summarise`), set by the suggested action or left for the agent to choose.

**The agent decides what it produces, and says so.**
- The turn prompt asks the agent to start with a one-line intent and to write `RESEARCH.md`, `PLAN.md` or code, according to what was asked.
- After the turn, the worker looks at what changed:
  - a written `RESEARCH.md` or `PLAN.md` becomes a new version of that artifact;
  - changes to the repository become a commit on the task branch and the PR, **only if the turn was allowed to write code**;
  - otherwise the result is a reply.
- The backend sets `allowCode` in the bootstrap from the policy. Without it, the worker discards code changes and the reply says it couldn't build.

**Agents are mentionable.** Mention tokens gain `@[Claude](agent:<clankerId>)`. A message that mentions an agent, or comes from a suggested action, starts a turn. `@agent` resolves to the agent already on the task, or to the space's default agent.

**The thread is a read model first.** `TaskTimelineService` merges these into one ordered list:
- `task_messages`;
- assistant `agent_turns` (intent, reply, status, which agent, resumed or cold);
- artifact versions (revisions, numbered per artifact);
- comments;
- `task_activity` (as quiet lines).

No data moves at first.

**Artifacts are versioned.** `ticket_phase_document_revisions` gains `version` and `agent_turn_id`. For code, each build turn is a version of the PR (its commit).

**Unread and "whose move".**
- `task_reads(ticket_id, user_id, last_read_at)` gives unread counts.
- `task_message_mentions.answered_at` is set when the mentioned person next posts in the thread. An open mention is someone's move.
- `taskSituation` (in `@viberglass/types`) reads open mentions, open questions, the running turn, the latest artifact and the PR state. When nobody is mentioned, the task waits on its owner.

**Harness capabilities.** `AgentPlugin` gains `capabilities: { resumesSessions: boolean; compactCommand?: string }`.
- The client checks the agent's advertised `loadSession`.
- It reports `resumed: true | false` with the turn, and the thread shows it.

## 3. Slices

Each slice ships on its own and leaves the product working. Sizes are rough.

### S1. The thread, read side (about 1 week)
**Done (2026-10-01).** What landed:
- **API:** `GET /api/tasks/:id/timeline`, from `TaskTimelineService`. It merges:
  - task messages;
  - what people said to the agent in live sessions (`TaskSessionMessageDAO`, with the "[Name]: " prefix stripped);
  - document revisions as numbered versions (Research v1, v2…, Plan v1…), crediting hand edits to their author;
  - Activity as events.

  Activity the thread shows another way is left out: a posted message is the message itself, and a hand edit is a version. When entries share a moment, a message reads before what it caused. Types: `TaskTimelineEntry` in `@viberglass/types`.
- **Task page:** one **Thread** replaces the Discussion and Activity tabs.
  - Events are short grey lines, versions are cards with Open (which switches to that document), and live-session messages say "to the agent, in the live session" with a link.
  - "Messages only" hides the events.
  - The composer says "People on this task see this. The agent doesn't read it yet." until S2.
  - The thread reloads when the page's runs, sessions or documents change.
- **Removed:** `GET /:id/messages` and `GET /:id/activity` (no callers left), and `TaskConversation`, `TaskDiscussion` and `TaskActivity`. The composer and message body are now components of their own.
- **Found on the way:**
  - `agent_turns.user_id` is text while `users.id` is a uuid, so the join compares as text.
  - Sessions opened before the prompt moved to `content_json` stored the whole prompt as their opening message. Those opening turns are left out.
- **Verified:** backend 1120 and frontend 212 unit tests; the smoke suite 39/39, including the new `task-thread.e2e.test.ts` (a message, a research run, Research v1, an owner change and a reply appear in order; Messages only hides the events). `phase-2-exit` and `approval-policy` now read the thread. Checked in the dev stack on WS-1 and WS-2.
- **Not in S1:** the agent's own replies in live sessions aren't in the thread yet. They exist only as streamed session events, and become thread entries when turns post into the thread (S2). The step views, banner and History column are unchanged.

- `TaskTimelineService` and `GET /api/tasks/:id/timeline`: messages, activity as quiet lines, and assistant turns and document revisions as entries.
- The task page shows the thread in place of the Discussion and Activity tabs, with a "Messages only" filter. The step views, banner and buttons stay as they are for now.
- **Tests:**
  - unit tests for the merge order and each entry kind;
  - a smoke journey: a message, a run, a document version and an owner change appear in order.

### S2. @agent turns on one engine (about 2 weeks; the big one)
**Research done (2026-10-01):** [`harness-session-research.md`](./harness-session-research.md). Resuming works across containers for Claude Code, opencode and qwen (tested with real models), but only once two worker bugs are fixed: the working directory changes every turn, and opencode, Codex and pi archive the wrong directories (opencode has never resumed). S2 starts with those fixes, cold-start detection in `AcpClient`, and image fixes (Claude adapter rename, Codex's missing `codex-acp`, pi's package, Kimi's end-of-life CLI).

**Groundwork landed (2026-10-01):**
- **One folder per task.** `jobWorkspaceDir` (`apps/viberator/src/workers/core/taskWorkspace.ts`) clones every turn of a task into `<root>/task-<taskId>`; jobs without a task keep a folder per job.
- **State directories.** Plugins declare `stateDirs` (several paths) and `stateExcludes`, for credential files the worker injects fresh. `SessionStateManager` archives all of them, minus the excludes. Corrections:
  - opencode archives `~/.local/share/opencode`, without `auth.json` and logs;
  - Codex's home moves to `~/.codex`;
  - Kimi Code uses `~/.kimi-code`, without its binary, credentials and logs;
  - Claude Code, qwen, pi and Gemini leave out their credential files.
- **`AcpClient`.**
  - It reads what the harness advertises and prefers `session/resume`, then `session/load`, else starts cold. `AcpSessionOpener` does this.
  - It drops the history a load replays, which would otherwise duplicate the transcript.
  - It starts over cold when a continued session fails its first prompt.
  - It reports the start as a progress event ("Continued the agent's earlier session" / "Started a fresh agent session: …", with a structured `sessionStart`) and as `acpSessionStart` on the result.
  - `initialize` now sends `clientCapabilities`, the spec's name, rather than `capabilities`.
- **Images.** Every Dockerfile (generated, multi-agent, Docker, ECS, Lambda) now installs:
  - `@agentclientprotocol/claude-agent-acp`; the multi-agent image had no Claude adapter at all;
  - `@agentclientprotocol/codex-acp`, missing from every image;
  - `@earendil-works/pi-coding-agent`;
  - Kimi Code CLI from its new installer, with `kimi-legacy` removed (Jussi).
  - Mistral Vibe in the multi-agent image, installed with uv's tools and Python under `/opt/uv` instead of `/root`, which the runtime user couldn't reach. `vibe-acp` had never run there.

  Checked on a local build of the multi-agent image: all seven harnesses (Claude Code, Codex, opencode, qwen, pi, Kimi Code, Vibe) start and answer `initialize`. Before this, Claude Code, Codex and Kimi didn't start at all, and Vibe couldn't be run. Published images change on the next push to `main`.
- **Tests.**
  - Unit: the folder rule; a real-tar round trip of opencode's state that leaves out credentials; and `AcpClient` over stdio against a scripted agent (resume preferred, load with replay dropped, cold when unsupported, gone, or failing its first prompt).
  - Verified: agent-core 36, worker 105 and every plugin's tests; the smoke suite 39/39 on a rebuilt fake worker.
**Turn engine landed (2026-10-01).** S2 is done. What landed:
- **Data** (migration 083):
  - `agent_turns.action` and `agent_turns.task_message_id`, the thread message a turn answers;
  - one open session per (task, agent), with older duplicates closed;
  - revisions get a stored `version` (backfilled) and `agent_turn_id`;
  - a `reply` job kind;
  - the `task_turn` and `task_turn_cold_start` templates.
- **One engine.** `TaskTurnService.ask(taskId, actorId, { message, action?, agentId? })` posts the message, then finds or opens the agent's session. The message becomes the session's next user turn, and waits if a turn is running.
  - `SessionTurnContinuationService` launches every turn, first or later, through `TaskTurnContextLoader` and `TaskTurnPromptBuilder`.
  - The delta is what's new since the agent's last *finished* turn: thread and live-session messages, new open comments, hand edits, and the PR's review comments on builds. A failed turn's prompt counts as unsent.
  - A first turn gets the cold-start preamble plus the delta. Later turns get the delta, with the cold version in the bootstrap (`coldStartTask`). `AcpClient` sends it instead when the harness can't continue (`coldStartMessage`).
- **Agents.**
  - Which agent: the one asked for, else the one mentioned, else the agent on the task, else `default-agent`, else the first that can run.
  - Mention tokens are `@[Name](agent:<id>)`, and a typed-out "@agent" asks too.
  - `POST /api/tasks/:id/messages` with `{ body, action?, agentId? }` starts a turn when it carries an action or mentions an agent. Starting turns stays limited to admins and members until S3.
- **Removed:**
  - the research/plan run and revision routes, `POST /:id/run`, `TicketExecutionService`, `AgentSessionLaunchService`, `openingMessage` and the old prompt types;
  - on the task page, `BuildChangesModal` and `PhaseSessionPanel`.

  `/:id/agent-sessions`, Slack and MCP (`TicketPhaseOrchestrationService`) call the engine.
- **What a turn produced.**
  - The worker writes the current `RESEARCH.md` and `PLAN.md` into the repository, kept out of commits.
  - A document the agent changed comes back in `documents`. `TaskTurnOutcomeService` saves it as a version linked to the turn, and stores the reply and intent (its first line) on the turn.
  - Code changes, new files included, become a commit and the PR only when the turn may write code. That's a *Build it* turn, or a build job that isn't a turn (webhooks). Otherwise they're thrown away (`codeDiscarded`).
  - A build that changes nothing, or research that writes nothing, now completes as an answer instead of failing with `AGENT_NO_CHANGES` or `AGENT_NO_DOCUMENT`.
- **Sessions stay open between turns.**
  - After a completed or a failed turn, the session waits on people.
  - Cancelling a run ends its turn, not the session; *End session* still ends it.
  - Task lists mark a task live only while a turn runs.
- **Thread and task page.**
  - Agent turns are thread entries: the agent, what it was asked for, its intent and reply, "continued its session" or "started a fresh session", and its run. A turn's run events are left out.
  - The composer suggests agents after `@`.
  - Suggested actions above it: *Try again*, *Write the research*, *Revise the research/plan with N comments*, *Write the plan* and *Build it*. N counts comments since the document's latest version. *Build it* waits for the plan's approval, the gate S3 removes.
  - The banner keeps Approve and drops its start, ask-for-changes and retry buttons. The board's and the run page's dialogs ask the agent.
- **Slack's session bridge** ends a run at a turn that wrote something, and on restart resumes only sessions with a turn running.
- **Fake agent.**
  - It keeps sessions in `~/.fake/sessions`, so loading one fails once its state is gone.
  - It writes the document named in `<what-to-do>`, or the one asked for in the thread.
  - `[fake:code]` changes `fake-change.txt`.
  - It starts with an intent line, and its documents say which turn of the session wrote them.
  - Directives count only in people's words, so quoted documents don't re-trigger them.
- **Split as touched:**
  - `jobs.ts` (719 → 189) into `jobs/jobResultRoute`, `jobs/workerCallbackRoutes` and `jobs/codexAuthCacheRoute`;
  - the comment routes out of `workflowPhaseRoutes.ts` (501 → 277);
  - `AgentSessionCancellationService` out of `AgentSessionInteractionService`;
  - `runSessionTurnJob` (437 → 131) into `turnArtifacts`, `workingTreeChanges` and `deliverPullRequest`.
- **Found and fixed:**
  - Two messages queued during one turn took the same turn sequence, which the unique index refuses. Turns now take `nextSequence`.
  - Cancelling a session turn's run never ended the turn, since `jobs.agent_turn_id` is never written. Every later message would have queued behind it.
  - A failed turn left its session `active`, so the task looked busy.
  - The worker cleaned up a per-job folder after each run, but runs clone into the task's folder now, so task folders stayed behind. On a warm Lambda's `/tmp` they would pile up. Cleanup now removes `jobWorkspaceDir`.
- **Verified:**
  - Unit tests: backend 1068, frontend 224, worker 110, agent-core 39, fake agent 17. Backend lint is clean, after fixing 4 errors that were already there.
  - Smoke 40/40, including the new `task-conversation.e2e.test.ts`: @agent writes research v1, a comment, "Revise the research with 1 comment" gives v2 with the comment, from a resumed session and without the task description, then "Write the plan" gives plan v1. `late-database` was re-run on its own: it starts its own backend and had caught one mid-edit.
  - Checked in the dev stack with agent-browser, after rebuilding the frontend image for the new shared types (see `docker-compose.yml`).
- **Left for later:**
  - The GitHub, Jira and Shortcut webhook processors still submit one-shot builds outside any session.
  - `ticket_phase_runs` isn't written for turns, so phase views' `latestRun` goes stale. Nothing reads it.
  - The old prompt template rows stay in the database, unused.
  - A session's `mode` only says what it started with.
  - A build turn's commit and PR aren't covered end to end: the fixture repository can't open pull requests. Unit tests cover the pieces.
  - The session page still calls a session between turns "Waiting on you", which reads oddly next to the thread.

- **Data:**
  - agent mention tokens;
  - `agent_turns.action`;
  - sessions keyed by (task, agent);
  - revision `version` and `agent_turn_id`.
- **Backend:**
  - `TaskTurnService` with delta prompts;
  - one new prompt template (`task_turn`, seeded by migration and editable like the others), plus a cold-start preamble;
  - the existing research, plan and build routes become thin calls to it, then go.
- **Worker:**
  - task jobs always take the session (ACP) path;
  - after a turn, detect documents and code changes as above;
  - honour `allowCode`.
- **Task page:** the composer suggests agents after `@`. **Suggested actions** above the composer (*Write the research*, *Revise with N comments*, *Write the plan*, *Build it*, *Try again*) replace the banner's run, approve and ask-for-changes buttons. The agent's intent line and result post into the thread.
- **Fake agent:**
  - keeps per-session state in its state directory, so it remembers across turns;
  - writes the document the action names;
  - `[fake:code]` makes a change.
- **Tests:**
  - a smoke journey: @agent writes research, a person comments, "Revise with 1 comment" produces research v2 that contains the comment, and "Write the plan" produces plan v1;
  - unit tests for the delta prompt (only what's new) and for detecting what a turn produced.

### S3. Agreement instead of approval (about 1 week)
**Done (2026-10-01).** Decided with Jussi along the way:
- anyone on the task, in any role, may ask for code;
- the override and reopen go too;
- Slack and MCP ask for the next step instead of approving;
- the phase is stored, but synced from artifacts.

What landed:
- **Who may ask** (`canAskAgent`, `canAskForCode` and `TaskCapabilities` in `@viberglass/types`; `TaskAskPolicyService`):
  - Research, plans and replies: admins and members on any task they can see, and guests only on tasks they're on.
  - Code: workspace admins, the space's maintainers, and anyone on the task, guests included.
  - Viewers never ask.
  - A turn with no person behind it (the system, or Slack with no linked account) may ask for anything but code.

  `TaskTurnService.ask` checks this in place of `assertPlanCleared`, so every path follows it: the thread, `/agent-sessions`, Slack and MCP. The routes' `RUNNER_ROLES` and `requireRunnerRole` checks went. `GET /api/tasks/:id/capabilities` tells the page what to offer.
- **No gates.** Removed:
  - the approve, revoke, request-approval, reopen and override-to-execution routes, and `GET /:id/approvals`;
  - `TicketResearchApprovalService`, `TicketPlanningApprovalService`, `StepApprovalRequestService`, `TicketWorkflowOverrideService`, `TicketStepReopenService`, `TicketPhaseRunGuard` and `TicketPhaseApprovalDAO`;
  - `approveUpTo`, and the feedback webhook's "research/planning approved" posts;
  - a starting phase on task creation (the Chrome extension and the Slack modal stop sending one).
- **The phase is derived.** `TicketLifecycleStatusService.synchronize`, already called after every document save and run change, sets the phase and the status:
  - the phase is the build once there's a pull request, the plan once one is written, else research;
  - the status is in review whenever an artifact exists and no run is going.
- **Migration 084:**
  - every approval on record without a `document_approved` Activity line gets one;
  - drops `ticket_phase_approvals`, the documents' `approval_state`, `approved_at` and `approved_by`, and the tickets' `workflow_override_*` columns;
  - re-derives every task's phase.
- **Mentions replace review requests.** A turn that produces an artifact mentions the task's reviewers, or else its owner (`artifactReviewers`):
  - the mention is stored as `outcome.mentioned`, and the thread shows "Asked Tomi to take a look";
  - the run's `run_finished` Activity carries `mentioned`, and its `step` is the artifact produced, so those people get a `mentioned` notification ("The agent mentioned you on …: the plan is ready") and the rest get `step_completed`;
  - adding a reviewer by hand still sends a review request.
- **Slack and MCP.**
  - Slack's Approve and Reject buttons became one button: *Write the plan* or *Build it*. Keywords ask for the next step.
  - MCP drops `task_review_approve` and `task_review_revoke`, and `task_review` no longer reports approval state.
- **Task page and run page.**
  - Gone: Approve, Request approval, Skip to the build, Reopen, and "Approved by".
  - The banner's "ready" card points at the thread's suggestions.
  - *Build it* is offered to whoever may ask for code, plan or not. No suggestions show for someone who can't ask.
  - The stepper says "Written" for earlier steps.
  - The run page offers *Write the plan* under finished research.
  - Old approvals still read as quiet lines ("Maria approved the plan").
- **Found on the way:** the Chrome extension's auto-run still called the research, plan and build run routes S2 removed. It now asks in the thread.
- **Verified:** see §5.
- **Left for later:**
  - "Build it from someone allowed opens a PR" is covered only up to the build run. The worker's `GitService` hardcodes `api.github.com` and parses only github.com addresses, and the git fixture is read-only over dumb HTTP, so a pull request stub needs a writable fixture plus a configurable GitHub API base passed to worker containers. The test checks that the guest's build turn runs as theirs.
  - People can add themselves as watchers, so any member, or any guest in the space, can make themselves able to ask for code. That follows "anyone on the task", but tightening it would mean excluding watchers or self-added participants.

Planned:
- The approval policy narrows to `canAskForCode` (the task's people, the space's maintainers, guests on the task).
- `assertPlanCleared`, the approve, revoke and request-approval routes, `approveUpTo` and the Approve buttons go.
- The workflow phase stops gating; it's derived from what exists.
- Existing approvals become quiet lines in the thread.
- Review-request notifications become mentions: the agent's post when an artifact is ready mentions the task's reviewers, or its owner.
- **Tests:**
  - "Build it" from someone allowed opens a PR;
  - from a guest who isn't on the task, the action isn't offered and the API refuses;
  - the Phase 2 exit journey, rewritten as a conversation.

### S4. Whose move, Home and unread (about 1.5 weeks)
**Done (2026-10-01).** What landed:
- **Where a task stands:** `taskSituation(input, viewer)` in `@viberglass/types` returns `state`, `label`, `waitingOn`, `since` and `yourMove`; `situationPhrase` gives "Plan v2 ready · Tomi". Precedence, highest first:
  - done;
  - the agent working ("Agent revising the plan");
  - an open question (an open pending request, asked of whoever opened the session);
  - a failed turn nothing has happened since (admins share setup and platform failures);
  - discussing, when people wrote after the latest artifact (waits on the open mentions, else the owner);
  - the PR (code);
  - the latest artifact ready (waits on the agent's open mentions, else the owner);
  - not started.

  The owner falls back to the requester. `TaskSituationService` gathers the facts for a whole list in eight batched queries (`TaskTurnFactsDAO`, `TaskThreadFactsDAO`, `TaskMentionDAO`, `TaskParticipantDAO.listDrivers`).
- **Migration 085:**
  - `task_mentions` holds mentions by people (with their message) and by the agent (with its turn); `task_message_mentions` is folded in. A mention is open until the person next posts in the thread, which `TaskMessageDAO.create` records.
  - `task_reads` tracks when each person last read each thread. Unread counts other people's messages and the agent's finished turns since then.
  - The Inbox's `notifications` table is dropped. Slack and email never read it.
- **API:**
  - `GET /api/home`: `needsYou`, then `threads` by latest activity, with roles, unread counts and last messages;
  - `GET /api/home/count`, for the sidebar badge;
  - `GET /api/overview?space=`: stuck (failed, or waiting on people over a day), in progress, done this week, live now, and per space;
  - `POST /api/tasks/:id/read`.

  Task lists and `GET /api/tasks/:id` include `situation`; the single task also has `capabilities`. Removed: `/api/inbox*` (My tasks included), `GET /:id/capabilities`, `InboxChannel`, `NotificationDAO`, and the Inbox and My tasks types.
- **Frontend:**
  - Home at `/` (Needs you, Your tasks with All · Unread · Mine, the setup checklist, a workspace-health line for admins, "Ask for something");
  - Overview at `/overview`, where viewers land;
  - the sidebar has Home (with the needs-you badge) and Overview in place of Dashboard, Inbox and Pulse;
  - the task page shows its situation under the title and marks the thread read, for everyone but viewers;
  - task lists and the board show the situation phrase.

  Deleted: DashboardPage, the Inbox pages and Pulse.
- **Split as touched:** the task routes (650 lines) into `crudRoutes`, `taskReadRoutes`, `taskMediaRoutes` and `taskListQuery`.
- **Found on the way: the production backend couldn't start.** Migrations 075 and 081 import `@viberglass/types`, which the prod image deletes because `server.js` bundles it, and `FileMigrationProvider` imports every migration on each start. So every start with `RUN_MIGRATIONS_ON_STARTUP` exited with `ERR_MODULE_NOT_FOUND`. `tsup.config.ts` now bundles each migration, still one file each. Checked on a locally built prod image against an empty Postgres: all migrations ran and `/health` returned 200.
- **Verified:**
  - Unit tests: backend 1056 (new: the situation table, `TaskSituationService`, `HomeService` and `OverviewService`); frontend 217.
  - Lint and type checks are clean.
  - Smoke 41/41, with the new `home.e2e.test.ts` (one journey per role: member, owner, guest, viewer); phase-2-exit and ask-policy now check Needs you.
- **Left for later:**
  - "Mark done" on a mention (the redesign's "or marks it done"); only replying answers one.
  - The `review_requested` notification on adding a reviewer still goes to Slack, but adding a reviewer opens no mention, so it isn't their move until the agent produces something.
  - `ApplicationLayout.tsx` (485) and `ProjectHomePage.tsx` (577) are still over the size limit; S7 rewrites both.
  - The space's own nav still says "Dashboard" (S7).

Planned:
- `task_reads`, mention `answered_at`, `taskSituation` and `capabilities` on every task response.
- **Home** becomes the thread list: Needs you, then by latest activity, with unread counts and last messages. It replaces the Dashboard, the Inbox page and Pulse. Overview for viewers.
- Slack and email keep notifying.
- **Tests:** a smoke journey per role: sign in, see what needs you, reply, and it stops needing you.

### S5. Done on merge (about 3 days)
**Done (2026-10-02).** What landed:
- **A merge closes the task.** `PullRequestOutcomeSweeper` tells its listeners about each outcome. `TaskMergeCompleter` resolves every open task with that pull request and records `pull_request_merged` Activity, with `mergedBy` from GitHub's `merged_by.login`.
  - The thread reads "Merged by dev-koskinen", the situation "Done · merged by dev-koskinen", and the requester and owner are told "“…” is done: dev-koskinen merged its pull request".
  - A failing listener is logged, not retried, since merged outcomes are final.
- **Migration 086** closes tasks whose pull request had already merged before this, each with its line.
- **Preview link.** The PR card's GraphQL query also reads the latest commit's deployments (a successful status's `environmentUrl`) and, failing that, a successful check run from Vercel, Netlify, Cloudflare Pages or Render. The card shows "Open the preview" when there's one (`BuildPullRequestDetails.previewUrl`).
- **Tests:** the sweeper with a fake outcome source closing a task, leaving open and closed-unmerged PRs alone, and surviving a failing listener; merged-by parsing; preview from a deployment and from a preview check; the merge line; notification text; the situation.
- **Left for later:** an open PR is rechecked at most hourly (`recheckAfterMs`), so a task can take up to about an hour to close after its merge. A GitHub webhook would make it immediate.

Planned:
- `PullRequestOutcomeSweeper` also marks the task done when its PR merges, with a quiet line ("Merged by …" when GitHub says who).
- The PR card shows a preview link when GitHub reports one (deployment status or check run URL).
- **Tests:** the sweeper with a fake outcome source.

### S6. Compaction and more than one agent (about 1 week)
**Done (2026-10-02).** What landed:
- **Context usage is read.**
  - `AcpClient` keeps the last `usage_update` (`used`/`size`), or the prompt result's `usage.inputTokens` for harnesses that only report that.
  - The compact command comes from `available_commands_update` (`/compact`, or qwen's `/compress`), so plugins don't hard-code it.
  - Both travel `AcpExecutor` → worker → result callback (`contextUsage`, `compacted`) and are stored on the turn's outcome.
- **The summary.**
  - A summarise turn writes `SUMMARY.md`, the worker's third artifact file.
  - Migration 087 adds `task_summaries` (numbered versions) and updates the seeded templates by replacing only the changed lines: the summarise instruction names SUMMARY.md, and the cold start gains `<summary-so-far>`.
  - Only a summarise turn's SUMMARY.md is kept; one an agent writes on its own is ignored. A summary mentions nobody.
- **Compaction.** On a summarise turn the bootstrap carries `compactInstructions`, and the harness compacts after writing the summary when it has a compact command. Harnesses without one read the summary at their next cold start.
- **Automatic summary.** `TaskAutoSummariser` asks the same agent for a summary after a turn whose context passed the threshold: 60% of the context window (`TASK_SUMMARY_CONTEXT_RATIO`), or 120k tokens when the size is unknown (`TASK_SUMMARY_CONTEXT_TOKENS`). Never after a summarise turn, and never failing the turn it follows.
- **Cold starts read the summary instead of what it covers.** The earlier messages of a cold start are the ones after the latest summary, and so are a brand-new agent's first-turn messages.
- **The thread.**
  - `summary` entries ("Summary v2"), with the latest pinned above the thread as "Summary so far";
  - agent turns say "Wrote Summary vN", "Compacted its context with the summary" and "Context 75% full";
  - *Summarise so far* is offered after 3 agent turns or 10 messages since the last summary;
  - *Bring in another agent* lists the active agents not on the task yet and posts "Bring in {Name}: it starts fresh and reads the summary and the task".
- **Fake agent:** `[fake:usage=N]` reports N of 200,000 tokens; it announces `/compact` and answers it without a turn; it writes SUMMARY.md when asked.
- **Tests:**
  - Unit: AcpClient usage and compaction against the scripted agent; the fake agent; outcome, auto-summariser, context loader, prompt builder and result route; the frontend summary entries, suggestion and bring-in menu.
  - Smoke 42/42, with the new `summary-and-second-agent.e2e.test.ts`: a turn reporting a full context is followed by Summary v1, unasked and compacted, pinned in the thread; a second fake agent is offered under *Bring in another agent*; its first, cold turn's prompt holds the summary.
- **Also:** code comments no longer refer to design documents, ADRs or plan labels; `.agents/AGENTS.md` §3b now says so.
- **Left for later:**
  - Codex compacts only through `compact_prompt` in its config, which isn't set.
  - The threshold is global, not per space.

Planned:
- A **summarise** turn writes `SUMMARY.md` with our prompt (decisions, who agreed, open questions), posted and pinned in the thread. It runs past a context threshold, measured from the turn's reported usage, and on "Summarise so far".
- Harnesses with a native compact command also run it. Others rely on the summary at their next cold start.
- **Bring in another agent** starts a cold session for a second harness, primed with the summary and the current artifacts. Each turn shows whether it resumed or started cold.
- **Tests:** the fake agent reports usage past the threshold, and a summary appears; a second fake agent's first prompt contains the summary.

### S7. Pages and navigation (about 1 week)
- The space page becomes the task list grouped by situation, and the sidebar stops swapping.
- Settings landings, role-aware actions everywhere, and the cuts in the IA doc.
- **Tests:** the sidebar is the same inside and outside a space; a viewer and a guest see no action they can't take.

### S8. Then Phase 3, on the thread
- `ask_human` as a mention of the addressee (Phase 3.2).
- The Slack thread mirrors the task thread and calls `TaskTurnService` (replacing `threadMention`'s keyword resolver and the two polling bridges).
- Then steering and interrupts, take over and hand back, failure recovery, and cancel-safe runs (Phase 3.4–3.7).

**Order and dependencies:** S1 → S2 → S3. S4 needs S2 (agent posts and mentions). S5 can come any time. S6 needs S2. S7 needs S4. S8 needs S3. About 8–9 weeks to the end of S7.

## 4. Risks and how each is handled

| Risk | Handling |
|---|---|
| Real harnesses may not resume, and every "conversation" silently restarts cold | **Checked 2026-10-01** ([research](./harness-session-research.md)): they do resume, but today opencode and qwen restart cold without anyone knowing. Fixes are S2's first steps; `resumed` is reported per turn |
| Delta prompts lose context a template used to repeat | The cold-start preamble carries everything; a resumed turn carries the delta. The turn records which it was, so a bad answer can be traced to the prompt it got |
| The agent misreads what it's asked to produce | The intent line is posted first and visible; suggested actions name the artifact; code needs `allowCode` whatever the agent decides |
| Removing gates (S3) undoes part of what passed Phase 2's exit | Accepted by Jussi (2026-10-01). The one gate that matters, writing code, stays as `canAskForCode` |
| The in-process session mutex assumes one backend replica | Unchanged by this plan. Note it before running more than one replica |
| Slack keeps the old keyword flow until S8 | Fine for the interim: it calls the same services, and keywords map onto actions |
| Oversized files | Split as touched (AGENTS.md §6). Start with `workflowPhaseRoutes.ts` and the session services, which S2 rewrites anyway |

## 5. Next step: S7

S1–S6 are done. S7 (pages and navigation) is next, then S8 (Phase 3 on the thread).

**Where S4 left the hooks:**
- **S5:** `PullRequestOutcomeSweeper` should set the task `resolved`. `taskSituation` already reads that as done; S5 adds "Done · merged by …", which needs the merger in the situation input.
- **S6:** a summarise turn's `SUMMARY.md` has no artifact kind yet (`TaskSituationArtifact`, `TaskArtifactKind`).
- **S7:** the space page can list its tasks grouped by `situation.state` straight from `GET /api/tasks`, which already includes it.

**Before running agents in the dev stack:**
- Rebuild the worker images, so the opencode image runs the new worker. Today's dev image sends `documentContent`, which the result callback now rejects. See next-steps-handover §2.1.
- Rebuild the frontend image (`docker compose build frontend && docker compose up -d frontend`) whenever `packages/types` changes. The image bakes in its build of the types (`dist/`).
- Migrations up to 087 run on startup when the dev backend restarts (RUN_MIGRATIONS_ON_STARTUP).
