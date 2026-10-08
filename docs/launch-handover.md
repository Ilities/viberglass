# Launch handover

Where the launch work stood at the end of 2026-10-08, so the next session can start testing and tweaking straight away. The list of what's left is [launch-todo.md](launch-todo.md); this file is the context behind it. Delete both once launch is done.

The 2026-10-07 work is committed (up to `5e4b9aed`). The 2026-10-08 work below isn't committed yet. Tests are green: frontend 406, backend unit 1,445. Backend integration tests weren't run.

## Done on 2026-10-08: spaces choose their tracker issues

Testing GitHub against `Ilities/token.observer` worked once a case bug was fixed, and led to [ADR 0012](adr/0012-spaces-choose-their-tracker-issues.md):
- A connection has one webhook, at `/api/webhooks/{github|jira|shortcut}/<webhook id>`. Its page shows the setup steps, events, bot account, the spaces taking its issues and every delivery. Deliveries no space takes, or events the webhook doesn't receive, are listed as ignored with the reason, and can be retried.
- Each space has Settings → Incoming issues (`tracker_issue_rules`, migration 114). Jira and Shortcut go by label. GitHub issues go to the space whose repository they're in without setup; a space can narrow that to labels. Write the plan for new issues is set there.
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

## Start here: testing the trackers

Use free or test accounts and delete their tokens afterwards. The dev stack is `docker compose up -d` (app on :3000, API on :8888). A tracker has to reach the webhook URL, so expose the API with a tunnel (`ngrok http 8888` works) and use that address in the tracker. Integration packages are baked into the dev frontend image: after changing a package's frontend code, rebuild the package and run `docker compose up -d --build frontend`.

GitHub: the connection's webhook exists (`497130fc-…`). Update the token.observer webhook's Payload URL to `<tunnel>/api/webhooks/github/497130fc-4b1b-40b7-8568-a70ededb2a7a` (the Issues event already includes labelling). Then check in token.observer's Incoming issues: every issue, labels only, plan on and off, and adding a label to an unlabelled issue. Comments by users of type Bot or the configured bot login are ignored; with your own token, leave the bot login empty.

Jira Cloud (a free site at atlassian.com):
1. Create an API token for the account that will act as the bot (id.atlassian.com, Security, API tokens). Note its account ID (profile URL).
2. In Viberglass, Settings, Connections, Jira: set Site URL (`https://<site>.atlassian.net`) and Account email, Save Configuration, add the token as a credential, then Test Connection.
3. Set up the webhook, set the bot account to the account ID, copy the URL and secret.
4. In Jira, Settings, System, Webhooks: add the URL with the secret, events Issue created, Issue updated, Comment created.
5. In a space's Incoming issues, take a label. Check: a labelled issue gives a task (and a plan when on); an unlabelled one is listed as ignored; adding the label brings it in; a label two spaces take gives two tasks; comments, bot mentions and answers; the plan, question, pull request and done comments arrive on the issue and aren't read back in.

Shortcut (free workspace): same flow with an API token from Settings, API Tokens, and the bot set to its mention name. Look at the delivery history for a real story payload with a label, and a comment payload: label names should arrive in the references, and the author only arrives as a member id today, so commenters show as "A Shortcut member".

## Known gaps and likely tweaks

- Shortcut commenter names and label names (above).
- Closing or reopening an issue doesn't change its task. Jira mentions written in rich text only match when the bot account is set to the mention's display text; wiki-markup bodies match by account ID.
- An answer given from a tracker isn't marked as coming from the issue, so the agent's reply to it isn't posted back (the plan and other milestones still are).
- The Markdown to Jira wiki conversion is deliberately simple.
- `custom.routes.ts` still creates tasks directly and ignores "Write the plan" (the custom inbound processor handles it).
- The generic connection configuration form (now only used by Jira) is plain; worth a look once Jira works.
- Not checked visually: outside authors in the thread, the GitHub and Shortcut connection screens after the rewording, the forgot-password page.
- Loose ends noticed: the forgot-password page still offers "Sign up" though registration closes after the first user; Slack still uses the `/viberator` command and the "Viberator" bot name.

## Waiting on manual steps

From launch-todo, things only the maintainer can do:
- Add `NPM_TOKEN`, publish a GitHub Release (`v1.0.0`) to publish images, the CLI and the extension zip, then make the GHCR packages public and link them to the repository.
- Pulumi secrets (`PULUMI_CONFIG_PASSPHRASE`, `PULUMI_PLATFORM_CONFIG_DEV`/`_PROD`, `AWS_ROLE_ARN` per environment); details in `.github/DEPLOYMENT.md`.
- Clean-machine runs CLEAN-20 to CLEAN-32, plus a new one for the one-server compose install (not written yet).
- The rest of launch-todo: UX validation, CLA, security mailbox, marketing site.
