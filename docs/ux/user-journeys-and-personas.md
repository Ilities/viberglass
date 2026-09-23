# Viberglass: UX Audit, Personas & User Journeys

Status: proposal · Author: UX walkthrough (2026-09-23) · Scope: user journey / information architecture / collaboration model. **Not** visual design.

---

## 0. TL;DR

Viberglass today is an **infrastructure console for one technical operator** that happens to have some multiplayer plumbing. The stated goal is a **collaborative AI platform where different people work together, with agents, on the same objective**. The gap between those two things is the root of almost every UX problem found.

Six things are wrong, in order of impact:

1. **Nobody can say what it is.** No positioning in the product. Whimsical copy ("Command Deck", "Project Constellation", "Galactic Logbook", "Mechanical Menagerie", "Asteroid Field", "Track Flight") replaces meaning. A beta user asked, after more than a week of use, *"What is this software? Who is it for?"*
2. **Setup is an infrastructure puzzle with dead ends.** Secrets → Integration → Integration credential → Agent runner → Start runner → Project → SCM config → Credential. Every form depends on something created on a different page, and you can't create it inline. The beta user could not finish setup and was given a pre-configured instance.
3. **There is no collaboration model.** No invitations, no project membership, no assignee, no @mentions, no notifications, no inbox, no "waiting on me", and no general discussion on a task. Roles are admin/member, and members can edit and delete org secrets. The agent literally writes *"needs PM confirmation"* into its research, but it has no way to ask the PM.
4. **The data model is project-first, with one hard-coded workflow.** Tickets can't exist without a project. Deleting a project cascades to its tickets, sessions and schedules. The only workflow is Research → Plan → Execute → PR. The beta user's verdict: *"software for software development thinking is embedded so deep it can't be turned."* Staying git-backed for software companies (ADR 0001) is fine. The problem is that *engineering-only* thinking shuts product, design and QA out.
5. **When things go wrong, only the builder can tell why.** An exhausted model credit or an expired GitHub token shows up as a generic failed run. *"Do you see a CEO or marketing director understanding why this doesn't work?"* The failure classifier matches error text and sends people to "Fix setup" for platform bugs. **Cancel doesn't stop anything:** "Cancel run" returns a 404, and a cancelled live session keeps running and later reports itself as "completed".
6. **The core loop is currently broken past the first research run** (second pass, §2.11). Revision and execution runs start the agent outside the cloned repo, so they fail ("RESEARCH.md was not generated", "No code changes detected"). A PM's answers to the agent were lost twice, and a PM could approve the plan that unlocks code changes. Archiving a project returns 404. A clean first-run setup took about **10 minutes, 25 page hops and 5 modals**, with two silent dead ends that can only be diagnosed from backend logs.

The plan: reposition the product around **Objectives** that humans and agents move forward together. Make **setup a guided 10-minute path**. Add first-class **people primitives**: members, roles, assignees, mentions, inbox, notifications, agent-to-human questions. Decouple **tasks from projects** and make **workflows templates** (git-backed). Make **every failure explain itself to the person who can fix it**.

---

## 1. What the product should be (positioning proposal)

The beta user's question deserves an answer that lives *inside the product* (onboarding, empty states, README), not in Jussi's head.

> **Viberglass is a self-hosted, git-backed workspace where people at software companies hand objectives to AI agents and steer them together.**
> Anyone (product, design, QA, engineering) can bring an objective. Agents research, plan and do the work in your repositories. The right people review, answer questions and approve at each step. Everything is visible, attributable and resumable.

Consequences of this positioning:

| Principle | What it means in the UX |
|---|---|
| **Objective-first, not infrastructure-first** | Landing page = "what needs me / what's happening", not runner counts and queue pressure. |
| **Humans are participants, agents are participants** | Tasks have people (requester, owner, reviewers, watchers) *and* agents. Agents can ask people questions. |
| **Workflows are templates; git is the substrate** | Research → Plan → Execute → PR is the flagship template. Git-backed variants (research or docs that end in a document PR, release notes, triage) use the same engine. Output always lands in a repo (ADR 0001). |
| **The first run is the demo** | Self-hosted portfolio piece (ADR 0002): `docker compose up` to a first useful result without insider knowledge. |
| **Designed for the product leader, setup included** | A product leader sets it up alone: paste a model API key, point at a repo with its token, name things (ADR 0003). Everything else is defaulted. Engineering admins get optional advanced settings. |
| **Plumbing is an admin concern** | Runners, secrets, deployment strategies, prompt templates and API tokens live under Settings, and only for admins. |
| **Nothing is lost** | Cancel = stop, not delete. Every run, draft, comment and decision is kept in history. |
| **Plain language** | One name per concept, no jokes in functional UI. Whimsy lives in empty states at most. |

### Decisions (Jussi, 2026-09-23)
Recorded as ADRs in [`docs/adr/`](../adr/README.md). Jussi owns product and UX decisions; this doc is the living journey spec.
- [ADR 0001](../adr/0001-collaborative-workspace-for-software-companies.md): collaborative workspace for software companies, git-backed for now.
- [ADR 0002](../adr/0002-self-hosted-portfolio-first.md): self-hosted, portfolio-first; no SaaS, billing or sales.
- [ADR 0003](../adr/0003-product-leader-as-primary-persona.md): the product leader is the first persona, and sets the product up too (API key, repo + token, names).
- [ADR 0004](../adr/0004-naming-space-and-task.md): the core entities are **Space** and **Task**.

---

## 2. Evidence: walkthrough findings

Walkthrough performed 2026-09-23 on the local Docker stack as `jussi@hallila.com` (admin), plus a new member account `maria.pm@example.com` ("Maria PM") to test the collaborator view. Screenshots: `/tmp/ux/*.png` (local, not committed).

Severity: **S1** blocks or misleads the journey · **S2** major friction · **S3** polish.

### 2.1 Installation / first contact
| # | Sev | Finding |
|---|---|---|
| F1 | S1 | The local stack came up with `postgres` exited. The backend crashed on migrations (`EAI_AGAIN postgres`), the frontend stayed up, and login showed a raw **"Failed to fetch"**. There is no health/status page and no "backend unreachable" message. |
| F2 | S2 | The login page says "Need an account? Ask an administrator to add you." There's no invite link or SSO, and no "request access" flow. |

### 2.2 Global dashboard ("Command Deck")
| # | Sev | Finding |
|---|---|---|
| F3 | S1 | Copy obscures meaning: "Project Constellation", "Unresolved Bugs", "Queue Pressure", "Galactic Logbook", "Mechanical Menagerie", "Deck Mood", "Asteroid Field", "Engines Warm", "Track Flight", "Latest whisper", "Awaiting dramatic backstory". A new user can't tell what's healthy, what's broken, or what to do. |
| F4 | S1 | The dashboard is identical for admin and member. It's infra-centric (runner status, queue), with nothing about *my* work or what's *waiting on me*. |
| F5 | S2 | "Unresolved **Bugs**" frames everything as bugs. The product can do features, research and scheduled work. |
| F6 | S2 | A project card shows "3 recent runs failed" with a joke about Vogons, but not *why* (e.g. expired token) or *who* should fix it. |

### 2.3 Navigation / IA
| # | Sev | Finding |
|---|---|---|
| F7 | S1 | Top-level nav for **everyone**: Dashboard, Agent runners, Secrets, Integrations, Pulse, (Users, Prompt Templates), API Tokens. Five of the eight items are plumbing. |
| F8 | S2 | Entering a project **replaces the whole sidebar** (Home / Dashboard / Tickets / Settings / Runs / Schedules). You lose global context, and the project name isn't in the sidebar or page header ("Mission Control"). |
| F9 | S2 | Naming is inconsistent: "Clankers" (URL) = "Agent runners" (nav) = "Mechanical Menagerie" (dashboard); "Claws" (URL) = "Schedules"; "Jobs" (URL) = "Runs"; "Pulse" (nav) = "Action Required" (page title) = `/sessions` (URL); "Viberator" vs "Viberglass" in copy. The beta user asked *"What is this 'Jobs' inside projects?"* |

