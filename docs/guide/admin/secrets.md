# Secrets

Model keys, access tokens and other credentials are workspace secrets. This page covers where they're stored, how runners and their runs get them, and the encryption key that protects them.

## The Secrets page

Settings → Secrets lists the workspace's secrets in groups: model keys, ChatGPT logins, cloud accounts for model deployments, and other secrets. Keys added in setup or in a runner form show up here too.

Choose Add Secret to create one:

- Name: the name it goes by, usually the environment variable it becomes, such as `ANTHROPIC_API_KEY`.
- Model key from: for an AI model key, the provider that issued it. Leave as none for other secrets.
- Where it's stored:
  - Store the value (encrypted): kept encrypted in the Viberglass database. The default, and the one to use on Docker and Kubernetes.
  - Server environment variable (advanced): read from an environment variable that's already set on the Viberglass server.
  - AWS SSM Parameter Store: stored in SSM as a SecureString, where ECS and Lambda workers read it.

Editing a secret leaves its value as it is unless you enter a new one.

## How runs get secrets

Secrets aren't handed to every run. A runner names the secrets it uses, each as an environment variable: its model key, and any extra variables under Advanced. A schedule's task template can add more. One secret can back several variables.

When a run starts, its worker gets exactly the secrets its runner names, and nothing else. On Kubernetes, the worker fetches them from the backend with a token that only works for that run while it's active; they're never written into the Job.

Inside the run, the coding agent sees less than the worker. It gets its model key and the runner's extra variables, but not repository tokens, private keys, passwords or client secrets: the worker clones, pushes and opens the pull request itself. See [Security](security.md).

Keep credentials in secrets, not in task descriptions, comments or agent instructions: everything on a task can reach the agent and the people on it.

## The encryption key

Secrets stored in the database are encrypted with AES-256-GCM using the backend's `SECRETS_ENCRYPTION_KEY`. Webhook secrets use `WEBHOOK_SECRET_ENCRYPTION_KEY`.

- Set both to long, random values on any installation people share. The Docker quick start uses fixed development values.
- Back them up with the database. A restored database is useless without the same keys.
- Changing a key without re-encrypting makes the stored values unreadable. Re-enter the secrets after a change.
