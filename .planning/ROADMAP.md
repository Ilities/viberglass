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
- [x] **Phase 4: Worker Execution** - Platform invokes Lambda/ECS/Docker workers asynchronously via AWS SDK with retry logic
- [x] **Phase 4.1: Allow Frontend to Invoke Workers** - Frontend initiates jobs from tickets (INSERTED)
- [x] **Phase 4.2: Testing** - Pragmatic testing for worker execution flow (INSERTED)
- [x] **Phase 4.3: Application organization and structural refactoring** - Code organization improvements (INSERTED)
- [x] **Phase 4.4: E2E Flow Verification** - Verify happy path and document infrastructure setup (INSERTED)
- [x] **Phase 5: Job Status Polling** - Frontend displays current job status
- [x] **Phase 6: Clanker Static Status** - Platform displays resource readiness
- [x] **Phase 7: Clanker Runtime Status** - Workers POST heartbeat and progress updates
- [x] **Phase 8: Webhook Provider Architecture** - Provider-agnostic webhook integration with GitHub as first implementation
- [x] **Phase 9: Local Development** - Docker compose environment for local development
- [x] **Phase 10: AWS Infrastructure** - Pulumi stack provisions complete AWS infrastructure
- [x] **Phase 11: Deployment Process** - CI/CD pipeline and environment-specific configs
- [x] **Phase 11.1: Remove Unused Frontend Infrastructure** - Clean up deprecated S3+CloudFront static hosting (INSERTED)
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

**Status**: Complete (2026-01-21)

Plans:
- [x] 04.4-01-PLAN.md — Verify Docker E2E prerequisites and trace code flow
- [x] 04.4-02-PLAN.md — Create infrastructure setup documentation (Docker and ECS)

**Details**:
Plan 01 verifies prerequisites (Docker running, worker image, services) and traces the complete code flow from frontend to callback. Documents any gaps found (e.g., log streaming not yet implemented - Phase 7 scope).

Plan 02 creates comprehensive setup documentation for both local Docker and AWS ECS deployments, including troubleshooting sections based on RESEARCH.md common pitfalls.

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
- [x] 07-01-PLAN.md — Create database migration for heartbeat and progress tracking
- [x] 07-02-PLAN.md — Create backend API endpoints for progress and log updates
- [x] 07-03-PLAN.md — Extend CallbackClient and create HeartbeatSweeper
- [x] 07-04-PLAN.md — Create frontend progress timeline and log viewer UI

---

### Phase 8: Webhook Provider Architecture

**Goal**: Provider-agnostic webhook integration with GitHub as first implementation. Incoming webhooks from external platforms trigger ticket creation and optionally clanker execution.

**Depends on**: Phase 7

**Requirements**: WEB-01, WEB-02, WEB-03, WEB-04

**Success Criteria** (what must be TRUE):
1. WebhookProvider interface defines signature validation, event parsing, outbound calls
2. GitHubWebhookProvider validates HMAC-SHA256 signatures with timing-safe comparison
3. GitHub issues and issue_comment events create tickets in database
4. @bot mentions in comments trigger ticket creation (configurable username)
5. Auto-execute configuration triggers job creation after ticket creation
6. Completed jobs post result comments and update labels on GitHub issues
7. Duplicate webhooks detected and skipped via content hash
8. Failed webhooks stored for manual retry

**Provider Interface Pattern**:
```typescript
interface WebhookProvider {
  validateSignature(payload: string, signature: string, secret: string): boolean;
  parseEvent(headers: Record<string, string>, payload: unknown): WebhookEvent | null;
  postComment(config: ProviderConfig, issueNumber: number, body: string): Promise<void>;
  updateLabels(config: ProviderConfig, issueNumber: number, add: string[], remove: string[]): Promise<void>;
}
```

**Plans**: 5 plans in 4 waves

**Status**: Complete (2026-01-22)

Plans:
- [x] 08-01-PLAN.md — Create database schema with inbound secrets and outbound API token storage
- [x] 08-02-PLAN.md — Implement WebhookProvider interface with inbound and outbound methods
- [x] 08-03-PLAN.md — Create deduplication service and configuration DAOs
- [x] 08-04-PLAN.md — Create WebhookService, FeedbackService, and integrate with JobService
- [x] 08-05-PLAN.md — Create frontend webhook configuration UI

---

### Phase 9: Local Development

**Goal**: Docker compose environment for local development.

**Depends on**: Phase 8

**Requirements**: DEV-01, DEV-02, DEV-03

**Plans**: 3 plans in 3 waves

**Status**: Complete (2026-01-22)

Plans:
- [x] 09-01-PLAN.md — Create development Dockerfiles for backend and frontend with hot-reload
- [x] 09-02-PLAN.md — Create unified docker-compose.yml with all services and health checks
- [x] 09-03-PLAN.md — Create simplified local development documentation and deprecate legacy files

---

### Phase 10: AWS Infrastructure

**Goal**: Pulumi stack provisions complete AWS infrastructure for production deployment.

**Depends on**: Phase 9

**Requirements**: DEP-01

**Success Criteria** (what must be TRUE):
1. Pulumi infrastructure at `infrastructure/` with multi-stack support (dev/staging/prod)
2. VPC with public/private subnets across 2 AZs, NAT gateways for private egress
3. RDS PostgreSQL in private subnets with credentials in SSM
4. S3 bucket for file uploads with encryption and lifecycle policies
5. KMS key for SSM parameter encryption
6. CloudWatch log groups for all compute resources
7. ECS Fargate service for backend API with Application Load Balancer
8. S3+CloudFront for frontend static hosting (unused - see Phase 11)
9. Worker infrastructure (Lambda and ECS) configured
10. Comprehensive documentation for deployment and operations

