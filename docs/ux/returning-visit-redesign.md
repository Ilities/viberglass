# The task as a conversation: redesign (Phase 2½ and 3)

Status: **proposal for Jussi's review, 2026-10-01, revised the same day for [ADR 0008](../adr/0008-tasks-are-conversations.md). No code until it's approved**, except the bug fixes in §2 · Evidence: [`appendix-returning-visit.md`](./appendix-returning-visit.md) (findings RA/RM/RD/RT/RV, bugs RB1–RB6) · Page by page: [`information-architecture.md`](./information-architecture.md) · Spec: [`user-journeys-and-personas.md`](./user-journeys-and-personas.md).

**Exit:** each person lands on a page that answers "what needs me now?" without clicking further; a task's status reads the same on every screen; and a team can take a task from question to merged pull request in one conversation, bringing the agent in with an @mention or an action, without anyone pressing an Approve button.

---

## 1. Why

**Who uses Viberglass** (ADR 0008): software teams (product owners, engineers, QA) who iterate on one task together to plan and implement it, and individual non-engineers who want a one-off change to a landing page or marketing site and can't make it themselves.

**What the product is for:** a long-running conversation per task, between those people and one or more agents, that ends in a merged pull request. Viberglass's job is coordination: making sure the right person, or the agent, moves the task on at the right moment.

**Why the UI is wrong now.** It grew in three layers. The oldest is an operator console for one engineer running a bug-fix pipeline: the Dashboard's counters and agents panel, the space home's Open Issues and Auto-Fix Queue, Pulse. Phases 0–1 fixed the first visit and the task page's next move. Phase 2 added people (roles, owners, reviewers, mentions, the Inbox, approvals), correctly on the server, but attached to the old screens. So:
- nobody lands on their work (RA1, RM1, RD1, RT1, RV1);
- status is worked out in two places that disagree, so a failed task reads "Open" on the board and vanishes from the space home (RA16, RA21);
- screens don't know who's looking: a viewer is told "Your move", a guest is offered Delete (RV16, RT24);
- the Inbox records events that go stale, not what people need to do (RA6, RD7).

And the deeper mismatch: **a task is built as a pipeline with gates**, with the conversation split across three places the people can't tell apart. Discussion is never read by the agent; document comments reach it only on "Ask for changes"; live-session messages do, on a separate page. A long-running chat needs those to be one thread.

The root of the list above is that the app has no single answer to **"whose move is it?"** The root of the deeper mismatch is that the conversation isn't the task. This plan fixes both.

## 2. Ship first: bugs (independent of the redesign)

These are fixes, not design. **All fixed 2026-10-01** (below); the rules in RB1 follow Q6's recommendation and change with it.

| # | Fix | Test |
|---|---|---|
| RB1 | Guard task edit, delete, archive/unarchive and set-status. Proposed by the §4 matrix: **delete** for admins only (maintainers archive); **edit details, archive and mark done/reopen** for admins, the space's maintainers, and the task's requester and owner; guests and viewers never. One policy (`TaskChangePolicy`, next to `ApprovalPolicyService`) checked in the routes. | Unit test per rule; an e2e that a guest and a non-participant member get 403 and the task survives. |
| RB2 | Point `integration-api.ts` at `/api/integrations/space/:id/…` (4 calls). | Space settings → Integrations loads and links in the smoke suite (none covers it today). |
| RB4 | A space the person can't see (or that doesn't exist) shows "This space doesn't exist or you don't have access", with a link home, instead of the loader. Same for tasks (RT34 lacks the link). | e2e: a member opens a private space's URL. |
| RB5 | Decide how a heartbeat-swept run is classified; make the Inbox item and the task page say the same thing. | The failure-copy journey. |
| RB6 | The heartbeat sweeper stops the worker it gives up on (`DockerWorkerStopper`; ECS with handover §3.7). | Unit test with a fake stopper. |

RB3 (the "Your move" banner) is fixed by §4 below.