### 2.4 Project creation
| # | Sev | Finding |
|---|---|---|
| F10 | S1 | The SCM dropdown's empty option reads **"No SCM integration configured"** even when GitHub *is* configured and marked Connected. I left the page to "fix" something that wasn't broken. |
| F11 | S1 | Repository, branch and credential fields are disabled until an SCM integration is picked, and you can't create an integration or credential inline. Leaving the page loses form state. |
| F12 | S2 | The integration name is auto-generated: "GitHub 2026-09-22 13:48:32 (github)". |
| F13 | S2 | Creation exposes plumbing up front: PR repository override, PR base branch, branch name template with `{{ clanker }}`. There's nothing about *who* is on the project or *what* it's for. |
| F14 | S2 | "Enable Auto-fix" is vague: what triggers it, which runner, who reviews? |
| F15 | S2 | Beta report: when a webhook integration is active, you can't pick Viberglass as the ticketing system, and Shortcut can't be made active (it forces Viberglass). **Second pass: not reproducible on current main; fixed in `83ba6e1`.** The root cause is still present: "Viberglass-native" is stored as `ticketSystem="custom"`, the same string as the Custom Webhook system id (PG3). |

### 2.5 Integrations
| # | Sev | Finding |
|---|---|---|
| F16 | S1 | GitHub is set up with personal tokens plus manual webhook setup ("Open your repository in GitHub… Settings > Webhooks… paste secret"). There's no GitHub App or OAuth install, and no repo picker. |
| F17 | S2 | Tokens are asked for twice: the integration credential (`GITHUB_TOKEN`) and a separate "GitHub API token" field under Feedback. The credential shows **"Secret: Unknown"**. |
| F18 | S2 | Stats row "1 Configured / 3 Available / 4 Ready to Use" doesn't add up to anything meaningful. Slack is tagged "Ticketing". Jira, GitLab and Linear are "Coming soon", but the README lists them as supported. |

### 2.6 Agent runners
| # | Sev | Finding |
|---|---|---|
| F19 | S1 | Runner creation needs secrets that must already exist ("No matching secrets found… create one with name like ANTHROPIC_API_KEY"). You can't add a key inline, and there's no "test connection". |
| F20 | S2 | Saving a runner doesn't make it usable: "Use the Start action on the runner page when you are ready to provision it." That's a second step that's easy to miss. |
| F21 | S2 | Deployment strategy (Lambda / Docker / ECS) and AGENTS.md/skills are exposed to every user in a single form. |
| F22 | S1 | Beta report: runs silently failed because the Claude account had **no credit** and the **GitHub token had expired**. Neither was surfaced as an actionable, human-readable reason. |

### 2.7 Tickets & phases
| # | Sev | Finding |
|---|---|---|
| F23 | S2 | The create-ticket form is bug-framed ("Provide more details about the bug and how to reproduce it"). There's no assignee, reviewers, watchers, due date, or workflow choice. |
| F24 | S1 | A new ticket immediately shows **Research: In Progress** when nothing is running. Status doesn't match reality. |
| F25 | S2 | The ticket page shows no **reporter / creator**, no owner, no participants, and no general discussion. "Ticket system: custom" is jargon. The ID is a UUID; there's no human key (e.g. `UXW-1`). |
| F26 | S2 | After a run, nobody is notified that research is ready for review. The ticket keeps saying "In Progress" in the sidebar and in Pulse, even though it's actually **waiting on a human**. |
| F27 | S1 | Any member (Maria, a PM) can press **"Approve Research & Continue"**. There's no approver policy and no "request review from…". |
| F28 | S2 | Comments exist only as **line comments on raw markdown source**, hidden behind a collapsed "Review source and line comments". Non-technical reviewers must read markdown source to comment. |
| F29 | S3 | Rendered markdown shows literal `**bold**` inside list items. |
| F30 | S2 | "Collaboration history" lists "Research Session · completed" without saying who started it or who took part. |
| F31 | S2 | Deleting a project **cascades** to tickets, sessions, schedules and SCM config (`001_initial_schema.ts:55`, `046_add_agent_sessions.ts:12`, `043_add_claw_tables.ts:11`, …). There's no soft-delete/archive-first for tickets. Beta user: *"If team X deletes their project, team Z's linked work collapses."* |
| F32 | S1 | Beta report: cancelling a research session leaves no record. **Second pass: FALSE as stated, but the reality is worse.** Cancel keeps the transcript, but it doesn't stop the work. "Cancel run" 404s (no route). A cancelled live session keeps running and flips back to `completed`. Neither cancel asks for confirmation, and the canceller's name isn't shown. Records are only destroyed by project delete, which cascades sessions and orphans jobs. See FL1–FL9. |

### 2.8 Live collaboration session
| # | Sev | Finding |
|---|---|---|
| F33 | S1 | The session's first "user" message is the **raw system prompt template**, shown as if the user wrote it. On a *fresh* ticket it's the **revision** prompt ("Revise the existing research document"), with empty `<title></title><description></description>`. Cause: `AgentSessionLaunchService` always renders `ticket_research_revision_task` for the displayed initial turn and doesn't pass ticket vars. The agent's actual job (`buildJobData`) gets the correct prompt, so the transcript misrepresents what was asked. |
| F34 | S1 | The transcript is a stream of "Tool call: bash / Tool completed: grep …", empty timestamp bubbles and collapsed "Reasoning". A PM or designer can't follow it. There's no plain-language progress summary ("Reading theme files… found 26 hard-coded colours…"). |
| F35 | S2 | "Collaborate live" behaved like "Run automatically": input was disabled ("Agent is working — your message will be queued") and the session ended on its own. There's no pause, steer or "take the wheel", and no prompt to invite others. |
| F36 | S2 | The session is titled "Session 6324e1". The ticket card, ticket list and dashboard don't show that a live session is happening or who is in it, so a teammate can't discover it and join. |
| F37 | S2 | Presence exists (avatar "J"), but there's no invite/share, no role in the session (driver/observer), and no link from the ticket page while it's live. |

### 2.9 Users, roles, security
| # | Sev | Finding |
|---|---|---|
| F38 | S1 | Adding a user = the admin types their password and "shares the credentials manually". There's no invite, forced reset, SSO, or project assignment. |
| F39 | S1 | Member role sees and can **edit/delete org secrets** (`GITHUB_TOKEN`, `OPENCODE_API_KEY`), runners and integrations. `requireRole("admin")` guards only user routes, and `requireProjectAccess` exists but isn't mounted. |
| F40 | S2 | There's no audit log. Credential expiry isn't warned about in advance, even though `integration_credentials` has an expiry. |

### 2.10 Beta user meta-feedback (Akseli, 2026-07-21)
- Couldn't articulate the product's purpose, customers or vertical after a week. Understood it *less* the more they used it.
- "A hydra: when one thing makes sense, ten new things don't." Many "standard" features are missing, while advanced ones exist without a clear reason.
- Wants **organisation-owned tickets and projects as separate entities**: tickets not bound to projects, projects that may be only automations, cross-project links. Wants a move away from the rigid `organisation > project > ticket` hierarchy toward **modular workflows**.
- Asked whether a CEO or marketing director could understand failures.
- Ultimately **left**, partly because the product direction and design ownership felt rigid.

### 2.11 Second pass: full ticket lifecycle with two people (2026-09-23)
Same ticket, continued: Maria (member/PM) comments and revises → Jussi approves research → Jussi starts a live planning session and Maria joins → Maria approves the plan → execution ("Run automatically") on `ilities/token.observer`.

