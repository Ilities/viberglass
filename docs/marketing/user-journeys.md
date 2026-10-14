# User journeys

What people do with Viberglass, step by step, in the product's own words. It's the groundwork for marketing copy and demo videos.

This page has the personas and the journeys. Two companion pages build on it:

- [Demo videos](demo-videos.md): the prioritised list of short videos, their scripts and the seed data each needs, plus a two to three minute overview.
- [Messaging notes](messaging.md): the claims each journey supports, how Viberglass differs from using a coding agent directly or from other agent platforms, and what not to claim yet.

Screen and button names below are taken from the app's screens as of 2026-10-13. Where the user guide words something differently from the screen, the screen wins, and the difference is listed under [Wording notes](#wording-notes) at the end.

## Contents

- [The product in one paragraph](#the-product-in-one-paragraph)
- [Personas](#personas)
- [Journeys at a glance](#journeys-at-a-glance)
- [The journeys](#the-journeys)
- [Wording notes](#wording-notes)
- [Sources](#sources)

## The product in one paragraph

Viberglass is a self-hosted workspace where people and coding agents work on the same tasks. Someone asks for something, from the web, Slack, an issue tracker, the Chrome extension or an MCP client. An agent reads the code and writes a plan. The team discusses the plan in one thread, comments on its lines and asks for revisions. The agent then builds it and opens a GitHub pull request, or for a large plan one pull request per part. A space can also be backed by Files instead of a repository, where agents produce documents and interactive presentations that preview in the app. It runs on one server with Docker Compose, on Kubernetes or on AWS, with eight coding agents and any OpenAI- or Anthropic-compatible model, including open-weight models on EU GPUs.

## Personas

The product is designed first for the person who knows what's wanted but doesn't write the code. Engineers and admins are essential, but they're the supporting cast in most journeys.

### Product leader (primary)

A product manager or head of product at a software company. They want to turn an idea, a customer request or a tracker issue into a change without queueing for an engineer to scope it, and they want to stay in the loop while it's built: see what the agent found, decide on scope and wording, and know when it's merged. They may also be the one who sets the product up, so setup has to ask them only for a model key, a repository and a space name. They fear an agent that guesses instead of asking, a pull request nobody on the team asked for, a tool that needs a terminal or a dev environment, and looking foolish by announcing something that hasn't actually shipped.

### Individual non-engineer

A marketer, founder, support lead or designer who wants a one-off change to a landing page, a marketing site or a docs page, and doesn't know how to make it. They want to describe the change in plain words and get it done, ideally straight to code when it's small. They fear breaking the site, needing to understand Git, and a tool built for engineers that makes them feel out of place.

### Workspace admin (engineering lead or platform engineer)

Whoever installs and looks after the installation. They want it on infrastructure they control, a short install with sensible defaults, runners on the compute they already have (Docker, Kubernetes, AWS), keys kept as encrypted secrets that agents can't read beyond what they need, and roles enforced by the server. They fear credential leaks, agents running wild with repository tokens, a GPU bill left running, a platform that's hard to upgrade or back up, and vendor lock-in to one model provider.

### Reviewer and developer

An engineer who reviews the plan and the pull request, and sometimes steps in. They want a plan that shows what the agent found in the code before any code exists, pull requests small enough to review, the agent to pick up their GitHub review comments, and a way to take the branch over locally and hand it back. They fear huge agent-written pull requests, being made the bottleneck for every small change, and losing control of what lands on the main branch.

### Guest (designer, QA, contractor, client)

Someone invited to specific spaces only. They want to comment on plans, answer the agent's questions and, when they're on a task, ask it to build, without seeing the rest of the company's work or any plumbing. They fear wading through a tool that isn't theirs, and seeing or touching things they shouldn't.

### Viewer (stakeholder or executive)

Read-only across the open spaces. They want to see how work is going, what's blocked and what shipped, without being asked to do anything. They land on Overview. They fear noise, and dashboards that don't say what's actually done.

### People who live in the tracker

Not a workspace role: support agents, QA and product people who work in Jira, Shortcut or GitHub Issues and may not have a Viberglass account. They want to follow and steer the work from the issue they already have open. They fear yet another tool to log in to, and status that only lives somewhere else.

## Journeys at a glance

| # | Journey | Main persona | Strength for launch |
|---|---|---|---|
| 1 | [First install and setup](#1-first-install-and-setup) | Admin, product leader | Strong: "running in minutes" proof |
| 2 | [From an idea to a plan and a pull request](#2-from-an-idea-to-a-plan-and-a-pull-request) | Product leader, non-engineer | Strongest: the core promise |
| 3 | [Reviewing and iterating on a plan](#3-reviewing-and-iterating-on-a-plan) | Product leader, reviewer | Strongest: team workflow nobody else has |
| 4 | [Building a big plan in parts](#4-building-a-big-plan-in-parts) | Reviewer, product leader | Strong for engineers; parts of it unverified |
| 5 | [The agent asks, a person answers](#5-the-agent-asks-a-person-answers) | Product leader, guest | Strongest: the "it asks instead of guessing" moment |
| 6 | [Tracker issue to merged pull request](#6-tracker-issue-to-merged-pull-request) | Tracker people, product leader | Strong: meets teams where they are |
| 7 | [A presentation from a Files space](#7-a-presentation-from-a-files-space) | Product leader, non-engineer | Strong and novel; newest, verified on Docker only |
| 8 | [Another agent, another model, your own GPU](#8-another-agent-another-model-your-own-gpu) | Admin, reviewer | Strong differentiator; deployed models are experimental |
| 9 | [Working from Slack](#9-working-from-slack) | Product leader, anyone | Strong; live Slack on a deployed install not verified |
| 10 | [Steering and taking over](#10-steering-and-taking-over) | Reviewer and developer | Supporting: reassures engineers |
| 11 | [Other front doors: Chrome extension and MCP](#11-other-front-doors-chrome-extension-and-mcp) | QA, support, developer | Supporting |
| 12 | [Admin: runners on Kubernetes](#12-admin-runners-on-kubernetes) | Admin | Supporting: credibility for platform teams |
| 13 | [Admin: secrets, people, roles and private spaces](#13-admin-secrets-people-roles-and-private-spaces) | Admin | Supporting: credibility for security reviews |
| 14 | [Keeping an eye on things](#14-keeping-an-eye-on-things) | Viewer, product leader | Supporting |
| 15 | [Recurring work on a schedule](#15-recurring-work-on-a-schedule) | Admin, developer | Minor |

### Which journeys to lead with

Lead with 2, 3 and 5 together: someone who doesn't code asks for a change, the agent asks them a real question, the team reviews the plan like a shared document, and a pull request comes out. That's the story no single coding agent tells, and it shows the team workflow in under two minutes.

Follow with 8 for the technical audience (Hacker News, Reddit): any of eight agents, any compatible model, a self-hosted or EU-hosted model, all on your own servers. It answers "why not just use Claude Code" and "what about my data".

Use 6 and 9 for teams that already live in Jira, GitHub Issues or Slack, and 7 as the "it's not only for code" surprise. Keep 4 for engineering audiences, but demo only the parts that have been tried on a real build (see [what not to claim yet](messaging.md#not-verified-on-real-deployments-yet)).

## The journeys

Each journey lists who it's for, what starts it, the path through the screens, the moment it clicks, what it replaces, what has to be set up first, and which features it shows.

### 1. First install and setup

Who: an admin, or a product leader setting it up alone.

Trigger and goal: they found Viberglass and want it running for their team, with a first plan written against their own repository, in one sitting.

Path:

1. On a Linux server with Docker, a domain and a second hostname for previews: `git clone https://github.com/Ilities/viberglass.git`, `cd viberglass`, check out the release, `cp .env.production.example .env`, fill in the address, domain, three generated keys and the version, then `docker compose -f docker-compose.prod.yml --profile https up -d`. Caddy fetches the certificates. (To try it on a laptop instead: `docker compose up`, then http://localhost:3000.)
2. Open the address. The first visit asks for the administrator's name, email and password.
3. Set up Viberglass, step Connect an AI model: pick the provider under "Who issued the key?" and paste the API key, or choose Custom endpoint (z.ai, a self-hosted model, …) and enter the API base URL, the API it speaks, a key and a model (Find models lists them). Choose Check and continue. A wrong key gets a plain-language error.
4. Choose your space backing: Git repository, or Files for documents, presentations and other artifacts. For Git, enter the repository (`acme/web` or its URL) and an access token; Create a token with the right permissions opens GitHub's fine-grained token form already filled in. Choose Continue; it says "Checking with GitHub…".
5. Name your first space, and choose Create space.
6. Getting your agent ready: setup creates a default agent for the key and starts it. "The first time, this downloads the agent and takes a couple of minutes."
7. Try your first task: a starter such as "Explain how this codebase is organised", which only reads the code. Choose Write the plan.
8. Home now shows Next steps: Invite your team, Connect Slack, Connect your tracker. Each ticks itself off.

Someone who wants to look before connecting anything chooses Explore a demo workspace on the first screen: a sample space with tasks at every stage, removable later from the demo's banner.

Aha: three inputs (a key, a repository, a name) and the agent is already reading your code. No runner, secret store, webhook or prompt settings in sight.

What it replaces: wiring up an agent platform by hand, or one engineer running a coding agent on their laptop with their own keys.

Prerequisites: a server with Docker Engine 20.10+ and Compose v2, about 20 GB free disk, a domain with ports 80 and 443 open, optionally a preview hostname and an S3-compatible bucket (needed for Files spaces), a model key or endpoint, a GitHub repository and token.

Features shown: one-server install with HTTPS, first-run setup, plain-language validation, provider-first model choice, custom endpoints, Git or Files backing, the auto-provisioned default agent, the demo workspace, Next steps.

### 2. From an idea to a plan and a pull request

Who: a product leader or a non-engineer.

Trigger and goal: an idea or a customer request ("show prices in EUR as well as USD") that they want done without scoping it with an engineer first.

Path:

1. On Home, choose Ask for something, and pick the space.
2. New task: a Title that states the outcome, a Description of what they want and how they'll know it's right, optionally Severity, Category and a screenshot. Choose Create task.
3. The task opens with Description, People (they're the Owner), the Plan and Code tabs, and the thread. Under the thread, the suggested action Write the plan. The line above it says which agent the next ask goes to.
4. Choose Write the plan. The thread shows the agent's turn: first one line saying what it's about to do, then "Wrote the plan". The Plan tab fills in: what the agent found in the code (the relevant code, constraints, risks), then the proposed change, the steps, the files and how to test it.
5. They read it, and optionally comment and revise (journey 3) or answer a question (journey 5).
6. Choose Build it. The agent works on the task's branch and opens a pull request. The Code tab shows it: state, branch, changes, commits, open review comments, and the preview link where the repository has one (Vercel, Netlify and the like).
7. An engineer reviews the pull request on GitHub as usual and merges it. Viberglass notices the merge and the task is done; the requester and owner are told.

For a small, clear change they can choose Build it straight away, without a plan.

Aha: the plan comes back in plain language, starting with what the agent found in their own code, before a single line is changed. And they got to a pull request without a terminal, an editor or a ticket in an engineer's queue.

What it replaces: writing a ticket, waiting for an engineer to scope it, a meeting, then a pull request nobody outside engineering can follow. Or pasting requests into a chat with a coding agent that only one engineer can run.

Prerequisites: a Git-backed space with a working repository token, a ready agent.

Features shown: Ask for something, tasks as conversations, the plan that includes the research, Build it, the Code tab, merge detection, notifications, ownership.

### 3. Reviewing and iterating on a plan

Who: the product leader as owner, plus reviewers (an engineer, a designer as a guest).

Trigger and goal: the plan is written, and the team needs to agree on it before anything is built.

Path:

1. Under People, Add a reviewer. They get a review request (in Slack if they've linked it) and the task shows under Needs you on their Home.
2. The reviewer opens the Plan tab, selects a passage and chooses Comment, writes the change and why, and chooses Add comment. For exact wording, they choose Suggest a change instead.
3. Each comment also appears in the thread with a quote of its text and Open in comments. Anyone can Resolve or Reopen a comment, and Apply suggestion where the text is still there.
4. To bring in someone else, type @ in the composer, pick the person and choose Send. It shows on their Home until they reply or choose Acknowledge mention.
5. The suggested actions now include "Revise the plan with 2 comments". Choosing it sends the agent every comment since the latest version. The agent's first line says how it read them ("Revising the plan: adding Tomi's point about the packing slip").
6. A new version arrives. The old one opens read-only, labelled "Older · current is v3", with Compare with current, which shows the changes word by word (highlighted and struck through).
7. Or ask in plain words: type @, pick the agent, write the change, Send.
8. When the thread has grown long, Summarise so far posts a Summary so far that everyone, and the next agent turn, starts from.

Aha: reviewing an agent's plan feels like reviewing a colleague's doc. Line comments, suggestions, @mentions, and a version compare, and the agent takes in all of it at once.

What it replaces: copying an agent's output into a Google Doc or Notion to discuss it, then pasting the feedback back into the agent by hand. Or one engineer's private chat with a coding agent that the rest of the team never sees.

Prerequisites: a task with a plan, people invited to the workspace.

Features shown: reviewers, inline comments and suggestions, comments in the thread, mentions, Revise the plan with N comments, versions and comparison, summaries, Home's Needs you.

### 4. Building a big plan in parts

Who: a reviewer and the product leader.

Trigger and goal: the plan is too large for one reviewable pull request. They want to ship it in steps, each reviewed on its own.

Path:

1. The agent writes larger plans in parts, each a section sized for one review. The plan's Parts box lists them, each with its state: Not built, Building, PR open, Merged, Done or Skipped.
2. Choose Build part 1. The agent builds only that part and opens a pull request for it. The Code tab shows "PR open for part 1".
3. Once part 1 is merged, the suggestion becomes Build part 2. Build the rest builds every remaining part in one pull request.
4. When work doesn't go that way, each part's menu (⋯) has a way around it: Mark done for a part finished some other way, Skip this part for one that isn't needed, Discard this build for a build that stopped before opening its pull request. A mark is taken back with Not done after all or Not skipped after all, and a merge always counts over a mark.
5. While part 1's pull request is still open, Add to part 1's pull request builds part 2 on the same branch, so one pull request covers both.
6. A build that stopped before its pull request is offered again, such as Build part 2 again.
7. Revising the plan leaves built parts as they are. The task is done when every part is merged, done or skipped.

Aha: an agent that ships a large change as three small pull requests your engineers will actually review, with progress tracked from the pull requests themselves rather than from the agent's own claims.

What it replaces: one huge agent-written pull request, or someone manually splitting the work into tickets and prompting the agent for each.

Prerequisites: a Git space, a plan with parts, someone allowed to ask for code.

Features shown: plans in parts, a pull request per part, part states, Build the rest, the parts menu, adding a part to the open pull request.

Caveat: the parts menu (Mark done, Skip this part, Discard this build, Add to part N's pull request, Build part N again) hasn't been tried with a real build yet. Building part by part with merges has.

### 5. The agent asks, a person answers

Who: whoever the agent asks, usually the requester, the owner or a reviewer; guests too.

Trigger and goal: the agent hits a decision it can't make from the code (which wording, which scope, what counts as done) and asks instead of guessing.

Path:

1. While planning or building, the agent posts a question card in the thread. It says who it's for ("It's for Maria, who was notified. Anyone on the task can answer if they know.") and may offer options as buttons.
2. Maria sees "Agent asked you" under Needs you on Home, and a Slack DM if she has linked Slack.
3. She picks an option or writes her own answer and chooses Answer. If someone else answers first, the thread records it ("Quinn answered for Maria: Include Acme").
4. The agent carries on from where it stopped, in the same conversation. No worker sat waiting while she thought about it.
5. The same question can be answered from Slack, by replying in the task's Slack thread or pressing an option button, or from the tracker issue, where Viberglass posted the question as a comment and a reply from the person asked answers it.

Aha: the agent asks the right person, by name, in the place they already are, and waits for the answer instead of guessing.

What it replaces: an agent that makes assumptions silently, or an engineer relaying questions to the PM over chat and pasting answers back.

Prerequisites: a task with people on it. Slack linking and a tracker connection for the other channels.

Features shown: agent questions with an addressee and options, Home's Needs you, Slack DMs and threads, tracker mirroring, answering for someone else, resumable sessions.

### 6. Tracker issue to merged pull request

Who: people who work in GitHub Issues, Jira or Shortcut; the product leader who triages there.

Trigger and goal: a new issue in the tracker should become agent work without anyone copying it anywhere, and people should be able to follow it from the issue.

Path (once journey 13's admin has connected the tracker):

1. In the space: Space settings → Incoming issues. On the tracker's card, set Create tasks for to All issues or Matching labels (for example `agent`), and tick Automatically write a plan if the agent should start straight away. Choose Save.
2. Someone opens an issue with that label. A task appears in the space, linked to the issue, with the issue's key. With automatic planning on, the agent starts on the plan.
3. Viberglass comments on the issue: the plan's first paragraph and a link. Questions the agent asks are posted too.
4. Comments on the issue show in the task's thread, as the matching Viberglass person or as "Pat · on Jira". Mentioning the bot account on the issue asks the agent, and its reply is posted back to the issue.
5. Someone chooses Build it in Viberglass (or Slack). The pull request's link is posted to the issue.
6. The pull request is merged; the issue gets a "done" comment. Closing the issue also finishes its tasks, and reopening it reopens them.
7. An issue several spaces take gets a task in each, and the comments posted back name the space. A task that turns out to need another repository can be copied with Actions → Copy to another space.

Aha: the issue becomes a live window on the work. People who never open Viberglass see the plan, answer the agent and get the pull request, all in the tracker.

What it replaces: copying issues into an agent by hand, and status updates nobody remembers to write back to the ticket.

Prerequisites: a tracker connection with its webhook (journey 13), a public HTTPS address for the backend, a bot account, and a space that opts in under Incoming issues. GitHub issues only go to spaces using their repository.

Features shown: tracker issues as linked threads, per-space issue rules, automatic planning, two-way comments, milestones posted back, the deliveries log, copying tasks between spaces.

Caveat: closing and reopening issues, and Shortcut commenter names, haven't been tried with real tracker events yet; the rest has been tested against real GitHub, Jira and Shortcut.

### 7. A presentation from a Files space

Who: a product leader, a founder or a marketer.

Trigger and goal: they need a deliverable that isn't code (a launch deck, a one-page brief, a customer-facing summary) and want to iterate on it with an agent and their team.

Path:

1. New space in the sidebar (or in setup), Space backing: Files ("A shared place for documents, presentations and other artifacts. Its files persist between runs and are shared by all of its tasks."). Name it and Create space. No repository or token.
2. The space's Files page: Upload a file (notes, numbers, logos) or create a New text file, and edit Markdown or plain text in the app.
3. New task: "Describe the document, presentation or other artifact you want." Create task.
4. Under the thread, choose Create artifact. The thread shows "Preparing files", the agent working, then "Saved files · 3 added".
5. An artifact card appears in the thread with its name and version, and Preview and Download. Preview opens the deck in the app: click or use the arrow keys to move through slides, go full screen.
6. Comment in the thread ("make slide 3 about pricing, shorter titles"), then choose Revise artifact. Version 2 appears. The artifact's page lists its versions.
7. The space's Artifacts page lists every deliverable across its tasks, with their current versions.
8. When it's finished, Actions → Mark done. Reopen task brings it back for another round.

Aha: the agent made an interactive presentation you can click through right in the app, kept the working files for next time, and revises it from the team's comments like any plan.

What it replaces: prompting a chat assistant for slides, downloading files, re-uploading them for the next round, and losing the context between sessions.

Prerequisites: an S3-compatible bucket configured on the installation; a preview hostname for HTML, image and PDF previews (without it, those can only be downloaded); a ready agent.

Features shown: Files backing, shared working files kept between runs, upload and text editing, Create and Revise artifact, versioned artifacts, sandboxed interactive previews, the Artifacts page, explicit Mark done.

Caveats: verified end to end on the Docker install with OpenCode; Kubernetes and ECS Files runs, and the preview host on each install path, aren't verified yet. Publishing an artifact to Notion or Google Docs is planned, not built. Files spaces don't open pull requests, and schedules don't run in them.

### 8. Another agent, another model, your own GPU

Who: an admin sets it up; a reviewer or owner uses it on a task.

Trigger and goal: they want a second opinion from a different agent, a cheaper or stronger model for some work, or code and prompts that never leave their own or an EU provider's infrastructure.

Path:

1. Settings → Agents, add a runner: name it, pick the agent (Claude Code, OpenAI Codex, Google Antigravity, Qwen Code, Mistral Vibe, Kimi Code, OpenCode or Pi), then the provider and key, or a model under Workspace models. Keys are shared across runners.
2. To use a model you run or rent, Settings → Models → Connect a model: a name, the base URL, the API format (OpenAI Chat Completions, OpenAI Responses or Anthropic Messages), authentication, and Check connection and discover models. Tick May need time to wake up for endpoints that scale to zero. Examples: OVH AI Endpoints (France), z.ai, vLLM, LM Studio or Ollama on your own box.
3. To have Viberglass run an open-weight model on a rented GPU (experimental): add a Verda account (Finland) under Settings → Secrets → Cloud accounts, then Settings → Models → Deployed models → Deploy a model. Pick From vLLM Recipes or Any Hugging Face model, a GPU (with its hourly price), the serving arguments and a name. Its mode is Scale to zero, Keep warm or Stop. The list shows its state, such as "Idle · scaled to zero", and the agents using it.
4. On a task, the line above the suggested actions shows the Agent for the next ask, and whether it "Picks up its conversation here" or "Starts fresh from the task and its documents".
5. Bring in another agent (beside the composer) and pick one: "Bring in OpenCode · Qwen on Verda: it starts fresh and reads the summary and the task". Or @mention a specific agent in a message.
6. A run against a scaled-to-zero model waits while it wakes and reports its progress, then runs. Run details show the harness, model, time and cost where reported.
7. A space can have its own Default agent under its settings.

Aha: the same task, the same thread, a different agent or model, including one running on a GPU in the EU that you control, and nothing else about the workflow changes.

What it replaces: being locked to one vendor's agent and model, or running separate tools for each.

Prerequisites: admin access; keys, an endpoint, or a Verda account with a positive balance.

Features shown: eight harnesses, shared keys, connected models, deployed models with scale to zero, cold-start waits, bringing in another agent, per-space defaults, run details with cost.

Caveats: deployed models are experimental and Verda-only; a full task on a live deployment and the scale-down, Keep warm, Stop and Delete cycle against a live deployment are still to be confirmed. Agent and model pairs verified end to end are mainly Claude Code through z.ai's Anthropic endpoint and OpenCode with OpenCode Go or an endpoint; several others failed in the last review or haven't been tried with native keys (see [messaging](messaging.md#not-verified-on-real-deployments-yet)).

### 9. Working from Slack

Who: anyone, especially product and support people who live in Slack.

Trigger and goal: a request comes up in a channel and they want to hand it to the agent right there, and follow it without switching tools.

Path:

1. Once: Settings → Notifications → Link Slack (it matches by email).
2. In the channel: `/invite @Viberglass`, then `/viberglass`.
3. In the Ask the agent form: the Space, the Agent, Start with (A plan or The build), the Message and an optional Title. Choose Ask.
4. The bot posts the task with a link to Open it in Viberglass. The thread under that post is the task's Slack thread.
5. The thread follows the task: "The agent is writing the plan…", then the plan attached as `plan.md` with a Build it button, the agent's questions with option buttons, the pull request's link, and "Done." when it's merged.
6. A plain reply becomes a message on the task; a reply mentioning the bot asks the agent; a reply to the agent's question answers it. Teammates who look at the task in Viberglass see the same conversation.

Aha: a Slack thread that is the task. Plan, questions, Build it and the pull request, without leaving the channel.

What it replaces: "can someone pick this up?" messages that turn into tickets that turn into meetings.

Prerequisites: the Slack app set up by an admin (journey 13), a public HTTPS backend, people's Slack accounts linked.

Features shown: `/viberglass`, the Ask the agent form, threads kept in step, plan attachments and Build it buttons, Slack answers to questions, DMs for review requests and mentions.

### 10. Steering and taking over

Who: an engineer who is the task's owner, a space maintainer or an admin.

Trigger and goal: the agent is heading the wrong way, or the last 10 percent is quicker by hand.

Path:

1. While the agent works: Pause the agent ("What people ask waits until it carries on"), then Let it carry on.
2. To change direction mid-turn: write the message and choose Send now and interrupt. The agent stops and starts again with it. Plain Send after this turn waits for the turn to end.
3. Cancel run stops a run, keeping what it already wrote.
4. Take over: the agent is paused and the Taken over card shows the Checkout commands. Or, in an existing clone: `npm install -g viberglass`, set `VIBERGLASS_URL` and `VIBERGLASS_TOKEN` (from Settings → API tokens), then `viberglass checkout WEB-42`.
5. Commit and push to the task's branch, write a Note for the agent, and choose Hand back: "the agent carries on from your changes", reading what was pushed first.
6. On a GitHub review, ask the agent in the thread; the open review comments go with the request, and the next build adds commits to the same pull request.

Aha: the agent's work is a normal branch. An engineer can grab it, fix it and hand it back mid-flight, and the agent picks up from their commits.

What it replaces: throwing away an agent's work and starting over, or a separate local session that nobody else can see.

Prerequisites: a Git space; Node.js 20+ for the CLI.

Features shown: pause, interrupt, cancel, take over, hand back, the `viberglass` CLI, review comments feeding the next build.

### 11. Other front doors: Chrome extension and MCP

Who: QA and support people (extension); developers who already work in Claude, Cursor or another MCP client (MCP).

Trigger and goal: report something from the page they're looking at, or file and follow tasks from the AI tool they're already in.

Path, Chrome extension:

1. Install it unpacked from the release zip, enter the workspace and API addresses, Sign in.
2. On the page: Capture visible tab, Select area to capture or Click element to capture; Annotate screenshot, or record the screen. Collect console errors, network errors and page metadata from this tab.
3. Select space, a title and "What should change?", severity, and leave the agent writing the plan on. Create task. Task created, with a link.

Path, MCP:

1. Settings → API tokens → Create API token. Copy the token and the MCP config the page shows into the client.
2. In the client: "list my spaces", "create a task in token.observer to …, and ask for the plan" (`task_create`, `task_trigger`), later "read the plan and comment on step 3" (`task_review`, `task_review_comment`), or "which branch is it on" (`task_branch`).

Aha: a bug report with the screenshot, the console errors and the page details already attached, and a plan on the way before the reporter has closed the tab. Or: a task filed and reviewed from inside the AI tool you already use.

What it replaces: bug reports without reproduction details; switching windows to file work.

Prerequisites: the extension zip (not in the Chrome Web Store); an API token for MCP.

Features shown: capture and annotation, page context, automatic planning, MCP tools acting with the person's own permissions.

### 12. Admin: runners on Kubernetes

Who: a platform engineer.

Trigger and goal: run the installation and its agents on the cluster they already operate, with isolation and limits.

Path:

1. Install the Helm chart from the release checkout, with an app namespace and a dedicated worker namespace, external PostgreSQL and S3-compatible storage, an ingress host and an optional preview host. `helm upgrade --install … --wait`.
2. Open the address, create the admin, and go through setup; the default runner starts on Kubernetes.
3. Settings → Agents → a runner → Advanced → Compute: Kubernetes worker, with CPU, Memory, Temporary Storage and Time Limit per run.
4. Each run is its own Job in the worker namespace. Workers get no Kubernetes API token, fetch exactly their runner's secrets with a token that only works for that run, and are limited by network policies. `kubectl -n viberglass-workers get jobs,pods --watch` shows them come and go.
5. Run details show the worker's log and the pod's state; cancelling removes the Job.

Aha: agents are just short-lived Jobs in a locked-down namespace, with secrets handed out per run, not long-lived pods holding everyone's keys.

What it replaces: agents on developer laptops, or a shared VM with every credential on it.

Prerequisites: a cluster with an ingress controller and a NetworkPolicy-capable CNI, PostgreSQL, a bucket, DNS and TLS.

Features shown: the Helm chart, Kubernetes compute, per-run Jobs and secrets, resource limits, network policies. Docker on one host, AWS ECS Fargate and Lambda are the other compute options.

Caveat: tested on a local kind cluster; a managed cloud cluster install following only the docs is still to do.

### 13. Admin: secrets, people, roles and private spaces

Who: the workspace admin, and space maintainers.

Trigger and goal: bring the team in with the right access, keep credentials safe, and keep some work private.

Path:

1. Settings → Members → Invite someone: Email, Role (Admin "Everything, including workspace settings.", Member "Works in open spaces and the ones they join.", Guest "Only the spaces picked below.", Viewer "Read-only."), the spaces, then Create invite link. The link works once for 7 days; it's emailed when email is set up. What each role can do opens the full table.
2. In a space: Space settings → Members, Add someone with a Space role (Maintainer or Member), tick Private space so only its members and admins see it, set the default owner and default reviewers, and turn on reminders for unanswered questions.
3. Settings → Secrets: model keys, agent logins, cloud accounts and other secrets. Add secret with Storage location Store the value (encrypted), Server environment variable (advanced) or AWS SSM Parameter Store. A runner names exactly the secrets its runs get; repository tokens never reach the agent.
4. Settings → Connections: GitHub, Jira, Shortcut, custom webhooks and Slack. For a tracker: Set up the webhook, copy the URL and secret, set the bot account; Deliveries lists every event, including ignored ones with the reason, with Retry.
5. Settings → Audit log for changes to agents, connections, secrets and members; Settings → Run records for every run with its agent, model, cost and tokens.

Aha: guests who see only their spaces, viewers who can't change anything, private spaces, and secrets the agent never sees, all enforced by the server, not just hidden in the screens.

What it replaces: sharing one agent account and API key across a team, with no record of who asked for what.

Prerequisites: admin role.

Features shown: invite links without email, four workspace roles, space roles, private spaces, default reviewers, encrypted secrets and SSM, per-run secret scoping, tracker and Slack connections, deliveries, audit log, run records.

### 14. Keeping an eye on things

Who: a viewer, or a product leader across several spaces.

Trigger and goal: know what's moving, what's stuck and what shipped, without opening every task.

Path:

1. Overview (where viewers land): Needs attention (failed, paused, asking a question, or waiting on someone for more than a day, each with its next move), Agent working, Waiting on people, Not started, and recent outcomes. Filter to one space at the top.
2. Home for the product leader: Needs you (Agent asked you, "Maria mentioned you", Your move) and Your conversations, filtered by All, Unread or I own.
3. A space's board or table, with search and filters.

Aha: one page that says whose move it is across every space, agent or person.

What it replaces: status meetings and chasing people for updates.

Features shown: Overview, Home, roles, notifications.

### 15. Recurring work on a schedule

Who: an admin or developer.

Trigger and goal: agent work that should happen regularly, such as dependency updates every Monday.

Path: in a Git space, Schedules → New Task Template (name, agent runner, task instructions, credentials), then New Schedule (template, Interval or Cron expression, timezone). Each schedule shows its last run and successes and failures; Pause and Resume. Runs that change code open pull requests and appear under the space's Runs.

Aha: the agent shows up every Monday with a pull request.

Features shown: task templates, schedules, runs. Not available in Files spaces.

## Wording notes

For script writers: the screen's words, where the user guide or older material says something else.

| Say (on screen) | Not |
|---|---|
| Send, Send after this turn, Send now and interrupt | Post, Interrupt with this |
| Create task | Create Task |
| Settings → Agents | Settings → Agents & runners |
| Agent working (Overview) | Live now |
| Incoming issues: Create tasks for (None, All issues, Matching labels) and Automatically write a plan | Write the plan for new issues |
| Bring in another agent | Bring in Codex |
| Space, task, plan, artifact, agent, run | Project, ticket, research, clanker, job |
| Files space, Git repository space | Repo-less space, artifact space |

Viberglass is the product name; the Slack bot and slash command are `@Viberglass` and `/viberglass`, and the CLI is `viberglass`.

## Sources

Product decisions in `docs/adr/` (0001 to 0016), the user and admin guide in `docs/guide/`, `docs/artifact-spaces-plan.md`, `docs/model-hosting-plan.md`, `docs/launch-handover.md`, `docs/launch-todo.md`, `docs/testing/e2e-manual/`, `README.md`, the screens in `apps/platform-frontend/src/pages` and `apps/platform-frontend/src/layouts`, `apps/chrome-extension/src/popup`, `packages/cli`, `packages/mcp-server` and `packages/integrations/integration-slack`.
