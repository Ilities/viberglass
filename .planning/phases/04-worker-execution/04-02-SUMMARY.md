---
phase: 04-worker-execution
plan: 02
subsystem: workers
tags: [aws-sdk-v3, lambda, ecs, worker-invocation, error-classification]

# Dependency graph
requires:
  - phase: 04-worker-execution
    plan: 01
    provides: WorkerInvoker interface, WorkerError classification, WorkerInvokerFactory
provides:
  - LambdaInvoker for AWS Lambda async invocation using InvocationType: Event
  - EcsInvoker for ECS RunTask invocation with failure checking
  - Error classification for Lambda/ECS errors (transient vs permanent)
affects: [04-03]

# Tech tracking
tech-stack:
  added:
    - "@aws-sdk/client-lambda@3.971.0"
    - "@aws-sdk/client-ecs@3.971.0"
  patterns:
    - AWS SDK v3 modular clients
    - Async invocation pattern (fire-and-forget)
    - Error classification for retry logic

key-files:
  created:
    - platform/backend/src/workers/invokers/LambdaInvoker.ts
    - platform/backend/src/workers/invokers/EcsInvoker.ts
  modified:
    - platform/backend/package.json
    - platform/backend/src/workers/index.ts

key-decisions:
  - "LambdaInvoker uses InvocationType: 'Event' for async (returns 202, no response payload)"
  - "EcsInvoker checks response.failures array - RunTask can return 200 but have task launch failures"
  - "Execution ID is requestId for Lambda, taskArn for ECS"
  - "Error classification enables retry logic: transient (throttling, 5xx) vs permanent (config errors)"

patterns-established:
  - "Pattern 1: AWS SDK v3 client instantiation with region fallback (config -> env -> us-east-1)"
  - "Pattern 2: Error classification via error name checking against known transient error lists"
  - "Pattern 3: Payload building with job data and clanker deployment config"

# Metrics
duration: 2min
completed: 2026-01-19
---

# Phase 4 Plan 2: Lambda and ECS Worker Invokers Summary

**LambdaInvoker with Event-type async invocation and EcsInvoker with RunTask failure checking, both implementing WorkerInvoker interface**
## Performance

- **Duration:** 2 min
- **Started:** 2026-01-19T19:58:49Z
- **Completed:** 2026-01-19T20:01:18Z
- **Tasks:** 3
- **Files created:** 2
- **Files modified:** 2

## Accomplishments

- LambdaInvoker invokes Lambda functions asynchronously using `InvocationType: 'Event'`, returning requestId as execution ID
- EcsInvoker starts ECS tasks via RunTask API, checking response.failures array for task launch errors
- Both invokers classify errors as transient (retry) or permanent (fail immediately)
- Error classification covers throttling, server errors, and configuration failures

## Task Commits

Each task was committed atomically:

1. **Task 1: Install AWS SDK v3 Lambda and ECS clients** - `fa0076d` (feat)
2. **Task 2: Implement LambdaInvoker for AWS Lambda async invocation** - `aff841c` (feat)
3. **Task 3: Implement EcsInvoker for ECS RunTask invocation** - `7c67d0b` (feat)

**Plan metadata:** (to be added in final commit)

## Files Created/Modified

- `platform/backend/package.json` - Added @aws-sdk/client-lambda and @aws-sdk/client-ecs
- `platform/backend/src/workers/invokers/LambdaInvoker.ts` - Lambda async invocation with Event type
- `platform/backend/src/workers/invokers/EcsInvoker.ts` - ECS RunTask with failure checking
- `platform/backend/src/workers/index.ts` - Barrel exports for both invokers

## Decisions Made

- LambdaInvoker uses `InvocationType: 'Event'` for async (returns 202, no response payload) - this is critical for fire-and-forget pattern
- EcsInvoker must check `response.failures` array because RunTask can return 200 but have task launch failures
- Execution ID extraction: requestId from Lambda metadata, taskArn from ECS response
- Transient errors include throttling (TooManyRequestsException) and server errors (5xx, ServerException)
- Permanent errors include ResourceNotFoundException, InvalidParameterException, and ECS RESOURCE/ATTRIBUTE failures

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed TypeScript type casting for EcsDeploymentConfig**
- **Found during:** Task 3 (EcsInvoker implementation)
- **Issue:** TypeScript complained about casting `Record<string, unknown>` to `EcsDeploymentConfig` directly
- **Fix:** Added `as unknown` intermediate cast: `clanker.deploymentConfig as unknown as EcsDeploymentConfig | undefined`
- **Files modified:** platform/backend/src/workers/invokers/EcsInvoker.ts
- **Committed in:** 7c67d0b (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Fix necessary for TypeScript compilation. No scope creep.

## Issues Encountered

None - all tasks completed as planned.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- LambdaInvoker and EcsInvoker implement WorkerInvoker interface
- Ready for DockerInvoker implementation in Plan 04-03
- Error classification pattern established for all invoker types
- WorkerInvokerFactory can register these invokers for runtime selection

---
*Phase: 04-worker-execution*
*Completed: 2026-01-19*
