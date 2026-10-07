# Information architecture: what every page and item is for

Status: **proposal for Jussi's review, 2026-10-01, revised the same day for [ADR 0008](../adr/0008-tasks-are-conversations.md) (tasks are conversations)** · Goes with [`returning-visit-redesign.md`](./returning-visit-redesign.md) (the behaviour: the thread, the task's situation, role-aware actions) · Evidence: [`appendix-returning-visit.md`](./appendix-returning-visit.md) and an element inventory of the current pages (2026-10-01).

The redesign says *how* screens should behave. This doc says *what each one is for*: the one question each page answers, who asks it, and why every item on it is there. An item that answers a different question moves to the page that owns that question, or goes.

---

## 1. Rules

1. **One page, one question.** Each page answers one question for named people (§3). If a block doesn't help answer it, it doesn't belong on that page.
2. **One home per fact.** Every fact has one place where it lives and can be acted on (§2). Other pages may *point* to it (a name, a status, a link) but don't copy it out as a second panel.
3. **Status is always the same phrase**, from the task's situation: *state · whose move* ("Plan v2 ready · Dev"). No page invents its own (redesign §4–§5).
4. **At most one primary action per item**, and only when it's the viewer's move. Housekeeping (edit, archive, delete) lives in an Actions menu, never on cards or rows.
5. **Show only what the person can do.** Items are shown or hidden from `capabilities` (redesign §7), not drawn for everyone and refused afterwards.
6. **Plumbing has one home: Settings.** Agents, runners, connections, secrets, prompts, run records and the audit log appear nowhere else, not even as a summary panel.
7. **Counts only where someone decides something from them.** That's the Overview. Counters on landing pages answer nobody's question (RA1, RV1).
8. **The conversation is the task.** Anything people or the agent say about a task, and anything that happens to it, appears in its thread. No second channel the agent may or may not read.

## 2. The objects, and where each fact lives

| Fact | Its one home | Pointed to from |
|---|---|---|
| What people and the agent have said, and what happened, in order | The task's **thread** | The last message on Home and the space page |
| Whose move it is | The task's **status phrase**, from its situation | Home (Needs you), the space page, Overview |
| What exists so far (Plan, Code) | The **artifact bar** in the task header | The status phrase ("Plan v2 ready") |
| An artifact's content and its versions | The **artifact view** | Its card in the thread |
| Feedback on an artifact's text, for the agent | **Comments** anchored on the artifact | A line in the thread, and the comment count on the card |
| Who decided to go on, and when | The **message** that asked the agent ("Jussi asked the agent to build it") | — |
| What the agent did in a turn | The **turn's details**, folded under its message in the thread | The space's Runs page |
| Who's involved on a task, and which agents | **People** on the task | Owner and whose move on cards |
| Who's in a space | Space settings › Members | The lock icon on private spaces |
| Whether a space is private | Space settings › General | The lock icon on private spaces |
| What a new task in a space starts with (agent, owner, reviewers) | Space settings › Task defaults | — |
| How a space reaches its repository | Space settings › Repository | Readiness notice, only while something's missing |
| How work is going across the workspace | **Overview** | — |
| How the workspace runs (agents, connections, secrets…) | **Settings** (admins) | Home's health line for admins, only when something's wrong |

## 3. Pages

The map, with who lands where:

```
Home ............ "What needs me, and what's new in the tasks I'm in?"   admins, members, guests land here
Overview ........ "How is the work going, and what's stuck?"              viewers land here
Space ........... "What's happening in this space, and what can I pick up?"
  └ Task ........ "What's been said and made, whose move is it, and what do I say or ask?"
  Space › Runs, Schedules ..... engineers' and automation owners' views of the same space
  Space › Settings ............ "How does this space work?"
Settings ........ "How is the workspace set up?" (admins) · "How do I want to be told?" (everyone, from the account menu)
```

