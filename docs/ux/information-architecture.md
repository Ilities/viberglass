# Information architecture: what every page and item is for

Status: **proposal for Jussi's review, 2026-10-01** · Part of Phase 2½, alongside [`returning-visit-redesign.md`](./returning-visit-redesign.md) (the behaviour: task situation, landings, role-aware actions) · Evidence: [`appendix-returning-visit.md`](./appendix-returning-visit.md) and an element inventory of the current pages (2026-10-01).

The redesign says *how* screens should behave. This doc says *what each one is for*: the one question each page answers, who asks it, and why every item on it is there. An item that answers a different question moves to the page that owns that question, or goes.

---

## 1. Rules

1. **One page, one question.** Each page answers one question for named people (§3). If a block doesn't help answer it, it doesn't belong on that page.
2. **One home per fact.** Every fact has one place where it lives and can be acted on (§2). Other pages may *point* to it (a name, a status, a link) but don't copy it out as a second panel.
3. **Status is always the same phrase**, from the task's situation: *state · whose move* ("Plan in review · Tomi"). No page invents its own (redesign §3–§4).
4. **At most one primary action per item**, and only when it's the viewer's move. Housekeeping (edit, archive, delete) lives in an Actions menu, never on cards or rows.
5. **Show only what the person can do.** Items are shown or hidden from `capabilities` (redesign §7), not drawn for everyone and refused afterwards.
6. **Plumbing has one home: Settings.** Agents, runners, connections, secrets, prompts, run records and the audit log appear nowhere else, not even as a summary panel.
7. **Counts only where someone decides something from them.** That's the Overview. Counters on landing pages answer nobody's question (RA1, RV1).

## 2. The objects, and where each fact lives

| Fact | Its one home | Pointed to from |
|---|---|---|
| Whose move it is on a task, and what it is | The task's **banner** | Home (Your move), the space page (groups, status on each card), Overview |
| Where the task is in its steps; who approved what, when | The task's **stepper** | Status phrase everywhere |
| The thing being reviewed (research, plan, PR) | The step's **Document / Pull request** view | Review requests, "Your move" rows |
| Feedback on that document, for the agent | **Comments** on the document | The Comments count on the step |
| Conversation between people about the task | **Discussion** | Mentions in the Inbox |
| Who did what, and when | **Activity** | Done rows on Overview ("closed by Jussi") |
| What the agent did in a run | The step's **Runs** view | "See what happened" links, the Space › Runs page |
| Who's involved on a task | **People** (task column) | Owner and whose move on cards |
| Who's in a space, its defaults and privacy | Space settings › **Members** | The lock icon on private spaces |
| How a space reaches its repository | Space settings › **Space** | Readiness notice, only while something's missing |
| What happened that someone should know | **Inbox** | The Inbox count in the nav |
| How work is going across the workspace | **Overview** | — |
| How the workspace runs (agents, connections, secrets…) | **Settings** (admins) | Home's health line for admins, only when something's wrong |

## 3. Pages

The map, with who lands where:

```
Home ............ "What's my move now?"                     admins, members, guests land here
Inbox ........... "What happened that I should know about?"
Overview ........ "How is the work going, and what's stuck?" viewers land here
Space ........... "What's happening in this space, and what can I pick up?"
  └ Task ........ "Where is this, whose move is it, and what do I do?"
      └ Run ..... "What did the agent do?"  (inside the task)
  Space › Runs, Schedules ..... engineers' and automation owners' views of the same space
  Space › Settings ............ "How does this space work?"
Settings ........ "How is the workspace set up?" (admins) · "How do I want to be told?" (everyone)
```

Gone: the workspace **Dashboard** (its job splits into Home and Overview), **Pulse** (Overview and Home cover it; Q3 in the redesign), the space **Dashboard** (the space page is its task board), and the separate **Tasks** page (it *is* the space page).

Each table lists what's on the page today and where it goes. **Keep** · **Change** · **Move → page** · **Cut** (and why).

### 3.1 Home: "What's my move now?"

For: everyone except viewers. It's personal and never shows another person's work unless it waits on you.