**What landed (2026-10-01):**
- **RB1:** `canChangeTask` in `@viberglass/types` (edit: admins, the space's maintainers, the task's requester and owner; delete: admins; never guests or viewers), checked by `TaskChangePolicyService` through `taskChangeGuard` / `tasksInBodyChangeGuard` on `PUT` and `DELETE /api/tasks/:id`, `POST /api/tasks/archive` and `/unarchive`, and `POST /api/tasks/:id/set-status`. A refusal is a 403 that says who can ("Only a workspace admin can delete a task. Archive it instead to hide it."). The UI still offers these actions to everyone until §7. Journey: `task-changes.e2e.test.ts`.
- **RB2:** the four calls in `integration-api.ts` use `/api/integrations/space/…`, which also fixes linking connections from the new-space form. Journey: `space-connections.e2e.test.ts`.
- **RB4:** `SpaceOutlet` shows "This space doesn't exist, or you don't have access to it" with Go home when a space doesn't load; the task page says the same for tasks. The space context now resets when the slug changes.
- **RB5:** the admins' failure notification says "failed and needs an admin: <reason>" instead of "because of setup", true of both setup and platform failures. Whether platform failures should also reach the task's owner is left to §3's failure rules.
- **RB6:** `WorkerStopperChain` (the stopper loop that cancel had) is used by cancel, `HeartbeatSweeper` and `OrphanSweeper`, so a run given up for no heartbeat or a timeout has its worker stopped.
- Also: `@testcontainers/postgresql` was imported by the integration test helper but never declared, so `database.integration.test.ts` couldn't compile; it's now a dev dependency.
- Verified: backend 1116 tests (1112 unit, 4 integration) and frontend 209; the smoke suite 39/39.

## 3. The task is one thread

(ADR 0008.) Everything about a task happens in one thread, in time order:
- **people's messages**, with @mentions of people and of the agent;
- **the agent's turns**: a one-line intent ("Revising the plan: adding Tomi's point about the packing slip"), then its reply or a new **artifact version**;
- **artifact cards**: Research v1, Plan v2, Code (the pull request), each opening the artifact with its versions and the comments anchored to its text;
- **questions** the agent asks a person (`ask_human`, ADR 0006), shown as a message that mentions them, answered by replying;
- **quiet lines for events**: owner changed, someone joined, a run failed and why, the PR merged.

What it replaces: the Discussion tab, the Activity tab (its entries become the quiet lines, with a "Messages only" filter), the Comments view's separate life (comments stay anchored on the artifact and also appear in the thread), and the live session page (an agent turn streams into the thread).

**Bringing the agent in.** An @mention of the agent starts a turn with the person's words. Above the composer, **suggested actions** offer the common next moves for where the task is: *Revise with 3 comments*, *Write the plan*, *Build it*, *Try again*. A suggested action posts an ordinary attributed message ("Jussi asked the agent to build it") and starts the same turn. The turn reads everything since the agent's last turn.

**Agreement instead of approval.** There's no Approve step. Asking the agent to go on *is* the decision, recorded under the person's name. The one rule that stays is who may ask the agent to **write code** (§7), because that writes to the repository and costs the most.

**Artifacts, not gates.** Research, Plan and Code are kinds of artifact. A task makes whichever it needs; a landing-page change can go straight to code. The task header shows what exists so far ("Research ✓ · Plan v2 · Code"), not steps to pass.

**Long tasks.** Past a context threshold, and when someone asks ("Summarise so far"), Viberglass asks the harness to compact with our prompt: decisions, who agreed to them, open questions. The summary is posted in the thread, so people can correct it.

**More than one agent.** Each harness keeps its own resumable session on the task. "Bring in another agent…" adds one, and says it starts cold: it reads the summary and the artifacts, without the first one's cache. Each turn shows which agent ran and whether it resumed or started fresh.

**What's built that this reuses:** turns as jobs resumed with `session/load` (ADR 0006), the session branch for code (ADR 0006 D9, ADR 0007's continued branch), `task_messages` and mentions (§2.5), `task_activity` (§2.5), anchored comments (§2.8), the notification channels (§2.6), and `ask_human` (Phase 3.2, still to build).

