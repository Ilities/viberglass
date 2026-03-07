# Platform Backend Architecture

## Scope
This document describes the current architecture of `apps/platform-backend` as implemented today.

## Tech Stack
- Runtime: Node.js + TypeScript (`tsx` in dev, `tsc` for build output)
- API framework: Express
- Database: PostgreSQL via Kysely
- Cloud integrations: AWS Lambda, ECS, S3, SSM, CloudWatch
- Testing: Jest (unit + integration)

## Runtime Composition

### Boot flow
1. `src/api/server.ts` loads env, optionally runs migrations (`RUN_MIGRATIONS_ON_STARTUP`), starts HTTP server.
2. `src/api/app.ts` configures middleware, auth, route modules, error handlers.
3. Background sweepers start with the server:
- `OrphanSweeper` marks long-running jobs as failed.
- `HeartbeatSweeper` marks stale active jobs as failed.

### HTTP composition root
`src/api/app.ts` wires:
- Security middleware (`helmet`, CORS, malicious request blocker)
- Request parsing and raw-body capture for webhook signature verification
- Passport auth initialization
- Route modules mounted under `/api/*`

## Core Domains

### 1) Tickets and Workflow
Key route: `src/api/routes/tickets.ts` (composition root)
Route modules:
- `src/api/routes/tickets/crudMediaRoutes.ts`
- `src/api/routes/tickets/workflowPhaseRoutes.ts`
- `src/api/routes/tickets/executionRoutes.ts`

Primary responsibilities:
- Ticket CRUD and filtering
- Workflow phase state (`research -> planning -> execution`)
- Phase document storage and approval
- Phase run triggers (research/planning generation)
- Execution run trigger
- Media access and signed URL generation
- Ticket domain error normalization via typed service errors (`TicketServiceError`) and shared route mapping (`src/api/routes/tickets/routeErrors.ts`)
- Non-ticket domain error normalization for secrets/jobs via typed service errors (`SecretServiceError`, `JobServiceError`)

Core services:
- `TicketResearchService`
- `TicketPlanningService`
- `TicketExecutionService`
- `TicketPlanningApprovalService`
- `TicketPhaseDocumentService`
- `TicketWorkflowService`
- `TicketWorkflowOverrideService`
- Shared run setup orchestrator:
  - `src/services/ticketRunOrchestration.ts` (`prepareTicketRunContext`)

Persistence:
- `TicketDAO`
- `TicketPhase*DAO` family

### 2) Jobs and Worker Callbacks
Key route: `src/api/routes/jobs.ts`

Primary responsibilities:
- Create/list/get/delete jobs
- Return bootstrap payload to workers
- Receive result/progress/log callbacks from workers
- Persist worker auth cache via secrets

Core service:
- `JobService`

Callback security:
- Tenant guard (`tenantMiddleware`)
- Callback token guard (`validateCallbackToken`)

Related tables:
- `jobs`
- `job_progress_updates`
- `job_log_lines`

### 3) Worker Invocation
- Orchestrator: `src/workers/WorkerExecutionService.ts`
- Invoker factory: `src/workers/WorkerInvokerFactory.ts`
- Invokers:
  - `DockerInvoker`
  - `LambdaInvoker`
  - `EcsInvoker`

Execution model:
- Ticket/phase services submit a job first.
- Worker is invoked asynchronously.
- Worker sends lifecycle callbacks back to `/api/jobs/:jobId/*`.

### 4) Clankers and Provisioning
Key route: `src/api/routes/clankers.ts`

Core provisioning architecture:
- `ClankerProvisioningOrchestrator`
- `ProvisioningStrategyResolver`
- Strategy handlers:
  - Docker
  - ECS
  - Lambda
- AWS/Docker client adapters under `src/provisioning/adapters`

Clankers represent runnable worker targets with:
- Deployment strategy + config
- Agent type
- Secret references
- Instruction files

### 5) Integrations and Webhooks
Routes:
- `src/api/routes/integrations.ts` (integration CRUD, linking, webhook config, delivery listing/retry)
- `src/api/routes/webhooks.ts` (provider webhook ingress)

Inbound webhook pipeline:
1. Route receives webhook and forwards headers/body/raw body.
2. `WebhookService` resolves provider and config.
3. Signature verification runs through provider + secret service.
4. Deduplication checks delivery id.
5. Provider-specific inbound processor maps event -> ticket/job.
6. Delivery attempt lifecycle is persisted.

Outbound feedback pipeline:
- `FeedbackService` + `feedback/*` orchestrates posting job/approval updates to external systems.

Key components:
- `ProviderRegistry`
- `WebhookConfigResolver`
- `InboundEventProcessorResolver`
- `ProviderWebhookPolicyResolver`
- `WebhookRetryService`

### 6) Projects, Secrets, Users
- Projects route: `src/api/routes/projects.ts`
- Secrets route: `src/api/routes/secrets.ts`
- Auth/users routes: `src/api/routes/auth.ts`, `src/api/routes/users.ts`

Notable supporting services:
- `SecretService` (env/database/SSM secret abstraction)
- `InstructionStorageService` (S3/filesystem instruction files)
- `FileUploadService` + `TicketMediaExecutionService` (media storage and worker access prep)

## Data Model (High-level)
Database type map is in `src/persistence/types/database.ts`.

Important table groups:
- Core entities: `projects`, `tickets`, `clankers`, `deployment_strategies`, `integrations`
- Execution: `jobs`, `job_progress_updates`, `job_log_lines`
- Webhooks: `webhook_provider_configs`, `webhook_delivery_attempts`
- Workflow docs: `ticket_phase_documents`, `ticket_phase_runs`, `ticket_phase_approvals`, `ticket_phase_document_revisions`, `ticket_phase_document_comments`
- Security/auth: `secrets`, `users`, `user_sessions`, `user_projects`

## Primary Request/Execution Flows

### Ticket execution flow
1. Client calls `POST /api/tickets/:id/run`.
2. `TicketExecutionService` validates phase gates and clanker availability.
3. Job is persisted via `JobService.submitJob`.
4. Bootstrap payload is saved for worker bootstrap retrieval.
5. Worker is invoked by `WorkerExecutionService`.
6. Worker reports progress/results to `/api/jobs/:jobId/*` callback endpoints.
7. Job and ticket state are updated from callback handlers.

### Phase generation flow (research/planning)
1. Client calls `POST /api/tickets/:id/phases/{research|planning}/run`.
2. Service builds AI task prompt + context.
3. Job submitted and linked to phase run history.
4. Worker callback with `documentContent` persists phase document.

### Inbound webhook flow
1. Provider webhook hits `/api/webhooks/{provider}`.
2. `WebhookService` validates signature and config.
3. Deduplication and delivery tracking run.
4. Inbound processor creates ticket and optional job.

## Configuration Surface
Configuration is currently read directly from `process.env` across multiple modules.
Main categories:
- API/server behavior (port, auth, CORS, migration-on-start)
- DB connection
- AWS providers (region, bucket, ECS/Lambda references)
- Secrets and credential sources
- Worker execution behavior

## Test Layout
- Unit tests: `src/__tests__/unit/**`
- Integration tests: `src/__tests__/integration/**`
- Helpers: `src/__tests__/helpers/**`

## Current Architectural Characteristics
- Clear module separation exists by domain, but many files are still large.
- Ticket route surface is now split into dedicated submodules, reducing hotspot size in the primary router.
- A lot of dependency construction happens at file scope or inside services instead of a single composition root.
- Multiple legacy and new pathways coexist (especially integrations/webhooks), increasing cognitive load for contributors.