| Item | Purpose | Shown to | Today |
|---|---|---|---|
| **Your move** list | The answer: tasks waiting on me, oldest first, each with its status phrase, how long it's waited, and the one primary action (Approve plan, Try again, Start the research, Review the PR) | everyone with moves | New; replaces My tasks' "Waiting on you", which guessed from ownership (RD14) |
| **New for you** | Unread mentions and comments not already in Your move, with an excerpt and Reply | people with unread ones | New; today they're mixed with stale updates in the Inbox |
| **Waiting on others** | Tasks I'm on that someone else has the move on, naming them ("Plan in review · Tomi") so I know whom to nudge | people on tasks | From My tasks, now naming the person |
| **Agent working** | One line each: mine that the agent is on now, with "Live · Join" for a session | people on tasks | From My tasks |
| **Done this week** | Collapsed list, so finishing is visible | people on tasks | From My tasks |
| **Finish setting up** (checklist) | The admin's next setup steps, until done or dismissed | admins | Keep (works well, RA4) |
| **Workspace health** line | One line when the workspace is broken (setup failure, no agent running), linking to the fix | admins, only when broken | New; replaces the Agents panel |
| Ask for something (composer) | Empty state: the way to start | people who can create tasks | New (J4) |
| Summary line, metric cards (Spaces / Open tasks / Runs in progress) | — | — | **Cut**: counts don't say what's mine to do, and they were wrong (RA2, RV2). The counts that matter go to Overview |
| Space cards with signals | — | — | **Cut**: spaces are in the sidebar; how each one is doing is on Overview |
| Recent activity feed (task and run records) | — | — | **Cut**: records without people (RA3). Activity lives on the task; done work on Overview |
| Agents panel | — | — | **Move → Settings › Agents** (plumbing, RM2, RD35) |

### 3.2 Inbox: "What happened that I should know about?"

For: everyone with notifications. It's the event history; Home is the to-do list. An item that's also my move shows its primary action, but Home is where I'd go to work through them.

| Item | Purpose | Shown to | Today |
|---|---|---|---|
| **New / Done** tabs | Unread or open items; what I've cleared | everyone | "Needs you" renamed New; **My tasks tab moves → Home** |
| Groups: Questions · Review requests · Mentions · Failures · Updates | What kind of thing happened, most urgent first | everyone | Keep. "Failures you own" becomes **Failures**: admins get setup and platform failures they don't own (RA8) |
| Item | One sentence, the task key, when, and who | everyone | Keep; mentions add an excerpt |
| Item's primary action | The task's next move, when it's mine | when `yourMove` | New |
| Mark done | Clear it by hand | everyone | Keep. Items also clear themselves when what they announce is over (redesign §5.3) |
| Snooze 1 day | Put off something I can't act on yet | everyone | Keep |

### 3.3 Overview: "How is the work going, and what's stuck?"

For: viewers (their landing, J13), and anyone wanting the workspace picture. Read-only.

| Item | Purpose | Shown to | Today |
|---|---|---|---|
| **Stuck** | Failed, or waiting longer than a day, each with the person it waits on: who to chase | everyone | New; Pulse left failures out (RA11) |
| **In progress** | By step, with whose move | everyone | Replaces Pulse's "Awaiting review / Agent working" |
| **Done this week** | Outcome (PR link), who closed it, how long it took | everyone | New (J13) |
| **Live now** | Agent sessions open right now, with Join | everyone who can join | Replaces a separate Live page (Q7) |
| Per-space line | Each space: in progress · stuck · done this week | everyone | Replaces the Dashboard's space cards |
| Filter by space | Narrow it down | everyone | New |

### 3.4 Space: "What's happening in this space, and what can I pick up?"

For: the space's people. It **is** the task board; there's no separate Dashboard or Tasks page.

