# Viberator Architecture

## What is a Viberator?

A **viberator** is an ephemeral, containerized AI worker that receives a coding task (typically a bug fix), clones the target repository, runs an AI coding agent against it, and produces a pull request with the fix. Each viberator instance runs a single job and exits.

The system is an **AI Agent Orchestrator** -- it abstracts over multiple AI coding CLIs (Claude Code, Qwen, Gemini, Codex, OpenCode, Kimi Code, Mistral Vibe) behind a unified interface, selects the best agent for a given task, and manages the full lifecycle from repo clone through PR creation.

---

## System Overview

```
                        ┌─────────────────────────┐
                        │    Platform Frontend     │
                        │  (React/Vite on Amplify) │
                        └────────────┬────────────┘
                                     │
                                     ▼
                        ┌─────────────────────────┐
                        │    Platform Backend      │
                        │  (Express/Kysely/PG)     │
                        │                          │
                        │  - Ticket management     │
                        │  - Job submission        │
                        │  - Clanker management    │
                        │  - Worker invocation     │
                        │  - Callback handling     │
                        └─────┬───────────┬───────┘
                              │           │
                   ┌──────────┘           └──────────┐
                   ▼                                  ▼
        ┌─────────────────┐                ┌─────────────────┐
        │  Worker Invoker │                │  Worker Invoker  │
        │  (Lambda/ECS/   │                │  (Lambda/ECS/    │
        │   Docker)       │                │   Docker)        │
        └────────┬────────┘                └────────┬─────────┘
                 │                                   │
                 ▼                                   ▼
        ┌─────────────────┐                ┌─────────────────┐
        │   Viberator     │                │   Viberator      │
        │   Worker        │                │   Worker         │
        │                 │                │                  │
        │  1. Clone repo  │     callbacks  │  1. Clone repo   │
        │  2. Select agent│ ◄────────────► │  2. Select agent │
        │  3. Run agent   │                │  3. Run agent    │
        │  4. Create PR   │                │  4. Create PR    │
        └─────────────────┘                └──────────────────┘
```

---

## Repository Structure (Viberator-scoped)

```
viberator/                          # Monorepo root
├── apps/
│   └── viberator/                  # The viberator worker application
│       ├── src/
│       │   ├── agents/             # AI agent implementations
│       │   ├── orchestrator/       # Agent selection & execution
│       │   ├── config/             # Configuration (env/SSM)
│       │   ├── services/           # Git operations
│       │   ├── scm/                # SCM auth (GitHub/GitLab/Bitbucket)
│       │   ├── workers/
│       │   │   ├── entrypoints/    # CLI and Lambda entry points
│       │   │   ├── core/           # Job execution pipelines
│       │   │   ├── runtime/        # Auth, logging, instruction files
│       │   │   └── infrastructure/ # CallbackClient, CredentialProvider
│       │   ├── types/              # Domain types
│       │   └── utils/
│       ├── dist/                   # Bundled output (cli-worker.js, lambda-handler.js)
│       └── tsup.config.ts          # Build config
│
├── packages/
│   └── types/                      # Shared type definitions
│       └── src/
│           ├── clanker.ts          # AgentType, Clanker, ClankerStatus
│           ├── clankerConfig.ts    # Deployment strategies (Docker/ECS/Lambda)
│           ├── job.ts              # JobKind (research/planning/execution)
│           ├── workerImages.ts     # Worker image variant resolution
│           └── workerImageCatalog.json
│
├── infra/
│   ├── base/                       # Shared AWS networking/security (Pulumi)
│   ├── platform/                   # Backend ECS, RDS, ALB, Amplify (Pulumi)
│   └── workers/                    # Worker Lambda, ECS cluster, SQS (Pulumi)
│       ├── docker/                 # All worker Dockerfiles
│       │   ├── base/               # Foundation image
│       │   ├── agents/             # Per-agent images (extend base)
│       │   └── tasks/              # Specialized images (testing, deployment)
│       └── scripts/                # Build/push/setup scripts
│
└── apps/platform-backend/          # Backend that manages clankers and dispatches jobs
    └── src/
        ├── workers/                # Worker invocation (Lambda/ECS/Docker invokers)
        ├── provisioning/           # Clanker provisioning strategies
        ├── persistence/clanker/    # Clanker DAO
        └── services/               # JobService, phase services
```

---

## Core Concepts

