# Phase 7: Clanker Runtime Status - Context

**Gathered:** 2026-01-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Workers POST heartbeat and progress updates to platform API during task execution. Platform tracks worker liveness and displays real-time progress to users. Log streaming is included for visibility into worker execution.

</domain>

<decisions>
## Implementation Decisions

### Heartbeat behavior
- Heartbeat is tied to progress updates: worker sends ping after each meaningful step/task
- Not a separate fixed-interval heartbeat—each progress update serves as heartbeat
- Grace period of ~5 minutes before declaring job failed
- Visual indicator shown when job enters stale state during grace period
- Job marked as failed if no progress/heartbeat received within grace period

### Progress update format
- Structured fields: current step, status message, optional details object
- UI displays both: latest status (prominent) and full history (timeline)
- Percentage completion NOT required—step-based is sufficient

### Log streaming
- Separate `/logs` endpoint for log line streaming (not combined with progress updates)
- Log lines visible in platform UI
- Workers send logs during execution via dedicated endpoint

### Claude's Discretion
- Exact structure of details object (flexible JSON based on needs)
- Log batching strategy (send per line vs batch)
- Exact UI layout for progress history vs current status
- Polling vs websockets for log streaming in UI

</decisions>

<specifics>
## Specific Ideas

- Progress updates double as heartbeats—no separate ping mechanism needed
- User should see "last seen" timestamp and visual stale indicator
- Log viewer should be accessible from job detail page
- Grace period allows for longer tasks without false failures

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

---

*Phase: 07-clanker-runtime-status*
*Context gathered: 2026-01-21*
