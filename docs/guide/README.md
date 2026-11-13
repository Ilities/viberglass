# Viberglass guide

How to use Viberglass with your team, and how to run it. Viberglass is an open-source internal tool builder that you host yourself, where coding agents write the apps and Viberglass runs them. Someone asks for a tool in a task, the agent builds it, and Viberglass runs it, backs it up and signs people in to it. The same tasks can produce documents and presentations in a space that keeps shared files, or change your own product through a GitHub pull request.

## Using Viberglass

For product managers, support and QA leads, designers, reviewers and engineers.

- [Getting started](user/getting-started.md): the words Viberglass uses, what you see when you sign in, and what your role lets you do.
- [Tasks](user/tasks.md): asking for something from the web, Slack or an issue tracker, and the task's thread.
- [Plans and reviews](user/plans-and-reviews.md): asking for a plan, commenting on it, answering the agent's questions and bringing people in.
- [Building and pull requests](user/building-and-prs.md): building the plan, plans in parts, pull requests and finishing a task.
- [Files and artifacts](user/files-and-artifacts.md): spaces without a repository, their shared files, and the documents and presentations agents make there.
- [Apps](user/apps.md): App spaces, trying a change on a preview, making it live, rolling back, and who can open an app.
- [Steering the agent](user/steering.md): pausing, interrupting, taking over the branch yourself and handing it back.
- [Home and notifications](user/home-and-notifications.md): what needs you, Overview, Slack DMs and email.
- [Slack](user/slack.md): starting and following tasks from a Slack thread.
- [Schedules](user/schedules.md): agent work that runs on a timer.
- [Track record](user/track-record.md): how each agent and model's tasks in a space went, side by side.
- [Chrome extension](user/chrome-extension.md): creating a task from the page you're on, with a screenshot and the page's details.
- [MCP server](user/mcp.md): working with Viberglass from Claude, Cursor or another MCP client.

## Running Viberglass

For whoever installs and looks after the workspace.

- [Getting started](admin/getting-started.md): from `docker compose up` to a first app, then to a server your team uses.
- [Install with Docker](admin/install-docker.md): try it on one machine, and the first-run setup.
- [Install on Kubernetes](admin/install-kubernetes.md): the Helm chart, locally and on a managed cluster.
- [Install on OVHcloud](admin/install-ovhcloud.md): the Helm chart on OVHcloud Managed Kubernetes, with its managed PostgreSQL and Object Storage.
- [Install on AWS](admin/install-aws.md): the Pulumi stacks.
- [Agents and models](admin/agents-and-models.md): runners, coding agents, model keys, and connected and deployed models.
- [Apps](admin/apps.md): what App spaces need, the App home, the apps domain, and how apps run, are isolated and backed up.
- [Repositories and integrations](admin/repositories-and-integrations.md): GitHub, Files spaces and what they need, custom webhooks, the Slack app and email.
- [Issue trackers](admin/issue-trackers.md): GitHub Issues, Jira and Shortcut, and which issues each space takes.
- [People and access](admin/people-and-access.md): members, guests, viewers, app users, spaces and invites.
- [Secrets](admin/secrets.md): where keys and tokens are kept and how runners get them.
- [Security](admin/security.md): what runs where, and what an agent can see.
- [Upgrades and backups](admin/upgrades-and-backups.md): keeping an installation current and recoverable.
- [Troubleshooting](admin/troubleshooting.md): failed runs, agents that won't start and other common problems.