## 4. One task situation, worked out on the server

A pure function in `@viberglass/types`, `taskSituation(…)`, grown out of today's `decideTaskNextMove`, from the task's latest artifact versions, its last agent turn, open questions, open mentions, the PR and its people. It returns `state`, `waitingOn` (people, the agent, GitHub or nobody), `since`, and for the person asking, **`yourMove`**. The server attaches it to every task it returns. The stored `ticket_status` stays for filters until Phase 4 but isn't shown.

**A mention is open until the person replies** in the thread (or marks it done), as in a chat app. That's what makes "whose move" work without gates.

| State | Example | Waiting on |
|---|---|---|
| Not started | "Not started" | the owner |
| Agent working | "Agent revising the plan" | the agent |
| Question | "Question for Maria" | the person asked |
| Artifact ready | "Plan v2 ready" | people the agent's post mentions, else the **owner**, who drives the task by default *(Q11)* |
| Discussing | "Discussing · 4 new" | people mentioned and not yet replied, else the owner |
| Failed | "Failed · credential expired" | the owner; admins too for setup and platform failures |
| PR open | "PR open · review on GitHub" | the owner |
| Done | "Done · merged by Dev" | nobody |

A status is always **state · whose move** when it's someone's: "Plan v2 ready · Dev". "Your move" appears only when `yourMove` is true.

