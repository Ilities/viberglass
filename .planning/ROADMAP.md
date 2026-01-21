# Roadmap: Viberator

## Overview

This is a brownfield integration project. The core components exist—CRUD operations for tickets/projects/clankers, agent factory, and worker handlers—but the integration plumbing is missing. The roadmap starts by establishing cloud-agnostic multi-tenant security foundations with a provider interface pattern, then builds the worker execution flow (callbacks, invocation, configuration), adds visibility features (status display, polling), integrates external triggers (provider-agnostic webhooks), and finally establishes development and production environments. Each phase delivers a verifiable integration milestone that unblocks subsequent work.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Multi-Tenant Security Foundation** - Cloud-agnostic credential storage interface with AWS SSM provider implementation
- [x] **Phase 2: Result Callback** - Workers POST results to platform API
- [x] **Phase 3: Worker Configuration** - Workers receive config via payload (no platform API calls)
- [x] **Phase 4: Worker Execution** - Platform invokes Lambda/ECS/Docker workers
- [x] **Phase 4.1: Allow Frontend to Invoke Workers** - Frontend initiates jobs from tickets (INSERTED)
- [x] **Phase 4.2: Testing** - Pragmatic testing for worker execution flow (INSERTED)
- [x] **Phase 4.3: Application organization and structural refactoring** - Code organization improvements (INSERTED)
- [x] **Phase 4.4: E2E Flow Verification** - Verify happy path and document infrastructure setup (INSERTED)
- [x] **Phase 5: Job Status Polling** - Frontend displays current job status
- [x] **Phase 6: Clanker Static Status** - Platform displays resource readiness
- [x] **Phase 7: Clanker Runtime Status** - Workers POST heartbeat and progress updates
- [ ] **Phase 8: Webhook Provider Architecture** - Provider-agnostic webhook integration with GitHub as first implementation
- [ ] **Phase 9: Local Development** - Docker compose environment for local development
- [ ] **Phase 10: AWS Infrastructure** - Pulumi stack provisions cloud resources and AWS credential provider
- [ ] **Phase 11: Deployment Process** - CI/CD pipeline and environment-specific configs
- [ ] **Phase 12: Secret Management** - Provider-based secret management for all deployment targets

## Phase Details

### Phase 1: Multi-Tenant Security Foundation

**Goal**: All tenant credentials are securely stored and isolated by tenantId through a cloud-agnostic provider interface, enabling support for AWS, other clouds, and local deployment.

**Depends on**: Nothing (first phase)

**Requirements**: SEC-01, SEC-02, SEC-03, SEC-04

**Success Criteria** (what must be TRUE):
1. CredentialProvider interface defines get/put/delete operations for tenant-scoped credentials
2. AwsSsmProvider implements CredentialProvider using AWS SSM Parameter Store
3. FileProvider implements CredentialProvider for local development using encrypted file storage
4. EnvironmentProvider implements CredentialProvider for environment variable fallback
5. API validates that requests only access resources belonging to the requesting tenant
6. No credential values appear in logs, error messages, or API responses

**Provider Interface Pattern**:
```typescript
interface CredentialProvider {
  get(tenantId: string, key: string): Promise<string | null>
  put(tenantId: string, key: string, value: string): Promise<void>
  delete(tenantId: string, key: string): Promise<void>
}
```

**Plans**: 5 plans in 4 waves

**Status**: Complete (2026-01-19)

Plans:
- [x] 01-01-PLAN.md — Create CredentialProvider interface, EnvironmentProvider, and log redaction utilities
- [x] 01-02-PLAN.md — Implement FileProvider with AES-256-GCM encryption
- [x] 01-03-PLAN.md — Implement AwsSsmProvider with SSM SDK v3
- [x] 01-04-PLAN.md — Create CredentialProviderFactory and tenant validation middleware
- [x] 01-05-PLAN.md — Write comprehensive tests for credential system (TDD)

---

### Phase 2: Result Callback

**Goal**: Workers POST execution results to the platform API, updating job status in the database with commit SHA, PR URL, error messages, and execution logs.

**Depends on**: Phase 1 (tenantMiddleware, logRedaction)

**Requirements**: CB-01, CB-02, CB-03

**Success Criteria** (what must be TRUE):
1. Worker can POST result to /api/jobs/:jobId/result endpoint
2. Endpoint validates tenantId via X-Tenant-Id header (SEC-03)
3. Valid result payload updates job status to 'completed' or 'failed' (CB-02)
4. Endpoint rejects result for jobs already in terminal state (idempotency)
5. Result payload includes commitHash, pullRequestUrl, errorMessage, logs (CB-03)
6. Worker retries callback on transient failures with exponential backoff
7. Logs are redacted before sending (SEC-04)

**Callback Endpoint Pattern**:
```typescript
// POST /api/jobs/:jobId/result
// Headers: X-Tenant-Id: <tenantId>
// Body: { success, commitHash, pullRequestUrl, errorMessage, logs, changedFiles, executionTime, branch }
```

