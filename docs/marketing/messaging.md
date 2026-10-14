# Messaging notes

What the journeys in [User journeys](user-journeys.md) let us claim, how Viberglass differs from the alternatives, and what not to claim yet. Use it to check copy, landing-page sections and video captions.

## Contents

- [The one-line positioning](#the-one-line-positioning)
- [Claims by journey](#claims-by-journey)
- [Differentiators](#differentiators)
- [Not verified on real deployments yet](#not-verified-on-real-deployments-yet)
- [Phrases to avoid](#phrases-to-avoid)
- [Sources](#sources)

## The one-line positioning

An open-source, self-hosted workspace where your whole team and any coding agent work on the same tasks: the people who know what's wanted ask, review the plan and answer the agent's questions, and the agent builds it as pull requests.

Shorter: Bring your team into the conversation with your coding agents.

## Claims by journey

Each claim is backed by the journey named. Wording is a starting point, not final copy.

### First install and setup

- One server, one compose command, HTTPS included, then three inputs in the browser: a model key, a repository, a name.
- No runner, secret-store or webhook configuration to get to the first plan; the default agent is created and started for you.
- Look around first with a demo workspace that removes itself cleanly.
- Invites work as links, so there's no email server to set up.

### From an idea to a plan and a pull request

- Anyone on the team can ask for a change in plain words. Nobody needs repository access or a dev environment.
- The agent reads your code first and writes one plan: what it found, then what it would change.
- Nothing is built until someone asks for it, and only people on the task, the space's maintainers and admins can ask for code.
- The result is an ordinary GitHub pull request your engineers review as usual. The task closes when it's merged.

### Reviewing and iterating on a plan

- Review an agent's plan the way you review a colleague's doc: comments on lines, suggested edits, mentions.
- One click sends every new comment back to the agent, which says in one line how it read them.
- Every version is kept and can be compared word by word.
- The whole conversation is in one thread, for everyone on the task, not in one engineer's terminal.

### Building a big plan in parts

- Large plans are written in parts and shipped as one pull request per part, each small enough to review.
- Progress comes from the pull requests themselves, not from the agent's own claims.
- Engineers can take over the agent's branch, push their own commits and hand it back.

### The agent asks, a person answers

- When the agent needs a decision, it asks a named person and waits, instead of guessing.
- The question reaches them where they are: Home, a Slack DM or thread, or the tracker issue.
- Anyone on the task can answer, and the thread records who answered for whom.
- Waiting costs nothing: no agent sits running while people think.

### Tracker issue to merged pull request

- Issues from GitHub, Jira and Shortcut become tasks that stay linked to them.
- Comments flow both ways; the plan, the agent's questions, the pull request and done are posted back to the issue.
- Each space chooses which issues it takes, by label or all of them, and whether the agent starts planning straight away.
- Every delivery is logged, including the ones that were ignored and why.

### A presentation from a Files space

- Spaces don't have to be code: a Files space gives agents a shared folder that's kept between runs.
- Agents produce named, versioned deliverables, such as an interactive presentation, that preview right in the app.
- Revise from the team's comments like any plan; every version stays until newer ones replace it.
- Previews run in a sandbox on a separate address, with no access to the app or the internet.

### Another agent, another model, your own GPU

- Eight coding agents side by side: Claude Code, OpenAI Codex, Google Antigravity, Qwen Code, Mistral Vibe, Kimi Code, OpenCode and Pi.
- Bring your provider keys, a coding plan, or any OpenAI- or Anthropic-compatible endpoint, including one you run yourself.
- Bring a second agent onto the same task; it reads the summary and the task and carries on.
- Experimental: deploy an open-weight model on a rented GPU in Finland, scaled to zero when idle.
- Every run shows the agent, the model, the time and the cost where the agent reports it.

### Working from Slack

- Start a task with `/viberglass`, and its Slack thread stays in step with it: plan, questions, Build it, pull request, done.
- Reply in the thread to talk to the team, mention the bot to ask the agent, press a button to answer it.

### Steering and taking over

- Pause, interrupt with a new instruction, or cancel at any time.
- Take over the agent's branch with one command, push, and hand it back; the agent reads your commits first.
- Ask the agent to address the pull request's open review comments; its next build adds to the same pull request.

### Admin journeys

- Self-hosted on one server, Kubernetes or AWS. Your database, files and secrets stay on your infrastructure.
- On Kubernetes, each run is its own Job in a locked-down namespace, with only its runner's secrets, handed out for that run.
- The agent never sees repository tokens, private keys or passwords; the worker clones, pushes and opens the pull request itself.
- Four workspace roles (admin, member, guest, viewer), private spaces, and space maintainers, all enforced by the server.
- An audit log of changes and a record of every run, with its model, cost and tokens.

## Differentiators

### Compared with using a coding agent directly

Claude Code, Codex or Cursor on an engineer's machine are excellent at the code. What they don't have:

- The rest of the team. A product manager, designer or support lead can't take part in a local agent session. In Viberglass they ask, review, answer and decide, and the agent hears all of them.
- A shared, durable record. One thread per task with every message, plan version, comment, run and pull request, instead of a terminal scrollback one person can see.
- Questions routed to the right person. The agent asks a named teammate and waits, in the app, Slack or the tracker.
- Review before code. A plan the team agrees on, then pull requests sized for review, a part at a time.
- Choice and switching. Any of eight agents and any compatible model on the same task, rather than one vendor's tool.
- Central control. Keys as encrypted shared secrets, roles, private spaces, an audit log and run costs, instead of personal keys on laptops.

Viberglass runs those same agents (Claude Code, Codex, OpenCode and the rest) inside it. It's a place for the team around the agent, not a replacement for it. Engineers keep their local tools and can take over any task's branch.

### Compared with other agent platforms and hosted coding agents

- Self-hosted and open source (AGPL). No hosted tier, no billing, no telemetry. Code, prompts, conversations and keys stay on infrastructure you run.
- EU data residency is possible end to end: run Viberglass in your own EU region and point agents at an EU model provider (OVHcloud in France) or a GPU deployment on Verda in Finland, or a model on your own hardware. The only things that leave are what you send to the model provider you chose, and to GitHub and Slack if connected.
- Any harness, not one vendor's agent. The coding agents are plugins, side by side, each with its own model choices.
- Built for the team workflow, not a single developer's prompt box: requester, owner, reviewers and watchers on every task, guests and viewers, mentions, Home's "whose move it is", and agreement in the thread instead of approval gates.
- Meets people where they work: GitHub Issues, Jira, Shortcut and Slack threads stay in step with the task both ways.
- Not only code: Files spaces for decks and documents with versioned artifacts and interactive previews.
- Runs on the compute you have: Docker on one host, Kubernetes, AWS ECS Fargate or Lambda.

Be careful with comparisons by name. Don't claim a competitor lacks something without checking it on the day.

## Not verified on real deployments yet

These exist in the product but haven't been confirmed on a real deployment or with real events, according to the launch handover, the launch to-do list and the plans. Don't feature them as proven, don't put them in a video unless they've been tried first, and label them where they appear.

Installation:

- The first release (v1.0.0) isn't published yet: the published images, `npm install -g viberglass` and the extension zip depend on it. GHCR packages still have to be made public.
- Install paths haven't been run from a clean machine following only the docs: the one-server compose install, Kubernetes from the README on kind, a managed Kubernetes cluster (OVHcloud), and AWS from nothing.
- Kubernetes was tested programmatically on a local kind cluster only. Network-policy enforcement, backups and real-model behaviour need validating on each cluster.
- AWS has known issues: HTTPS sign-in likely needs extra domain settings, and managed ECS workers may not keep conversation state between turns.
- The launch target of "first plan within 15 minutes of install" hasn't been timed on a clean machine yet.

Plans in parts:

- Mark done, Skip this part, taking a mark back, Discard this build, Add to part N's pull request and Build part N again haven't been tried with a real build. Building part by part with real merges has been.

Trackers:

- Closing an issue finishing its tasks, and reopening it reopening them, haven't been tried with real tracker events. GitHub needs the closed and reopened events ticked on the webhook.
- Shortcut commenters shown by name and matched by email, and Shortcut label names from real event payloads, aren't verified.
- Jira mentions of the bot by account ID in rich text are new and untried. The Markdown to Jira formatting is deliberately simple.
- Pull requests are GitHub only. GitLab, Bitbucket, Linear and Monday aren't available.

Slack and notifications:

- Live Slack account linking and question reminders on a deployed installation, and recovery of long conversations, are still to validate.
- The self-service password reset email has never been sent for real.

Agents and models:

- Verified end to end: Claude Code through z.ai's Anthropic-compatible endpoint, OpenCode with OpenCode Go and with workspace endpoints, and the deterministic test agent. Pi on endpoints has been exercised against a local test server.
- In the last review, Qwen Code, Codex (API key against a compatible endpoint) and Kimi Code failed against z.ai. Native Anthropic, OpenAI, Gemini, Mistral and Moonshot keys are untested. Claim "eight supported agents", not "eight agents tested with every provider".
- Native-provider keys haven't been tested separately from custom endpoints, including replacing a failed key and timeouts.
- Deployed models are experimental and Verda only. Two live deployments ran on Verda, but a full agent task on a live deployment, a second (cached) wake, and scaling down, Keep warm, Stop and Delete against a live deployment are still to confirm. A cold start can take close to ten minutes.
- OVH AI Endpoints listed its models, but a live completion hit its free tier's rate limit; a full task there isn't confirmed. Viberglass doesn't deploy models on OVH AI Deploy, and Bedrock is reachable only with a Bedrock API key on a custom endpoint.

Files spaces:

- Verified on the Docker install with the OpenCode agent: an interactive presentation created, previewed with working navigation, and revised to a third version. Files runs on Kubernetes and ECS, the preview host on each install path, and a stopped worker saving its files within its grace period are not verified there.
- Other agents haven't been tried in a Files space.
- Publishing an artifact to Notion or Google Docs is planned, not built. Don't mention it.
- Files spaces don't open pull requests, and schedules and Lambda runners don't run in them.

Product-wide:

- No manual accessibility pass yet (contrast, keyboard, focus, screen readers, both themes). Don't claim accessibility compliance.
- No first-time admin, PM, reviewer and viewer has yet used it unguided. Hold "anyone can set it up" claims until that's done, or phrase them as design intent ("setup asks for three things").
- The Chrome extension isn't in the Chrome Web Store; it's loaded unpacked.

## Phrases to avoid

- "Autonomous" or "fully automatic": the point is that people stay in the loop, and nothing is built until someone asks.
- "Approval workflow" or "approval gates": the product has agreement in the thread, not approval steps.
- "Deploys your changes": Viberglass stops at the merged pull request; deploying is outside it.
- "Research" as a separate step: the plan includes what the agent found.
- "Tickets" and "projects": they're tasks and spaces.
- "GDPR compliant", "certified" or "sovereign" as guarantees: say where things run and that you choose the model provider; compliance depends on how it's hosted.
- "Works with GitLab" or "Linear": not yet.
- "Publishes to Notion": not yet.
- "Hosted" or "sign up": there's no hosted offering.

## Sources

`docs/launch-handover.md`, `docs/launch-todo.md`, `docs/artifact-spaces-plan.md`, `docs/model-hosting-plan.md`, `docs/testing/e2e-manual/README.md`, `00-clean-machine.md` and `03-agents-and-model-endpoints.md`, `docs/guide/admin/security.md`, `docs/guide/admin/agents-and-models.md`, `docs/guide/admin/install-kubernetes.md`, `README.md`, and the product decisions in `docs/adr/`.
