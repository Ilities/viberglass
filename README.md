# Viberglass

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-20+-green.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)
[![GitHub issues](https://img.shields.io/github/issues/Ilities/viberglass)](https://github.com/Ilities/viberglass/issues)

An open-source, self-hosted workspace where people and coding agents work on the same tasks together. Viberglass is for software companies: product, design, QA, support and engineering bring the work, the agents do it, and everyone sees and shapes it in one shared thread, from the first question to the merged pull request.

Coding agents are good at writing code. They're bad at knowing what your company actually wants. In Viberglass, the people who know what's wanted stay in the conversation: they're asked when the agent is unsure, they review its plan before any code is written, and they decide when it's done. Nobody needs repository access or a dev environment to take part.

[Documentation](docs/) | [Architecture](docs/ARCHITECTURE.md) | [Contributing](CONTRIBUTING.md) | [Security](SECURITY.md)

## How a task works

1. Someone asks for something. A PM, a support lead or an engineer creates a task in a space, from the web, Slack (`/viberator`) or an issue tracker. They own it, and can bring in reviewers and watchers.
2. The agent writes a plan. It reads the code and writes one document: what it found and what it would change. When it's missing something, it asks the right person in the thread and waits for their answer.
3. The team agrees on it. Reviewers comment on lines of the plan, suggest edits, @mention a designer or an engineer, and ask the agent to revise. Everyone sees the same plan, the same comments and the same history.
4. The agent builds it and opens a GitHub pull request for engineering's usual review. Large plans can be built in parts, with a PR per part.
5. The PR is merged and the task closes. Anyone can ask for another round on the same task; it keeps its conversation and its branch.

An engineer can step in at any point: pause the agent, take over its branch locally with `viberglass checkout` (`npm install -g viberglass`), and hand it back.

## Features

- One thread per task: people's messages, the agent's questions, plan revisions, comments, runs and PRs, in order, for everyone on the task.
- Home shows whose move it is: a question from the agent, a review request, a mention, a failed run. Notifications reach you in Slack or by email.
- Roles that fit a company: members, guests and read-only viewers; open or private spaces; owners, reviewers and watchers per task. Not everyone who can comment can ask for code.
- Slack as a front door: start tasks, answer the agent's questions, discuss the plan and start the build from a Slack thread that stays in step with the task.
- Bring your own agent and model: eight coding agent harnesses side by side, with provider keys, coding plans, or any OpenAI- or Anthropic-compatible endpoint.
- Runs you can inspect: what the agent thought and did, its tool calls, the prompt it got, the worker log, and cost and token usage where the harness reports them.
- Workspace controls: shared secrets, MCP servers and skills for agents, agent instructions per space, API tokens and an audit log.
- Schedules for recurring agent work.

## Agents and models

| Harness                                                       | Models                                                            |
|---------------------------------------------------------------|-------------------------------------------------------------------|
| [Claude Code](https://docs.anthropic.com/en/docs/claude-code) | Anthropic                                                         |
| [OpenAI Codex](https://github.com/openai/codex)               | OpenAI, including ChatGPT sign-in                                 |
| [Google Antigravity](https://antigravity.google)              | Google                                                            |
| [Qwen Code](https://github.com/QwenLM/qwen-code)              | Alibaba                                                           |
| [Mistral Vibe](https://github.com/mistralai/mistral-vibe)     | Mistral                                                           |
| [Kimi Code](https://github.com/MoonshotAI/kimi-code)          | Moonshot                                                          |
| [OpenCode](https://github.com/opencode-ai/opencode)           | OpenCode Go, OpenRouter, DeepSeek, xAI, Groq and custom endpoints |
| [Pi](https://pi.dev)                                          | Many providers and custom endpoints                               |

Custom model endpoints: add a URL, an API format and a key under the runner form, and OpenCode and Pi runners can use it. This covers hosted open-weight models and anything you serve yourself.

Model deployments (experimental): Viberglass can create a GPU container on [Verda](https://verda.com) running vLLM, scale it to zero when idle and wake it when a run needs it.

## Integrations

|                   |                                                 |
|-------------------|-------------------------------------------------|
| Pull requests     | GitHub                                          |
| Task sources      | GitHub Issues, Shortcut, custom webhooks        |
| Chat              | Slack                                           |
| Compute           | Docker, Kubernetes, AWS ECS Fargate, AWS Lambda |

---

## Quick start

Requires Docker Engine 20.10+ and Docker Compose v2.

```bash
git clone https://github.com/Ilities/viberglass.git
cd viberglass
docker compose up
```

Open http://localhost:3000. The first visit creates the administrator account, then setup walks you through:

1. A model key: pick a provider and paste a key, or point at a custom endpoint.
2. A repository: a GitHub repository and a fine-grained token that can push a branch and open a pull request. Setup links to GitHub's token form with the permissions filled in.
3. A space for the repository's tasks.
4. A default agent, created for you and run on your local Docker using the published worker images.
5. A first task.

There's also an "Explore a demo workspace" option on setup's first screen, with sample tasks and no keys needed.

> This compose file is for trying Viberglass on your own machine. It runs the development servers and uses fixed database and encryption keys. Don't expose it to a network. For a shared installation, use [one server](#one-server), [Kubernetes](#kubernetes) or [AWS](#aws).

The backend runs database migrations on startup. Optional services (Mailpit for email, Langfuse for traces) and Slack setup are in [local development](docs/local-development.md).

---

## Configuration

The backend reads its environment from `docker-compose.yml`; optional settings go in a `.env` file in the repository root. Running the backend outside compose, it reads `apps/platform-backend/.env` (start from `.env.example`).

| Variable                                                  | Description                                                     |
|-----------------------------------------------------------|-----------------------------------------------------------------|
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | PostgreSQL connection                                           |
| `SECRETS_ENCRYPTION_KEY`                                  | Encrypts stored credentials at rest                             |
| `WEBHOOK_SECRET_ENCRYPTION_KEY`                           | Encrypts webhook secrets                                        |
| `PORT`                                                    | Backend port (default: `8888`)                                  |
| `PLATFORM_FRONTEND_URL`                                   | The app's address, for links in Slack and email                 |
| `EMAIL_FROM` + `SMTP_URL` (or `EMAIL_PROVIDER=ses`)       | Email for invites and notifications; off when unset             |
| `SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET`                 | Slack app (commands, threads, DMs)                              |
| `VIBERATOR_WORKER_REGISTRY`                               | Where worker images are pulled from (default `ghcr.io/ilities`) |
| `VIBERGLASS_DATA_DIR`                                     | Where compose keeps task media and saved agent conversations (default `~/.viberglass`) |

Agent credentials are stored as workspace secrets (encrypted in the database, or in AWS SSM) and attached to runners in Settings → Agents & runners. See [portable storage and credentials](docs/portable-storage-and-credentials.md).

---

## Deployment

### One server

[`docker-compose.prod.yml`](docker-compose.prod.yml) runs the published images on one Linux server, with the database password and encryption keys from `.env` and optional HTTPS through Caddy:

```bash
cp .env.production.example .env   # fill in the address, password and keys
docker compose -f docker-compose.prod.yml --profile https up -d
```

The steps, backups and upgrades are in [Install with Docker](docs/guide/admin/install-docker.md#on-a-server).

### Kubernetes

A Helm chart in [`infra/kubernetes/chart`](infra/kubernetes/chart) installs the backend, frontend and migrations; each agent run is a Kubernetes Job. Bring PostgreSQL, S3-compatible storage, an ingress and TLS, or use the bundled PostgreSQL and MinIO for a local cluster:

```bash
python3 infra/kubernetes/scripts/local.py
```

- [Local Kubernetes](docs/local-kubernetes.md): prerequisites, port forwards and a full-platform smoke test.
- [Install on your Kubernetes cluster](docs/guide/admin/install-kubernetes.md): step-by-step setup, Secrets, production values, TLS, installation and your first task.
- [Kubernetes operations](docs/kubernetes-deployment.md): upgrades, backups, diagnostics and cleanup.
- [OVHcloud plan](docs/kubernetes-ovh-deployment-plan.md): the managed-cluster target we're validating against.

### AWS

Three Pulumi stacks in [`infra/`](infra/README.md), deployed in order:

```bash
./infra/setup-pulumi-state.sh
pulumi login s3://viberglass-pulumi-state

cd infra/base && npm install && pulumi stack select dev && pulumi up       # VPC, KMS, logging
cd infra/platform && npm install && pulumi stack select dev && pulumi up   # ECS backend, RDS, S3, Amplify frontend
cd infra/workers && npm install && pulumi stack select dev && pulumi up    # Lambda and ECS workers
```

Runners on ECS or Lambda are created under Settings → Agents & runners; the platform creates the task definition or function, with networking from the stack outputs.

### Worker images

Every agent runs in a worker image: a shared base plus one harness.

- Docker and Kubernetes use the public images on GHCR (`ghcr.io/ilities/viberator-worker-<agent>`, `linux/amd64` and `linux/arm64`), published by `publish-worker-images` on pushes to `main` and on releases. The backend and frontend images (`viberglass-backend`, `viberglass-frontend`) are published the same way by `publish-platform-images`. Set `VIBERATOR_WORKER_REGISTRY` empty to use images you built locally.
- AWS pulls from ECR. The `deploy-viberators` workflow pushes them, or by hand:

```bash
./infra/workers/scripts/setup-harness-images.sh dev multi-agent   # one image with every harness
./infra/workers/scripts/setup-harness-images.sh prod all          # every image
```

### Database migrations

The backend migrates on startup. To run them yourself:

```bash
npm run migrate -w @viberglass/platform-backend                    # development
./apps/platform-backend/scripts/run-migrations.sh prod --dry-run   # staging / production
./apps/platform-backend/scripts/run-migrations.sh prod
```

Check that a database backup exists before migrating production.

---

## Security model

Agents run code from your repositories with your credentials, so it matters where those go.

- Each run gets its own container (or Kubernetes Job, ECS task or Lambda invocation), started for that run and removed after it.
- Credentials are stored encrypted (AES-256-GCM in PostgreSQL, or AWS SSM) and only the secrets bound to a runner reach its runs. Kubernetes workers fetch them at start from the backend with a token scoped to the run. They are not written into the Job spec.
- The agent doesn't see worker credentials. Worker-only credentials, such as a ChatGPT sign-in, are kept out of the agent's environment. Workers handle integration communication towards GitHub etc.

Report vulnerabilities as described in [SECURITY.md](SECURITY.md), not in public issues.

---

## Development

[Local development](docs/local-development.md) and [TESTING.md](TESTING.md) cover the dev stack and test suites. In short:

```bash
(cd apps/platform-backend && npx jest --maxWorkers=2 src/__tests__/unit)   # backend unit tests
npm run test:e2e                                                           # smoke suite, starts its own stack
```

## Community

- [GitHub Issues](https://github.com/Ilities/viberglass/issues): bug reports and feature requests
- [GitHub Discussions](https://github.com/Ilities/viberglass/discussions): questions and ideas
- [Contributing guide](CONTRIBUTING.md)

## License

Viberglass is licensed under the [GNU Affero General Public License v3.0](LICENSE). You can use, modify and self-host it freely. If you modify it and let people use it over a network, you must offer them the source of your modified version under the same license.