**Tests:** the function as a table of unit tests (state × who's asking); an e2e that takes a task through every state and checks Home, the space page and the task page show the same words.

## 5. Vocabulary

| Concept | The only words | Retired |
|---|---|---|
| Artifacts | Research · Plan · Code, with versions ("Plan v2") | Planning, Execution, Phase, Step |
| States | Not started · Agent working · Question for X · Plan v2 ready · Discussing · Failed · PR open · Done | Open, Open Issues, Awaiting review, In review, Approved, Resolved, Recently resolved, Actionable |
| Bringing the agent in | @mention, or a suggested action | Run research, Approve & plan, Ask for changes, Start a run |
| Whose move | "Your move" only when it's yours; otherwise the name | "Your move" for everyone |
| Landing | Home | Dashboard |
| A space's page | the space name | Dashboard (space), Mission Control |

Also retired: "Auto-Fix Queue", severity and category breakdowns, "Active Queue", the "Viberglass" source chip with one source, UUID fragments (keys everywhere).

## 6. Home: the tasks you're in

(Replaces the workspace Dashboard **and** the Inbox, *Q1*.) For everyone except viewers. A list of the task threads you're part of, like a chat app's conversation list:
- **Needs you** at the top: threads where it's your move (you're mentioned or asked and haven't replied, or you own a task waiting on its owner), each with the status phrase and, where there's one, the suggested action.
- **Then every thread you're in, by latest activity**: key, title, status phrase, unread count, and the last message ("Tomi: does the warehouse template have room…").
- **Finish setting up** for admins until it's done, and one **workspace health** line when something's broken.
- Empty state: "Ask for something", with the composer.

Notifications still go out by Slack and email (§2.6). In the app, they *are* the unread counts and the Needs you list, so there's nothing to go stale: a thread stops needing you when you reply. A separate Inbox page goes *(Q1)*.

**Overview** stays for viewers (J13), read-only and lower priority: stuck, in progress and done this week, with whose move.

## 7. Role-aware screens

The server returns `capabilities` with each task and space, from the same policies the routes enforce, and the UI **hides** what a person can't do *(Q4)*.
- **Who may ask the agent to write code** (the one gate left from §2.7): the task's people and the space's maintainers, and guests when they're on the task. Everyone on the task who can post may ask for research or a plan. `canApproveStep`, `ApprovalPolicyService` and `approveUpTo` become this rule.
- **Viewers** read; no composer, no actions.
- **Guests** post, reply, comment on artifacts, and ask the agent when they're on the task; no create task (*Q5*), no Runs, Schedules or raw logs.
- **Members** don't meet plumbing: no Agents panel, no runner pages, and space settings read as a summary unless they maintain the space.
- **Task changes** (edit, archive, done, delete) follow RB1's rule (§2).

## 8. Pages and navigation

[`information-architecture.md`](./information-architecture.md) has each page's question, every item on it with its purpose, and the sidebar: **Home · Overview**, then **Spaces** expanding in place (the space page is its task list grouped by situation, with Runs, Schedules and Settings under it), then **Settings**. Pulse, both Dashboards, the separate Tasks page, the Inbox page and the session page go.

## 9. Build order

Superseded by the slices in [`task-conversation-handover.md`](./task-conversation-handover.md) §3, which map this order onto the code. Kept here as the product view.

Phase 2½ and Phase 3 are one phase now. Each step lands with unit tests and a smoke journey, run one suite at a time.

1. ~~**Bugs** (§2).~~ Done 2026-10-01.
2. **The thread, read side.** A `TaskTimelineService` that merges messages, activity, artifact versions, anchored comments and agent turns into one ordered timeline, from the tables that exist. The task page shows it in place of the Discussion and Activity tabs. No change to how runs start yet.
3. **Situation and capabilities** (§4, §7), with mentions open until answered. The status phrase everywhere.
4. **@agent turns and suggested actions.** A mention of the agent, or a suggested action, starts a turn with the thread since the last one; the agent posts its intent and the new artifact version. These replace the Run, Approve and Ask-for-changes buttons. Artifacts get versions.
5. **Agreement.** Approval gates go; the policy becomes "who may ask for code". Migrate existing approvals into the thread as quiet lines.
6. **Home as the thread list**, and Overview for viewers. The Inbox page goes. Exit journey: each role signs in and sees what needs them.
7. **Questions** (`ask_human`, Phase 3.2), as messages that mention the person.
8. **Compaction** and the posted summary; **bring in another agent** (cold start).
9. **Pages and navigation** per the IA doc.
10. Then the rest of Phase 3, now on the thread: steer and interrupt (3.4), take over and hand back (3.5), failure recovery (3.6), cancel-safe runs (3.7).

Rough size: 6–8 weeks for steps 2–9. Steps 2, 4 and 6 are the big ones.

## 10. Decisions

**Decided (Jussi, 2026-10-01), recorded in ADR 0008:** the agent is brought in by @mention, with buttons for the common next moves; agreement replaces approval; more than one harness per task, with the cold-start cost visible; done is a merged PR and deployment is out of scope; compaction by the harness, with our prompt; storage stays git for now, with "artifacts" in the model. **Q6** (RB1's rules) is implemented as recommended. **Q2** (who research waits on) is gone with the gates.

**Open:**

| # | Decision | Recommendation |
|---|---|---|
| Q1 | **Home and the Inbox:** merge into one thread list (notifications are the unread counts and Needs you), or keep the Inbox as a separate history. | **Merge.** In a chat model a separate history goes stale again. |
| Q3 | **Pulse:** remove it. | **Remove.** |
| Q4 | **Actions a person can't take:** hide, or show disabled with the reason. | **Hide.** |
| Q5 | **Can guests create tasks?** | **Not yet.** (Revisit if solo non-engineers come in as guests.) |
| Q11 | **The owner drives by default:** when nobody's mentioned, a ready artifact or a discussion waits on the owner. | **Yes.** Someone has to have the move, and the owner is the person the task is for. |
| Q12 | **How the agent is named in the thread:** one "@agent", or by harness ("@claude", "@codex"), with "@agent" meaning the one already on the task. | **By harness, with "@agent" as the alias.** Needed once there's more than one. |
| Q13 | **The live session page:** fold into the thread. | **Fold.** A live turn is the agent posting into the thread as it works. |

Q7–Q10 from the IA doc still apply; Q8 (cut the History column) and Q10 (the agent doesn't read Discussion) are answered by the thread.

## 11. Out of scope

- Other storage (Notion, Confluence, Google Docs): later, as other kinds of artifact.
- Deployment and preview environments (only links a pull request already has).
- Workspace-owned tasks and archive-not-cascade (Phase 4).
- Visual design. This is structure, wording and behaviour.
