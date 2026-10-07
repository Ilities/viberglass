# Manual end-to-end test suite

A hands-on pass over the whole product: local first, then the integrations, the agent harnesses and model endpoints, rented GPU models, and the AWS and Kubernetes deployments. Each test has an ID, what it needs, numbered steps and what you should see. Record results in the log at the bottom (or a copy of it per run).

The automated Playwright smoke suite (`npm run test:e2e`, specs in `tests/e2e/tests/smoke/`) covers many core flows with a fake agent. This suite exists for what automation doesn't reach: real models, real GitHub/Slack/trackers, clients outside the browser, cloud compute and deployments.

## Contents

- [Files](#files)
- [Environments](#environments)
- [Accounts and credentials](#accounts-and-credentials)
- [Conventions](#conventions)
- [Suggested order](#suggested-order)
- [Known blockers before you start](#known-blockers-before-you-start)
- [Results log](#results-log)

## Files

| File | Covers |
|---|---|
| [00-clean-machine.md](00-clean-machine.md) | A stranger's first hour from the public docs: local install, first PRs on real repositories, Kubernetes and AWS from nothing, a cold user session |
| [01-local-core.md](01-local-core.md) | Accounts and people, first-run setup, spaces, tasks and the agent conversation, steering, runners, tools, admin pages, schedules, notifications, resilience |
| [02-integrations-and-clients.md](02-integrations-and-clients.md) | GitHub (PRs, reviews, merge, webhooks), Jira/Shortcut/custom webhooks, Slack, MCP endpoint, CLI, Chrome extension, run-record export |
| [03-agents-and-model-endpoints.md](03-agents-and-model-endpoints.md) | Every harness with the credentials available; workspace model endpoints, auth schemes, discovery, cold start |
| [04-gpu-rented-models.md](04-gpu-rented-models.md) | An open-weight model served by vLLM on a rented GPU, used as a model endpoint; Bedrock API keys |
| [05-aws.md](05-aws.md) | Pulumi deploy of base/platform/workers, backend and frontend delivery, ECS and Lambda runners, SSM, S3, SES, logs, teardown |
| [06-kubernetes.md](06-kubernetes.md) | The Helm chart on kind and on a real cluster, the Kubernetes runner, reconciliation, network policy, upgrades |
| [07-cross-cutting.md](07-cross-cutting.md) | Permissions matrix, secret hygiene, accessibility, responsive and themes, browsers, upgrades and migrations, backup and restore |

## Environments

| ID | What | How to get it |
|---|---|---|
| **L-REV** | Local review instance with fixtures (people, spaces, tasks, 14 runners) | http://localhost:3200; `python3 docs/ux/v1-review/harness/instance.py status\|restart` |
| **L-NEW** | Local empty instance (no users) | http://localhost:3201; `python3 .tmp/ux-fresh/instance.py status\|restart`; reset steps in [../../ux/v1-review/MANUAL-TESTING.md](../../ux/v1-review/MANUAL-TESTING.md#resetting) |
| **L-DEV** | The docker compose dev stack | `docker compose up -d` → http://localhost:3000, API :8888; see [../local-development.md](../../local-development.md) |
| **TUNNEL** | A public HTTPS URL to a local backend, for webhooks and Slack | `cloudflared tunnel --url http://localhost:8888` (or ngrok); set `PLATFORM_API_URL`/webhook URLs to it |
| **AWS-DEV** | The AWS dev deployment | [05-aws.md](05-aws.md) |
| **K8S-KIND** | The Helm chart on a local kind cluster | [06-kubernetes.md](06-kubernetes.md) |
| **K8S-CLOUD** | The Helm chart on a managed cluster (e.g. OVHcloud MKS) | [06-kubernetes.md](06-kubernetes.md) |
| **GPU** | A rented GPU running vLLM | [04-gpu-rented-models.md](04-gpu-rented-models.md) |

Local mail for L-REV/L-NEW lands in http://localhost:8125. L-DEV has Mailpit under the `mail` compose profile.

## Accounts and credentials

Gather these first; tests list which they need. Keep keys outside the repo where possible, and revoke them after the run.

| Need | Used by |
|---|---|
| z.ai GLM coding plan key (`.zai-token` holds one) | Most real agent runs, model endpoints |
| OpenCode Go key | Native-provider setup path (OpenCode) |
| A GitHub account with a **disposable test repository**, a fine-grained token with Contents + Pull requests read/write, and a second read-only token | Setup, code turns, PRs, merges, webhooks, CLI |
| A Slack workspace where you can create an app | Slack tests |
| Jira and/or Shortcut test projects (optional) | Tracker webhooks |
| A ChatGPT account (optional) | Codex ChatGPT login |
| Native keys for Anthropic/OpenAI/Gemini/Mistral/Moonshot (optional) | Native-provider harness rows in 03 |
| AWS account, a Route53 hosted zone with a domain you control, Pulumi CLI, AWS CLI v2, Docker with buildx | 05 |
| kind, kubectl, Helm 3, ~40 GB free disk; for the cloud cluster an account with a managed Kubernetes service, a registry, S3-compatible storage and Postgres | 06 |
| A GPU rental account (Verda, OVHcloud AI Deploy, RunPod or similar) and a Hugging Face token for gated models | 04 |
| Chrome or Chromium | Chrome extension |
| An MCP client (MCP Inspector, Claude Code, or similar) | MCP endpoint |

## Conventions

- **IDs** are `<AREA>-<NN>` (e.g. `TASK-07`). Keep them stable so results compare between runs.
- **Needs** lists the environment, accounts and earlier tests a test depends on.
- **Expect** is the pass condition. Anything else is a failure: record what you saw and, if you can, the run ID (`/spaces/<space>/runs/<jobId>`), the time, and the browser console or backend log lines.
- **Known issue** marks behaviour the code is already known to get wrong. Record whether it still happens; don't stop the run for it.
- **Not available yet** marks planned features with nothing to test. Skip them and leave the row as `n/a`.
- Use a separate browser profile or private window per person, so you can switch without logging out.
- Agent runs cost model tokens. GLM 4.7 Flash is cheap; native providers may not be.

## Suggested order

0. 00 before a release, on clean machines and accounts.
1. 01 on L-NEW and L-REV (one to two days with real models).
2. 03 on L-REV (harness matrix, endpoints), then 04 if a GPU is available.
3. 02 on L-DEV + TUNNEL (needs the GitHub test repo and Slack app).
4. 07 alongside the above.
5. 05 on AWS-DEV, then repeat the 01 smoke subset there.
6. 06 on K8S-KIND, then K8S-CLOUD, repeating the 01 smoke subset.

**Smoke subset** to repeat on every deployment: AUTH-01, AUTH-03, SETUP-01 or SETUP-02, SETUP-03, SPACE-01, TASK-01, TASK-04, TASK-07, TASK-09, TASK-10, RUNNER-01, NOTIF-01, GH-03, GH-05.

## Known blockers before you start

Found while reading the code for this suite (2026-10-05). Check them first; several stop a deployment test outright.

- **Kubernetes** support was merged into `main` on 2026-10-05 (the merge commit may still be pending); its migration is now `101_kubernetes_deployment_strategy`. Clusters installed from the old branch must be recreated. See [06-kubernetes.md](06-kubernetes.md#k8s-00-merge-gate).
- **GPU deployments created by Viberglass** (Verda/OVH ModelHost) and **Bedrock role auth** are not built. Only hand-made endpoints are testable.
- **AWS**:
  - The infra workflows (`pulumi-*.yml`) point at a missing `infrastructure/` folder, so deploy infra by hand.
  - Login over HTTPS likely needs `apiDomain` + `appDomain` + `route53ZoneId`.
  - Managed ECS workers don't get `AWS_S3_BUCKET`, so conversation state may not survive between turns.
  - `deploy-backend-prod.yml` smoke steps are stale.
  - Details are in [05-aws.md](05-aws.md#known-issues).
- **Password reset email**: `/forgot-password` only logs the request; resets are admin-issued links.

## Results log

Copy this table into a run file (e.g. `results/2026-10-xx-local.md`) or a spreadsheet.

| ID | Env | Date | Tester | Result (pass / fail / known issue / blocked / n/a) | Notes, run ID, issue link |
|---|---|---|---|---|---|
| AUTH-01 | L-NEW | | | | |
