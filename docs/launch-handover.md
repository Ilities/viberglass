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
- `CLA.md` drafted, with a placeholder for the Project Owner's legal name; CONTRIBUTING asks for it.

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

1. Finish trying the parts work on a real build in token.observer: add part 2 to part 1's pull request and check the agent pushes to the same one, mark a part done and check the task finishes and that taking the mark back reopens it, then a failed build, "Build part N again" and Discard.
2. Fix whichever of the known gaps below matter after that.
3. Then the manual steps below and the rest of launch-todo.

The dev stack is `docker compose up -d` (app on :3000, API on :8888). After changing `packages/types`, run its build and touch a backend file so nodemon restarts; the dev backend runs new migrations on start. Integration packages are baked into the dev frontend image: after changing a package's frontend code, rebuild the package and run `docker compose up -d --build frontend`. A tracker needs a tunnel to reach the webhook URL (`ngrok http 8888`); the GitHub connection's webhook is `497130fc-…`.

## Other known gaps and likely tweaks

- Shortcut comment events carry the author only as a member id, so commenters show as "A Shortcut member". The delivery history has real payloads to check against.
- Closing or reopening an issue doesn't change its task. Jira mentions written in rich text only match when the bot account is set to the mention's display text; wiki-markup bodies match by account ID.
- The Markdown to Jira wiki conversion is deliberately simple.
- The generic connection configuration form (now only used by Jira) is plain; worth a look once Jira works.
- Not checked visually: outside authors in the thread, the GitHub and Shortcut connection screens after the rewording, the forgot-password page.
- The dev `docker-compose.yml` uses `jussi` as the PostgreSQL user, and the Docker backup command in Upgrades and backups copies it.

## Waiting on manual steps

From launch-todo, things only the maintainer can do:
- Add `NPM_TOKEN`, publish a GitHub Release (`v1.0.0`) to publish images, the CLI and the extension zip, then make the GHCR packages public and link them to the repository.
- Pulumi secrets (`PULUMI_CONFIG_PASSPHRASE`, `PULUMI_PLATFORM_CONFIG_DEV`/`_PROD`, `AWS_ROLE_ARN` per environment); details in `.github/DEPLOYMENT.md`.
- Clean-machine runs CLEAN-15 to CLEAN-32 (CLEAN-15 – CLEAN-19 are the one-server compose install).
- The CLA's legal name, gist and cla-assistant.io link; the rest of launch-todo: UX validation, security mailbox, marketing site.
