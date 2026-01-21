# Viberator

## What This Is

An agent orchestrator and ticket management platform. Users create bug tickets that coding agents automatically fix, with results flowing back through the system. Supports projects spanning multiple repositories, integration with common SCMs and legacy ticketing systems, and configurable clankers (instruction sets) that define how agents run.

## Core Value

Users can create tickets that coding agents automatically fix, with the entire flow—ticket creation, agent execution, PR creation, and status updates—working end-to-end.

## Requirements

### Validated

<!-- Shipped and confirmed valuable. -->

- ✓ **Monorepo architecture** — npm workspaces with orchestrator, platform backend, platform frontend
- ✓ **Agent factory** — Multiple AI agent implementations (Claude Code, Qwen, Codex, Mistral, Gemini)
- ✓ **SCM authentication** — GitHub, GitLab, Bitbucket URL authentication
- ✓ **Ticket CRUD** — Create, read, update, delete tickets with media assets
- ✓ **Project CRUD** — Create, read, update, delete projects spanning multiple repositories
- ✓ **Clanker CRUD** — Create, read, update, delete clanker configurations
- ✓ **Deployment strategy CRUD** — Create, read, update, delete deployment strategies
- ✓ **Job queue infrastructure** — Bull/Redis-backed job queue foundation
- ✓ **Worker execution** — Ephemeral workers run in AWS Lambda and local Docker
- ✓ **Persistence layer** — PostgreSQL with Kysely query builder
- ✓ **Frontend framework** — Next.js 15 with app router and Headless UI components
- ✓ **Infrastructure as Code** — Pulumi stack for ECR, ECS, Lambda, SQS, IAM

### Active

<!-- Current scope. Building toward these. -->

- [ ] **Job queue integration** — Platform creates jobs, workers pick them up via SQS/Bull
- [ ] **Result callback** — Workers post results back to platform API, job status updates
- [ ] **Webhook triggers** — GitHub webhooks create tickets and trigger agent execution
- [ ] **Worker configuration** — Workers fetch SCM credentials from SSM, load clanker configs
- [ ] **Clanker status display** — Static (resource ready) and runtime (heartbeat/progress via API)
- [ ] **End-to-end flow** — User creates ticket → agent fixes bug → PR created → status updated
- [ ] **Local development environment** — Docker compose or similar for local development
- [ ] **Production deployment strategy** — Clear path to deploy entire system to AWS

### Out of Scope

<!-- Explicit boundaries. Includes reasoning to prevent re-adding. -->

- **User authentication** — Platform is currently open, no auth in this milestone
- **Real-time status via WebSocket** — Using polling/POST for status updates, defer WebSocket
- **Multi-cloud support** — AWS only for this milestone
- **Custom agent implementations** — Only existing factory agents (Claude, Qwen, etc.)
- **Advanced clanker types** — Focus on Docker and ECS clankers first, defer Lambda/Fargate specifics

## Context

**Current state:** Individual components work in isolation. CRUD operations function for tickets, projects, and clankers. Agents execute correctly. Workers run in Lambda and Docker locally. However, the integration plumbing is missing—jobs created by the platform aren't picked up by workers, results don't flow back, webhooks don't trigger flows, and worker configuration is incomplete.

**Technical environment:** TypeScript 5.x, Node.js 20+, PostgreSQL 13+, Redis 6+, AWS (ECS Fargate, Lambda, SQS, S3, SSM), Pulumi for infrastructure.

**Clanker concept:** Clankers are instruction sets, not physical entities. Users configure runtime definitions (Docker images, ECS task definitions) with environment variables, agent instructions (agents.md), and secret management. Clankers have static status (resource ready) and runtime status (heartbeat/progress updates posted to API). Projects have default clankers with per-ticket override capability.

## Constraints

- **Multi-tenant** — System must support multiple tenants with credential isolation via `tenantId`
- **Security** — Proper secrets management from the start (SSM Parameter Store, Secrets Manager), no hardcoded credentials
- **Local dev first** — Must run locally for development and testing before AWS deployment
- **Budget** — Minimize AWS costs during development (use local execution, free tier, etc.)
- **Tech stack** — Committed to existing stack (TypeScript, Node, Express, Next.js, PostgreSQL, Redis, Pulumi, AWS)

## Key Decisions

<!-- Decisions that constrain future work. Add throughout project lifecycle. -->

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| API endpoint for status | Workers POST to platform, simple and scalable | — Pending |
| Project-level clanker defaults | Reduce per-ticket configuration, enable override | — Pending |
| Bull + Redis for job queue | Existing infrastructure, reliable queue semantics | — Pending |
| SQS for Lambda worker trigger | AWS native, scales Lambda workers | — Pending |
| SSM for credential storage | Multi-tenant secure credential access | — Pending |

---
*Last updated: 2026-01-19 after initialization*
