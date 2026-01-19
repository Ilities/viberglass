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
- [ ] **Phase 3: Worker Configuration** - Workers fetch credentials and clanker configs
- [ ] **Phase 4: Worker Execution** - Platform invokes Lambda/ECS/Docker workers
- [ ] **Phase 5: Job Status Polling** - Frontend displays current job status
- [ ] **Phase 6: Clanker Static Status** - Platform displays resource readiness
- [ ] **Phase 7: Clanker Runtime Status** - Workers POST heartbeat and progress updates
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

**Goal**: Workers receive their complete configuration at invocation time from the platform, including clanker configuration, credential variable names, and tenant identifier.

**Depends on**: Phase 2

**Requirements**: WRK-01, WRK-02, WRK-03, WRK-04, WRK-05

**Success Criteria** (what must be TRUE):
1. Worker fetches clanker configuration from platform API by ID
2. Worker validates all required credentials exist in environment before starting job
3. Worker injects environment variables from clanker config before agent execution
4. Worker authenticates git operations using SCM credentials from environment
5. Worker retrieves instruction files (agents.md, etc.) from clanker config

**Plans**: 3 plans in 2 waves

**Status**: Not started

Plans:
- [ ] 03-01-PLAN.md — Create WorkerConfigurationClient for fetching clanker configs from platform API
- [ ] 03-02-PLAN.md — Extend job types and create CredentialInjector for environment-based credential handling
- [ ] 03-03-PLAN.md — Wire ViberatorWorker to use configuration-based initialization

---

### Phase 4: Worker Execution

**Goal**: Platform invokes Lambda/ECS/Docker workers asynchronously via AWS SDK with retry logic.

**Depends on**: Phase 3

**Requirements**: EXEC-01, EXEC-02, EXEC-03, EXEC-04

**Plans**: 0 plans

**Status**: Not started

---

### Phase 5: Job Status Polling

**Goal**: Frontend polls and displays current job status to users.

**Depends on**: Phase 2, Phase 4

**Requirements**: CB-04

**Plans**: 0 plans

**Status**: Not started

---

### Phase 6: Clanker Static Status

**Goal**: Platform displays clanker static status (resource exists, connected, ready).

**Depends on**: Phase 3

**Requirements**: STAT-01

**Plans**: 0 plans

**Status**: Not started

---

### Phase 7: Clanker Runtime Status

**Goal**: Workers POST heartbeat and progress updates to platform API during task execution.

**Depends on**: Phase 4

**Requirements**: STAT-02, STAT-03, STAT-04, STAT-05

**Plans**: 0 plans

**Status**: Not started

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
