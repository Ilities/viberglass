# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-01-19)

**Core value:** Users can create tickets that coding agents automatically fix, with the entire flow—ticket creation, agent execution, PR creation, and status updates—working end-to-end.

**Current focus:** Phase 3: Worker Configuration

## Current Position

Phase: 3 of 12 (Worker Configuration)
Plan: 2 of 4 in current phase
Status: In progress
Last activity: 2026-01-19 — Completed 03-02-PLAN.md (CredentialProvider and ConfigLoader)

Progress: [███░░░░░░░] 25%

## Performance Metrics

**Velocity:**
- Total plans completed: 9
- Average duration: ~3 minutes
- Total execution time: 0.46 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01 | 5 | 5 | 4m |
| 02 | 2 | 2 | 2m |
| 03 | 2 | 4 | 3m |

**Recent Trend:**
- Last 5 plans: N/A
- Trend: N/A

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

### Pending Todos

None yet.

### Blockers/Concerns

None yet.

## Session Continuity

Last session: 2026-01-19
Stopped at: Completed 03-02-PLAN.md — CredentialProvider and ConfigLoader created
Resume file: None