Gone: the workspace **Dashboard** (its job splits into Home and Overview), the **Inbox** page (its job is Home's, Q1), **Pulse** (Q3), the space **Dashboard** and the separate **Tasks** page (the space page is the task list), and the **session** page (a live turn streams into the thread, Q13).

Each table lists what's on the page today and where it goes. **Keep** · **Change** · **Move → page** · **Cut** (and why).

### 3.1 Home: "What needs me, and what's new in the tasks I'm in?"

For: everyone except viewers. A list of the task threads you're part of, like a chat app's conversation list. It replaces the Dashboard and the Inbox.

| Item | Purpose | Shown to | Today |
|---|---|---|---|
| **Needs you** | Threads where it's your move: you're mentioned or asked and haven't replied, or you own a task waiting on its owner. Each with the status phrase and, where there is one, the suggested action | people with moves | New; replaces the Inbox's review requests and mentions (which went stale, RA6) and My tasks' "Waiting on you" (which guessed from ownership, RD14) |
| **Your tasks, by latest activity** | Every thread you're in: key, title, status phrase, unread count, the last message | people on tasks | New; replaces My tasks and the Inbox's updates |
| Filter: All · Unread · Mine (I own) | Narrow the list | everyone | New |
| **Finish setting up** (checklist) | The admin's next setup steps, until done or dismissed | admins | Keep (works well, RA4) |
| **Workspace health** line | One line when the workspace is broken (setup failure, no agent running), linking to the fix | admins, only when broken | New; replaces the Agents panel |
| Ask for something (composer) | Start a task: pick a space, say what you want | people who can create tasks | New (J4); the empty state, and a button otherwise |
| Summary line and metric cards | — | — | **Cut**: counts don't say what needs me, and they were wrong (RA2, RV2). The ones that matter go to Overview |
| Space cards with signals | — | — | **Cut**: spaces are in the sidebar; how each one is doing is on Overview |
| Recent activity feed | — | — | **Cut**: records without people (RA3). Each thread says what happened |
| Agents panel | — | — | **Move → Settings › Agents** (plumbing, RM2, RD35) |
| Inbox page (Needs you / My tasks / Done tabs, Snooze, Mark done) | — | — | **Cut**: in a chat model the unread counts and Needs you are the notifications. A thread stops needing you when you reply. Slack and email still go out |

### 3.2 Overview: "How is the work going, and what's stuck?"

For: viewers (their landing, J13), and anyone wanting the workspace picture. Read-only.

| Item | Purpose | Shown to | Today |
|---|---|---|---|
| **Stuck** | Failed, or waiting longer than a day, each with the person it waits on: who to chase | everyone | New; Pulse left failures out (RA11) |
| **In progress** | By what's being made (plan, code), with whose move | everyone | Replaces Pulse's "Awaiting review / Agent working" |
| **Done this week** | Outcome (PR link), who closed it, how long it took | everyone | New (J13) |
| **Live now** | Threads where an agent is working right now | everyone | Replaces a separate Live page (Q7) |
| Per-space line | Each space: in progress · stuck · done this week | everyone | Replaces the Dashboard's space cards |
| Filter by space | Narrow it down | everyone | New |

### 3.3 Space: "What's happening in this space, and what can I pick up?"

For: the space's people. It **is** the task board; there's no separate Dashboard or Tasks page.

| Item | Purpose | Shown to | Today |
|---|---|---|---|
| Header: space name, 🔒 when private, **Create task** | Where I am; the one way to add work | Create task: those who can | Keep Create task; cut "View tasks" (this is the tasks page) |
| **Readiness notice** | What's missing before agents can run here, with the fix | maintainers and admins, only while something's missing | Keep, narrowed: others can't fix it |
| **Groups by situation**: Needs you · Agent working · Waiting on someone else · Not started · Failed · PR open · Done (collapsed) | The space's work, sorted by what happens next | everyone | Replaces both the space home's status sections (which dropped failures, RA16) and the board's Research/Planning/Execution columns |
| Card | **Key**, title, status phrase, owner's avatar, unread count, the last message | everyone | Change: key replaces the hash id (RA17); the status phrase replaces the severity, phase, status and auto-fix badges |
| Card's primary action | The next move, only when it's mine | when `yourMove` | Replaces the Play button on every card |
| Board / Table switch | Table for scanning many tasks | everyone | Keep |
| Table columns: Key · Title · Status · Waiting on · Owner · Updated | The same facts as cards, scannable | everyone | Change: cut Severity, Category, Auto-Fix, Reported, Archive and Actions columns |
| Search; filters: State · Artifact · Owner · Waiting on | Find a task | everyone | Change: status and phase filters use the new words; severity moves under More filters; Per page goes (load more) |
| Select → Archive | Housekeeping in bulk | people who can archive | Change: checkboxes only for them; the per-card Archive link goes |
| Archived | Find archived tasks | everyone | Change: a link at the bottom instead of an "Active Queue / Archived" tab |
| Today's activity chart; metric cards (Tasks, Open Issues, Auto-Fix Queue, Resolved) | — | — | **Cut**: the empty chart and contradicting counts (RA18–RA20); groups show the same thing |
| Active runs | — | — | **Cut**: running work is the "Agent working" group; the run list is Space › Runs |
| Agents panel, Severity breakdown, Workflow phase bars, Categories | — | — | **Cut**: plumbing (Settings) and tracker statistics nobody decides from |
| Sidebar "Awaiting review / Agent working" lists | — | — | **Cut**: a second copy of this page's groups |

### 3.4 Task: "What's been said and made, whose move is it, and what do I say or ask?"

For: everyone who can see the task. The page is the task's **thread**, with the current artifact beside it.

| Item | Purpose | Shown to | Today |
|---|---|---|---|
| Header: space name › key, title, status phrase | What the task is and whose move it is | everyone | Change: the status phrase replaces the banner's eyebrow; space name, not slug (RA15) |
| **Artifact bar**: Plan v2 · Code | What the conversation has produced so far; opens each one | everyone | Replaces the Research · Plan · Build stepper, which was a sequence of gates |
| **People and agents** (avatars in the header, open for the list) | Who's on the task: requester, owner, reviewers, watchers, and the agents with "resumed" or "starts cold"; change the owner, add people, **bring in another agent** | everyone; changes for those allowed | Change: today's People column, plus agents |
| **Thread** | Everything in order: messages, the agent's intents and replies, artifact cards, questions, quiet lines for events | everyone | Replaces the Discussion and Activity tabs and the live session page |
| Agent turn (in the thread) | What the agent was asked, what it's doing ("Revising the plan: …"), and the result; its details (what it read and ran, the prompt, the raw log) folded under it | everyone; details for admins and members | Replaces the Runs view and the History column |
| Artifact card (in the thread) | A new version: "Plan v2 · 2 changes from v1 · 1 comment", opens the artifact | everyone | New |
| Question (in the thread) | The agent asking a named person; they answer by replying | everyone; the person asked replies | New (`ask_human`) |
| Quiet lines (in the thread) | Owner changed, someone joined, a run failed and why, the PR merged | everyone; "Messages only" hides them | Replaces Activity |
| Summary (pinned when present) | What the agent believes was agreed, after compaction; people correct it by replying | everyone | New |
| **Suggested actions** above the composer | The common next moves for where the task is: Revise with 3 comments · Write the plan · Build it · Try again. Each posts an attributed message and starts a turn | those allowed (Build it: who may ask for code) | Replaces Run research, Approve & plan, Approve plan, Ask for changes, Start the build, the banner's buttons |
| **Composer** | Say something; @mention people or the agent | everyone who can post | Change: the Discussion composer, now reaching the agent when mentioned |
| **Artifact view** (beside the thread, or full width) | The current artifact rendered, its versions (compare v1 and v2), comments anchored to its text; select text to comment or suggest a change | everyone; comment if not a viewer | Change: today's Document view and Comments view together. A comment also appears in the thread |
| Code artifact | The pull request as GitHub has it: state, branch, changes, review comments, and a preview link if the PR has one | everyone | Keep (ADR 0007), add the preview link |
| Details: severity, category, tracker link | Facts that matter only when set | everyone | Change: shown only when set |
| **Actions ▾** | Housekeeping: Edit details · Copy link · Mark as done / Reopen · Archive · Delete (admins) | only the items each person may use | Change: "Skip to the build" goes (no gates) |
| Readiness notice | What's missing before agents can run | maintainers and admins, only while broken | Change: narrowed |
| Banner ("Your move" / "Waiting on…") | — | — | **Cut**: the status phrase and the suggested actions do its job |
| History column | — | — | **Cut**: everything in it is in the thread |

### 3.5 Space › Runs and Schedules

| Page | Question | For | Today |
|---|---|---|---|
| **Runs** | "What has the agent run in this space, and how did it go?" Engineers' view across tasks: task key, step, status, agent, duration | admins, members | Keep, add task keys; not shown to guests or viewers |
| **Schedules** | "What runs on its own here, and is it healthy?" | admins, members | Keep for now (becomes Automations in Phase 4) |

### 3.6 Space › Settings: "How does this space work?"

| Tab | Purpose | Maintainers and admins | Everyone else |
|---|---|---|---|
| General | Name, the private switch, and housekeeping: archive the space, delete it | edit; maintainers archive, admins delete | About: a read-only summary (repository, who sees it, who maintains it), never the SCM or credential form (RM35, RV24) |
| Repository | Code host, repository address, default branch, access token, issue tracker. Under Advanced: where pull requests go, branch names, and auto-fix (start runs on new tracker issues, and the tags that start one) | edit | hidden |
| Task defaults | What a new task starts with: the default agent, default owner and default reviewers, and when unanswered questions are chased | edit | hidden |
| Members | Who's in the space | edit | read-only list |
| Connections | Which connections the space uses | edit | hidden |
| Agent instructions | What the agent is told in this space | edit | hidden |

### 3.7 Settings

Settings is a sidebar entry for admins. Everyone else reaches their own settings, Notifications and API tokens, from the account menu.

| Section | Items | For |
|---|---|---|
| You | Notifications (Slack link, email); API tokens | everyone; API tokens for admins and members (MCP) |
| Workspace | Members, Agents, Connections, Secrets | admins |
| Advanced | Models, MCP servers, Skills, Prompt templates, Run records, Audit log | admins |

Settings opens on Notifications for everyone except admins, who land on Members (RM13, RV26). Workspace and Advanced pages refuse non-admins in the UI too, not just in the nav: opening one sends a non-admin back to their own settings.

## 4. Navigation

```
Home            (n)      needs you · unread
Overview
──────────
Spaces
  ▾ Web shop             → the space page (its tasks)
      Runs
      Schedules
      Settings
  ▸ Payments 🔒
  + New space            (those who may create one)
──────────
Settings                 (admins)
[avatar] Jussi ▾         Notifications · API tokens · Theme · Sign out
```

| Item | Purpose | Today |
|---|---|---|
| Home, Overview | The two ways in: my tasks, and the whole picture | Dashboard, Inbox and Pulse go; "Platform" heading goes |
| Spaces, each expanding in place | Get to a space without losing the rest of the nav (plan §6.1) | Change: today entering a space replaces the sidebar (RA13) |
| A space's children: Runs, Schedules, Settings | The space's other views | "Dashboard" and "Tasks" merge into the space itself; "Operations" heading goes |
| Settings | Workspace settings, shown to admins only | Change: members reach their own settings from the avatar menu |
| Avatar menu | Me: notifications, tokens, theme, sign out | Change: today the name links to Members ("You need an admin role", RD5) and theme and sign-out appear twice (sidebar footer and top bar) |
| Top bar space switcher | — | **Cut** on desktop: the sidebar does it. Kept on mobile, where the sidebar is hidden |
| One accent colour | — | Change: today it shifts per space, which makes the same page look like different products |

## 5. What this adds to the redesign's decisions

These join the open decisions in [`returning-visit-redesign.md`](./returning-visit-redesign.md) §10:

| # | Decision | Recommendation |
|---|---|---|
| Q7 | **Live:** a nav item of its own, or "Live now" on Overview plus a live marker on threads. | **Fold it in.** A live turn is the agent posting into a thread. |
| Q9 | **Severity and category:** on every card and in Details, or only when set (and as a filter). | **Only when set.** Every task in the walkthrough was "Medium · General" (RM17). |
| Q14 | **Quiet lines in the thread:** show events (owner changed, run failed, merged) in the thread by default, with "Messages only" to hide them; or the reverse. | **Show by default.** They're short, and they're how people see what happened without a second tab. |
| Q15 | **The artifact beside the thread** (split view) or **in place of it** (the card opens full width). | **Beside, on wide screens.** Reviewing a plan while the team talks about it is the core loop; on narrow screens the card opens full width. |

Answered by ADR 0008: Q8 (the History column goes; the thread has it) and Q10 (the agent reads the thread when it's brought in, so there's no channel it doesn't read).
