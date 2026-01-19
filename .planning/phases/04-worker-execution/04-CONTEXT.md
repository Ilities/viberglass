# Phase 4: Worker Execution - Context

**Gathered:** 2026-01-19
**Status:** Ready for planning

<domain>
## Phase Boundary

Platform invokes Lambda/ECS/Docker workers asynchronously via AWS SDK with retry logic. This phase delivers the invocation mechanism — workers receive payloads (Phase 3) and send results via callback (Phase 2).

</domain>

<decisions>
## Implementation Decisions

### Worker Type Abstraction
- Single `WorkerInvoker` interface for all worker types (Lambda, ECS, Docker)
- `invoke(job, config)` method returns execution ID only (AWS request ID, task ARN, container ID)
- Async-only invocation — all workers fire-and-forget, results come via callback
- Invoker handles payload serialization — accepts typed `WorkerPayload`, converts to JSON/bytes as needed

### Worker Selection
- Worker type configuration lives on the Clanker (workerType field + type-specific config)
- Job inherits worker type from its clanker
- `WorkerInvokerFactory.getInvoker(clanker.workerType)` returns typed invoker instance
- All three worker types (Lambda, ECS, Docker) implemented in this phase
- Validate worker config at clanker creation AND fail gracefully at runtime if somehow invalid

### Execution Tracking
- Store execution ID on job record for debugging/observability
- Platform-side timeout: if no callback received within threshold, mark job as timed out
- Background sweep process checks for 'running' jobs past timeout, marks them failed (orphan detection)
- Retry invocation based on error type: transient errors (throttling, network) retry with backoff, config errors fail immediately

### Claude's Discretion
- Specific AWS SDK patterns for each invoker type
- Background sweep interval and implementation approach
- Exact retry counts and backoff timing
- Error classification logic (which errors are transient vs permanent)

</decisions>

<specifics>
## Specific Ideas

- Factory pattern mirrors existing CredentialProviderFactory from Phase 1
- Execution ID storage enables future debugging and CloudWatch correlation
- Background sweep is "safety net" — workers should always callback, but platform handles failures

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 04-worker-execution*
*Context gathered: 2026-01-19*
