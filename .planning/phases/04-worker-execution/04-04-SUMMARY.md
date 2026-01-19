---
phase: 04-worker-execution
plan: 04
subsystem: workers
tags: [retry-logic, exponential-backoff, orphan-detection, job-lifecycle]

# Dependency graph
requires:
  - phase: 04-worker-execution
    plan: 02
    provides: WorkerInvokerFactory with Lambda/ECS/Docker invokers
  - phase: 04-worker-execution
    plan: 03
    provides: WorkerError with transient/permanent classification
provides:
  - WorkerExecutionService with exponential backoff retry for transient errors
  - OrphanSweeper background process for stuck job detection
  - JobService.findOrphanedJobs() method for timeout queries
affects: [callback-handling, job-monitoring, error-recovery]

# Tech tracking
tech-stack:
  added: []
  patterns: [exponential-backoff-retry, error-classification-retry, background-sweep, graceful-shutdown]

key-files:
  created:
    - platform/backend/src/workers/WorkerExecutionService.ts
    - platform/backend/src/workers/OrphanSweeper.ts
  modified:
    - platform/backend/src/services/JobService.ts
    - platform/backend/src/workers/index.ts
    - platform/backend/src/api/server.ts

key-decisions:
  - "Exponential backoff: delay * 2^(attempt-1) with maxDelayMs cap"
  - "Permanent errors fail immediately, transient errors retry up to maxRetries"
  - "OrphanSweeper runs every 60s, jobs timeout after 30 minutes by default"
  - "Execution ID stored in job.progress for CloudWatch correlation"

patterns-established:
  - "Pattern: ErrorClassification.isTransient determines retry eligibility"
  - "Pattern: setInterval cleanup via stop() for graceful shutdown"
  - "Pattern: Factory lookup via getInvokerForClanker() for polymorphic invocation"

# Metrics
duration: 4min
completed: 2026-01-19
---

# Phase 4: Plan 4 Summary

**WorkerExecutionService with exponential backoff retry for transient errors and OrphanSweeper background process for stuck job detection**

## Performance

- **Duration:** 4 min (226 seconds)
- **Started:** 2026-01-19T20:04:45Z
- **Completed:** 2026-01-19T20:08:31Z
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments

- WorkerExecutionService orchestrates worker invocation with retry logic
- Transient errors (throttling, network) retry with exponential backoff
- Permanent errors (config, permissions) fail immediately without retry
- Execution ID stored in job progress after successful invocation
- OrphanSweeper detects and marks stuck jobs as failed
- Clean shutdown via SIGTERM/SIGINT handlers

## Task Commits

Each task was committed atomically:

1. **Task 1: Create WorkerExecutionService with retry logic** - `93204d7` (feat)
2. **Task 2: Create OrphanSweeper for stuck job detection** - `c4c0031` (feat)
3. **Task 3: Wire up sweeper in server startup and update exports** - `1281dd9` (feat)

**Plan metadata:** (to be added in final commit)

## Files Created/Modified

### Created
- `platform/backend/src/workers/WorkerExecutionService.ts` - Orchestrates worker invocation with exponential backoff retry for transient errors, fails immediately on permanent errors
- `platform/backend/src/workers/OrphanSweeper.ts` - Background sweep process that detects and marks stuck jobs as failed

### Modified
- `platform/backend/src/services/JobService.ts` - Added `findOrphanedJobs()` method for querying active jobs past timeout
- `platform/backend/src/workers/index.ts` - Exported WorkerExecutionService and OrphanSweeper
- `platform/backend/src/api/server.ts` - Integrated OrphanSweeper startup/shutdown with configurable env vars

## Decisions Made

- **Exponential backoff formula:** `baseDelayMs * 2^(attempt-1)` with configurable cap (default 30s max)
- **Default retry configuration:** 3 max retries, 1000ms base delay, 30000ms max delay
- **OrphanSweeper defaults:** 60-second sweep interval, 30-minute job timeout
- **Execution ID storage:** Stored in `job.progress.executionId` for CloudWatch correlation
- **Environment configuration:** `ORPHAN_SWEEP_INTERVAL_MS` and `ORPHAN_JOB_TIMEOUT_MS` for runtime tuning

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- **TypeScript compilation:** Pre-existing errors in test files and other services not related to this plan's changes. Verified no errors were introduced by new WorkerExecutionService, OrphanSweeper, or server.ts changes.
- **Server startup verification:** Server started successfully with OrphanSweeper integration, no import or runtime errors.

## User Setup Required

None - no external service configuration required. Optional environment variables:

- `ORPHAN_SWEEP_INTERVAL_MS` - How often to check for orphaned jobs (default: 60000ms)
- `ORPHAN_JOB_TIMEOUT_MS` - Job timeout before marking as orphaned (default: 1800000ms = 30 minutes)

## Next Phase Readiness

- WorkerExecutionService ready to be integrated with job queue processing
- OrphanSweeper provides safety net for failed callbacks
- Error classification (transient vs permanent) enables intelligent retry behavior
- No blockers or concerns

---
*Phase: 04-worker-execution*
*Plan: 04*
*Completed: 2026-01-19*