| # | Sev | Finding |
|---|---|---|
| LC1 | S1 | **Follow-up and execution runs are broken.** The revision turn and the execution run started the agent in `/app` instead of the cloned repo. OpenCode then logged `permission requested: external_directory (/tmp/viberator-work/<job>/repo/*); auto-rejecting`. Revision failed with "RESEARCH.md was not generated" after 17 s. Execution failed with "No code changes detected… pull request was not created" after 2.5 min of work. The first research run in the same session worked. (Same root cause as FL13/PG5. Possibly related to uncommitted `DockerInvoker.ts` / `GitService.ts` / worker Dockerfile changes in the working tree; not investigated.) |
| LC2 | S1 | **Human answers to the agent were lost.** The research said "Scope ambiguity (needs PM confirmation)". Maria answered twice: (a) an inline comment, which was fed only to the revision that failed; (b) a message queued during the live planning session. That turn row is marked `completed`, but no agent turn followed and the session ended. The approved plan still has **"Step 0 — Confirm scope with the PM (blocking prerequisite)"**. |
| LC3 | S1 | **A member approved the plan that unlocks code execution** (F27 applies to plan approval too). No approver policy, no "request approval", no record of who approved. |
| LC4 | S1 | The failed revision shows the PM "Run needs attention: The run stopped before it could finish" with a **Fix setup** button. It isn't a setup problem, and the PM can't fix setup. A failed execution appears only as grey "Latest: failed · 3m ago" under a collapsed "Agent Runs". The main area says "No pull request yet", and the phase stays "In Progress". |
| LC5 | S2 | "Approve Research & Continue" stays enabled **while a revision is running** and with **unresolved comments**. It gives no warning and records no approver in the UI. |
| LC6 | S2 | Status churn: each phase shows "In Progress" as soon as it opens, with nothing running. Plan approval flipped ticket status from "In Progress" back to **"Open"**. |
| LC7 | S2 | Comments are attributed by **email**, not name. "@Jussi" is plain text: no mention, no notification. Jussi's Pulse showed nothing about the comment. |
| LC8 | S2 | The Revise modal makes the PM choose an **"Agent runner"**. Submit stays disabled until the PM types free text, even though the inline comment is attached automatically. |
| LC9 | S2 | Live session: **any participant can Cancel** someone else's session (large red button, no confirmation). The session **auto-ends after one turn** ("SESSION COMPLETED"), so the conversation can't continue. The agent's final message renders raw `**markdown**`. |
| LC10 | S2 | "Run Plan" / "Run Research" stay enabled while a session for that phase is active, which invites duplicate runs. |
| LC11 | S2 | The execution dialog is the same as research ("Run automatically / Collaborate live"). It never says it will **push a branch and open a PR on `<repo>`** against `<base>`. |
| LC12 | S3 | The target repo has **90 stale `viberator/*` branches** from earlier runs, and nothing cleans them up. |
| LC13 | S3 | The "Agent runs" chips count research and planning but have no execution chip ("4 total runs · 2 research · 1 planning"). |

**What worked (keep and build on):**
- The ticket page embeds the live session with a composer and "Full view".
- Presence avatars show for both users.
- A message queued while the agent works is shown to *both* users in real time as "QUEUED · Maria PM".
- The non-live revision prompt *does* include the ticket title and description, so F33 is specific to the live-session display path.

### 2.12 Second pass: first run, failure/cancel, integrations & secondary pages (summaries)
Full tables: [`appendix-first-run.md`](./appendix-first-run.md) (FR1–FR23), [`appendix-failure-and-cancel.md`](./appendix-failure-and-cancel.md) (FL1–FL18), [`appendix-integrations-and-pages.md`](./appendix-integrations-and-pages.md) (PG1–PG22).

**First run on an empty database** (isolated stack, fake keys):
- **Cost:** about 10 min, 25 page hops and 5 modals to reach a ticket that can run. The minimum is about 9 hops if you already know the order. Two dead ends are silent and need backend logs.
- **FR10 (S1):** "Add Secret" defaults to *Name only (env)* with no value field. It reports "Secret created", then fails at run time because the variable isn't set on the API server.
- **FR16 (S1):** the real runner Start error (`connect ENOENT /var/run/docker.sock`) is overwritten on reload by "Inactive · Docker image not configured" (`api/routes/clankers.ts:48`).
- **FR8 (S1):** the readiness item "Agent credentials: add model credentials" stays red when credentials *are* attached, because the runner just isn't started.
- **FR12 (S1):** merely *visiting* `/settings/integrations/new/github` creates a "Configured" integration.
- **FR3/FR4 (S1):** the empty dashboard pushes "Launch Project" first. That's the wrong order, and it later needs a hidden "Link to Project" step.
- **FR23 (S2):** the README leaves out Database storage, integration credentials and linking, and lists GitLab (UI: "Coming Soon").
- **FR7, FR21 (positive):** the readiness banner and repo-access failure messages are real improvements.

**Failure & cancel:**
- **FL1–FL3 (S1):** Cancel doesn't cancel. "Cancel run" → 404 (`/api/jobs/:id/cancel` has no route, and `JobCancellationService` has no callers). Live-session cancel updates only DB rows; the container kept running, then the session flipped to `completed` and wrote its document.
- **FL10–FL12 (S1):** failures don't appear in Pulse or the project dashboard. The regex classifier labels the platform bug `GIT_CONFIG_COUNT … allowUnsafeConfigEnvCount` as "could not access the configured repository".
- **FL13 (S1):** a research agent read the *worker's own source* in `/app` and wrote `/app/RESEARCH.md`. Worker internals ended up in a tenant's run, and the work was lost.

**Integrations & secondary pages:**
- **PG1/PG2 (S1):** archiving a project → 404 (no route). The delete dialog's "what will be lost" summary also 404s, and the error is swallowed.
- **PG9/PG10 (S1):** integrations can't be deleted in the UI. Slack setup needs `.env` edits plus a backend restart.
- **PG12 (S2):** custom outbound webhooks default to "Global (all projects)".
- **PG16 (S1):** prompt templates are raw Mustache containing pipeline output rules. Editing one can break runs; there's no reset, versioning or preview.
- **PG19–PG21 (S1/S2):** schedules have no owner, destination, failure alert, next run or history. Deleting a template silently cascades to its schedules.
- **PG14/PG18 (S2):** project settings has no people at all, and any member can delete a project. API tokens are personal but sit under "Platform", with no scope or expiry.

---

## 3. Root causes

| Root cause | Symptoms |
|---|---|
| **R1. Built outward from the worker, not inward from the user.** The mental model is job → worker → runner → deployment. | F7, F13, F19–F21, F34, jargon everywhere |
| **R2. Single-player assumptions.** One admin sets up, triggers and reviews. | F4, F23, F25–F27, F30, F35–F38 |
| **R3. Project is the root of everything.** | F11, F31, beta feedback on cross-project work |
| **R4. Software delivery is hard-coded as the only workflow.** | F5, F23, beta "software for software" |
| **R5. Status is derived from pipeline state, not from human responsibility.** | F24, F26, Pulse mislabels, no inbox |
| **R6. No product voice or glossary.** | F3, F9, F18 |
| **R7. No failure-to-owner routing.** | F1, F6, F22, F32 |
| **R8. Configuration dependencies aren't modelled in the UI.** | F10, F11, F17, F19, F20, FR3, FR4, FR8, FR10 |
| **R9. Half-wired features: UI shipped without a backend or end-to-end check.** Buttons call routes that don't exist, or services exist with no callers. | FL1 (cancel), PG1 (archive), PG2 (deletion summary), PG9 (integration delete), FR16 (Start error overwritten), LC1 (follow-up runs outside repo) |
| **R10. Human input isn't a first-class input to the agent.** Comments, queued messages and answers are side channels that can be dropped. | LC2, LC7, F28 |

---

## 4. Personas

Personas are grouped by their **relationship to the objective**, not by job title. The same human can hold several roles on different tasks.

### P1. Maria, Product leader (primary persona: sets up, requests, steers; ADR 0003)
- **Who:** PM or head of product at a software company, and by extension other non-engineers there (design, QA, support, founder). Comfortable creating an API key and copying a repo URL. Doesn't read code or markdown source, and doesn't know what a runner, secret store or webhook is.
- **Goal:** Get agents working on the product's objectives without an engineer setting things up or chasing work for them. Always know where things stand.
- **JTBD:**
  - **Set up** (once): paste a model API key, point at the repo with its access token, name the workspace and first space, invite the team.
  - **Bring objectives** in plain language (app, Slack, tracker).
  - **Answer** the agent's clarifying questions.
  - **Review** research and plans in plain language, and approve or give feedback.
  - **Track** progress and outcomes across spaces.
- **Today:**
  - Setup requires understanding Clankers, Secrets and their storage modes, integration credentials, deployment strategies, Start, linking and webhooks. That took about 25 page hops, with dead ends only visible in backend logs (F10–F21, FR3–FR16). The beta user couldn't finish it.
  - Day to day: sees infra nav and secrets (F7, F39); bug-framed form (F23); can't follow transcripts (F34); must comment on raw markdown (F28); never told when something is ready (F26); answers to the agent get lost (LC2).
- **Success:**
  - "I pasted my Anthropic key and our repo token, named the space, and five minutes later the agent was asking me a question about my first task."
  - Later: "I approved a plain-English plan and got a PR link to hand to engineering."
- **Surfaces:** Setup (three inputs), Inbox, Ask composer, Task page (Overview tab), Slack/email.
- **Self-hosted note (ADR 0002):** the portfolio evaluator goes through the same setup, so it has to be the easiest part of the product.

