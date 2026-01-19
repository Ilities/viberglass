---
phase: 04-worker-execution
plan: 03
subsystem: workers
tags: [docker, dockerode, container-invocation, worker-invoker, factory-pattern]

# Dependency graph
requires:
  - phase: 04-worker-execution
    plan: 01
    provides: WorkerInvoker interface, WorkerError classification, WorkerInvokerFactory skeleton
  - phase: 04-worker-execution
    plan: 02
    provides: LambdaInvoker, EcsInvoker (Note: Plan 02 was not executed, invokers created as blocking fix)
provides:
  - DockerInvoker for local Docker container execution
  - Complete WorkerInvokerFactory with all three invokers (Lambda, ECS, Docker)
  - Barrel exports for all worker invokers
affects: [04-04]

# Tech tracking
tech-stack:
  added: [dockerode ^4.0.9, @types/dockerode ^3.3.47]
  patterns:
    - Docker container invocation via dockerode SDK
    - Unique container naming with viberator-job-{job.id}
    - AutoRemove container cleanup
    - Error classification for Docker daemon issues

key-files:
  created:
    - platform/backend/src/workers/invokers/DockerInvoker.ts
    - platform/backend/src/workers/invokers/LambdaInvoker.ts (blocking fix)
    - platform/backend/src/workers/invokers/EcsInvoker.ts (blocking fix)
  modified:
    - platform/backend/src/workers/index.ts
    - platform/backend/src/workers/WorkerInvokerFactory.ts

key-decisions:
  - "dockerode default import works with esModuleInterop enabled"
  - "Container name uses viberator-job-{job.id} for uniqueness"
  - "AutoRemove: true for automatic cleanup after execution"

patterns-established:
  - "Pattern 1: Docker containers receive JOB_PAYLOAD via environment variable"
  - "Pattern 2: Error classification distinguishes transient (daemon unavailable) from permanent (image not found)"
  - "Pattern 3: isAvailable() uses docker.ping() for connectivity check"

# Metrics
duration: 4min
completed: 2026-01-19
---

# Phase 4 Plan 3: Docker Invoker Summary

**Docker container invocation using dockerode SDK with AutoRemove cleanup and unique container naming**

## Performance

- **Duration:** 4 min
- **Started:** 2026-01-19T19:59:00Z
- **Completed:** 2026-01-19T20:03:00Z
- **Tasks:** 3
- **Files created:** 3, modified: 2

## Accomplishments

- Created DockerInvoker implementing WorkerInvoker interface for local Docker execution
- Docker containers receive job payload via JOB_PAYLOAD environment variable
- Container names use pattern `viberator-job-${job.id}` for uniqueness
- AutoRemove enabled for automatic container cleanup after completion
- Error classification distinguishes transient (daemon unavailable, name collision) from permanent (image not found)
- isAvailable() uses docker.ping() to verify Docker daemon connectivity
- WorkerInvokerFactory now initializes all three invokers (Lambda, ECS, Docker)

## Task Commits

Each task was committed atomically:

1. **Task 1: Install dockerode SDK** - Packages already installed, no commit needed
2. **Task 2: Implement DockerInvoker** - `1e9177b` (feat)
3. **Task 3: Update exports and register all invokers in factory** - `13dc2b5` (feat)

**Plan metadata:** (to be added in final commit)

## Files Created/Modified

- `platform/backend/src/workers/invokers/DockerInvoker.ts` - Docker container invocation via dockerode
- `platform/backend/src/workers/invokers/LambdaInvoker.ts` - Lambda async invocation (blocking fix)
- `platform/backend/src/workers/invokers/EcsInvoker.ts` - ECS RunTask invocation (blocking fix)
- `platform/backend/src/workers/index.ts` - Added DockerInvoker export
- `platform/backend/src/workers/WorkerInvokerFactory.ts` - Updated to initialize all invokers

## Decisions Made

- Used default import for dockerode (esModuleInterop is enabled in tsconfig)
- Container naming pattern uses job ID for uniqueness
- AutoRemove: true ensures containers clean up after completion
- Errors classified as transient if they involve Docker daemon connectivity issues

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Created LambdaInvoker and EcsInvoker**
- **Found during:** Task 3 (factory registration)
- **Issue:** Plan 04-02 hadn't been executed, but Task 3 requires factory to register all invokers for code to compile
- **Fix:** Created LambdaInvoker and EcsInvoker following Plan 04-02 specifications
- **Files modified:** platform/backend/src/workers/invokers/LambdaInvoker.ts, platform/backend/src/workers/invokers/EcsInvoker.ts
- **Verification:** TypeScript compiles, factory returns ['lambda', 'ecs', 'docker']
- **Committed in:** 13dc2b5 (part of Task 3 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** LambdaInvoker and EcsInvoker were required for factory to compile. This work was planned in 04-02 but hadn't been executed yet. No scope creep - this is work that would have been done in 04-02.

## Issues Encountered

- Initial dockerode import using `import * as Docker` caused TS1259 error - fixed by using default import `import Docker from 'dockerode'` which works with esModuleInterop enabled

## User Setup Required

None - no external service configuration required. For Docker invocation to work, the platform needs:
- Docker daemon running at /var/run/docker.sock (or configured socket path)
- Container images must be available locally or pullable

## Next Phase Readiness

- DockerInvoker complete and ready for Plan 04-04 (Orphan Detection / Retry Logic)
- All three invokers (Lambda, ECS, Docker) registered in factory
- Error classification system in place for transient/permanent detection

---
*Phase: 04-worker-execution*
*Completed: 2026-01-19*
