# Security

Agents run code from your repositories with your credentials, on instructions that include text anyone on a task can write. This page says what runs where, what an agent can reach, and what you're responsible for as the host.

## What leaves your installation

Viberglass is self-hosted: its database, files and secrets stay in infrastructure you control. Two things leave it:

- Code and task text go to the model provider. Every run sends the agent's prompt, including the task, its thread and parts of your repository, to the provider or endpoint its runner uses. If code must not leave your network, use a model you host yourself, through a [custom endpoint](agents-and-models.md#custom-endpoints).
- Branches and pull requests go to GitHub, and Slack posts go to Slack, when those are connected.

## How a run is isolated

- Each run gets its own container: a Docker container, a Kubernetes Job, an ECS task or a Lambda invocation, started for that run and removed after it.
- The coding agent inside runs without asking for permission for its commands. Treat it like a script that runs whatever the task, the repository and the thread lead it to.
- The agent's environment is filtered: it gets what it needs to reach its model, and the runner's declared extra variables. Repository tokens, private keys, passwords and client secrets are withheld, even if a runner declares them. The worker clones, pushes and opens pull requests itself.
- On Kubernetes, workers run in their own namespace with no service account token, and network policies limit where they can connect. Network policies need a network plugin that enforces them.

## Credentials

- Secrets are stored encrypted with AES-256-GCM in the database, or in AWS SSM. See [Secrets](secrets.md).
- A run only gets the secrets its runner names. Kubernetes workers fetch them at start with a token that works for that run alone, while it's active.
- Webhook deliveries from GitHub, Shortcut, Jira and custom sources are checked against their signing secret.
- Repository access comes from the token you give each space. Use fine-grained tokens limited to the repositories and permissions the agent needs.

## People

- Roles are enforced by the server, not only hidden in the interface. Viewers can't change anything; guests see only their spaces. See [People and access](people-and-access.md).
- Only people on a task, its space's maintainers and admins can ask an agent to build. Choose who can create tasks and who joins as a guest with that in mind, since a task's text steers the agent.
- The audit log records changes to agents, connections, secrets and members, with who made them.

## Your part as the host

- Set strong, random `SECRETS_ENCRYPTION_KEY` and `WEBHOOK_SECRET_ENCRYPTION_KEY` values, and back them up. Never expose the Docker quick start to a network.
- Serve the app and API over HTTPS.
- Give each runner the narrowest model key and each space the narrowest repository token that work.
- Protect your default branches on GitHub with required reviews, so an agent's pull request is reviewed like anyone's.
- Keep Viberglass and its worker images up to date. See [Upgrades and backups](upgrades-and-backups.md).

Report vulnerabilities as described in [SECURITY.md](https://github.com/Ilities/viberglass/blob/main/SECURITY.md), not in public issues.
