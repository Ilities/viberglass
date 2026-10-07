# Viberglass guide

How to use Viberglass with your team, and how to run it. Viberglass is a self-hosted workspace where people and coding agents work on the same tasks: someone asks for a change, an agent writes a plan, the team discusses it, and the agent builds it as a GitHub pull request.

## Using Viberglass

For product managers, support and QA leads, designers, reviewers and engineers.

- [Getting started](user/getting-started.md): the words Viberglass uses, what you see when you sign in, and what your role lets you do.
- [Tasks](user/tasks.md): asking for something from the web, Slack or an issue tracker, and the task's thread.
- [Plans and reviews](user/plans-and-reviews.md): asking for a plan, commenting on it, answering the agent's questions and bringing people in.
- [Building and pull requests](user/building-and-prs.md): building the plan, plans in parts, pull requests and finishing a task.
- [Steering the agent](user/steering.md): pausing, interrupting, taking over the branch yourself and handing it back.
- [Home and notifications](user/home-and-notifications.md): what needs you, Overview, Slack DMs and email.
- [Slack](user/slack.md): starting and following tasks from a Slack thread.
- [Schedules](user/schedules.md): agent work that runs on a timer.
- [Chrome extension](user/chrome-extension.md): reporting a bug from the page it happens on.
- [MCP server](user/mcp.md): working with Viberglass from Claude, Cursor or another MCP client.

## Running Viberglass

For whoever installs and looks after the workspace.

- [Install with Docker](admin/install-docker.md): try it on one machine, and the first-run setup.
- [Install on Kubernetes](admin/install-kubernetes.md): the Helm chart, locally and on a managed cluster.
- [Install on AWS](admin/install-aws.md): the Pulumi stacks.
- [Agents and models](admin/agents-and-models.md): runners, coding agents, model keys, and connected and deployed models.
- [Repositories and integrations](admin/repositories-and-integrations.md): GitHub, issue trackers, custom webhooks and the Slack app.
- [People and access](admin/people-and-access.md): members, guests, viewers, spaces and invites.
- [Secrets](admin/secrets.md): where keys and tokens are kept and how runners get them.
- [Security](admin/security.md): what runs where, and what an agent can see.
- [Upgrades and backups](admin/upgrades-and-backups.md): keeping an installation current and recoverable.
- [Troubleshooting](admin/troubleshooting.md): failed runs, agents that won't start and other common problems.
