# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-01-19)

**Core value:** Users can create tickets that coding agents automatically fix, with the entire flow—ticket creation, agent execution, PR creation, and status updates—working end-to-end.

**Current focus:** Phase 4.3: Application organization and structural refactoring

## Current Position

Phase: 4.3 of 12 (Application organization and structural refactoring) — INSERTED
Next: Phase 4.3 (structural refactoring) or Phase 5 (Job Status Polling)
Status: Phase inserted, not yet planned
Last activity: 2026-01-20 — Inserted Phase 4.3

Progress: [██████████] 61%

## Performance Metrics

**Velocity:**
- Total plans completed: 27
- Average duration: ~4 minutes
- Total execution time: 1.52 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01 | 5 | 5 | 4m |
| 02 | 2 | 2 | 2m |
| 03 | 3 | 3 | 3m |
| 04 | 4 | 4 | 3m |
| 04.1 | 4 | 4 | 5m |
| 04.2 | 3 | 3 | 6m |

**Recent Trend:**
- Last 5 plans: 6m, 8m, 8m
- Trend: Stable

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| CredentialProvider interface | Establish pattern for all credential providers | get/put/delete/isAvailable contract |
| EnvironmentProvider read-only | Environment variables cannot be set at runtime in Node.js | put/delete throw errors |
| Key transformation | "github_token" -> "GITHUB_TOKEN" for env var conventions | UPPERCASE_WITH_UNDERSCORES |
| AWS SDK v3 | Modular, smaller bundle, better TypeScript support | @aws-sdk/client-ssm, @aws-sdk/client-node |
| AES-256-GCM encryption | Industry-standard authenticated encryption for file storage | 12-byte IV, 16-byte auth tag |
| File permissions 0o600 | Owner read/write only for credential file | Security best practice |
| 64-char hex key format | Direct 32-byte key for production security | CREDENTIALS_ENCRYPTION_KEY env var |
| SSM hierarchical paths | /prefix/{tenantId}/{key} enables tenant-scoped IAM policies | SecureString with KMS encryption |
| 5-minute SSM cache | Reduce API calls and cost while maintaining freshness | In-memory Map with TTL |
| Fixed fallback chain order | Simplified debugging, predictable credential lookup | Environment -> File -> AWS |
| CredentialProviderFactory singleton | App-wide credential access with single initialization | getCredentialFactory() |
| X-Tenant-Id header | Standard convention for multi-tenant API requests | tenantMiddleware extracts and validates |
| AWS SDK mocking in tests | Avoid external dependencies for unit tests | jest.mock() for @aws-sdk/client-ssm |
| Test coverage targets | All provider operations and security guarantees verified | 175 passing tests |
| Status-based idempotency | Reject updates to terminal states rather than idempotency tokens | Simpler pattern, matches JobService |
| Joi middleware pattern | Follow existing validation patterns for consistency | validateResultCallback after validateUpdateTicket |
| Non-blocking callbacks | Callback failures logged but don't throw, worker completes regardless | Prevents platform issues from breaking worker flow |
| Exponential backoff retry | delay * 2^attempt pattern (1s, 2s, 4s) with 3 retries | Handles transient failures, only 5xx/429 retried |
| Extended redaction patterns | Added gho_, ghu_, ghs_, ghr_ for all GitHub token types | SEC-04 compliance for all token formats |
| Type-specific worker payloads | BaseWorkerPayload with type-specific Lambda/ECS/Docker extensions | S3 URLs for AWS, mount paths for Docker |
| WorkerType discrimination | Literal 'lambda' | 'ecs' | 'docker' for type narrowing | WorkerPayload union type enables safe type guards |
| Instruction file references | S3InstructionFile for AWS workers, MountedInstructionFile for Docker | Separate patterns for cloud vs container deployment |
| CredentialProvider class pattern | Worker-side SSM credential fetching with 5-min cache | Map-based TTL cache, soft fail on missing |
| ConfigLoader class pattern | S3 instruction file fetching with graceful degradation | AWS default credential chain, s3:// URL parsing |
| @aws-sdk/client-s3 dependency | S3 operations for instruction file fetching | Matches existing @aws-sdk/client-ssm pattern |
| Payload-based worker initialization | ViberatorWorker.initialize() accepts optional WorkerPayload | Backward compatible, enables SSM/env credential fetching |
| Environment variable injection | injectEnvironmentVars() before git operations | GitService reads via SCMAuthFactory.authenticateUrl |
| Credential key transformation | keyToEnvVar() converts to UPPER_CASE_WITH_UNDERSCORES | github_token -> GITHUB_TOKEN for env var conventions |
| Credential cleanup | finally block removes injected credentials | Prevents credential leakage after execution |
| LambdaPayload with jobId | Uses jobId field instead of id for consistency | Matches BaseWorkerPayload, different from CodingJobData.id |
| DockerPayload with workerType validation | CLI handler validates workerType='docker' | Ensures correct payload type for Docker workers |
| CredentialProvider env fallback | Checks process.env before SSM fetch | Docker workers receive creds via -e flags at container start |
| WorkerInvoker fire-and-forget | invoke() returns execution ID only, results come via callback | Async invocation pattern matches Phase 2 callback architecture |
| ErrorClassification enum | TRANSIENT vs PERMANENT for retry logic | isTransient/isPermanent getters for clean retry decisions |
| WorkerInvokerFactory registration | registerInvoker() allows dynamic invoker addition | Enables Plans 02/03 to add Lambda/ECS/Docker implementations |
| Lambda async invocation pattern | InvocationType: 'Event' returns 202, no response payload | requestId serves as execution ID for tracking |
| ECS RunTask failure checking | response.failures array must be checked even on 200 response | taskArn is execution ID, AGENT/CAPACITY failures are transient |
| AWS SDK v3 Lambda/ECS clients | @aws-sdk/client-lambda and @aws-sdk/client-ecs | Modular clients matching existing @aws-sdk/client-ssm pattern |
| Docker container naming | viberator-job-{job.id} pattern for uniqueness | Prevents container name collisions |
| Docker AutoRemove cleanup | AutoRemove: true in HostConfig | Containers clean up after completion automatically |
| dockerode SDK usage | Default import works with esModuleInterop | Container management via Docker API |
| Docker error classification | ECONNREFUSED/ETIMEDOUT are transient, image not found is permanent | Matches retry logic pattern from other invokers |
| WorkerExecutionService retry logic | Exponential backoff: baseDelay * 2^(attempt-1) with maxDelayMs cap | Transient errors retry, permanent errors fail immediately |
| Execution ID storage | Stored in job.progress.executionId after successful invocation | Enables CloudWatch correlation and debugging |
| OrphanSweeper background sweep | Runs every 60s by default, marks jobs as failed after 30min timeout | Safety net for workers that fail to callback |
| OrphanSweeper graceful shutdown | stop() clears interval on SIGTERM/SIGINT | Prevents memory leaks from setInterval |
| sonner toast library | Headless, accessible, DX-friendly for user notifications | Toaster component in layout, 5s duration, bottom-right position |
| Job API client pattern | fetch-based API calls with typed responses | runTicket(ticketId, clankerId), getJob(jobId) functions |
| Ticket-to-job foreign keys | Jobs table links to tickets and clankers via nullable FK columns | ON DELETE SET NULL preserves job history |
| Fire-and-forget ticket run | POST /api/tickets/:id/run returns 202 before worker completes | Worker invocation is non-blocking with error logging |
| Hardcoded tenant ID | Uses "api-server" tenantId for ticket-sourced jobs | To be replaced with real auth when implemented |
| Job detail page server/client split | Server component for data fetching, client component for interactions | router.refresh() pattern for manual refresh |
| Status badge color coding | queued=yellow, active=blue, completed=green, failed=red | Consistent visual feedback for job states |
| RunTicketModal component pattern | Pre-flight confirmation modal with clanker selection | Single modal used from both list and detail views |
| Play icon button in table rows | Prevents row navigation with e.preventDefault()/e.stopPropagation() | Clean interaction pattern for table actions |
| Client/server component split | Server fetches data, client handles interactions | Leverages Next.js RSC for optimal performance |
| AWS SDK mock reference pattern | Declare mock function before jest.mock() to share reference | Prevents mock consumption issues in multi-assertion tests |
| jest.useFakeTimers for retry testing | Fake timers with advanceTimersByTimeAsync for delay verification | Tests retry/backoff without real delays |
| Mock service injection | jest.mock() for JobService and WorkerInvokerFactory | Isolated unit testing without external dependencies |
| Service integration test pattern | Real WorkerExecutionService with mocked JobService | Tests service integration without database dependency |
| AWS SDK boundary mocking | jest.mock() at module level for @aws-sdk/client-lambda/ecs | Prevents real AWS calls during integration tests |
| dockerode mocking pattern | jest.mock() returning jest.fn().mockImplementation() | Works with default import in DockerInvoker |
| Pragmatic testing approach | Focus on complex logic (error classification, retry), skip trivial tests | 134 tests for worker execution flow |

### Roadmap Evolution

- Phase 4.1 inserted after Phase 4: Allow frontend to invoke workers and initiate jobs from tickets (URGENT)
- Phase 4.2 inserted after Phase 4.1: Testing (URGENT)
- Phase 4.3 inserted after Phase 4.2: Application organization and structural refactoring (URGENT)

### Pending Todos

None yet.

### Blockers/Concerns

None yet.

## Session Continuity

Last session: 2026-01-20
Stopped at: Phase 4.2 complete
Resume file: None
