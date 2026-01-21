---
phase: 07-clanker-runtime-status
plan: 03
subsystem: API
tags: [kysely, workers, heartbeat, stale-job-detection, callback-client, exponential-backoff]

# Dependency graph
requires:
  - phase: 07-clanker-runtime-status
    plan: 02
    provides: POST /api/jobs/:jobId/progress endpoint, POST /api/jobs/:jobId/logs endpoint, JobService.recordProgress() method, last_heartbeat column
provides:
  - CallbackClient.sendProgress() method for workers to send progress updates
  - CallbackClient.sendLog() method for workers to send log lines
  - HeartbeatSweeper background service for detecting stale jobs
  - JobService.findStaleJobs() method with NULL heartbeat handling
affects: [workers, 07-04, job-monitoring, reliability]

# Tech tracking
tech-stack:
  added: []
  patterns: [heartbeat-monitoring, stale-job-detection, exponential-backoff-retry, worker-callback-pattern]

key-files:
  created:
    - platform/backend/src/workers/HeartbeatSweeper.ts
  modified:
    - viberator/app/src/workers/CallbackClient.ts
    - platform/backend/src/services/JobService.ts
    - platform/backend/src/api/server.ts

key-decisions:
  - "10 second timeout for progress, 5 seconds for logs: Different timeouts reflect priority - result is most critical, progress is medium, logs are lowest"
  - "NULL heartbeat in stale job check: Jobs that never send progress still fail after grace period from started_at"

patterns-established:
  - "HeartbeatSweeper pattern: Same structure as OrphanSweeper but monitors last_heartbeat instead of started_at"
  - "Worker callback pattern: All callbacks use exponential backoff, X-Tenant-Id header, sensitive info redaction"

# Metrics
duration: 3min
completed: 2026-01-21
---

# Phase 7 Plan 3: Worker Callback Client and Heartbeat Sweeper Summary

**Worker progress/log callbacks with exponential backoff retry and HeartbeatSweeper for automatic stale job detection**

## Performance

- **Duration:** 3 min
- **Started:** 2026-01-21T14:21:09Z
- **Completed:** 2026-01-21T14:24:00Z
- **Tasks:** 3
- **Files modified:** 3
- **Files created:** 1

## Accomplishments

- Added `CallbackClient.sendProgress()` method for worker progress updates to platform API
- Added `CallbackClient.sendLog()` method for worker log streaming to platform API
- Created `HeartbeatSweeper` service that runs every 60 seconds to detect jobs with stale heartbeats
- Added `JobService.findStaleJobs()` method with complex OR condition for NULL heartbeat handling
- Integrated HeartbeatSweeper into server startup with graceful shutdown support

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend CallbackClient with progress and log methods** - `7d21a10` (feat)
2. **Task 2: Create HeartbeatSweeper service** - `257ca96` (feat)
3. **Task 3: Integrate HeartbeatSweeper into server startup** - `9855c51` (feat)

**Plan metadata:** (to be added)

## Files Created/Modified

- `viberator/app/src/workers/CallbackClient.ts` - Added sendProgress() and sendLog() methods with exponential backoff retry
- `platform/backend/src/workers/HeartbeatSweeper.ts` - New service for detecting jobs with stale heartbeats
- `platform/backend/src/services/JobService.ts` - Added findStaleJobs() method with NULL heartbeat handling
- `platform/backend/src/api/server.ts` - Integrated HeartbeatSweeper startup/shutdown

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| 10 second timeout for progress, 5 seconds for logs | Different timeouts reflect priority - results are most critical, progress updates are medium priority, logs are lowest |
| NULL heartbeat in stale job check | Jobs that never send progress should still fail after grace period from started_at |

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

Environment variables (optional, for tuning):
- `HEARTBEAT_SWEEP_INTERVAL_MS`: How often to check for stale jobs (default: 60000ms = 1 minute)
- `HEARTBEAT_GRACE_PERIOD_MS`: How long before job is considered stale (default: 300000ms = 5 minutes)

## Next Phase Readiness

- Workers can now send progress updates and log lines to the platform
- HeartbeatSweeper automatically detects and fails jobs that stop communicating
- Frontend can consume job log lines via GET /api/jobs/:jobId/logs endpoint
- Final plan 07-04 can now focus on frontend UI for progress and log display

---
*Phase: 07-clanker-runtime-status*
*Completed: 2026-01-21*
