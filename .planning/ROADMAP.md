# Roadmap: Viberator

## Overview

This is a brownfield integration project. The core components exist—CRUD operations for tickets/projects/clankers, agent factory, and worker handlers—but the integration plumbing is missing. The roadmap starts by establishing cloud-agnostic multi-tenant security foundations with a provider interface pattern, then builds the worker execution flow (callbacks, invocation, configuration), adds visibility features (status display, polling), integrates external triggers (provider-agnostic webhooks), and finally establishes development and production environments. Each phase delivers a verifiable integration milestone that unblocks subsequent work.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Multi-Tenant Security Foundation** - Cloud-agnostic credential storage interface with AWS SSM provider implementation
- [ ] **Phase 2: Result Callback** - Workers POST results to platform API
- [ ] **Phase 3: Worker Execution** - Platform invokes Lambda/ECS/Docker workers
- [ ] **Phase 4: Worker Configuration** - Workers fetch credentials and clanker configs
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

**Plans**: TBD

---

### Phase 2: Result Callback

**Goal**: Workers can POST execution results back to the platform API, enabling job status tracking.

**Depends on**: Phase 1 (tenant-scoped result storage)

**Requirements**: CB-01, CB-02, CB-03

**Success Criteria** (what must be TRUE):
1. Worker POSTs to `/api/jobs/:id/result` endpoint and receives 200 OK
2. Job status in database updates to "completed" or "failed" based on result payload
3. Result payload stores commit SHA, PR URL, error message, and logs for retrieval
4. Failed results include error details that help diagnose the failure

**Plans**: TBD

---

### Phase 3: Worker Execution

**Goal**: Platform invokes workers asynchronously via AWS SDK for Lambda, ECS, and local Docker.

**Depends on**: Phase 2 (workers can report results when invoked)

**Requirements**: EXEC-01, EXEC-02, EXEC-03, EXEC-04

**Success Criteria** (what must be TRUE):
1. Platform invokes Lambda worker asynchronously via AWS Lambda SDK call
2. Platform starts ECS task worker via ECS RunTask API with proper task definition
3. Platform starts local Docker worker via Docker API with proper container configuration
4. Failed worker invocations trigger retry logic with exponential backoff

**Plans**: TBD

---

### Phase 4: Worker Configuration

**Goal**: Workers fetch their runtime configuration including SCM credentials, clanker settings, and agent instructions.

**Depends on**: Phase 1 (credential provider interface), Phase 3 (workers are being invoked)

**Requirements**: WRK-01, WRK-02, WRK-03, WRK-04, WRK-05

**Success Criteria** (what must be TRUE):
1. Worker fetches SCM credentials from configured CredentialProvider using tenantId from job context
2. Worker loads clanker configuration (environment variables, agent selection) from platform API by clanker ID
3. Worker injects environment variables from clanker config into agent execution context
4. Worker retrieves and applies instruction files (agents.md) from clanker config to agent execution
5. Worker authenticates git operations using provider-specific URLs with embedded credentials

**Plans**: TBD

---

### Phase 5: Job Status Polling

**Goal**: Frontend polls and displays current job status to users, providing visibility into worker execution.

**Depends on**: Phase 2 (job status exists in database)

**Requirements**: CB-04

**Success Criteria** (what must be TRUE):
1. Frontend polls `/api/jobs/:id/status` endpoint every few seconds while job is running
2. Status display shows current state (queued, running, completed, failed) with visual indicator
3. Polling stops when job reaches terminal state (completed or failed)
4. Status display includes result details (commit SHA, PR link) when job completes

**Plans**: TBD

---

### Phase 6: Clanker Static Status

**Goal**: Platform displays whether clanker resources exist and are ready for execution.

**Depends on**: Nothing (uses existing clanker CRUD)

**Requirements**: STAT-01

**Success Criteria** (what must be TRUE):
1. Clanker list page shows static status indicators for each clanker (resource exists, connected, ready)
2. Status indicators reflect the actual state of underlying resources (ECS task definition, Lambda function, Docker image)
3. Inactive clankers show "not deployed" status
4. Clanker detail page displays comprehensive static status information

**Plans**: TBD

---

### Phase 7: Clanker Runtime Status

**Goal**: Workers POST heartbeat and progress updates during execution, and platform displays runtime status history.

**Depends on**: Phase 3 (workers are executing), Phase 6 (static status display exists)

**Requirements**: STAT-02, STAT-03, STAT-04, STAT-05

**Success Criteria** (what must be TRUE):
1. Worker POSTs heartbeat to `/api/clankers/:id/heartbeat` every N seconds during task execution
2. Worker POSTs progress updates to `/api/clankers/:id/progress` with current step and percentage
3. Platform stores runtime status history in database with timestamps
4. Frontend shows real-time status updates for active clankers with visual progress indicator

**Plans**: TBD

---

### Phase 8: Webhook Provider Architecture

**Goal**: External systems (GitHub, GitLab, Bitbucket, Jira) create tickets and trigger agent execution through a provider-agnostic webhook interface.

**Depends on**: Phase 3 (worker execution), Phase 4 (worker config fetch works)

**Requirements**: WEB-01, WEB-02, WEB-03, WEB-04

**Success Criteria** (what must be TRUE):
1. WebhookProvider interface defines parse, validate, and normalize operations for webhook events
2. GitHubWebhookProvider implements WebhookProvider with signature verification and event parsing
3. Platform routes webhook requests to appropriate provider based on project configuration
4. Webhook payload creates ticket when project is configured for auto-fix
5. Ticket creation triggers worker execution via job submission
6. Adding a new provider (GitLab, Bitbucket, Jira) requires only implementing WebhookProvider interface