| Item | Purpose | Shown to | Today |
|---|---|---|---|
| Header: space name, 🔒 when private, **Create task** | Where I am; the one way to add work | Create task: those who can | Keep Create task; cut "View tasks" (this is the tasks page) |
| **Readiness notice** | What's missing before agents can run here, with the fix | maintainers and admins, only while something's missing | Keep, narrowed: others can't fix it |
| **Groups by situation**: Your move · Waiting on others · Agent working · Not started · Failed · PR open · Done (collapsed) | The space's work, sorted by what happens next | everyone | Replaces both the space home's status sections (which dropped failures, RA16) and the board's Research/Planning/Execution columns |
| Card | **Key**, title, status phrase, owner's avatar, how long it's waited, "Live · Join" | everyone | Change: key replaces the hash id (RA17); the status phrase replaces the severity, phase, status and auto-fix badges |
| Card's primary action | The next move, only when it's mine | when `yourMove` | Replaces the Play button on every card |
| Board / Table switch | Table for scanning many tasks | everyone | Keep |
| Table columns: Key · Title · Status · Waiting on · Owner · Updated | The same facts as cards, scannable | everyone | Change: cut Severity, Category, Auto-Fix, Reported, Archive and Actions columns |
| Search; filters: State · Step · Owner · Waiting on | Find a task | everyone | Change: status and phase filters use the new words; severity moves under More filters; Per page goes (load more) |
| Select → Archive | Housekeeping in bulk | people who can archive | Change: checkboxes only for them; the per-card Archive link goes |
| Archived | Find archived tasks | everyone | Change: a link at the bottom instead of an "Active Queue / Archived" tab |
| Today's activity chart; metric cards (Tasks, Open Issues, Auto-Fix Queue, Resolved) | — | — | **Cut**: the empty chart and contradicting counts (RA18–RA20); groups show the same thing |
| Active runs | — | — | **Cut**: running work is the "Agent working" group; the run list is Space › Runs |
| Agents panel, Severity breakdown, Workflow phase bars, Categories | — | — | **Cut**: plumbing (Settings) and tracker statistics nobody decides from |
| Sidebar "Awaiting review / Agent working" lists | — | — | **Cut**: a second copy of this page's groups |

### 3.5 Task: "Where is this, whose move is it, and what do I do?"

For: everyone who can see the task. The order on the page follows the question: what it is → whose move → where it is → the work → the conversation.

| Item | Purpose | Shown to | Today |
|---|---|---|---|
| Breadcrumb: space name › key | Where I am | everyone | Change: space name, not slug (RA15) |
| Title, key, description | What the task is | everyone | Change: the key moves up from Details |
| **Banner** | The one fact that matters most: whose move it is and the action. "Your move" only when it's mine; otherwise "Waiting on Tomi to approve the plan" | everyone | Change: viewer-aware (redesign §6) |
| **Stepper** Research · Plan · Build | Where the task is, and who approved each step and when | everyone | Change: adds who and when (RA25) |
| Step view **Document** (or **Pull request** for the build) | The thing being reviewed, rendered, with highlights where people commented | everyone | Keep |
| Step view **Comments** | Feedback on the document's text, which the agent gets when someone asks for changes | everyone; comment if not a viewer | Keep; say plainly that the agent reads these |
| Step view **Runs** | What the agent did on this step: summary, prompt, raw log | admins and members; guests and viewers see the summary only | Change: also lists this step's live sessions, which leaves the History column with nothing unique |
| **Discussion** | People talking about the task. The agent doesn't read it (until Phase 3); the composer says so | everyone; post if not a viewer | Keep, with that hint |
| **Activity** | The record: who did what, when | everyone | Keep. Comment entries quote the comment, not the text it's on (RA28) |
| **People**: requester, owner, reviewers, watchers | Who's involved; change the owner or reviewers | everyone; changes for those allowed | Keep |
| Details: severity, category, tracker link, created | Facts that matter only when set | everyone | Change: shown only when set; Key moves to the header |
| History (runs and sessions) | — | — | **Cut**: duplicates Runs (per step) and Activity (across steps) |
| **Actions ▾** | Housekeeping: Edit details · Copy link · Mark as done / Reopen · Archive · Skip to the build (approvers) · Delete (admins) | only the items each person may use | Change: hidden when empty, as for viewers |
| Readiness notice | What's missing before agents can run | maintainers and admins, only while broken | Change: narrowed, like the space page |

