# Viberator

## What This Is

An agent orchestrator and ticket management platform. Users create bug tickets that coding agents automatically fix, with results flowing back through the system. Supports projects spanning multiple repositories, integration with common SCMs and legacy ticketing systems, and configurable clankers (instruction sets) that define how agents run.

## Core Value

Users can create tickets that coding agents automatically fix, with the entire flow—ticket creation, agent execution, PR creation, and status updates—working end-to-end.

## Requirements

### Validated

<!-- Shipped and confirmed valuable. -->

<details>
<summary>v1.0 MVP — Shipped 2026-01-23</summary>

**Worker Execution:**
- ✓ Platform invokes Lambda/ECS/Docker workers asynchronously via AWS SDK
- ✓ Platform handles worker execution failures with retry logic
- ✓ Workers POST execution results to platform API
- ✓ Workers fetch SCM credentials from SSM, load clanker configs

**Result Callback:**
- ✓ Workers POST results back to platform API with job status updates
- ✓ Frontend polls and displays current job status

**Webhook Triggers:**
- ✓ Platform receives and validates GitHub webhook events
- ✓ Webhook signature verification prevents unauthorized requests
- ✓ Webhook payload creates tickets and triggers worker execution

**Clanker Status:**
- ✓ Platform displays clanker static status (resource exists, connected, ready)
- ✓ Workers POST heartbeat and progress updates during execution
- ✓ Frontend shows real-time status updates

**Local Development:**
- ✓ Docker compose environment starts all services locally
- ✓ Development documentation explains local setup

**Production Deployment:**
- ✓ Pulumi stack provisions complete AWS infrastructure
- ✓ CI/CD pipeline builds and deploys container images
- ✓ Environment-specific configuration (dev, staging, prod)
- ✓ Secret management uses provider pattern

**Multi-Tenant Security:**
- ✓ CredentialProvider interface defines cloud-agnostic credential storage
- ✓ Workers isolate operations by tenantId
- ✓ API validates tenant access to resources

</details>

### Active

<!-- Current scope. Building toward these. -->

None — v1.0 complete, awaiting next milestone definition.

### Out of Scope

<!-- Explicit boundaries. Includes reasoning to prevent re-adding. -->

- **User authentication** — Open API for v1.0, defer to future milestone
- **Real-time WebSocket** — Polling sufficient for v1.0
- **Multi-cloud credential providers** — Azure Key Vault, GCP Secret Manager deferred to v2.0
- **SQS job queue** — Direct API calls simpler for current architecture

## Context

**Current state:** v1.0 MVP shipped. Complete integration of worker execution flow, webhook triggers, multi-tenant security, CI/CD deployment, and secret management.

**Shipped:** 2026-01-23

**Technical environment:** TypeScript 5.x, Node.js 20+, PostgreSQL 16+, AWS (ECS Fargate, Lambda, SSM, KMS, Amplify), Pulumi for infrastructure, GitHub Actions with OIDC.

**Clanker concept:** Clankers are instruction sets configured by users. Workers execute agents based on clanker configuration with credentials fetched from SSM. Status flows back via heartbeat/progress updates.

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
*Last updated: 2026-01-23 after v1.0 milestone*
