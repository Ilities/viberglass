# Repositories and integrations

How spaces connect to code and to the tools your team already uses: GitHub repositories, Files spaces, issue trackers, custom webhooks and Slack. Workspace-wide connections live under Settings → Connections; each space links the ones it uses in its own settings.

## Repositories

Agents work in GitHub repositories: they read them, push a branch per task and open pull requests. Pull requests are GitHub only.

Setup connects the first repository from a pasted access token. Use a fine-grained token limited to the repository, with write access to Contents and Pull requests. Setup's "Create a token with the right permissions" link opens GitHub's form with these filled in.

To change a space's repository, open the space's Settings tab:

- Repository: the code host connection, the repository address (the one you'd clone), the default branch and the access token.
- Under Advanced: Open pull requests in another repository, for forks or mirrors; Pull request target branch, when it isn't the default branch; and Branch names, with a live example of the branch a task gets.

Each task keeps one branch, named the first time it's built or taken over.

## Files spaces

A space is backed by a Git repository or by Files, chosen when it's created; the backing can't be changed later. A Files space has no repository. Its tasks share one set of working files, which are kept between runs, and agents produce named artifacts with versions people can preview and download. How people use them is in [Files and artifacts](../user/files-and-artifacts.md).

What the installation needs:

- Object storage. Files spaces keep their files and artifacts in an S3-compatible bucket. Without one, a Files space shows File storage is not configured and its tasks can't run. The Docker quick start bundles one; for the other installs, see [Docker on a server](install-docker.md#on-a-server), [Kubernetes](install-kubernetes.md#4-configure-the-installation) and [AWS](install-aws.md#files-spaces).
- Workers that can reach the storage. They fetch and save a space's files through short-lived signed URLs from the backend, and need no storage credentials of their own.
- A preview host, for HTML, image and PDF artifacts. Previews run the agent's HTML and scripts, so they're served from a hostname of their own, in a sandbox, where the app's sign-in cookies never go. Without one, those artifacts can only be downloaded.
- Runners on Docker, Kubernetes or ECS. Lambda runners can't run in Files spaces.

Viberglass keeps the newest 20 working snapshots of each space's files and the newest 10 versions of each artifact, and deletes older ones from storage. Set `SPACE_FILES_KEEP_SNAPSHOTS` and `ARTIFACT_KEEP_VERSIONS` on the backend to keep more or fewer.

## Issue trackers

A space can take its tasks from a tracker. Each issue is linked to the task it creates, and the two stay in step, the way a task's Slack thread does.

| Tracker | State |
|---|---|
| GitHub Issues | Ready |
| Jira Cloud | Ready |
| Shortcut | Ready |
| Asana | Ready |
| Custom webhook | Ready, for any system that can send JSON |
| GitLab, Bitbucket, Linear, Monday | Not available yet |

Connecting a tracker, choosing which issues each space takes, and what to check when an issue doesn't arrive are in [Issue trackers](issue-trackers.md).

### Custom webhooks

Create one custom inbound endpoint per system that sends tasks. Each has its own secret; sign the raw request body with HMAC-SHA256. The page shows the expected payload, the required headers and a test script.

## Slack

The Slack app lets people start tasks with `/viberglass`, follow them in a Slack thread, and get DMs. See [Slack](../user/slack.md) for how people use it.

1. Under Settings → Connections → Slack, enter your backend's public hostname under Backend host and copy the app manifest it fills in. On the Docker server and Kubernetes installs, that's the app's own hostname. At api.slack.com/apps, choose Create New App → From a manifest, paste it, create the app and install it to your workspace.
2. On the same screen, enter the app's Bot User OAuth Token (`xoxb-…`, under OAuth & Permissions) and Signing Secret (under Basic Information) and save. The bot starts right away; the screen shows Bot active once Slack accepts the token. Slack posts link to tasks at `PLATFORM_FRONTEND_URL`, which the Docker server setup and the Helm chart set to your app's address.
3. Each person links their account under Settings → Notifications → Link Slack.

Slack must reach the backend over HTTPS. On a local install, use a tunnel such as ngrok. The slash command, interactivity and events all use `https://<your backend>/api/webhooks/slack`. Full detail, including the scopes, is in the [Slack integration guide](https://github.com/Ilities/viberglass/blob/main/docs/operations/slack-integration.md).

## Email

Email is optional; invite links work without it. With email set up, Viberglass emails invites, failed setups and finished tasks.

- Docker and Kubernetes: set `EMAIL_FROM` and `SMTP_URL`, such as `smtp://user:password@smtp.example.com:587`.
- AWS: set `emailDomain` in the platform stack to use SES. See [Install on AWS](install-aws.md#email).

Admins can check delivery with Send test email under Settings → Notifications.