### 3.6 Space › Runs and Schedules

| Page | Question | For | Today |
|---|---|---|---|
| **Runs** | "What has the agent run in this space, and how did it go?" Engineers' view across tasks: task key, step, status, agent, duration | admins, members | Keep, add task keys; not shown to guests or viewers |
| **Schedules** | "What runs on its own here, and is it healthy?" | admins, members | Keep for now (becomes Automations in Phase 4) |

### 3.7 Space › Settings: "How does this space work?"

| Tab | Purpose | Maintainers and admins | Everyone else |
|---|---|---|---|
| **Space** | Name, repository and branch, how pull requests are opened | edit | **About this space**: a read-only summary (repository, who maintains it), never the SCM or credential form (RM35, RV24) |
| **Members** | Who's in the space, private or open, the default owner and reviewers | edit | read-only list |
| **Connections** | Which connections the space uses (tracker, repository) | edit | hidden |
| **Agent instructions** | What the agent is told in this space (today "Prompt templates") | edit | hidden |
| Archive / Delete space | Housekeeping | maintainers archive; admins delete | hidden |
| Auto-fix switch and tags | Start runs on new tasks from a tracker automatically | Move into Connections, next to the tracker it applies to | hidden |

### 3.8 Settings

| Section | Items | For |
|---|---|---|
| **You** | Notifications (Slack link, email); API tokens | everyone; API tokens for admins and members (MCP) |
| **Workspace** | Members and invites | admins |
| **Advanced** | Agents & runners, Connections, Secrets, Prompt templates, Run records, Audit log | admins |

Settings opens on Notifications for everyone except admins, who land on Members (RM13, RV26). Advanced pages refuse non-admins in the UI too, not just in the nav (today the routes aren't guarded and a member reaches runner pages from the dashboard, RD35).

## 4. Navigation

```
Home            (n)      your moves
Inbox           (n)      unread
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
Settings
[avatar] Jussi ▾         Notifications · API tokens · Theme · Sign out
```

| Item | Purpose | Today |
|---|---|---|
| Home, Inbox, Overview | The three ways in: my moves, my notifications, the whole picture | Dashboard and Pulse go; "Platform" heading goes |
| Spaces, each expanding in place | Get to a space without losing the rest of the nav (plan §6.1) | Change: today entering a space replaces the sidebar (RA13) |
| A space's children: Runs, Schedules, Settings | The space's other views | "Dashboard" and "Tasks" merge into the space itself; "Operations" heading goes |
| Settings | Workspace and personal settings | Keep |
| Avatar menu | Me: notifications, tokens, theme, sign out | Change: today the name links to Members ("You need an admin role", RD5) and theme and sign-out appear twice (sidebar footer and top bar) |
| Top bar space switcher | — | **Cut** on desktop: the sidebar does it. Kept on mobile, where the sidebar is hidden |
| One accent colour | — | Change: today it shifts per space, which makes the same page look like different products |

## 5. What this adds to the redesign's decisions

These join Q1–Q6 in [`returning-visit-redesign.md`](./returning-visit-redesign.md) §10:

| # | Decision | Recommendation |
|---|---|---|
| Q7 | **Live:** a nav item of its own (plan §6.1), or a "Live now" section on Overview plus "Live · Join" on cards and rows. | **Fold it in.** One more page for a list that's usually empty isn't worth a nav slot. |
| Q8 | **Cut the task page's History column** (runs and sessions), with sessions moving into each step's Runs view. | **Cut.** Every entry in it is already in Runs or Activity. |
| Q9 | **Severity and category:** keep them on every card and in the Details column, or only when set (and as a filter). | **Only when set.** Every task in the walkthrough was "Medium · General", so they said nothing (RM17). |
| Q10 | **Tell people the agent doesn't read Discussion** (until Phase 3 lets it), with a hint in the composer. | **Yes.** People can't tell today which of Discussion, Comments and messages reaches the agent, and an answer that goes nowhere is the LC2 problem again. |
