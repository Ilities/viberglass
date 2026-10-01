# Returning-visit redesign (Phase 2½ plan)

Status: **proposal for Jussi's review, 2026-10-01. No code until it's approved** (plan §12, Phase 2½ step 2) · Evidence: [`appendix-returning-visit.md`](./appendix-returning-visit.md) (findings RA/RM/RD/RT/RV, bugs RB1–RB6) · Spec: [`user-journeys-and-personas.md`](./user-journeys-and-personas.md) §6 (IA), §7 J4/J10/J13, §9 (status model).

**Exit (plan §12):** each persona lands on a page that answers "what needs me now?" without clicking further, and a task's status reads the same on every screen.

---

## 1. What the research says, in one paragraph

The task page already knows the truth about a task: `decideTaskNextMove` reads its runs, documents, PR and live session, and the stepper built on it was right on every task for every person. Nothing else uses it. Lists read a four-value stored status that can't say "failed", "PR open" or "waiting on Tomi". The Inbox records events and never clears them. My tasks guesses whose move it is from ownership. The banner on the task page doesn't know who's looking, so it tells a viewer "Your move". And every screen is drawn the same for every role, with the server refusing afterwards. So the redesign starts with one thing: **a task's situation, worked out once on the server, including whose move it is, and used by every screen.** Landings, vocabulary, role-aware actions and navigation all follow from that.

## 2. Ship first: bugs (independent of the redesign)

These are fixes, not design. **All fixed 2026-10-01** (below); the rules in RB1 follow Q6's recommendation and change with it.

| # | Fix | Test |
|---|---|---|
| RB1 | Guard task edit, delete, archive/unarchive and set-status. Proposed by the §4 matrix: **delete** for admins only (maintainers archive); **edit details, archive and mark done/reopen** for admins, the space's maintainers, and the task's requester and owner; guests and viewers never. One policy (`TaskChangePolicy`, next to `ApprovalPolicyService`) checked in the routes. | Unit test per rule; an e2e that a guest and a non-participant member get 403 and the task survives. |
| RB2 | Point `integration-api.ts` at `/api/integrations/space/:id/…` (4 calls). | Space settings → Integrations loads and links in the smoke suite (none covers it today). |
| RB4 | A space the person can't see (or that doesn't exist) shows "This space doesn't exist or you don't have access", with a link home, instead of the loader. Same for tasks (RT34 lacks the link). | e2e: a member opens a private space's URL. |
| RB5 | Decide how a heartbeat-swept run is classified; make the Inbox item and the task page say the same thing. | The failure-copy journey. |
| RB6 | The heartbeat sweeper stops the worker it gives up on (`DockerWorkerStopper`; ECS with §3.7). | Unit test with a fake stopper. |

RB3 (the "Your move" banner) is fixed by §3 below.

**What landed (2026-10-01):**
- **RB1:** `canChangeTask` in `@viberglass/types` (edit: admins, the space's maintainers, the task's requester and owner; delete: admins; never guests or viewers), checked by `TaskChangePolicyService` through `taskChangeGuard` / `tasksInBodyChangeGuard` on `PUT` and `DELETE /api/tasks/:id`, `POST /api/tasks/archive` and `/unarchive`, and `POST /api/tasks/:id/set-status`. A refusal is a 403 that says who can ("Only a workspace admin can delete a task. Archive it instead to hide it."). The UI still offers these actions to everyone until §7. Journey: `task-changes.e2e.test.ts`.
- **RB2:** the four calls in `integration-api.ts` use `/api/integrations/space/…`, which also fixes linking connections from the new-space form. Journey: `space-connections.e2e.test.ts`.
- **RB4:** `SpaceOutlet` shows "This space doesn't exist, or you don't have access to it" with Go home when a space doesn't load; the task page says the same for tasks. The space context now resets when the slug changes.
- **RB5:** the admins' failure notification says "failed and needs an admin: <reason>" instead of "because of setup", true of both setup and platform failures. Whether platform failures should also reach the task's owner is left to §3's failure rules.
- **RB6:** `WorkerStopperChain` (the stopper loop that cancel had) is used by cancel, `HeartbeatSweeper` and `OrphanSweeper`, so a run given up for no heartbeat or a timeout has its worker stopped.
- Also: `@testcontainers/postgresql` was imported by the integration test helper but never declared, so `database.integration.test.ts` couldn't compile; it's now a dev dependency.
- Verified: backend 1116 tests (1112 unit, 4 integration) and frontend 209; the smoke suite 39/39.

## 3. One task situation, worked out on the server

Implements plan §9 ("state + waiting on").

**What it is.** A pure function in `@viberglass/types`, `taskSituation(task, latestRunPerStep, documents, approvals, liveSession, participants)`, grown out of today's `decideTaskNextMove`. It returns:
- `state`: one of the vocabulary in §4;
- `step`: research · plan · build;
- `waitingOn`: `{ kind: "people", userIds } | { kind: "agent" } | { kind: "github" } | { kind: "nobody" }`;
- `since`: when it entered this state (for "waiting 2 days").

