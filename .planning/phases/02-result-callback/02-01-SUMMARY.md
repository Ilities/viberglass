---
phase: 02-result-callback
plan: 01
subsystem: api
tags: express, joi, typescript, multi-tenant, callback-api

# Dependency graph
requires:
  - phase: 01-multi-tenant-security-foundation
    provides: tenantMiddleware, tenant isolation patterns
provides:
  - POST /api/jobs/:jobId/result endpoint for worker callbacks
  - resultCallbackSchema for CB-03 payload validation
  - validateResultCallback middleware for request validation
  - Tenant ownership check for job result updates
  - Idempotency protection against duplicate terminal state updates
affects: 02-02 (worker callback client), 05-job-status-polling

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Callback endpoint with tenant validation
    - Joi schema validation for result payloads
    - Status transition idempotency (queued/active -> completed/failed)

key-files:
  created: []
  modified:
    - platform/backend/src/api/routes/jobs.ts
    - platform/backend/src/api/middleware/schemas.ts
    - platform/backend/src/api/middleware/validation.ts

key-decisions:
  - "Use existing tenantMiddleware from Phase 1 for SEC-03 compliance"
  - "Status-based idempotency (reject terminal state updates) rather than idempotency tokens"
  - "Joi validation middleware pattern following existing validateUpdateTicket structure"

patterns-established:
  - "Callback Endpoint: POST /:jobId/result with tenantMiddleware and validateResultCallback"
  - "Status Transition Protection: Reject completed/failed -> completed/failed transitions with 409 Conflict"

# Metrics
duration: 2min
completed: 2026-01-19
---

# Phase 2 Plan 1: Worker Callback Endpoint Summary

**POST /api/jobs/:jobId/result endpoint with tenant validation, CB-03 payload schema, and status transition idempotency**

## Performance

- **Duration:** 2 min (126 seconds)
- **Started:** 2026-01-19T12:57:02Z
- **Completed:** 2026-01-19T12:59:08Z
- **Tasks:** 1
- **Files modified:** 3

## Accomplishments

- Created POST /api/jobs/:jobId/result callback endpoint for workers to report execution results
- Added resultCallbackSchema validating CB-03 fields (success, commitHash, pullRequestUrl, errorMessage, logs, changedFiles, executionTime, branch)
- Implemented tenant ownership check to prevent cross-tenant job updates (SEC-03)
- Added idempotency protection rejecting duplicate updates to terminal states (409 Conflict)
- Integrated with existing JobService.updateJobStatus() method for database updates

## Task Commits

Each task was committed atomically:

1. **Task 1: Create POST /api/jobs/:jobId/result callback endpoint** - `efc72dd` (feat)

**Plan metadata:** `pending` (docs: complete plan)

_Note: TDD tasks may have multiple commits (test -> feat -> refactor)_

## Files Created/Modified

- `platform/backend/src/api/routes/jobs.ts` - Added POST /:jobId/result endpoint with tenant validation and idempotency
- `platform/backend/src/api/middleware/schemas.ts` - Added resultCallbackSchema for CB-03 payload validation
- `platform/backend/src/api/middleware/validation.ts` - Added validateResultCallback middleware

## Decisions Made

- **Use existing tenantMiddleware**: Reused Phase 1 deliverable for SEC-03 compliance rather than creating new auth logic
- **Status-based idempotency**: Reject updates to terminal states (completed/failed) rather than implementing idempotency tokens - simpler, matches JobService pattern
- **Joi middleware pattern**: Followed existing validateUpdateTicket structure for consistency

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- Import path correction: Initially used `../../middleware/` from routes directory but corrected to `../middleware/` since jobs.ts is in `api/routes/` subdirectory

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Callback endpoint complete and ready for worker integration (02-02)
- Existing JobService.updateJobStatus() method handles database updates correctly
- Tenant isolation prevents cross-tenant job access
- Idempotency protection prevents status inconsistency from duplicate callbacks

**Blockers/Concerns:** None

---
*Phase: 02-result-callback*
*Completed: 2026-01-19*