### P2. Olli, Engineering admin (secondary, optional)
- **Who:** Engineering manager or staff engineer who hosts the instance (`docker compose up`) and wants control beyond the defaults.
- **Goal:** Tune and govern: other agents or models, where agents run (Docker, ECS, Lambda), GitHub App instead of a token, webhooks, prompt templates, roles, audit.
- **JTBD:** everything under Settings → Advanced. **Never a prerequisite** for Maria's setup or daily use.
- **Today:** is forced to be the setup desk, the manual user-creation desk (F38) and the only person who can decode failures (F22).
- **Success:** can change any default without breaking what Maria set up. Failures that need an engineer reach them with enough detail.
- **Surfaces:** Settings → Advanced (Agents & runners, Connections, Secrets, Workflows, Prompt templates, Audit log, Health).

### P3. Tomi, Reviewer / Approver (tech lead)
- **Goal:** Keep agent output correct and safe without doing the work themselves.
- **JTBD:** get review requests; read research/plan docs; comment inline (rendered, not source); request changes or approve; enforce "no execution without plan approval"; review the PR.
- **Today:** isn't requested; no approver policy; line comments only on source; approvals not attributed in history.
- **Success:** review queue with SLAs; one-click "approve / request changes"; policy set once per space.
- **Surfaces:** Inbox (Review requests), Task page (Documents tab), GitHub PR.

### P4. Dev, Builder / Pair (developer)
- **Goal:** Use the agent as a pair for execution; step in when it's stuck; ship.
- **JTBD:** join a live session; steer mid-run; take over locally (checkout branch); hand back; see diffs and test output.
- **Today:** "Collaborate live" is effectively read-only while the agent runs (F35); no "open in local"; transcript is noise (F34).
- **Success:** real-time steering; interrupt/pause; diff-first view; "continue locally" command; agent picks up the dev's pushed commits.
- **Surfaces:** Live session, Diff view, CLI/MCP, IDE.

### P5. Kaisa, Contributor / Domain expert (QA, designer, SME)
- **Goal:** Add expertise at the right moment (acceptance criteria, design spec, test verification) without owning the task.
- **JTBD:** get @mentioned; attach assets; answer a question; verify a preview; flag regressions.
- **Today:** no mentions, no notifications, no preview environments, no general thread (F25).
- **Success:** mentioned → answers in one place → sees their input reflected in the plan.
- **Surfaces:** Inbox (Mentions), Task discussion, Preview link.

### P6. Eero, Executive / Observer
- **Goal:** Know if this is worth it. What got done and what's stuck.
- **JTBD:** weekly digest; drill into outcomes; see blocked items and owners.
- **Today:** "Queue Pressure 0", "Deck Mood". Failures are unintelligible (beta quote).
- **Success:** outcome report (completed objectives, cycle time) and a short list of blockers with named owners.
- **Surfaces:** Workspace Overview, optional email digest (needs SMTP, ADR 0002).

### P7. Aino, Automation Owner
- **Goal:** Set up recurring agent work (dependency upgrades, weekly competitor scan, nightly triage) and trust it.
- **JTBD:** pick a template; schedule; choose where output goes (task, Slack channel, PR); own failures; pause.
- **Today:** Claws are buried under project "Schedules" and require a runner. Output destination and failure alerts aren't clear.
- **Success:** automations are workspace-level objects with an owner, a destination and a health status. Failures go to the owner's inbox.
- **Surfaces:** Automations, Inbox.

### P8. External stakeholder / Guest
- **Who:** A customer, contractor or someone from another team who reports through Slack, a Jira/Shortcut board, email or the Chrome extension.
- **Goal:** Report and get updates without an account.
- **Today:** inbound webhooks exist, but setup is manual (F16) and there's no guest identity or update loop other than GitHub feedback.
- **Success:** reporting from their tool creates a task with them as requester. Updates flow back to where they reported.
- **Surfaces:** Integrations, Slack, public intake form, feedback comments.

### P9. The Agent (non-human participant)
Designing for the agent as a persona forces the collaboration model to be explicit.
- **Goal:** Complete the step with the least ambiguity.
- **Needs:** the objective, context (repo, docs, prior decisions), **who to ask** for which kind of question, permission boundaries, and a way to hand off.
- **Today:** it wrote "needs PM confirmation" into a document and had nobody to ask. There's no routing from agent questions to humans. It's shown the wrong prompt in the transcript (F33).
- **Success:** the agent can raise a **Question** (blocking or non-blocking) addressed to a role ("requester", "reviewer") or a person. It pauses or continues according to policy and resumes when answered.

### Persona × capability matrix (default roles)

| Capability | Owner/Admin | Space Maintainer | Member | Reviewer (per task) | Guest |
|---|---|---|---|---|---|
| Connect integrations, model keys, runners | ✅ | – | – | – | – |
| View/edit secrets | ✅ | – | – | – | – |
| Invite members / manage roles | ✅ | space only | – | – | – |
| Create space, set defaults & policies | ✅ | ✅ | – | – | – |
| Create task / ask | ✅ | ✅ | ✅ | ✅ | via intake |
| Start/cancel agent runs | ✅ | ✅ | ✅ | ✅ | – |
| Approve phase gates | per policy | per policy | per policy | ✅ | – |
| Comment / answer questions | ✅ | ✅ | ✅ | ✅ | on own tasks |
| Delete (hard) | ✅ | archive only | – | – | – |

---

## 5. Target domain model & vocabulary

### 5.1 Entities (proposal; addresses R3/R4 and the beta feedback)

```
Workspace (org)
 ├─ Members ── Teams
 ├─ Connections        (GitHub App, Jira, Shortcut, Slack, model providers)  [admin]
 ├─ Agents             (what it is: "Claude Code – default"; runner/deployment hidden) [admin]
 ├─ Workflow templates (Software change: Research→Plan→Build→Review; Analysis; Content; Custom)
 ├─ Spaces             (optional grouping = context + defaults: repos, knowledge, members, policies, default workflow)
 ├─ Tasks / Objectives (workspace-owned; 0..n spaces; links: blocks/relates/duplicates/parent)
 │    ├─ Participants  (requester, owner, reviewers, watchers, agents)
 │    ├─ Steps         (instances of the workflow's phases, each with gate policy)
 │    │    ├─ Runs     (agent executions; always kept, incl. cancelled/failed)
 │    │    ├─ Artifacts (documents, diffs, PRs, previews, files)
 │    │    └─ Questions (agent → human, blocking or not)
 │    ├─ Discussion    (thread; @mentions; mirrored to Slack/Jira)
 │    └─ Activity      (append-only, attributed event log)
 ├─ Automations        (workspace-owned, optional space; schedule/trigger → task or output)
 ├─ Inbox / Notifications (per member)
 └─ Audit log
```

Key rules:
- **Tasks belong to the workspace.** A space is a lens and a set of defaults, not an owner. Deleting or archiving a space **never** deletes tasks; it unlinks them. That fixes F31 and the beta "team Z collapses" scenario.
- **A space without tasks is valid** (e.g. automations only). **A task without a space is valid** (e.g. an ad-hoc question to an agent).
- **Workflow is a property of the task** (defaulted from the space). Software delivery becomes one template.
- **Runs are immutable history.** Cancel = `cancelled` status with partial artifacts kept (fixes F32).
- **Responsibility is explicit.** Every step in a "waiting" state names *who* it's waiting on. That drives the Inbox (fixes R5).

### 5.2 Glossary (one name per concept)

| Today (UI / URL / code) | Proposed user-facing name | Notes |
|---|---|---|
| Clanker / Agent runner / Mechanical Menagerie | **Agent** (admin: *Runner* under Agent → Advanced) | Users pick "which agent", never "which runner". |
| Viberator | *(internal only)* | Never in UI copy. |
| Ticket / Bug | **Task** (ADR 0004) | Type field: bug, feature, question, research… |
| Project / Constellation | **Space** (ADR 0004) | Context + defaults (repo, members, instructions); doesn't own tasks. |
| Job / Run | **Run** | Remove "Jobs" everywhere. |
| Claw / Schedule | **Automation** | |
| Pulse / Action Required / Sessions | **Inbox** (what needs me) + **Live** (active sessions) | |
| Command Deck / Mission Control | **Home** (workspace) / **Overview** (space) | |
| Research / Planning / Execution phase | **Step** names from the workflow template | |
| Integration credential + Secret | **Connection** (credential is an implementation detail) | |
| Prompt templates / AGENTS.md | **Agent instructions** (space) / **Prompt templates** (admin, advanced) | |
| Auto-fix | **Auto-start** on new tasks from source X, with workflow Y | |