### Clanker
A **clanker** is a configured worker target -- a deployment configuration that pairs a **deployment strategy** (Docker, ECS, Lambda) with an **agent type** (claude-code, qwen-cli, etc.), instruction files, and secret references. The platform backend manages clankers and uses them to invoke viberator workers.

### Agent
An **agent** is an AI coding CLI tool. Each agent has its own implementation class extending `BaseAgent`, which handles the specifics of invoking that CLI and parsing its output. Currently supported:

| Agent | CLI Tool | Provider |
|-------|----------|----------|
| claude-code | `claude` | Anthropic |
| qwen-cli | `qwen-code` | Alibaba |
| codex | `codex` | OpenAI |
| opencode | `opencode` | OpenCode.ai |
| kimi-code | `kimi-code` | Moonshot |
| gemini-cli | `gemini` | Google |
| mistral-vibe | `mistral-vibe` | Mistral |

### Job
A **job** represents a unit of work. Jobs have three kinds:
- **research** -- Analyze code to understand a bug (produces a document)
- **planning** -- Create an implementation plan (produces a document)
- **execution** -- Make the actual code fix and create a PR

### Ticket Workflow
Tickets flow through phases: **research** -> **planning** -> **execution**. Each phase triggers a job dispatched to a viberator worker. Research and planning produce documents; execution produces a pull request.

---

## Worker Execution Flow

### 1. Job Submission (Platform Backend)
```
Client POST /api/tickets/:id/run
  → TicketExecutionService validates phase gates + clanker readiness
  → JobService.submitJob() persists job (status=queued, callback token generated)
  → Bootstrap payload saved for worker retrieval
  → WorkerExecutionService invokes via WorkerInvokerFactory
    → LambdaInvoker / EcsInvoker / DockerInvoker
```

### 2. Worker Lifecycle (Viberator App)
```
Entry point (cli-handler.ts or lambda-handler.ts)
  → Parse payload (--job-data, --job-file, or --job-ref bootstrap)
  → ViberatorWorker.initialize()
    ├─ CredentialProvider.getCredentials()
    ├─ ConfigManager.loadConfiguration()
    ├─ Initialize GitService, AgentOrchestrator, CallbackClient
    ├─ AgentAuthLifecycle.materialize() (agent-specific auth setup)
    └─ InstructionFileManager.loadFromPayload()
  → Route to job runner by kind:
    ├─ runCodingJob()    -- clone, branch, run agent, create PR
    ├─ runResearchJob()  -- clone, run agent for analysis
    └─ runPlanningJob()  -- clone, run agent for planning
```

### 3. Coding Job Pipeline (runCodingJob.ts)
```
1. Clone repository with SCM auth
2. Create feature branch (naming: viberator/{ticketId}-{slug})
3. Write instruction files to repo (AGENTS.md, etc.)
4. Merge worker settings (project + clanker + override)
5. Build ExecutionContext (bug details, media, research docs, constraints)
6. Select agent (requested or best available)
7. Ensure agent ready (CodexAuthManager for Codex, env vars for others)
8. Execute agent CLI in cloned repo directory
9. If auth failure + retry supported, re-auth and retry once
10. Parse results (changed files, commit hash)
11. Create pull request via GitHub API
12. Send result callback to platform backend
13. Cleanup workspace
```

### 4. Callback Flow (Worker -> Backend)
```
Worker sends callbacks during execution:
  POST /api/jobs/:jobId/progress  -- heartbeat + progress updates
  POST /api/jobs/:jobId/logs      -- log lines (single or batch)
  POST /api/jobs/:jobId/result    -- final success/failure result

Security:
  - X-Tenant-Id header for tenant isolation
  - X-Callback-Token header for job-scoped authentication
  - Retry with exponential backoff
  - Sensitive data redaction (API keys, tokens)
```

---

## Agent Architecture

### Class Hierarchy
```
BaseAgent (abstract)
├── ClaudeCodeAgent
├── QwenCodeAgent
├── CodexAgent
├── OpenCodeAgent
├── KimiCodeAgent
├── GeminiCLIAgent
└── MistralVibeAgent
```

### BaseAgent Responsibilities
- `execute(prompt, context)` -- main entry point with error handling and timing
- `executeCommand(command, args, options)` -- shell command execution with log streaming
- Git operations: clone, branch, commit, push, create PR
- Changed file detection via `git diff`