**WebhookProvider Interface Pattern**:
```typescript
interface WebhookEvent {
  provider: string
  eventType: string
  sourceUrl: string
  metadata: Record<string, unknown>
}

interface WebhookProvider {
  name: string

  // Verify webhook signature (HMAC, JWT, etc.)
  verifySignature(headers: Headers, body: string, secret: string): boolean

  // Parse raw webhook into normalized format
  parse(headers: Headers, body: unknown): Promise<WebhookEvent>

  // Extract source URL for repo/ticket lookup
  getSourceUrl(event: WebhookEvent): string

  // Determine if event should trigger auto-fix
  shouldTrigger(event: WebhookEvent): boolean

  // Extract metadata for ticket creation
  extractMetadata(event: WebhookEvent): Record<string, unknown>
}
```

**Provider Implementations**:
- **GitHubWebhookProvider**: HMAC-SHA256 signature verification, supports push, pull_request, issues events (v1)
- **GitLabWebhookProvider**: JWT token verification, supports Merge Request, Pipeline events (future)
- **BitbucketWebhookProvider**: HMAC signature verification, supports pullrequest:created, repo:push events (future)
- **JiraWebhookProvider**: Basic auth or JWT verification, supports issue_updated, issue_created events (future)

**Plans**: TBD

---

### Phase 9: Local Development

**Goal**: Developers can run entire system locally using Docker compose for development and testing.

**Depends on**: Phase 3 (worker execution), Phase 4 (worker configuration)

**Requirements**: DEV-01, DEV-02, DEV-03

**Success Criteria** (what must be TRUE):
1. Single `docker compose up` command starts all services (backend, frontend, database, workers)
2. Local workers execute jobs directly without queue by calling worker binary or Docker run
3. Developer can create ticket via web UI and see worker execute locally
4. Local development uses FileProvider for credential storage (no AWS dependency)

**Plans**: TBD

---

### Phase 10: AWS Infrastructure

**Goal**: Pulumi stack provisions complete AWS infrastructure for production deployment and implements AWS-specific credential provider.

**Depends on**: Phase 1 (CredentialProvider interface defined), Phase 3 (worker execution requirements known)

**Requirements**: DEP-01

**Success Criteria** (what must be TRUE):
1. `pulumi up` provisions ECR repositories for container images
2. `pulumi up` provisions ECS cluster, task definitions, and Fargate capacity
3. `pulumi up` provisions Lambda function with proper IAM role
4. `pulumi up` provisions SQS queue (for future high-volume scenarios)
5. `pulumi up` provisions SSM Parameter Store with tenant-scoped paths
6. AwsSsmProvider is fully implemented and configured with proper IAM permissions
7. Infrastructure outputs all necessary ARNs and URLs for configuration

**Plans**: TBD

---

### Phase 11: Deployment Process

**Goal**: CI/CD pipeline builds and deploys container images, with environment-specific configuration and provider selection.

**Depends on**: Phase 10 (infrastructure exists)

**Requirements**: DEP-02, DEP-03, DEP-04

**Success Criteria** (what must be TRUE):
1. Documentation describes complete deployment process for all components
2. Environment-specific configurations exist for dev, staging, and prod
3. CI/CD pipeline builds container images and pushes to ECR on commit to main
4. Deployment process is reproducible and documented end-to-end
5. Provider selection is configurable per environment (FileProvider for dev, AwsSsmProvider for prod)

**Plans**: TBD

---

### Phase 12: Secret Management

**Goal**: Production secrets are managed via provider-based secret management supporting AWS, other clouds, and local deployment.

**Depends on**: Phase 1 (provider pattern established), Phase 10 (AWS provider implemented), Phase 11 (deployment process)

**Requirements**: DEP-05

**Success Criteria** (what must be TRUE):
1. Secret management uses CredentialProvider interface for all secret access
2. Development uses FileProvider (encrypted file storage, no cloud dependency)
3. AWS production uses AwsSsmProvider (SSM Parameter Store)
4. Azure deployments can use AzureKeyVaultProvider (interface ready for implementation)
5. GCP deployments can use GcpSecretManagerProvider (interface ready for implementation)
6. Secret rotation strategy is documented for production
7. Deployment process handles provider configuration without exposing values in logs

**Provider Implementations**:
- **FileProvider**: Encrypted JSON file, local dev only
- **AwsSsmProvider**: AWS SSM Parameter Store, production
- **AzureKeyVaultProvider**: Azure Key Vault (future, interface ready)
- **GcpSecretManagerProvider**: GCP Secret Manager (future, interface ready)

**Plans**: TBD

---

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11 → 12

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Multi-Tenant Security Foundation | 0/0 | Not started | - |
| 2. Result Callback | 0/0 | Not started | - |
| 3. Worker Execution | 0/0 | Not started | - |
| 4. Worker Configuration | 0/0 | Not started | - |
| 5. Job Status Polling | 0/0 | Not started | - |
| 6. Clanker Static Status | 0/0 | Not started | - |
| 7. Clanker Runtime Status | 0/0 | Not started | - |
| 8. Webhook Provider Architecture | 0/0 | Not started | - |
| 9. Local Development | 0/0 | Not started | - |
| 10. AWS Infrastructure | 0/0 | Not started | - |
| 11. Deployment Process | 0/0 | Not started | - |
| 12. Secret Management | 0/0 | Not started | - |

---

**Roadmap created:** 2026-01-19
**Depth:** Comprehensive (12 phases)
**Coverage:** 29/29 requirements mapped
**Revised:** 2026-01-19 (cloud-agnostic provider pattern), 2026-01-19 (provider-agnostic webhook architecture)