---

## 6. Information architecture

### 6.1 Navigation (role-aware, persistent)

```
[Workspace switcher]
  Inbox                (n)   ← everyone's default landing page
  My tasks
  Live                 (●)   ← sessions in progress I can join
  ─────────
  Spaces
    ▸ Web app
    ▸ Marketing site
    + New space
  All tasks
  Automations
  ─────────
  Settings  (owner/admins; members see Profile, Notifications, API tokens)
    Workspace · Members · Model keys · Repositories · Spaces          ← what the product leader needs
    Advanced ▸ Agents & runners · Connections & webhooks · Secrets · Workflows · Prompt templates · Audit log · Health
```

- The sidebar **doesn't swap** when entering a space. The space expands in place and the header always shows `Space › Task`.
- **Plumbing leaves the main nav** (fixes F7). Members never see Secrets, Runners or deployment options (fixes F39).

### 6.2 Key screens

| Screen | Purpose | Replaces |
|---|---|---|
| **Inbox** | Everything waiting on me: questions from agents, review requests, mentions, failures I own, invites. Actions inline. | Pulse, sidebar "Needs Review" |
| **Home** | Workspace overview: my active tasks, live sessions, recent outcomes, blockers with owners, setup checklist until done. | Command Deck |
| **Task page** | Tabs: **Overview** (plain-language summary, status "waiting on Tomi to approve plan", participants, next action) · **Discussion** · **Documents** (rendered, inline comments) · **Runs** · **Changes** (diff/PR/preview) · **Activity** | Ticket detail |
| **Live session** | Shared, readable, steerable session. See §7 J8. | Session page |
| **Space overview** | Board by *step and responsibility*, members, defaults, health. | Mission Control |
| **Setup** | Guided checklist. See §7 J1–J2. | README steps 1–5 |

---

## 7. User journeys

Format per journey: **Persona · Trigger · Target flow · Today's friction (evidence) · Acceptance criteria · Metric.**

---

### J1. Set up and reach first value (product leader)
- **Persona:** P1 Maria (the portfolio evaluator takes the same path) · **Precondition:** someone ran `docker compose up`. The install story itself is accepted as is (Jussi, 2026-09-23), **on the condition that it works reliably**: no configuration, and every service comes back healthy after restarts (see §11.0 item 9) · **Trigger:** opens the URL for the first time.
- **Target flow:** one screen per input, three inputs in total (ADR 0003):
  1. **Create your account & name your workspace.** Name, email, password, workspace name. The first user is the owner.
     - *Portfolio shortcut (ADR 0002):* "Explore a demo workspace first" loads seeded members, a sample space and tasks at every stage (question pending, plan in review, PR open, a failed run with a readable reason). The setup below stays available.
  2. **Connect an AI model.** Paste an API key. The provider is detected from the key format (Anthropic, OpenAI, Google, …), with a manual picker as fallback. A live test shows "✓ Works: Claude Sonnet 5 available" or a plain-language error ("This key was rejected by Anthropic", "No credit left on this account"). It's stored encrypted in the database automatically, with no storage-mode choice. A "Where do I get this?" link goes to the provider's key page.
  3. **Point at your repository.** Paste the repo URL (or `owner/repo`) and an access token. The page links to "Create a token with the right permissions" (a prefilled fine-grained-token URL for GitHub). A live check says, in plain language, "✓ Can read and push to acme/web · default branch main", or exactly what's missing ("This token can read but can't push, so the agent couldn't open a pull request"). This implicitly creates the SCM connection and credential; neither is shown as a concept.
  4. **Name your first space.** Prefilled from the repo name ("web"). Everything else is defaulted: base branch = repo default, workflow = Research → Plan → Build → PR, agent = the default for the key's provider, running locally in Docker.
  5. **Getting ready…** The agent is provisioned in the background with a plain progress line ("Preparing your agent · about 2 minutes the first time"). There's no "Start" button; failures show the real cause and a retry.
  6. **First task.** The composer is prefilled with a safe starter ("Explain how this codebase is organised"), or Maria writes their own. It runs, and a readable result appears in the task.
  7. Home shows a short, dismissible checklist: *Invite your team · Connect Slack · Connect your tracker.* Advanced settings are mentioned once: "Engineers can fine-tune agents and connections in Settings → Advanced."
- **Never shown during setup:** runners, deployment strategies, secret storage modes, integration credentials, webhooks, PR-repository overrides, branch templates, prompt templates, "Start".
- **Today:** F1, F10–F21, FR1–FR23. About 25 page hops and 5 modals, with two dead ends only visible in backend logs. The README asks for five manual steps across four pages, and the beta user couldn't finish.
- **Acceptance:**
  - A product leader who has never seen the product finishes setup alone.
  - Exactly three required inputs after the account: key, repo + token, space name.
  - Every input is validated live, in plain language.
  - No step sends the user to another page.
  - A backend-down state shows a clear message.
- **Bar:** ≤ 5 minutes of user effort (excluding the first agent image preparation) and ≤ 6 screens to the first task.

### J2. Add more and fine-tune (product leader for the basics, engineering admin for advanced)
- **Trigger:** add a second repo/space, another model key, Jira, Slack; or (admin) change where agents run, use a GitHub App, edit prompts.
- **Principle:** adding a space = the same two inputs as J1 (repo + token, name). If the token is already known, it's reused, and the repo is picked from a list.
- **Target:** Settings → Connections shows cards with **health** (OK / expiring in 5 days / failing: token revoked). "Add" launches the same inline flows as J1. Integration names are human ("Acme GitHub"), editable.
- **Today:** F12, F16–F18, F22; token asked twice; "Secret: Unknown".
- **Acceptance:** one credential per connection, reused everywhere; expiry warnings 7 days ahead go to the owner's inbox and email.

### J3. Invite the team (Owner → Members)
- **Target flow:** Members → **Invite** → role (Admin / Member / Guest) → optional spaces and teams → **shareable single-use invite link** (works without SMTP, ADR 0002; also emailed if SMTP is configured) → invitee sets their own password. SSO (GitHub/OIDC) is deferred and optional.
- **Today:** F38: the admin types passwords and shares them manually.
- **Acceptance:** admins never know user passwords; pending invites visible, expiring and revocable; the whole flow works on a stock `docker compose up` with no mail server.

### J4. First login as a collaborator (Member / Requester)
- **Persona:** Any invited teammate (P3–P5, or another product person invited by Maria) · **Trigger:** accepts an invite link.
- **Target flow:** Welcome → 3-card explainer (*You bring objectives · Agents do the work · You review and approve*) → lands on **Inbox** (probably empty) with a big **"Ask for something"** composer and 3–4 example requests for the spaces they belong to → optional: connect Slack DM for notifications.
- **Today:** F4, F7, F39: the member sees the admin's infrastructure dashboard and can delete secrets.
- **Acceptance:** members never see plumbing; first screen explains the product in one sentence; the composer is the primary action.

### J5. Bring an objective (Requester)
- **Trigger:** needs something done.
- **Target flow:**
  1. Composer (app, Slack `/viberglass`, email, Chrome extension, tracker label): plain language plus attachments.
  2. The system proposes **space**, **type** (bug/feature/research/…) and **workflow**, all editable. Severity is optional.
  3. **Participants:** requester = me (auto); owner = suggested from the space's default; reviewers = from the space policy; add watchers with @.
  4. **Start mode:** *Start now* · *Wait for owner* · *Let the agent ask me questions first* (default for vague requests).
  5. Created → Task page shows "Agent is reading the request… may have questions for you".
- **Today:** F23–F25: bug-only form, no people, false "In Progress".
- **Acceptance:** a task always has a requester and an owner (a human, not just an agent); status reflects reality ("Not started", "Queued", "Agent working", "Waiting on Maria").

### J6. The agent needs a human (Agent → Requester / Reviewer / Contributor)
- **Trigger:** ambiguity (e.g. "site is already dark, what does 'dark mode toggle' mean?").
- **Target flow:**
  1. The agent raises a **Question** addressed to a role or person, with options where possible ("A: add a light theme · B: add system-preference mode · C: other").
  2. Delivered to the addressee's **Inbox**, **Slack DM** and email per preference.
  3. The addressee answers in place (buttons or text). The answer is recorded in Activity and fed back to the agent.
  4. Policy: blocking questions pause the step; non-blocking ones continue with a stated assumption that can be overturned.
  5. Escalation: no answer in N hours → reminder → owner.
