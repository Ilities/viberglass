# Launch handover

Where the launch work stood at the end of 2026-10-08, so the next session can carry on straight away. The list of what's left is [launch-todo.md](launch-todo.md); this file is the context behind it. Delete both once launch is done.

Committed up to `41233620` (Kubernetes worker lifecycle). The plan-parts work below isn't committed yet. Tests are green: frontend 410, backend unit 1,506. Backend integration tests weren't run.

Since the last handover: the trackers' webhooks were tested against real GitHub, Jira and Shortcut, and Kubernetes was tested programmatically on a local cluster (`kubernetesSmoke.ts`, the storage smokes).

## Done late on 2026-10-08: ways around building in parts

[ADR 0013](adr/0013-ways-around-building-in-parts.md) amends ADR 0010. Not tried in a browser or with a real build yet.

- Each part in the plan's parts box has a menu (⋯): Mark done, Skip this part, taking a mark back, and Discard this build for a build that never opened its pull request (refused while a run is going). Marks live in `task_plan_part_marks` (migration 115); `TaskPartMarksService` and `PUT/DELETE /api/tasks/:id/build/parts/:n/mark`, `POST /api/tasks/:id/build/discard`.
- A merge counts over a mark. A pull request whose parts are all finished stops being the open one, so the next part gets its own branch. Marking the last part finishes the task, credited to whoever marked it.
- Add to part N's pull request: an ask with `add: true` widens the open pull request's range (`TaskPartsService.extendOpen`, only once the ask goes through) and builds on its branch. The prompt's new `addParts` sentence comes from migration 115.
- `TaskBranchDAO.claim` reuses the latest live branch only when a build continues it or it covers the parts asked for. That rule has no unit test (it's a query).
- Bug fixed on the way: looking at a task's code branch (the task page, MCP) claimed a branch for the whole plan, so every part read "Building" and part 1 couldn't be built. Reads now only preview the name; taking the work over claims it, for the parts left.

Gaps fixed on 2026-10-09 (uncommitted): taking a mark back on a finished task opens it again; the parts box header drops "one pull request each" once parts share one; a build that stopped before opening its pull request is offered again ("Build part 2 again", same branch) rather than discarded on its own, since resuming a paused agent continues it; an answer to the agent's question written in a tracker is stored with that tracker as its source, so the agent's reply is posted back.

Also late on 2026-10-08, uncommitted with the above:
- Eleven token.observer tasks showed every part as Building from the branch-claim bug; their stray rows were deleted from the dev DB (none had a build).
- Home's "Part 1 merged · build part N" skips parts marked done or skipped (`TaskPlanPartMarkDAO.listFor`, `nextPart` in the situation).
- "Build it" on a plan in parts now tells the agent "parts 1 to the end of the plan", not "the plan of the plan".
- The forgot-password page links to Sign in instead of Sign up.
- Slack: the command is `/viberglass`, the bot and app are named Viberglass (manifest, install screen, docs). An existing Slack app needs its slash command renamed.
- The custom webhook route creates tasks through `CustomInboundProcessor`, so "Write the plan for new issues" works there too.
- Clean-machine tests CLEAN-15 – CLEAN-19 for the one-server compose install.
- `CLA.md` drafted; CONTRIBUTING asks for it.

## Tested on 2026-10-13: a local Kubernetes install with real agents

A kind cluster from `infra/kubernetes/scripts/local.py`, OpenCode with an OpenCode Go key, GitHub through a personal token. Everything below ran on Kubernetes workers.

- First-time setup: model, backing, first space, agent and starter task, with no manual steps.
- Files: a Files space made a 10-slide HTML presentation about Viberglass from an uploaded brief, which previewed on the separate preview origin with click and keyboard navigation. A revision made version 2. An edit to the brief while the revision ran waited and was saved straight after the run. Cancelling a later revision saved its partial files.
- token.observer (TO-1, a plan in three parts): the agent asked where the docs should live and the answer went through; part 1 opened PR #100, adding part 2 pushed onto the same pull request, part 3 was skipped, marking parts 1 and 2 done finished the task, and taking a mark back reopened it.
- token.observer (TO-2): a build stopped before its pull request offered "Build part 1 again" and "Discard this build"; discarding put the part back, and building again carried on from the stopped run's commit into PR #101.
- local-ctx: plan, a question about what "running" means, the answer, a revised plan, and PR #37 with a title and description the agent wrote. Take over and hand back also worked.

Fixed on the way: the Create space page and webhook addresses failed on production builds (a `URL` built from the empty API base); Kubernetes workers defaulted to 1 GiB and were killed running OpenCode, so the default is now 1 CPU and 4 GiB, and a worker killed for memory now says so instead of "Agent couldn't start"; pull requests and commits were titled "fix:" (commits "fix: fix:") and signed "Viberator", with bug-fix wording in the description, so builds now write PR_TITLE.md and PR_DESCRIPTION.md (migration 125) and the fallback is neutral; a stopped build's part read "Building" and offered "Add to part 1's pull request" with no pull request; failure cards squeezed their text in the task thread; the plan panel said the agent was writing the plan during artifact runs.

Fixed on 2026-10-14: the artifact preview frame shows "Loading the preview…" until the deck loads; "Discard this build" asks first; OpenCode runs counted only uncached input tokens as the context ("0k tokens in context"), and now count cached tokens too and prefer the harness's own context report.

## Done on 2026-10-08: spaces choose their tracker issues

Testing GitHub against `Ilities/token.observer` worked once a case bug was fixed, and led to [ADR 0012](adr/0012-spaces-choose-their-tracker-issues.md):
- A connection has one webhook, at `/api/webhooks/{github|jira|shortcut}/<webhook id>`. Its page shows the setup steps, events, bot account, the spaces taking its issues and every delivery. Deliveries no space takes, or events the webhook doesn't receive, are listed as ignored with the reason, and can be retried.
- Each space has Settings → Incoming issues (`tracker_issue_rules`, migration 114). A space takes a tracker's issues only through its rules: every issue or by label, and none without rules ([ADR 0014](adr/0014-spaces-opt-in-to-tracker-issues.md)). GitHub issues only go to spaces using their repository. Write the plan for new issues is set there.
- An issue several spaces take gets a task in each (`TrackerIssueRouter`, `TrackerIssueTaskOpener`). Comments reach every linked task, mentions ask each agent, and posts back name the space.
- Edits to an issue with no task are routed again, so adding a label later brings it in. GitHub's `issues.labeled` is handled; the Shortcut parser keeps label names from the event's references (unverified with a real payload).
- Tasks can be copied to another space from the Actions menu (`POST /api/tasks/:id/copy`), for work that needs another repository. Spaces still have one repository; multi-repository spaces were considered and dropped for now.
- Tracker packages describe themselves (`trackerWebhook` in each frontend plugin) and one shared section renders them; the per-package webhook sections and provider policies are gone.
- Posting back to an issue found no token when the connection's only token credential wasn't marked default; it now uses the default, else the newest token credential.

## Done on 2026-10-07

UI snags from the screenshot pass:
- Answer buttons wrap, agent messages are separated by a blank line, an answered question shows only under the question.
- Home: a finished plan reads "Ready for your review" with the AI avatar; adding a reviewer to a task whose plan is waiting puts it under their Needs you.
- Run details show repository paths instead of `/tmp/viberator-work/…`, and a $0 estimate as "cost not reported". Migration 112 asks the agent to write its first line without file names (only affects new turns, unverified with a real run).
- "Invite your team" ignores the demo workspace's users.
- Docker runners default to the published image ("Published image" / "Build from source").
- Plan versions compare as rendered markdown with word-level changes.
- Relative timestamps in comments and builds; the content frame fills the window on desktop.

Product:
- Stub integrations are hidden; connection screens say tasks and spaces.
- "Source code" link in the user menu (`VITE_SOURCE_URL`, defaults to the GitHub repo).
- Self-service password reset email, reusing the admin reset links. Never sent for real, not tried in a browser.

Repository clean-up: `docs/ux/`, old images, infographic, submitter contract, AWS walkthrough, `CODEBASE_MAP.md` and the backend docs are gone. The manual test harness lives in `tests/manual-harness/`. The vendored AI Elements license sits in `components/ai-elements/`.

Installing and running:
- `docker-compose.prod.yml` and `.env.production.example` for one server, optional HTTPS via Caddy (`--profile https`). The agent started it locally and it came up healthy.
- `publish-platform-images.yml` publishes backend and frontend images to GHCR.
- Pulumi workflows and `deploy-backend-prod.yml` smoke checks fixed; required secrets listed in `.github/DEPLOYMENT.md`.
- The production frontend image build was broken by the integration packages' tsup configs deleting each other's types; each build now has its own `outDir`.

CLI and extension:
- The CLI publishes to npm as `viberglass` on `v*` tags (`publish-cli.yml`, needs `NPM_TOKEN`).
- The Chrome extension uses current wording, has a release zip workflow, and creating a task through it worked end to end (it left task UW-10 in the dev database).

Trackers as linked threads ([ADR 0011](adr/0011-tracker-issues-are-linked-threads.md)):
- A new Jira issue, Shortcut story or GitHub issue creates a task linked to it (`task_issue_links`, migration 113). The connection setting "Write the plan for new issues" (renamed from auto-execute, column `plan_new_issues`) starts the plan; GitHub can limit it to labelled issues.
- Edits update the task's title and description.
- Comments become messages in the thread: as the Viberglass person whose email matches, otherwise under the commenter's name with "on Jira" etc. Mentioning the connection's bot account asks the agent; a reply from the person the agent asked answers its question.
- `TaskIssueMirror` posts back to the issue: the plan's first paragraph with a link, the agent's questions, the pull request, merged parts and done, plus the agent's reply when the ask came from the issue. Comments end with "— via Viberglass" so they aren't read back in.
- Shared code: `services/trackers/` (TrackerIssueInbound, TaskIssueMirror, TrackerCommenterResolver, ConnectionCredentialsResolver, trackerMirrorPosts). Payload parsing per tracker: `webhooks/inbound-processors/{Jira,Shortcut,GitHub}InboundProcessor.ts` and `trackers/`. Commenters live in each integration package (`JiraCommenter`, `ShortcutCommenter`, `GitHubCommenter`).
- Jira is marked ready so it can be set up and tested. Its connection has Site URL and Account email fields; Jira Cloud authenticates with email plus API token (Basic). "Test connection" now uses the connection's token credential.

## Start here

1. Record the demo videos from `docs/marketing/demo-videos.md` on a freshly seeded install.
2. Try the tracker changes with real GitHub, Jira and Shortcut events.
3. Then the manual steps below and the rest of launch-todo.

The dev stack is `docker compose -f docker-compose.dev.yml up -d` (app on :3000, API on :8888); plain `docker compose up -d` is the quick start, which runs the published images. After changing `packages/types`, run its build and touch a backend file so nodemon restarts; the dev backend runs new migrations on start. Integration packages are baked into the dev frontend image: after changing a package's frontend code, rebuild the package and run `docker compose up -d --build frontend`. A tracker needs a tunnel to reach the webhook URL (`ngrok http 8888`); the GitHub connection's webhook is `497130fc-…`.

## Other known gaps and likely tweaks

Fixed on 2026-10-13, none tried with real tracker events yet:
- Shortcut commenters are looked up by member id through the Shortcut API, so they show by name and match a Viberglass person by email. Shortcut comment events couldn't be read at all before (`story-comment` actions carry no story id); that's fixed too.
- Closing an issue marks its linked tasks done; reopening it opens them again. GitHub needs `issues.closed` and `issues.reopened` ticked on an existing webhook (the dev one `497130fc-…` doesn't have them). Jira counts a resolution or a move into the done category; Shortcut counts completed, archived and moves into a done workflow state.
- Jira rich-text mentions of the bot match by account ID.
- The Jira connection settings form follows the other connection sections.

Still open:
- The Markdown to Jira wiki conversion is deliberately simple.
- Not checked visually: outside authors in the thread, the GitHub and Shortcut connection screens after the rewording, the forgot-password page.
- `docker-compose.dev.yml` uses `jussi` as the PostgreSQL user.

## Waiting on manual steps

From launch-todo, things only the maintainer can do:
- Clean-machine runs CLEAN-15 to CLEAN-23 (CLEAN-15 – CLEAN-19 are the one-server compose install).
- The rest of launch-todo: UX validation and the marketing site.
