# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-01-19)

**Core value:** Users can create tickets that coding agents automatically fix, with the entire flow—ticket creation, agent execution, PR creation, and status updates—working end-to-end.

**Current focus:** Phase 8: Webhook Provider Architecture

## Current Position

Phase: 8 of 12 (Webhook Provider Architecture)
Plan: 1 of 3 (Webhook Provider Database Schema)
Status: In progress - Plan 1 complete
Last activity: 2026-01-22 — Webhook provider database schema with deduplication tracking

Progress: [█████████░] 92%

## Performance Metrics

**Velocity:**
- Total plans completed: 50
- Average duration: ~4 minutes
- Total execution time: 3.0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01 | 5 | 5 | 4m |
| 02 | 2 | 2 | 2m |
| 03 | 3 | 3 | 3m |
| 04 | 4 | 4 | 3m |
| 04.1 | 4 | 4 | 5m |
| 04.2 | 3 | 3 | 6m |
| 04.3 | 4 | 4 | 3m |
| 04.4 | 2 | 2 | 10m |
| 05 | 3 | 3 | 4m |
| 06 | 2 | 2 | 3m |
| 07 | 4 | 4 | 2.5m |
| 08 | 1 | 3 | 1m |

**Recent Trend:**
- Last 5 plans: 3m, 3m, 3m, 2m, 1m
- Trend: Stable

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Pragmatic testing approach | Focus on complex logic (error classification, retry), skip trivial tests | 134 tests for worker execution flow |
| Validation factory pattern | Single createValidator() function reduces 285 lines to ~80 | DRY middleware code |
| crypto.randomUUID() for IDs | Replaces deprecated substr(), cryptographically secure | Modern ID generation |
| Error propagation over mock fallbacks | Silent error swallowing masks real problems | Proper UI error states |
| Type safety over 'as any' | Enable better IDE support and compile-time checking | Proper type definitions |
| Formatting utilities separation | Separates data access from presentation logic | Cleaner architecture with lib/formatters.ts |
| getTicketStats() placeholder | Keep function with zeros rather than break UI | TODO for future API endpoint |
| AgentCLIResult intermediate type | Extends ExecutionResult with optional cost without breaking existing types | Type-safe agent cost propagation |
| Indexed access type pattern | Use Type['field'] for literal casts instead of duplicate type definitions | DRY type-safe casts |
| @viberator/types for shared types | Import from types package instead of local models for cross-package compatibility | FileUploadService import fixed |
| Cross-platform Docker networking | Document host.docker.internal (Mac/Win) vs 172.17.0.1 (Linux) for container-to-host | Local Docker Setup guide covers all platforms |
| Fargate Spot for non-production | 70% cost savings for development/staging environments | AWS ECS Setup recommends Spot for dev workloads |
| Dan Abramov's useInterval pattern | useRef stores callback to prevent stale closures, interval continues without reset | Declarative intervals with proper cleanup |
| Page Visibility API for polling | Pauses polling when tab hidden (document.hidden) to save bandwidth/server resources | usePolling hook automatically pauses/resumes |
| Status change detection for toasts | Track previousStatus to only notify on changes, not initial load | useJobStatus shows toasts only when jobs transition to terminal states |
| 3-second polling interval | Balances freshness with server load | useJobStatus polls getJob every 3 seconds |
| Params guard pattern for useParams | Check useParams values before use to handle initial render edge case | Job detail page guards undefined jobId with loading state |
| Animated status indicators | Use motion/react with conditional animation for visual feedback | JobStatusIndicator pulses when job is active + polling |
| Three-tier clanker health checks | resourceExists (DB), deploymentConfigured (strategy+config), invokerAvailable (connectivity) | ClankerHealthService validates all three before marking healthy |
| Server-client component separation | Keep main page as server component, use client components for interactivity | ClankerHealth is a client component while page.tsx remains server component for SSR |
| UUID primary keys for new tables | Consistent with modern PostgreSQL practices, better than varchar for performance | job_progress_updates and job_log_lines use uuid |
| ON DELETE CASCADE foreign keys | Automatic cleanup when jobs are deleted prevents orphaned records | progress and log tables cascade on job deletion |
| Partial index on last_heartbeat | Optimizes stale job queries without index bloat, only indexes active jobs | idx_jobs_last_heartbeat has WHERE status = 'active' |
| Separated progress from log tables | Different query patterns (history vs streaming) warrant separate storage | job_progress_updates for timeline, job_log_lines for streaming |
| Transaction for progress updates | Atomic heartbeat + history insert prevents data races between concurrent progress calls | JobService.recordProgress() uses db.transaction().execute() |
| JSON.stringify for jsonb columns | Kysely requires string serialization for JSON columns, matching existing pattern | recordProgress() and recordLog() use JSON.stringify() |
| Heartbeat monitoring with grace period | Jobs that stop sending heartbeats are automatically failed after 5 minutes | HeartbeatSweeper runs every 60 seconds checking last_heartbeat < grace period |
| Worker callback retry pattern | All worker callbacks use exponential backoff with 429/5xx retry, non-retryable 4xx fail fast | CallbackClient sendResult/sendProgress/sendLog all share retry logic |
| Differential timeouts for callbacks | Results: 30s, Progress: 10s, Logs: 5s - reflects priority of each callback type | Prevents worker blocking on low-priority log delivery |
| Logs reversed to chronological order | DESC query from database reversed for UI readability (oldest to newest) | LogViewer shows logs in chronological order |
| 5 minute stale threshold | Matches HeartbeatSweeper grace period for consistency between backend and frontend | isJobStale() uses same 5 minute threshold |
| Live indicator only when active and polling | Visual feedback only meaningful when job is actively running and polling is enabled | LogViewer live indicator checks isPolling && status === 'active' |
| ProgressTimeline returns null for queued | Queued jobs have no progress yet, hiding component is cleaner than empty state | ProgressTimeline component returns null for currentStatus === 'queued' |
| Nullable project_id for webhook configs | Allows tenant-level default configurations without being bound to a specific project | webhook_provider_configs.project_id is nullable with ON DELETE CASCADE |
| api_token_encrypted in provider config | Stores outbound API credentials (GitHub PAT, Jira API token) alongside webhook config | Simplifies credential management for posting results back to platforms |
| Unique delivery_id for webhook deduplication | Database-level unique constraint prevents duplicate webhook processing from retries | webhook_delivery_attempts.delivery_id has unique constraint |
| Check constraints for webhook enums | provider and status fields use CHECK constraints for type safety at database level | `provider IN ('github', 'jira')` and `status IN ('pending', 'processing', 'succeeded', 'failed')` |

### Roadmap Evolution

- Phase 4.1 inserted after Phase 4: Allow frontend to invoke workers and initiate jobs (URGENT)
- Phase 4.2 inserted after Phase 4.1: Testing (URGENT)
- Phase 4.3 inserted after Phase 4.2: Application organization and structural refactoring (URGENT)
- Phase 4.4 inserted after Phase 4.3: E2E flow verification and infrastructure setup (URGENT)

### Pending Todos

None yet.

### Blockers/Concerns

- Frontend static build requires backend running on port 8888 (expected behavior for SSR with data fetching)

## Session Continuity

Last session: 2026-01-22
Stopped at: Completed Phase 8 Plan 01 - Webhook Provider Database Schema
Resume file: None
