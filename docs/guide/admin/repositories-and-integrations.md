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

A space can take its tasks from a tracker. Each issue is linked to the task it creates, and the two stay in step, the way a task's Slack thread does.

| Tracker | State |
|---|---|
| GitHub Issues | Ready |
| Shortcut | Ready |
| Custom webhook | Ready, for any system that can send JSON |
| Jira | Not available yet; hidden under Connections until it has been tried against a real site |
| GitLab, Bitbucket, Linear, Monday | Not available yet |

To connect one:

1. Under Settings → Connections, add the tracker. For Jira, enter the site URL and the email of the account Viberglass posts as.
2. Under Credentials on the same page, add an API token for that account. Viberglass uses it to post to the issues tasks are linked to. GitHub uses the repository token for this.
3. Set up the connection's inbound webhook. The page gives the webhook address and a secret, the setup steps for the tracker, and which events to accept: issues created and updated, and comments created.
4. Register the webhook in the tracker with that address and secret. Viberglass checks every delivery's signature.
5. In the space's settings, link the connection under Connections, and choose it under Issue tracker.

### How an issue and its task work together

- A new issue creates a task in the space, linked to the issue. The person who opened it becomes the task's requester when their email matches a Viberglass account.
- Editing the issue's title or description updates the task.
- A comment on the issue appears in the task's thread. It's shown as the Viberglass person whose email matches the commenter, or otherwise under the commenter's name with where they wrote it, such as "Pat · on Jira".
- A comment that mentions the connection's bot account asks the agent, like mentioning it in the thread. A reply from the person the agent asked answers its question.
- Viberglass comments on the issue when the plan is ready, with a short summary and a link, when the agent asks a question, when it opens the pull request, and when the task is done. When the agent was asked from the issue, its reply is posted there too. Messages written in Viberglass stay in Viberglass.

### Plans for new issues

Each connection's inbound webhook has a setting, Write the plan for new issues. With it on, the agent writes the plan as soon as an issue arrives. With it off, the task waits until someone asks, in Viberglass or by mentioning the bot on the issue. For GitHub you can limit it to issues with certain labels. Nothing is built before there's a plan.

Set the bot account on the same page: the account whose mention asks the agent. That's the Jira account ID, the Shortcut mention name or the GitHub login, usually the account the token belongs to.

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
