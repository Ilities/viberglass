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
- `task_reads`, mention `answered_at`, `taskSituation` and `capabilities` on every task response.
- **Home** becomes the thread list: Needs you, then by latest activity, with unread counts and last messages. It replaces the Dashboard, the Inbox page and Pulse. Overview for viewers.
- Slack and email keep notifying.
- **Tests:** a smoke journey per role: sign in, see what needs you, reply, and it stops needing you.

### S5. Done on merge (about 3 days)
- `PullRequestOutcomeSweeper` also marks the task done when its PR merges, with a quiet line ("Merged by …" when GitHub says who).
- The PR card shows a preview link when GitHub reports one (deployment status or check run URL).
- **Tests:** the sweeper with a fake outcome source.

### S6. Compaction and more than one agent (about 1 week)
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

## 5. First step

S1 is safe to start now: it's read-only and changes no behaviour. S2's first task is the harness resume check in §4, because the answer changes how much S6 matters.
