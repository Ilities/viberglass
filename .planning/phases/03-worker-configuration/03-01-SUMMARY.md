---
phase: 03-worker-configuration
plan: 01
subsystem: worker
tags: typescript, payload-types, worker-configuration, lambda, ecs, docker

# Dependency graph
requires:
  - phase: 02-result-callback
    provides: ResultCallback types and CallbackClient for worker status updates
provides:
  - Type-specific worker payload interfaces (BaseWorkerPayload, LambdaPayload, EcsPayload, DockerPayload)
  - Instruction file reference types (S3InstructionFile for AWS, MountedInstructionFile for Docker)
  - WorkerPayload union type for type discrimination via workerType field
affects: [worker-handlers, platform-worker-invocation]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Type-specific payload pattern: separate interfaces for Lambda/ECS/Docker with shared base"
    - "Instruction file reference pattern: S3 URLs for AWS workers, mount paths for Docker"
    - "WorkerType discrimination: literal 'lambda' | 'ecs' | 'docker' for type narrowing"

key-files:
  created: []
  modified:
    - viberator/app/src/workers/types.ts

key-decisions:
  - "BaseWorkerPayload contains all shared fields (tenantId, jobId, clankerId, repository, task, context, settings)"
  - "AWS workers (Lambda/ECS) use S3InstructionFile with s3Url for fetching config files at runtime"
  - "Docker workers use MountedInstructionFile with mountPath for volume-mounted config files"
  - "All payloads include requiredCredentials array for dynamic credential fetching"
  - "Legacy CodingJobData retained for backward compatibility with existing lambda-handler"

patterns-established:
  - "WorkerType literal field enables TypeScript type discrimination for WorkerPayload union"
  - "Instruction files referenced by location (S3 URL or mount path) not inline content"
  - "Payload-based configuration: workers receive complete config at invocation, no API calls needed"

# Metrics
duration: 1min
completed: 2026-01-19
---

# Phase 3 Plan 1: Type-Specific Worker Payload Interfaces Summary

**Worker payload interfaces with BaseWorkerPayload, Lambda/ECS/Docker type-specific extensions, and S3/mounted instruction file references**

## Performance

- **Duration:** 1 min
- **Started:** 2026-01-19T19:39:46Z
- **Completed:** 2026-01-19T19:40:57Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments

- Created BaseWorkerPayload interface with shared fields for all worker types
- Created LambdaPayload and EcsPayload with S3InstructionFile[] for AWS workers
- Created DockerPayload with MountedInstructionFile[] for Docker workers
- Created WorkerPayload union type for type discrimination
- Existing wildcard export in index.ts already exports all new types

## Task Commits

Each task was committed atomically:

1. **Task 1: Create BaseWorkerPayload and type-specific payload interfaces** - `be06b27` (feat)
2. **Task 2: Export new payload types from workers module** - N/A (already exported via `export * from './types'`)

**Plan metadata:** TBD (docs: complete plan)

## Files Created/Modified

- `viberator/app/src/workers/types.ts` - Added BaseWorkerPayload, LambdaPayload, EcsPayload, DockerPayload, WorkerPayload, S3InstructionFile, MountedInstructionFile

## Decisions Made

- Used S3 URLs for AWS workers (Lambda/ECS) to fetch instruction files at runtime using platform credentials
- Used mount paths for Docker workers since containers can have files volume-mounted at startup
- Included clankerId in BaseWorkerPayload for worker to identify which clanker configuration it's running
- requiredCredentials as string array enables dynamic credential fetching based on clanker config
- Kept CodingJobData interface for backward compatibility with existing lambda-handler

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- Pre-existing TypeScript errors in ClaudeCodeAgent.ts (missing @anthropic-ai/claude-agent-sdk package) unrelated to this plan

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Worker payload types established and ready for handler implementation
- Next phase can implement Lambda/ECS handlers using LambdaPayload/EcsPayload types
- ConfigLoader class can be implemented to fetch S3 instruction files for AWS workers

---
*Phase: 03-worker-configuration*
*Completed: 2026-01-19*