The server attaches `situation` to every task it returns (lists, task detail, Inbox, My tasks), plus **`yourMove: boolean`** for the person asking (`waitingOn` includes them). The stored `ticket_status` stays for filters and history until Phase 4, but no screen displays it.

**Who it waits on**, state by state:

| State | Waiting on |
|---|---|
| Not started | the owner |
| Queued / Agent working | the agent |
| Research in review | **the requester** (they asked; they judge if it answers them), the owner when there's no requester. Anyone the policy allows can still approve. *(Decision Q2.)* |
| Plan in review | `namedApprovers`: the task's reviewers, else the owner (§2.7's rule) |
| Failed (agent or work) | the owner |
| Failed (setup) | the workspace admins, as the notification already does |
| Waiting on you (live session turn ended) | the session's driver |
| Pull request open | the owner, shown as "PR open · in review on GitHub" |
| Done / Cancelled | nobody |

Phase 3 adds **Needs input** (an agent question, waiting on its addressee) and **Paused** to the same function, so they arrive everywhere at once.

**Tests:** the function as a table of unit tests (one row per state × role); an e2e that walks one task through every state and checks that the board, the space home, Home and the task page show the same words.

## 4. One vocabulary

Every screen uses these and nothing else. A status is always **state · whose move**, e.g. "Plan in review · Tomi", "Failed · Dev", "Agent working".

| Concept | The only words | Retired |
|---|---|---|
| Steps | Research · Plan · Build | Planning, Execution, Phase |
| Not started | Not started | Open, Open Issues, Next step, Actionable |
| Agent working | Agent working (Queued while queued) | In progress |
| In review | Research in review / Plan in review | Awaiting review, ready for your review |
| Failed | Failed | (shown as Open today) |
| PR open | PR open | Not started (space home), Execution |
| Done | Done | Resolved, Recently resolved |
| Whose move | "Your move" only when `yourMove`; otherwise the name: "Waiting on Tomi" | "Your move" for everyone |
| Workspace landing | Home | Dashboard (workspace) |
| A space's landing | the space name | Dashboard (space), Mission Control |

Also retired from working screens: "Open Issues", "Auto-Fix Queue", severity and category breakdowns, "Active Queue", the "Viberglass" source chip when a space has one source, and UUID fragments (keys everywhere: RA17, RM16).

## 5. Landings

### 5.1 Home (`/`) for admins, members and guests: "Your move"

Replaces the workspace Dashboard. Sections, in order, each hidden when empty:
1. **Your move**: tasks where `yourMove` is true, oldest first. Each row: key, title, "Plan in review · waiting 2 h", and **the one primary action from the task's next move** (Approve plan, Try again, Start the research, Review the PR). Clicking the row opens the task at the right step.
2. **New for you**: unread mentions and comments not already covered by a Your move row ("Maria mentioned you on WS-2: *is the nightly job…*"), with a reply link.
3. **Waiting on others**: tasks you asked for, own, review or watch, each naming who: "WS-1 Plan in review · Tomi".
4. **Agent working** (one line each) and **Done this week** (collapsed).
5. Admins only, and only when something's wrong: a **workspace health** line (setup failure, runner down, the home checklist until done). The Agents panel and run counters leave Home (they're in Settings).

Empty state: "Nothing needs you. Ask for something", with the task composer (J4).

This makes **My tasks a section of Home, not a tab of the Inbox**, and makes "what needs me now?" state-derived, so it can't go stale. *(Decision Q1: the plan said "Inbox as landing"; the research says the Inbox's events go stale and the answer is state, so Home should be state and the Inbox should be the event history.)*

### 5.2 Overview for viewers (and anyone, from the nav): J13

Viewers have no moves, so Home and the Inbox stay empty for them for good (RV5). They land on **Overview**, read-only across the spaces they can see:
- **Stuck**: failed, or waiting longer than a day, each with the person it waits on;
- **In progress**: by step, with who it waits on;
- **Done this week**: with outcome (PR link) and who closed it.

Same `situation` data; no new backend beyond a time filter. *(Q3 decides whether Overview replaces Pulse.)*

### 5.3 The Inbox becomes the notification history

It keeps Done, Snooze and grouping, but:
- **Items clear themselves** when what they announce is over: a review request when the step is approved or the person is removed, "the plan is ready" when it's approved, a failure when the step is retried or succeeds. A listener on Activity marks them done (`NotificationService` already listens there).
- **Research sends a review request** to whoever it waits on (§3), like the plan does, instead of an "update".
- **One item per task per person** for updates: a newer update replaces the older one.
- Mentions show an excerpt; replying in that thread marks the mention read.
- Each item's primary action is the task's next move when it's yours.

## 6. The task page knows who's looking

