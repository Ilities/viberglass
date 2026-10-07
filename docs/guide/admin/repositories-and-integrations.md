# Repositories and integrations

How spaces connect to code and to the tools your team already uses: GitHub repositories, issue trackers, custom webhooks and Slack. Workspace-wide connections live under Settings → Connections; each space links the ones it uses in its own settings.

## Repositories

Agents work in GitHub repositories: they read them, push a branch per task and open pull requests. Pull requests are GitHub only.

Setup connects the first repository from a pasted access token. Use a fine-grained token limited to the repository, with write access to Contents and Pull requests. Setup's "Create a token with the right permissions" link opens GitHub's form with these filled in.

To change a space's repository, open the space's Space settings:

- Repository: the code host connection, the repository address (the one you'd clone), the default branch and the access token.
- Under Advanced: Open pull requests in another repository, for forks or mirrors; Pull request target branch, when it isn't the default branch; and Branch names, with a live example of the branch a task gets.

Each task keeps one branch, named the first time it's built or taken over.

## Issue trackers

A space can take its tasks from a tracker. New issues become tasks, and comments on them reach the task.

| Tracker | State |
|---|---|
| GitHub Issues | Ready |
| Shortcut | Ready |
| Custom webhook | Ready, for any system that can send JSON |
| Jira | Limited; shown as Coming Soon under Connections |
| GitLab, Bitbucket, Linear, Monday | Not available yet |

To connect one:

1. Under Settings → Connections, open the tracker and set up its inbound webhook. The page gives the webhook address and a secret, setup steps for the tracker, and which events to accept, such as issues opened and comments created.
2. Register the webhook in the tracker with that address and secret. Viberglass checks every delivery's signature.
3. In the space's settings, link the connection under Connections, and choose it under Issue tracker.

### Starting the agent from the tracker

In the space's Space settings, under Advanced, Fix tracker issues automatically makes the agent start on issues that carry one of the tags you list, such as `bug, fix-requested`. The agent's build shows in the task's thread like any other. Each inbound webhook also has its own setting for running on matching events, and for only running when the issue has the configured labels.

### Custom webhooks

Create one custom inbound endpoint per system that sends tasks. Each has its own secret; sign the raw request body with HMAC-SHA256. The page shows the expected payload, the required headers and a test script.

## Slack

The Slack app lets people start tasks with `/viberator`, follow them in a Slack thread, and get DMs. See [Slack](../user/slack.md) for how people use it.

1. Under Settings → Connections → Slack, enter your backend's public HTTPS address and copy the app manifest it fills in. At api.slack.com/apps, choose Create New App → From a manifest, paste it, create the app and install it to your workspace.
2. Set `SLACK_BOT_TOKEN` (the bot token, `xoxb-…`) and `SLACK_SIGNING_SECRET` on the backend, and `PLATFORM_FRONTEND_URL` so Slack posts link to tasks. Restart the backend.
3. Each person links their account under Settings → Notifications → Link Slack.

Slack must reach the backend over HTTPS. On a local install, use a tunnel such as ngrok. The slash command, interactivity and events all use `https://<your backend>/api/webhooks/slack`. Full detail, including the scopes, is in the [Slack integration guide](https://github.com/Ilities/viberglass/blob/main/docs/operations/slack-integration.md).

## Email

Email is optional; invite links work without it. With email set up, Viberglass emails invites, failed setups and finished tasks.

- Docker and Kubernetes: set `EMAIL_FROM` and `SMTP_URL`, such as `smtp://user:password@smtp.example.com:587`.
- AWS: set `emailDomain` in the platform stack to use SES. See [Install on AWS](install-aws.md#email).

Admins can check delivery with Send test email under Settings → Notifications.