**Plans**: 2 plans in 1 wave

**Status**: Complete (2026-01-19)

Plans:
- [x] 02-01-PLAN.md — Create POST /api/jobs/:jobId/result callback endpoint
- [x] 02-02-PLAN.md — Create CallbackClient and integrate into ViberatorWorker

---

### Phase 3: Worker Configuration

**Goal**: Workers are invoked and some of their configuration is provided via the payload. For cases like cloud resources the clanker configuration is predetermined and provided via the platform when the clanker is created. For example in case like ECS the worker configuration is the task definition.

**Depends on**: Phase 2

**Requirements**: WRK-01, WRK-02, WRK-03, WRK-04, WRK-05

**Plans**: 3 plans in 2 waves

**Status**: Complete (2026-01-19)

Plans:
- [x] 03-01-PLAN.md — Define shared types for payload-based worker configuration
- [x] 03-02-PLAN.md — Create ConfigLoader and CredentialProvider for payload-based initialization
- [x] 03-03-PLAN.md — Wire ViberatorWorker to use payload-based configuration

---

### Phase 4: Worker Execution

**Goal**: Platform invokes Lambda/ECS/Docker workers asynchronously via AWS SDK with retry logic.

**Depends on**: Phase 3

**Requirements**: EXEC-01, EXEC-02, EXEC-03, EXEC-04

**Success Criteria** (what must be TRUE):
1. WorkerInvoker interface defines invoke() returning execution ID
2. LambdaInvoker invokes Lambda functions asynchronously (InvocationType: Event)
3. EcsInvoker starts ECS tasks via RunTask API
4. DockerInvoker starts Docker containers via dockerode
5. Transient errors trigger retry with exponential backoff
6. Permanent errors fail job immediately without retry
7. Execution ID stored on job record for debugging
8. OrphanSweeper marks stuck jobs as failed after timeout

**Plans**: 4 plans in 3 waves

**Status**: Complete (2026-01-19)

Plans:
- [x] 04-01-PLAN.md — Create WorkerInvoker interface, error types, and factory skeleton
- [x] 04-02-PLAN.md — Implement LambdaInvoker and EcsInvoker for AWS workers
- [x] 04-03-PLAN.md — Implement DockerInvoker for local Docker workers
- [x] 04-04-PLAN.md — Create WorkerExecutionService with retry logic and OrphanSweeper

---

### Phase 4.1: Allow Frontend to Invoke Workers and Initiate Jobs (INSERTED)

**Goal**: Frontend can invoke workers and initiate jobs to run from tickets.

**Depends on**: Phase 4

**Requirements**: None (urgent insertion bridging UI to backend)

**Success Criteria** (what must be TRUE):
1. POST /api/tickets/:ticketId/run creates job and invokes worker
2. Job record links to originating ticket and clanker
3. Run button visible in ticket list with clanker selection modal
4. Successful run shows toast and redirects to job detail page
5. Job detail page displays status, PR link, error details

**Plans**: 4 plans in 2 waves

**Status**: Complete (2026-01-20)

Plans:
- [x] 04.1-01-PLAN.md — Create run ticket API endpoint with job creation and worker invocation
- [x] 04.1-02-PLAN.md — Set up job API client and toast notifications
- [x] 04.1-03-PLAN.md — Create run ticket modal and ticket table with run actions
- [x] 04.1-04-PLAN.md — Create job detail page

---

### Phase 4.2: Testing (INSERTED)

**Goal**: Pragmatic testing for worker execution flow - focus on error classification logic and retry behavior, skip trivial tests.

**Depends on**: Phase 4.1

**Requirements**: None (testing phase)

**Success Criteria** (what must be TRUE):
1. Error classification tested (transient vs permanent) - this is the business logic
2. Retry logic tested with exponential backoff
3. Orphan detection timeout behavior tested
4. Integration tests verify end-to-end worker execution flow

**Plans**: 3 plans in 2 waves

**Status**: Complete (2026-01-20)

Plans:
- [x] 04.2-01-PLAN.md — Error classification tests for Lambda/ECS/Docker invokers
- [x] 04.2-02-PLAN.md — Retry logic tests (WorkerExecutionService) and orphan detection (OrphanSweeper)
- [x] 04.2-03-PLAN.md — Integration tests for full worker execution flow

---

### Phase 4.3: Application organization and structural refactoring (INSERTED)

**Goal**: Improve code organization and structure across the application by eliminating duplication, removing deprecated APIs, fixing anti-patterns, and improving type safety.

**Depends on**: Phase 4.2

**Requirements**: None (structural refactoring)

**Success Criteria** (what must be TRUE):
1. Validation middleware uses factory pattern (no 200+ lines of duplicate code)
2. No deprecated String.substr() calls remain
3. Frontend data.ts has no mock fallbacks (errors propagate properly)
4. 'as any' casts reduced significantly with proper type definitions