**Plans**: 9 plans in 5 waves

**Status**: Complete (2026-01-23)

Plans:
- [x] 10-01-PLAN.md — Reorganize Pulumi infrastructure to proper location with multi-stack support (dev/staging/prod)
- [x] 10-02-PLAN.md — Create VPC networking with public/private subnets, NAT gateways, and security groups
- [x] 10-03-PLAN.md — Create RDS PostgreSQL with subnet group, parameter group, and SSM credential storage
- [x] 10-04-PLAN.md — Create S3 bucket for file uploads with encryption and lifecycle policies
- [x] 10-05-PLAN.md — Create KMS key for SSM parameter encryption
- [x] 10-06-PLAN.md — Create CloudWatch log groups with retention policies
- [x] 10-07-PLAN.md — Create ECS Fargate service and Application Load Balancer for backend API
- [x] 10-08-PLAN.md — Create S3+CloudFront for frontend static hosting
- [x] 10-09-PLAN.md — Complete infrastructure wiring and create comprehensive documentation

---

### Phase 11: Deployment Process

**Goal**: CI/CD pipeline and environment-specific configs.

**Depends on**: Phase 10

**Requirements**: DEP-02, DEP-03, DEP-04

**Success Criteria** (what must be TRUE):
1. Production Dockerfile builds optimized backend container image
2. Frontend builds for Amplify SSR deployment (dynamic rendering, not static export)
3. GitHub Actions CI runs tests on PRs
4. Backend deploys to ECS with migrations on push to main (dev)
5. Frontend deploys to Amplify on push to main (dev)
6. Prod deployments require manual trigger with approval
7. Pulumi preview runs on infrastructure PRs
8. Pulumi up runs for dev infrastructure on merge to main
9. OIDC authentication used for all AWS access
10. Two environments: dev (auto-deploy) and prod (manual with approval)

**Plans**: 5 plans in 3 waves

**Status**: Complete (2026-01-23)

Plans:
- [x] 11-01-PLAN.md — Create production Dockerfile for backend with multi-stage build
- [x] 11-02-PLAN.md — Configure Next.js for Amplify SSR deployment
- [x] 11-03-PLAN.md — Verify and finalize GitHub Actions workflows for backend CI/CD
- [x] 11-04-PLAN.md — Create GitHub Actions workflows for frontend CI/CD
- [x] 11-05-PLAN.md — Create GitHub Actions workflows for Pulumi infrastructure

**Notes**:
- Frontend deployment uses AWS Amplify SSR (not S3+CloudFront static export) to support Next.js 15 dynamic routes
- Phase 10's S3+CloudFront frontend infrastructure remains but is unused
- Backend CI/CD workflows verified (CI, dev, prod with OIDC)
- Pulumi workflows created (preview, dev, prod)

---

### Phase 11.1: Remove Unused Frontend Infrastructure (INSERTED)

**Goal**: Remove the unused S3+CloudFront frontend static hosting infrastructure from Pulumi stack, since Amplify SSR is now the deployment method.

**Depends on**: Phase 11

**Requirements**: None (cleanup/technical debt)

**Success Criteria** (what must be TRUE):
1. S3 bucket for frontend static hosting removed from Pulumi stack
2. CloudFront distribution removed from Pulumi stack
3. CloudFront OAC (Origin Access Control) removed from Pulumi stack
4. SSM parameters for frontend CDN URL removed (no longer needed)
5. Pulumi up succeeds without errors
6. Documentation updated to reflect Amplify-only deployment

**Plans**: 1 plan in 1 wave

**Status**: Complete (2026-01-23)

Plans:
- [x] 11.1-01-PLAN.md — Remove S3+CloudFront frontend infrastructure from Pulumi stack

**Details**:
Phase 10 created S3+CloudFront infrastructure for static hosting, but Phase 11 switched to Amplify SSR for Next.js 15 dynamic route support. The static hosting resources are now unused and should be removed to:
- Reduce AWS costs (~$15-20/month for CloudFront)
- Avoid confusion about deployment method
- Simplify infrastructure maintenance

---

### Phase 12: Secret Management

**Goal**: Provider-based secret management for all deployment targets.

**Depends on**: Phase 11

**Requirements**: DEP-05

**Success Criteria** (what must be TRUE):
1. SecretProvider interface defines getSecret/putSecret/deleteSecret operations for deployment-time secrets
2. SsmSecretProvider implements SecretProvider using /viberator/{environment}/{category}/{key} path hierarchy
3. Pulumi secrets component provisions SSM parameters for all deployment configurations
4. GitHub Actions workflows use environment-specific secrets without hardcoded values
5. Documentation covers GitHub environment setup, SSM configuration, and troubleshooting

**SecretProvider Interface Pattern**:
```typescript
interface SecretProvider {
  getSecret(environment: string, key: string): Promise<string | null>
  putSecret(environment: string, key: string, value: string, options?: SecretOptions): Promise<void>
  deleteSecret(environment: string, key: string): Promise<void>
  isAvailable(): Promise<boolean>
}
```

**Plans**: 5 plans in 3 waves

**Status**: Planning

Plans:
- [ ] 12-01-PLAN.md — Create SecretProvider interface and SsmSecretProvider implementation
- [ ] 12-02-PLAN.md — Create Pulumi secrets component for SSM parameter provisioning
- [ ] 12-03-PLAN.md — Update backend deployment workflows to use centralized secrets
- [ ] 12-04-PLAN.md — Update frontend deployment workflows to use centralized secrets
- [ ] 12-05-PLAN.md — Create deployment secrets documentation and GitHub quick reference