- **Today:** the agent wrote "Scope ambiguity (needs PM confirmation)" into the doc (§2.7). There is no routing. When the PM answered anyway (inline comment and live message), both answers were lost, and the approved plan still lists PM confirmation as a blocking step (LC2).
- **Acceptance:** any agent question reaches a named human within 1 minute; answers are traceable.
- **Metric:** median question-to-answer time; % of runs that needed a revision because of an unasked question.

### J7. Review & approve a step (Reviewer)
- **Persona:** P3 Tomi (and P1 for plain-language plans).
- **Target flow:**
  1. The step finishes → **review request** to the policy's reviewers (Inbox + Slack) with a 3-bullet summary.
  2. The document opens **rendered**. Select text → comment / suggest edit (Google-Docs style). The source view is optional.
  3. Actions: **Approve** · **Request changes** (sends open comments to the agent as a revision) · **Reassign reviewer**.
  4. Policy per space/workflow: e.g. research = any participant; plan = 1 tech reviewer; build = PR review in GitHub.
  5. Approval is attributed ("Approved by Tomi, 10:42") in Activity and the step header.
- **Today:** F26–F30.
- **Acceptance:** only eligible reviewers see Approve; others see "Request approval from…"; all comments are visible on the rendered doc.

### J8. Live multiplayer session (Builder + others)
- **Persona:** P4 Dev, with P1/P3/P5 joining.
- **Target flow:**
  1. From the task: **Start live session** → optional "Invite: @Maria @Kaisa" → a notification with a join link.
  2. The session header shows the task title (not "Session 6324e1"), step, participants with presence, and who is **driving**.
  3. The main pane is a **plain-language narrative** ("Looked at 14 files. Theme lives in `src/index.css`. Found 26 hard-coded colours."). Tool calls are collapsed under each narrative item, with a "Details" toggle for devs.
  4. Anyone can post; the driver's messages **interrupt** (pause and steer); observers' messages queue as suggestions the driver can accept.
  5. Controls: **Pause** · **Resume** · **Take over locally** (`viberglass checkout <task>`) · **Hand back** · **End & summarise**.
  6. End → the summary is posted to the task Discussion, and artifacts are attached to the step.
- **Today:** F33–F37, LC9: the raw (wrong) system prompt is shown as the user's message; the transcript is noise; typing only queues; the session auto-ends after one turn; any participant can cancel it; it can't be found from the board (it *is* embedded on the ticket page). Presence and attributed queued messages work and should be kept.
- **Acceptance:** the first message shown is what the human asked (the system prompt is behind "View full prompt"); the task card shows "● Live · Dev, Maria"; a non-developer can explain what happened after reading the session.

### J9. Cross-role hand-off on one objective (end-to-end collaboration)
This is the product's hero journey. Every role touches the same task.
1. **Maria (PM)** asks: "Users want a dark mode toggle in settings."
2. **Agent** researches and asks Maria (J6): "The site is already dark. Do you mean a light theme?" Maria answers "Light theme + follow system".
3. **Agent** produces the research. **Kaisa (designer)** is @mentioned by Maria and attaches the palette. **Tomi** is auto-requested on the plan.
4. **Tomi** comments on the rendered plan, requests a change, then approves.
5. **Dev** starts a live build session, steers the agent through a tricky CSS token migration, and takes over locally for 20 minutes.
6. **Agent** opens a PR plus a **preview link**. **Kaisa (QA/design)** verifies it on the preview and approves the "Verify" step.
7. The PR is merged in GitHub → the task is done → Maria is notified. The Slack thread and Jira issue are updated.
8. **Eero** sees it in the weekly digest: cycle time 1.5 days, 4 humans, 3 agent runs.
- **Today:** only steps 1, 3 (partially), 5 (partially) and 6 (PR) are possible, and only one human is visible at any point.
- **Acceptance:** Activity shows every hand-off with actor and time; at every moment the task states who it's waiting on.

### J10. "What needs me?" (all humans)
- **Target:** **Inbox** groups: *Questions for you* · *Review requests* · *Mentions* · *Failures you own* · *Updates on tasks you follow*. Mark done, snooze, open. **My tasks** = tasks where I'm requester/owner/reviewer, grouped by "waiting on me / waiting on others / agent working / done".
- **Today:** Pulse / "Action Required" lists pipeline states, not responsibility (F26).
- **Acceptance:** zero-inbox is achievable; each item has one primary action.

