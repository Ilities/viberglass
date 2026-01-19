---
phase: 04-worker-execution
plan: 01
subsystem: workers
tags: [worker-invocation, factory-pattern, error-handling, typescript]

# Dependency graph
requires:
  - phase: 03-worker-configuration
    provides: WorkerPayload types, credential providers, S3 config loading
provides:
  - WorkerInvoker interface for all worker types (Lambda, ECS, Docker)
  - WorkerError classification system for retry logic (TRANSIENT vs PERMANENT)
  - WorkerInvokerFactory skeleton for invoker registration and retrieval
affects: [04-02, 04-03, 04-04]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Factory pattern with singleton (mirrors CredentialProviderFactory)
    - Error classification for retry logic (transient vs permanent)
    - Interface-based invoker abstraction

key-files:
  created:
    - platform/backend/src/workers/WorkerInvoker.ts
    - platform/backend/src/workers/errors/WorkerError.ts
    - platform/backend/src/workers/WorkerInvokerFactory.ts
    - platform/backend/src/workers/index.ts
  modified: []

key-decisions:
  - "WorkerInvoker.invoke() returns execution ID only (fire-and-forget pattern)"
  - "ErrorClassification enum enables retry logic in Plans 02-04"
  - "Factory registration pattern allows dynamic invoker addition in later plans"

patterns-established:
  - "Pattern 1: Factory pattern with registerInvoker() for extensibility"
  - "Pattern 2: Error classification via isTransient/isPermanent getters"
  - "Pattern 3: Barrel export in index.ts for clean imports"

# Metrics
duration: 2min
completed: 2026-01-19
---

# Phase 4 Plan 1: Worker Invoker Interface Summary

**WorkerInvoker abstraction with error classification and factory pattern for Lambda/ECS/Docker worker invocation**

## Performance

- **Duration:** 2 min
- **Started:** 2026-01-19T19:55:25Z
- **Completed:** 2026-01-19T19:57:36Z
- **Tasks:** 3
- **Files created:** 4

## Accomplishments

- Created WorkerInvoker interface defining invoke() and isAvailable() methods
- Created ErrorClassification enum (TRANSIENT vs PERMANENT) for retry logic
- Created WorkerInvokerFactory following CredentialProviderFactory pattern
- Established barrel export pattern for clean module imports

## Task Commits

Each task was committed atomically:

1. **Task 1: Create WorkerInvoker interface and InvocationResult type** - `7a5389b` (feat)
2. **Task 2: Create WorkerError with error classification** - `9c60d16` (feat)
3. **Task 3: Create WorkerInvokerFactory skeleton** - `b4d7517` (feat)

**Plan metadata:** (to be added in final commit)

## Files Created/Modified

- `platform/backend/src/workers/WorkerInvoker.ts` - Core interface with WorkerType union and InvocationResult
- `platform/backend/src/workers/errors/WorkerError.ts` - Error classification for retry logic
- `platform/backend/src/workers/WorkerInvokerFactory.ts` - Factory with registration pattern
- `platform/backend/src/workers/index.ts` - Barrel export for all worker types

## Decisions Made

- WorkerInvoker.invoke() returns Promise<InvocationResult> with executionId only (fire-and-forget)
- ErrorClassification enum enables clean retry logic via isTransient/isPermanent getters
- Factory uses registerInvoker() pattern to allow dynamic registration in Plans 02/03

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Factory skeleton ready for LambdaInvoker registration in Plan 04-02
- Error classification system ready for ECS/Docker invokers in Plan 04-03
- Interface contract established for all invoker implementations

---
*Phase: 04-worker-execution*
*Completed: 2026-01-19*
