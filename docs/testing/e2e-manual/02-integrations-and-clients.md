# 02 · Integrations and clients

Everything that talks to Viberglass from outside the browser: GitHub, trackers, Slack, the MCP endpoint, the CLI and the Chrome extension. Run on **L-DEV** (or L-REV) with **TUNNEL** for anything that needs inbound webhooks.

## Contents

- [Preparing a public URL](#preparing-a-public-url)
- [GitHub (GH)](#github-gh)
- [Tracker and custom webhooks (HOOK)](#tracker-and-custom-webhooks-hook)
- [Slack (SLACK)](#slack-slack)
- [MCP endpoint (MCP)](#mcp-endpoint-mcp)
- [CLI (CLI)](#cli-cli)
- [Chrome extension (EXT)](#chrome-extension-ext)
- [Run-record export (EXPORT)](#run-record-export-export)

## Preparing a public URL

1. Start a tunnel to the backend: `cloudflared tunnel --url http://localhost:8888` (L-DEV) or `:9088` (L-REV). Note the `https://…trycloudflare.com` URL.
2. Webhook endpoints are `<tunnel>/api/webhooks/<provider>/<webhook id>`; the connection's page shows the address. Workers keep calling the backend through `PLATFORM_API_URL` (no change needed locally).

## GitHub (GH)

Use a **disposable** repository: these tests push branches, open and merge PRs.

### GH-01 · Connection and token
1. Workspace settings → Connections → GitHub → add it with the read/write fine-grained token. **Test connection**.
2. Add a second credential with an expiry date; mark one default.

Expect: test passes; the connection shows under In use; credentials list both, with expiry.

### GH-02 · Link to a space
1. Space settings: code host = the GitHub connection, repository address, default branch, access token = the read/write credential. Save.
2. Check the space readiness banner disappears.

Expect: readiness all green; Advanced shows the branch-name example.

### GH-03 · Code turn → pull request
Needs: GH-02; a ready runner.
1. In a task, ask for research, then **Build it**.
2. Open the PR on GitHub; open the Code tab in the task.

Expect: branch named by the space template; one commit with the changes; a PR with title and description from the agent; the Code tab shows the PR panel with status and changed files.

### GH-04 · Review comments → revision
Needs: GH-03.
1. On GitHub, leave a review comment on the PR.
2. In the task, ask the agent to address the review (the build panel offers it).

Expect: the agent's next code turn pushes a new commit to the same PR addressing the comment.

### GH-05 · Merge → task done
Needs: GH-03.
1. Merge the PR on GitHub.
2. Wait up to 15 minutes (the PR outcome sweeper interval).

Expect: the task becomes Done, "merged by <you>"; owners get a task-done notification; Overview counts it under Done this week.

### GH-06 · Take over with real commits
Needs: GH-03, CLI-01.
1. **Take over**; check out the branch; commit and push a change by hand; **Hand back** with a note.

Expect: the agent's next turn says it read your changes and builds on them; no force-push over your commit.

### GH-07 · Inbound GitHub webhook
Needs: TUNNEL; GH-01.
1. Connection → Webhook → Set up the webhook. Copy the URL and secret into the repository's webhook settings (events: Issues, Issue comments). The space using the repository needs no setup.
2. Open an issue on GitHub; comment on it.
3. Send a delivery with a wrong secret (edit the GitHub webhook secret).
4. In the space's settings → Incoming issues, turn on Write the plan for new issues; open another issue.
5. Narrow the space to issues labelled `ready`; open an issue without it, then add the label.

Expect: (2) a task appears with the issue content; the comment lands in its thread. (3) The delivery is rejected and listed as failed; **Retry** works after fixing. (4) The agent writes the plan on its own. (5) The unlabelled issue is listed as ignored with the reason; adding the label creates the task.

## Tracker and custom webhooks (HOOK)

### HOOK-01 · Custom inbound webhook
1. Connections → Custom → add; create an inbound webhook config for a space with a secret.
2. `curl -X POST <tunnel or localhost>/api/webhooks/custom/<configId>` with the documented JSON body and signature header (see the connection's webhook section for the exact format).
3. Send it twice; send a bad signature.

Expect: one task created; the duplicate is ignored (deduplication); the bad signature is refused; deliveries are listed with status and **Retry**.

### HOOK-02 · Jira (optional)
1. Connections → Jira → add with an API token; set up the webhook; register it in Jira. In a space's settings → Incoming issues, take the label `viberglass`.
2. Create an issue with the label; comment on it. Create one without it.

Expect: a task for the labelled issue, comments in its thread; the other is listed as ignored. Jira is marked as a limited integration; record what works.

### HOOK-03 · Shortcut (optional)
Same as HOOK-02 with a Shortcut story and label.

### HOOK-04 · Linear, Monday, GitLab, Bitbucket
Not available yet (stubs). Confirm Connections lists them as not available, without broken pages.

## Slack (SLACK)

Follow [../../operations/slack-integration.md](../../operations/slack-integration.md) to create the app. Set `SLACK_BOT_TOKEN` and `SLACK_SIGNING_SECRET` on the backend; the request URL is `<tunnel>/api/webhooks/slack`.

### SLACK-01 · Install and status
1. Workspace settings → Connections → Slack: follow the install instructions.

Expect: Slack shows as in use; without the signing secret, the webhook answers 503.

### SLACK-02 · Link your account and DMs
1. Your settings → Notifications → **Link Slack**.
2. Trigger a mention and an agent question for yourself.

Expect: DMs for the mention and question, with links back to the task.

### SLACK-03 · Slash command and modal
1. In Slack: `/viberator` → the modal; pick a space you can see; describe a task; submit.
2. As a Slack user not linked to a Viberglass account, try the same.

Expect: (1) a task created with you as requester; a thread posted with its link. (2) A message saying to link the account first.

### SLACK-04 · Thread mirroring
1. Reply in the task's Slack thread; mention someone.
2. Let the agent post a result and ask a question; answer it with a button in Slack.

Expect: Slack replies appear in the task thread attributed to you; activity mirrors to Slack; the button answer resumes the agent.

## MCP endpoint (MCP)

### MCP-01 · Tools over MCP
Needs: an API token (AUTH-06) of a member.
1. Point an MCP client at `http://localhost:9088/api/mcp` (or the dev port) with `Authorization: Bearer <token>`. MCP Inspector: `npx @modelcontextprotocol/inspector`.
2. Call `space_list`, `task_list`, `task_get`, `agent_list`.
3. `task_create` in a space; `task_trigger` research; `task_review` and `task_review_comment` on the research.
4. Repeat with a viewer's token; with a session cookie instead of a token.

Expect: (2) only spaces the user can see. (3) Visible in the UI as that user, with a real agent turn. (4) Viewer refused; session auth refused.

## CLI (CLI)

### CLI-01 · Checkout after take-over
Needs: GH-03; an API token.
1. `npm run build -w viberglass`.
2. In a clone of the test repository: `VIBERGLASS_URL=http://localhost:9088 VIBERGLASS_TOKEN=<token> node <repo>/packages/cli/dist/cli.js checkout <TASK-KEY>`.
3. Run it in a clone of a different repository.

Expect: (2) the task branch checked out. (3) Refused because the origin doesn't match.

## Chrome extension (EXT)

### EXT-01 · Capture to task
1. `npm run build -w @viberglass/chrome-extension`; load `apps/chrome-extension/dist` unpacked in Chrome.
2. Options: set the server URL; sign in from the popup.
3. On any page: capture the screen, an area and an element; annotate; create a task in a space.

Expect: the task has the screenshot(s) and page context (URL, console errors) under Media.

## Run-record export (EXPORT)

### EXPORT-01 · NDJSON export
1. As admin: `curl -b <session cookie> 'http://localhost:9088/api/run-manifests/export' > runs.ndjson`.

Expect: one JSON object per run; usage and cost marked unavailable where not reported; no secret values.