- The banner's eyebrow and primary action come from `yourMove`. When it's someone else's move: "**Waiting on Tomi** to approve the plan", with secondary actions the person may take (Request approval from…, Comment). That fixes RB3, RA24, RM23, RD27, RT23 and RV16.
- The stepper adds who and when: "Plan · Approved by Tomi, 10:42"; "Plan · In review · Tomi" (RA25).
- "Done" says who and when (RM33, RT28).

## 7. Role-aware screens

**One source:** the server returns `capabilities` with each task (`canRun`, `canEdit`, `canDelete`, `canArchive`, `canComment`, `canManagePeople`, `canApprove` per step) and each space (`canCreateTask`, `canMaintain`), computed by the same policies the routes enforce (§2 RB1, §2.7). The UI **hides** what the person can't do *(Decision Q4)*. Concretely:

- **Viewers:** no Create, Start a run, Archive, Edit, Delete, Mark as done, Request approval, Resolve or "Write it yourself". A quiet "View only" label in the header.
- **Guests:** comment, reply, watch, and approve or ask for changes when they're the one waited on. No New space, Create task (Q5), run buttons, Prompt or Raw log tabs, Schedules or Runs pages. Pages a guest can't read say so instead of showing an empty list with Create (RT2, RT30, RT32).
- **Members** keep running, creating and the People controls, but plumbing leaves their path: no Agents panel on Home or space pages; runner pages admin-only in the UI; space settings for non-maintainers become a read-only summary (repository name, members, default owner and reviewers), never the SCM or credential form (RM35, RV24, RT31).
- **Settings** opens on **Notifications** for everyone who isn't an admin; the avatar opens a small profile menu (Notifications, API tokens for admins and members, Sign out) instead of Members (RM13, RD5, RV26, RT5).

## 8. Navigation and page purposes

Moved to [`information-architecture.md`](./information-architecture.md): the question each page answers, every item on it with its purpose and who sees it, and the sidebar. In short: Home · Inbox · Overview, then Spaces expanding in place (the space page is its task board grouped by situation; Runs, Schedules and Settings under it), then Settings. Pulse, both Dashboards and the separate Tasks page go; Live folds into Overview (Q7).

## 9. Build order

Each step lands with unit tests and a smoke journey, run one suite at a time.

1. ~~**Bugs** (§2): RB1, RB2, RB4, RB5, RB6.~~ Done 2026-10-01.
2. **Situation** (§3) in `@viberglass/types` and on every task response, with `yourMove` and `capabilities`. No visible change except the banner (§6). Journey: one task through every state, same words on every screen.
3. **Vocabulary** (§4) on the board, table, space home and task page, all reading `situation`.
4. **Home** (§5.1) and **Overview** (§5.2); landing by role. Journey per landing: as admin, member, guest and viewer, sign in and see your moves (or Overview) with no further click. That's the exit test.
5. **Inbox hygiene** (§5.3). Journey: approving a plan clears the reviewer's review request; research sends one.
6. **Role-aware actions** (§7). Journey: a viewer and a guest see no action they can't take on the board and the task page.
7. **Navigation and page contents** ([`information-architecture.md`](./information-architecture.md)): sidebar, space page as the grouped board, Pulse removed, items cut or moved per page, Settings landing. Journey: the sidebar is the same inside and outside a space.

Rough size: 2–3 weeks. Steps 2 and 4 are the big ones.

## 10. Decisions needed

Q7–Q10 (Live, the History column, severity and category, Discussion and the agent) are in [`information-architecture.md`](./information-architecture.md) §5.

| # | Decision | Recommendation |
|---|---|---|
| Q1 | **Landing:** Home "Your move" (state-derived) for everyone but viewers, with the Inbox as notification history; or the Inbox as landing, as plan §6.1 says. | **Home.** The Inbox's items are events and went stale in every walkthrough; "what needs me" is a question about state. |
| Q2 | **Who research waits on.** The policy lets any participant approve, but "waiting on everyone" names nobody (RV: "Waiting on Dev, Tomi, Maria or Kaisa"). | **The requester**, else the owner. Others may still approve. |
| Q3 | **Pulse:** remove it (Overview + Live + Home cover it), or keep it as the workspace board. | **Remove.** |
| Q4 | **Actions a person can't take:** hide them, or show them disabled with the reason. | **Hide**, except Approve, which shows "Waiting on Tomi" with Request approval (it's useful to know approval exists). |
| Q5 | **Can guests create tasks** in their spaces? The §4 matrix says "via intake" (Phase 4); the server refuses today. | **Not yet**, keep it for intake in Phase 4. |
| Q6 | **RB1's rules:** delete admin-only, edit/archive/done for admins, maintainers, requester and owner. | As proposed. |

## 11. Out of scope here

- Agent questions, steering and failure pause/resume (Phase 3) plug into `situation` when they land; nothing in this plan blocks them.
- Workspace-owned tasks, archive-not-cascade (Phase 4).
- Digests and outcome metrics for J13 beyond "Done this week" (Phase 5).
- Visual design. This is structure, wording and behaviour; the look follows the existing system.