### Agent-specific Responsibilities
Each agent implements `executeAgentCLI(prompt, context, workDir)` which:
1. Invokes the agent's CLI tool with appropriate flags
2. Passes the prompt and any agent-specific configuration
3. Returns `AgentCLIResult` with output and exit status

### AgentFactory
Maps agent type string to concrete class. Used by `AgentOrchestrator` during job execution.

### AgentOrchestrator
- Builds comprehensive prompts from ExecutionContext (bug description, steps, screenshots, research docs, constraints)
- Selects best agent from available pool based on language compatibility, success rates, cost
- Manages execution with proper error handling and metrics

---

## Configuration

### Configuration Sources (Priority)
1. **Environment variables** -- `.env` or container env
2. **AWS SSM Parameter Store** -- `/viberglass-viberator/agents/{name}/apiKey` etc.
3. **Defaults** -- Hardcoded in ConfigManager

### Key Environment Variables
```
# Agent API keys (at least one required)
ANTHROPIC_API_KEY, QWEN_CLI_API_KEY, OPENAI_API_KEY,
KIMI_API_KEY, MISTRAL_API_KEY, GEMINI_API_KEY

# Platform callback
PLATFORM_API_URL

# AWS
AWS_REGION, SECRETS_SSM_PREFIX, TENANT_CONFIG_PATH_PREFIX

# Worker behavior
LOG_LEVEL, LOG_FORMAT, MAX_CONCURRENT_JOBS, DEFAULT_TIMEOUT
```

---

## Infrastructure

### AWS Resources (Pulumi)

**Base Stack:**
- VPC (10.0.0.0/16) with public/private subnets across 2 AZs
- NAT Gateway (enterprise mode) or public subnet placement
- Security groups: backend, RDS, worker
- KMS key for SSM encryption
- CloudWatch log groups (7/30/90 day retention by env)

**Workers Stack:**
- ECR repositories for each worker image variant
- SQS queue + DLQ for job dispatch
- Lambda function (900s timeout, 2048MB, container image)
- ECS Fargate cluster + task definition (2 vCPU, 4GB)
- Optional Slack app Lambda + DynamoDB

**Platform Stack:**
- ECR repository for backend image
- RDS PostgreSQL (db.t4g.micro -> db.m6g.xlarge by env)
- S3 bucket for uploads with lifecycle policies
- ALB with HTTPS termination + Route53
- Backend ECS service (Fargate)
- Amplify frontend deployment

### Worker Container Images

13 image variants defined in `workerImageCatalog.json`:

| Variant | Purpose | Agents |
|---------|---------|--------|
| base | Foundation (Node.js, git, ripgrep) | none |
| multi-agent | All agents pre-installed (**default**) | all 7 |
| claude | Claude Code only | claude-code |
| lambda | Lambda-optimized with all agents | all 7 |
| ecs | ECS-optimized | via base |
| qwen/gemini/mistral/codex/opencode/kimi | Single-agent variants | respective agent |
| testing | Testing frameworks (jest, vitest, pytest) | none |
| deployment | Deploy tools (kubectl, terraform, AWS CLI) | none |

### Deployment Pipeline
```
Push to main → GitHub Actions
  ├─ deploy-viberators.yml  → Build worker images → Push to ECR
  ├─ deploy-backend-dev.yml → Build backend image → Update ECS service
  └─ pulumi-deploy-dev.yml  → Update infrastructure
```

---

## Security Model

- **Callback tokens**: Per-job cryptographic tokens (32 bytes hex) for worker authentication
- **Tenant isolation**: X-Tenant-Id header validated on all callback endpoints
- **Credential management**: API keys in SSM Parameter Store (SecureString), never in task definitions
- **Log redaction**: Sensitive patterns (API keys, GitHub tokens, Bearer tokens) stripped from forwarded logs
- **Git auth**: SCM tokens injected into clone URLs, not persisted to disk
- **Container isolation**: Non-root user (`viberator`), isolated workspace (`/tmp/viberator-work`)

---

## Reliability

- **Heartbeat sweeper**: Marks jobs as failed if no heartbeat for 5 minutes
- **Orphan sweeper**: Marks jobs as failed if no callback within 30 minutes
- **Retry logic**: Exponential backoff on callback failures (3 retries default)
- **Idempotent callbacks**: 409 on already-terminal jobs is handled gracefully
- **Agent retry**: If agent auth fails and lifecycle supports retry, re-auth and retry once