**Plans**: 4 plans in 2 waves

**Status**: Complete (2026-01-21)

Plans:
- [x] 04.3-01-PLAN.md — Refactor validation middleware to factory pattern
- [x] 04.3-02-PLAN.md — Replace deprecated substr() with crypto.randomUUID()
- [x] 04.3-03-PLAN.md — Remove mock fallbacks from frontend data.ts
- [x] 04.3-04-PLAN.md — Replace 'as any' casts with proper types

---

### Phase 4.4: E2E Flow Verification (INSERTED)

**Goal**: Verify the complete end-to-end happy path works and produce infrastructure setup documentation for local Docker and AWS ECS clankers.

**Depends on**: Phase 4.3

**Requirements**: None (verification and documentation phase)

**Happy Path to Verify**:
1. User navigates to platform frontend
2. User creates a ticket for a project
3. User configures a clanker (Docker or AWS ECS) successfully
4. User enhances ticket with additional context
5. User triggers the clanker to work on the ticket
6. User sees a pull request appear on GitHub with proposed fix

**Success Criteria** (what must be TRUE):
1. Happy path code flow verified for Docker clanker
2. Happy path code flow verified for AWS ECS clanker
3. Gaps in current implementation identified and documented
4. Local infrastructure setup instructions complete
5. AWS infrastructure setup instructions complete

**Plans**: 2 plans in 2 waves

Plans:
- [x] 04.4-01-PLAN.md — Verify Docker E2E prerequisites and trace code flow
- [x] 04.4-02-PLAN.md — Create infrastructure setup documentation (Docker and ECS)

**Details**:
Plan 01 verifies prerequisites (Docker running, worker image, services) and traces the complete code flow from frontend to callback. Documents any gaps found (e.g., log streaming not yet implemented - Phase 7 scope).

Plan 02 creates comprehensive setup documentation for both local Docker and AWS ECS deployments, including troubleshooting sections based on RESEARCH.md common pitfalls.

**Status**: Complete (2026-01-21)

---

### Phase 5: Job Status Polling

**Goal**: Frontend polls and displays current job status to users.

**Depends on**: Phase 2, Phase 4

**Requirements**: CB-04

**Plans**: 3 plans in 3 waves

**Status**: Complete (2026-01-21)

Plans:
- [x] 05-01-PLAN.md — Create useInterval and usePolling hooks
- [x] 05-02-PLAN.md — Create useJobStatus hook with toast notifications
- [x] 05-03-PLAN.md — Create JobStatusIndicator component and integrate polling into job detail page

---

### Phase 6: Clanker Static Status

**Goal**: Platform displays clanker static status (resource exists, connected, ready).

**Depends on**: Phase 3

**Requirements**: STAT-01

**Plans**: 2 plans in 2 waves

**Status**: Complete (2026-01-21)

Plans:
- [x] 06-01-PLAN.md — Create backend health check service and API endpoint
- [x] 06-02-PLAN.md — Create frontend health badge component and integrate display

---

### Phase 7: Clanker Runtime Status

**Goal**: Workers POST heartbeat and progress updates to platform API during task execution.

**Depends on**: Phase 4

**Requirements**: STAT-02, STAT-03, STAT-04, STAT-05

**Plans**: 4 plans in 4 waves

**Status**: Complete (2026-01-21)

Plans:
- [ ] 07-01-PLAN.md — Create database migration for heartbeat and progress tracking
- [ ] 07-02-PLAN.md — Create backend API endpoints for progress and log updates
- [ ] 07-03-PLAN.md — Extend CallbackClient and create HeartbeatSweeper
- [ ] 07-04-PLAN.md — Create frontend progress timeline and log viewer UI

---

### Phase 8: Webhook Provider Architecture

**Goal**: Provider-agnostic webhook integration with GitHub as first implementation.

**Depends on**: Phase 5

**Requirements**: WEB-01, WEB-02, WEB-03, WEB-04

**Plans**: 0 plans

**Status**: Not started

---

### Phase 9: Local Development

**Goal**: Docker compose environment for local development.

**Depends on**: Phase 7

**Requirements**: DEV-01, DEV-02, DEV-03

**Plans**: 0 plans

**Status**: Not started

---

### Phase 10: AWS Infrastructure

**Goal**: Pulumi stack provisions complete AWS infrastructure.

**Depends on**: Phase 8

**Requirements**: DEP-01

**Plans**: 0 plans

**Status**: Not started

---

### Phase 11: Deployment Process

**Goal**: CI/CD pipeline and environment-specific configs.

**Depends on**: Phase 10

**Requirements**: DEP-02, DEP-03, DEP-04

**Plans**: 0 plans

**Status**: Not started

---

### Phase 12: Secret Management

**Goal**: Provider-based secret management for all deployment targets.

**Depends on**: Phase 11

**Requirements**: DEP-05

**Plans**: 0 plans

**Status**: Not started