### J11. Failure & recovery (Owner + Requester)
- **Trigger:** run fails (no credit, expired token, repo access denied, runner down, agent error, tests fail).
- **Target flow:**
  1. The failure is classified: **Configuration** (credential, credit, runner) · **Access** (repo/permission) · **Agent** (couldn't complete) · **Work** (tests fail, conflicts).
  2. **Requester sees** plain language: "Paused: the GitHub connection expired. Maria (who connected the repo) has been notified. Nothing was lost; this will resume when fixed."
  3. **Owner/admin gets** an inbox item with a **Fix** CTA deep-linking to the exact connection, plus "Retry all paused runs" after the fix.
  4. Agent/work failures → the task owner gets "Retry", "Retry with instructions", or "Take over".
  5. Proactive: credential expiry and credit-low warnings *before* failure.
- **Today:** F1, F6, F22, LC4, FL10–FL15, FR16; beta: "would a CEO understand?" The run page does classify some failures well (FR21), but the classifier is regex-based and mislabels platform bugs as repo/credential problems. "Fix setup" appears for every failure, and failures don't reach Pulse or dashboards.
- **Acceptance:** 100% of failed runs have a human-readable reason and a named owner; configuration failures pause rather than fail, and resume after the fix.

### J12. Cancel, pause, resume, never lose work (all)
- **Target:** Cancel = stop the run; keep transcript, partial documents and the branch; mark the run `cancelled by X`. Confirm dialog for long runs ("This run has been going for 2h. Stop and keep partial results?"). Resume from last checkpoint where the harness supports it. Hard delete only by admin, from an archive.
- **Today:** F31 cascade deletes; FL1–FL9: cancel keeps records but doesn't stop the work ("Cancel run" 404s; a cancelled live session keeps running and flips to `completed`); no confirmation; canceller not shown; no resume. Archive 404s (PG1), so hard delete is the only way out.
- **Acceptance:** no user action other than admin hard-delete destroys run history.

### J13. Executive visibility (Observer)
- **Target:** Home "Outcomes" section and a **weekly email digest**: objectives completed, in progress, blocked (with owner), median cycle time, top automations. Drill-down to tasks. Usage and cost aren't a feature yet. When they're built, they get drill-downs across every dimension (workspace, space, task, member, agent, automation) like the rest of the reporting.
- **Today:** F3, F6: vanity counters and jokes.
- **Acceptance:** an exec can answer "is this worth it?" in 30 seconds.

### J14. Automations (Automation owner)
- **Target flow:** Automations → **New** → template (dependency updates, weekly research digest, flaky-test triage, custom prompt) → trigger (cron, webhook, event such as "new Jira issue with label X") → agent → **output destination** (create task, post to Slack channel, open PR, update doc) → owner (defaults to me) → failure policy. Each automation shows last runs, health and next run.
- **Today:** Claws are project-scoped and require understanding runners; output and failure ownership are unclear.
- **Acceptance:** automation failures reach the owner's inbox; automations don't need a space.

### J15. External ticket sources & two-way sync (Owner, Guest)
- **Target flow:** Space settings → **Where do tasks come from?** Multi-select: Viberglass, GitHub Issues (repo), Jira (project + JQL), Shortcut (workflow/label), Slack channel, custom webhook. Each source has a **status mapping** and **write-back** options (comments, status, labels). The UI states clearly where tasks are *created* versus *mirrored*.
- **Today:** F15 (the webhook overrides the ticket system; Shortcut can't be made active); manual webhooks (F16).
- **Acceptance:** multiple sources per space; no hidden "primary" override; each source shows its last delivery and errors.

### J16. Slack-native participation (Requester, Contributor, Guest)
- **Target:** `/viberglass ask …` creates a task; the thread mirrors key events (question, review request, done); buttons answer questions and approve; @mentioning a Slack user maps to a member or invites a guest.
- **Today:** Slack install exists, but it's labelled "Ticketing" and depends on env vars (`SLACK_BOT_TOKEN`) rather than an in-app install.
- **Acceptance:** a requester can complete J5 → J6 → J7 without opening the web app.

### J17. Governance & safety (Owner)
- **Target:** roles (§4 matrix) enforced server-side; per-space membership (mount `requireProjectAccess`); secrets visible only to admins; **audit log** (who ran what, approved what, changed which connection); agent **repo allow-list**; approval policy templates.
- **Today:** F39, F40.
- **Acceptance:** a member can't read or modify secrets, runners or connections via UI or API; every approval and run is in the audit log.

### J18. Organise work across spaces (Owner, Maintainer)
- **Target:** tasks can link to multiple spaces and to other tasks (blocks/relates/parent). Archiving a space hides it and unlinks tasks but keeps them. Moving a task between spaces keeps its history. Workspace-wide "All tasks" view with saved filters.
- **Today:** F31, beta cross-project feedback.
- **Acceptance:** deleting or archiving a space never removes a task that's linked elsewhere; hard delete requires typing the name and lists affected items.

### J19. Non-code objective, still git-backed (product leader)
- **Persona:** P1 product leader · **Trigger:** "Compare our pricing page with 5 competitors and propose changes", or "Draft release notes for everything merged since v2.3".
- **Target:** workflow template *Research & Recommend* (Research → Draft → Review → **Doc PR**). The agent works against the repo (and the web where allowed). The output is a Markdown document committed on a branch and opened as a PR (e.g. `docs/research/pricing-2026-09.md`). It's reviewed with rendered inline comments like any other document, and merging it is the approval.
- **Today:** the only workflow is Research → Plan → Execute (code) → PR. The research document lives only in the database; it isn't in git and can't be the deliverable.
- **Acceptance:** a task can finish with a document PR as its outcome; the workflow choice decides which steps and readiness checks apply. Repo-less spaces stay out of scope (ADR 0001).

### J20. Tune agents & instructions (Maintainer)
- **Target:** space → **Agent instructions** (plain editor, versioned, with "what changed" in runs); pick a default agent per workflow step (e.g. cheaper model for research, stronger for build); compare two agents on the same task (A/B run); prompt templates in the Advanced section for admins.
- **Today:** AGENTS.md is in the runner form; prompt templates are global and per-project with no versioning or feedback loop.
- **Acceptance:** changes to instructions are attributed and visible in the runs they affected.

### J21. Offboarding & ownership transfer (Owner)
- **Target:** deactivating a member → prompt to reassign their owned tasks, reviews, automations and connections they created → audit entry.
- **Today:** no concept of ownership, so nothing breaks visibly, but nothing transfers either.

---

## 8. Notification model

| Event | Inbox | Slack DM | Email | Default recipients |
|---|---|---|---|---|
| Agent question (blocking) | ✅ | ✅ | ✅ (if unanswered 1h) | addressee |
| Review requested | ✅ | ✅ | digest | reviewers |
| @mention | ✅ | ✅ | digest | mentioned |
| Step completed | ✅ | thread | – | requester, owner, watchers |
| Task done / PR merged | ✅ | thread | ✅ | requester |
| Run failed: configuration | ✅ | ✅ | ✅ | admins/connection owner |
| Run failed: agent/work | ✅ | ✅ | – | task owner |
| Credential expiring / credit low | ✅ | – | ✅ | admins |
| Invited to task / live session | ✅ | ✅ | – | invitee |
| Weekly digest | – | – | ✅ | observers, admins (opt-in for all) |

Every notification links to a place where the recipient can act in one click.

---

## 9. Status model (responsibility-first)

Replace pipeline-derived status with a pair of fields: **state** + **waiting on**.

| State | Waiting on | Example label |
|---|---|---|
| Not started | owner | "Not started · Tomi to kick off" |
| Queued | system | "Queued · starts in ~1 min" |
| Agent working | agent | "Agent researching · 3 min" |
| Needs input | person/role | "Question for Maria" |
| In review | reviewers | "Plan awaiting Tomi's approval" |
| Paused | admin | "Paused · GitHub connection expired (Maria notified)" |
| Blocked | linked task | "Blocked by WEB-12" |
| Done / Cancelled / Archived | – | "Done · merged by Dev" |

Human-readable task keys (`WEB-42`) per space prefix, with the UUID kept internally.

---

## 10. Success metrics

Self-hosted portfolio software has no product analytics (ADR 0002). These are **quality bars**, checked with scripted walkthroughs (like the one in this doc) and end-to-end tests on every release:

| Bar | Why | Target |
|---|---|---|
| Time from `docker compose up` to first completed run, following only the UI | the first run is the demo | < 15 min, zero backend-log lookups |
| Required inputs / screens from account creation to first task | ADR 0003 | 3 inputs, ≤ 6 screens (today: ~25 hops) |
| A product leader completes setup unaided in a scripted walkthrough | ADR 0003 | passes |
| Hero journey J9 runs end to end with ≥ 3 users | the core promise | passes |
| Agent question reaches the right human and the answer reaches the agent | J6, LC2 | 100% in the e2e test |
| Failed runs with a classified, audience-appropriate reason and owner | J11 | 100% of the failure cases in the test suite |
| Cancel stops work and keeps history | J12, FL1–FL3 | passes |
| A product leader can finish J5 → J7 without reading markdown source or seeing plumbing | ADR 0003 | passes |

---

## 11. Quick wins (days, no model changes)

### 11.0 Correctness blockers first (found in the second pass)
These break the core loop or data safety. Fix them before any UX work, and add end-to-end tests for each:

> **Status (2026-09-23):** all nine done on branch `ux-plan-and-core-fixes`, each verified live on the local stack. Item 8 is partial by design (approvals move to the Phase 2 approval policy). The end-to-end smoke test from Phase 0 is still open.
1. **Follow-up and execution runs start outside the repo** (LC1, FL13, PG5). The agent's working directory must be the cloned repo; never let it read or write `/app`.
2. **Cancel must stop work** (FL1–FL3): add `POST /api/jobs/:id/cancel` wired to `JobCancellationService`; have live-session cancel stop the job and container; never let a cancelled session flip to `completed`; add confirmation and show who cancelled.
3. **Human input must reach the agent** (LC2): queued session messages must trigger a follow-up turn, never be marked consumed silently. Unresolved comments must block or warn on approval.
4. **Archive route and deletion summary** (PG1, PG2): wire the missing routes; offer archive before delete.
5. **Don't overwrite the runner Start error** (FR16, `api/routes/clankers.ts:48`).
6. **Secrets default to Database storage with a value field** (FR10); keep env references as an advanced option with a check that the variable exists.
7. **Visiting an integration page must not create an integration** (FR12, PG8); add UI delete (PG9).
8. **Gate approvals and destructive actions by role** (LC3, F27, F39, PG14). *Done for destructive actions and workspace plumbing (admin-only secrets, runners, integrations, global prompt templates and project delete). Approvals are deferred to the J7 approval policy in Phase 2: without reviewers or owners, admin-only approval would lock out product leaders who aren't admins (ADR 0003).*
9. **Install must just work** (F1). This walkthrough started with the backend crash-looping because `postgres` had exited and never came back. There are two causes in `docker-compose.yml`:
   - `postgres` has no `restart:` policy, while `backend` has `restart: unless-stopped`. After a Docker or host restart the backend returns without its database.
   - The dev backend runs under `nodemon`, which catches the crash ("app crashed - waiting for file changes") and keeps the container alive. So neither the restart policy nor `depends_on: service_healthy` can recover it.

   Fix: give every stateful service a restart policy; have the backend retry the DB connection with backoff (or exit so Docker restarts it); make the frontend show "Can't reach the Viberglass server" instead of "Failed to fetch". Add a smoke test that restarts the stack and checks `/health` plus the login page.

### 11.1 UX quick wins
Ordered by impact/effort. Each maps to findings above.

1. **Fix the session initial message** (F33): render the correct template (fresh vs revision) with ticket vars, and show the human's intent as the first bubble with the system prompt behind "View full prompt". `apps/platform-backend/src/services/agentSession/AgentSessionLaunchService.ts:192-206`.
2. **Replace whimsical functional copy** (F3, F9) with plain labels; unify names (glossary §5.2). Keep one easter egg in empty states if desired.
3. **SCM dropdown placeholder** "Select an integration…" instead of "No SCM integration configured" when options exist (F10). `NewProjectPage.tsx:281`, `ProjectSettingsPage.tsx:626`.
4. **Status truth** (F24, F26): "Not started" until a run starts; "Awaiting review" when a doc exists and isn't approved; Pulse → "Inbox"-lite showing *awaiting review* separately.
5. **Hide plumbing from members** in nav and **enforce admin on secrets/clankers/integrations routes** (F7, F39).
6. **Show reporter/creator, session starter and approver names** on the ticket, history and session (F25, F30).
7. **Markdown rendering fix** for bold in list items (F29).
8. **Live session discoverability** (F36): "● Live" badge on ticket card/page with a join link; title the session with the ticket title.
9. **Readable failure reasons** for the top 3 causes: credential expired, credit/quota exhausted, repo access denied (F22). Pattern-match worker errors → reason code → message + fix link.
10. **Backend-down message** on login (F1): "Can't reach the Viberglass server" plus a health link.
11. **Human-readable default integration names** (F12) and remove the duplicate GitHub token field (F17).
12. **Readiness banner shows the real next step** (FR7, FR8): order the items, include secrets and integration, deep-link to the specific runner's Start, and show "Ready, try your first run" when everything is green.
13. **Failure copy by audience** (LC4, FL14): requesters see plain status and who was notified; "Fix setup" only for configuration failures and only for admins; Retry for agent failures; a reason column in the Runs list (FL17, PG6).
14. **Execution confirmation** (LC11): "This will push branch `x` to `repo` and open a PR against `base`."
15. **Disable Run buttons while a run or session for that phase is active** (LC10, FL6).
16. **Show names, not emails**, in comments and history (LC7).
17. **Branch hygiene** (LC12): delete agent branches for failed or cancelled runs, or offer cleanup.

---

## 12. Phased roadmap

### Phase 0: Truth & trust (1–2 weeks)
Correctness blockers §11.0 (first), then quick wins §11.1. Remove the shared `ticketSystem="custom"` meaning (PG3) so F15-class bugs can't return. Add an end-to-end smoke test covering research → revise → plan → execute → PR, and cancel, on every release.
**Exit:** a new member can follow what happened on a task without asking the admin.

### Phase 1: Three-input setup (2–3 weeks)
J1, J2. Account + workspace → model key (detect provider, live test, encrypted storage by default) → repo URL + token (live permission check; implicitly creates the SCM connection and credential) → space name → auto-provisioned default Docker agent (no Start; real errors surfaced) → first task. Demo workspace seed. Everything removed from the flow moves to Settings → Advanced. Connection health and expiry warnings.
**Exit:** a product leader who has never seen Viberglass goes from first page load to a first agent result, alone, in a scripted walkthrough.

### Phase 2: People primitives (3–5 weeks)
J3, J4, J5, J7, J10, J17. Invite links (SMTP optional); roles enforced server-side; space membership; task participants (requester/owner/reviewers/watchers); general Discussion thread with @mentions; Inbox + notifications (in-app, Slack, email); approval policies; rendered-document inline comments; Activity log; audit log.
**Exit:** J9 steps 1, 3, 4, 7 work with ≥ 3 humans.

### Phase 3: Agent ↔ human collaboration (3–4 weeks)
J6, J8, J11, J12. Agent Questions (routing, blocking policy, escalation); readable narrative transcripts; steer/pause/take-over/hand-back in live sessions; failure classification + pause/resume; cancel-safe runs; preview environments (if feasible).
**Exit:** the full J9 hero journey runs end to end.

### Phase 4: Decouple the model (4–6 weeks, migration-heavy)
J15, J18, J14. Workspace-owned tasks; spaces as lenses; task links; archive-not-cascade; workspace-level automations with owners and destinations; multi-source ticket intake with explicit mapping; workflow templates as data (phases, gates, readiness checks per template).
**Exit:** a space can be deleted without destroying any linked task; a space with only automations is valid.

### Phase 5: Beyond engineering, inside software companies
J19, J20, J13. Git-backed non-code workflow templates (Research & Recommend → Doc PR, release notes, triage); document outputs committed to the repo; outcome views for product leaders; agent comparison. Knowledge connectors (Drive/Notion) and repo-less spaces are out of scope (ADR 0001).
**Exit:** a product leader can take an objective from question to merged outcome (code or document) without an engineer driving it.

---

## 13. Decisions & remaining open questions

**Decided 2026-09-23** (see [`docs/adr/`](../adr/README.md)):
1. Positioning: collaborative workspace for software companies, git-backed for now ([ADR 0001](../adr/0001-collaborative-workspace-for-software-companies.md)).
2. Distribution: self-hosted, portfolio-first ([ADR 0002](../adr/0002-self-hosted-portfolio-first.md)).
3. Primary persona: the product leader, who also sets it up: API key, repo + token, names, nothing else ([ADR 0003](../adr/0003-product-leader-as-primary-persona.md)).
4. Naming: **Space** and **Task** ([ADR 0004](../adr/0004-naming-space-and-task.md)).
5. Decision ownership: Jussi owns product and UX decisions. They're recorded as ADRs, and this doc is the living journey spec.

Dropped: default approval settings (a detail for the policy design in J7, not a strategic question) and budget models (no such feature exists; if usage/cost is built, it gets drill-downs across every dimension).

**Still open:** none at the strategic level. Validate ADR 0003 with the first real users.

---

## Appendix A: Walkthrough log (2026-09-23)

1. `docker compose` stack: `postgres` exited → backend crash loop → login "Failed to fetch". Started postgres, restarted backend.
2. Logged in as admin → "Command Deck" with existing project "Live Verification Project" (3 failed runs, no reason shown).
3. New Project: SCM dropdown claimed none configured; detoured to Integrations, found GitHub "Connected"; returned and selected it from the dropdown (label "GitHub 2026-09-22 13:48:32 (github)"); repo `ilities/token.observer`; credential `GITHUB_TOKEN`; created project `ux-walkthrough`.
4. Project page "Mission Control": all zeros, no guidance, project name not shown.
5. Created ticket "Add a dark mode toggle to the settings page" → Research shown "In Progress" immediately.
6. Run Research → "Collaborate live" → session showed the revision prompt with empty ticket fields as my message; tool-call stream; input disabled; completed in ~3 min.
7. Created member "Maria PM" (admin sets password). Logged in as Maria: saw the same infra dashboard; could open, edit and delete Secrets.
8. As Maria: ticket board gave no live/participant signals; the ticket page showed the research doc (raw `**` in lists), a line-comment UI on markdown source only, and an enabled "Approve Research & Continue" button; the agent's doc explicitly says "needs PM confirmation".
9. Pulse = "Action Required" listing the ticket as "In Progress" although it's awaiting review.
10. Agent runner form: requires pre-existing secrets; creation ≠ provisioning.

**Second pass (same day):**

11. As Maria: added an inline comment on line 90 answering the agent's scope question (shown with the email address; "@Jussi" not a mention). Revise → had to pick an agent runner and type text → revision run failed in 17 s ("RESEARCH.md was not generated"; the agent ran in `/app`, repo access auto-rejected). The PM saw "Fix setup".
12. As Jussi: Pulse showed nothing about the comment. Approved research despite the open comment and failed revision (no warning).
13. Jussi started a live planning session. Maria found it embedded on the ticket page; presence showed both users. Maria queued a message (visible to both in real time). The session wrote PLAN.md and auto-ended; Maria's message was marked completed without an agent response. PLAN.md still has "Step 0: Confirm scope with the PM (blocking)".
14. Maria approved the plan (no policy stopped it; status flipped to "Open").
15. Jussi ran execution automatically (user approved a real PR). It failed after 2.5 min: "No code changes detected" (same working-directory bug). No branch or PR was pushed; the repo has 90 stale `viberator/*` branches from earlier runs.
16. Subagents ran in parallel: first run on an isolated empty-DB stack (FR), failure/cancel (FL), integrations and secondary pages (PG). See appendices.

Test data created locally:
- User `maria.pm@example.com`.
- Project `ux-walkthrough` with one ticket, three agent sessions and four runs.
- Shortcut integration `ed2bac52-…` (fake token) and Custom Webhook integration `a371bb68-…`. These can't be deleted from the UI; use `DELETE /api/integrations/:id`.
- Subagent throwaway projects, the runner, the schedule and the first-run database were cleaned up.
