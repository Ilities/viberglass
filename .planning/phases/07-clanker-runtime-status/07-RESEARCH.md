# Phase 7: Clanker Runtime Status - Research

**Researched:** 2026-01-21
**Domain:** Worker heartbeat/progress tracking + log streaming
**Confidence:** HIGH

## Summary

This phase implements runtime status tracking for clanker jobs. The platform needs to receive progress updates (which double as heartbeats) from workers during task execution, track worker liveness with a grace period before declaring jobs stale/failed, and provide real-time visibility into job progress and logs via the UI.

**Primary recommendation:** Extend existing JobService with progress update endpoints, add database columns for heartbeat tracking, and use simple polling for status updates (existing pattern) with optional SSE for log streaming.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Express | 4.16+ | Backend API routes | Existing platform backend uses Express |
| Kysely | 0.27+ | Database queries | Existing database layer uses Kysely |
| Next.js 15 | 15+ | Frontend API client | Existing frontend framework |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| axios | 1.6+ | Worker HTTP client | CallbackClient already uses axios for callbacks |
| Server-Sent Events | Native | Log streaming | For one-way server-to-client streaming |

### Real-time Technology Decision

**For job status/progress updates: Use polling (existing pattern)**
- Existing `useJobStatus` hook already polls every 3 seconds
- Page Visibility API integration pauses polling when tab hidden
- Stops automatically on terminal state
- **Rationale:** Status updates are low-frequency, polling is simpler, pattern already exists

**For log streaming: Use Server-Sent Events (SSE)**
- One-way server-to-client streaming (perfect for logs)
- Browser-native, single HTTP connection
- Automatic reconnection handling
- Lighter than WebSockets for this use case
- **Alternative:** Could use polling if SSE complexity is too high

### Installation

No additional dependencies needed. Existing stack covers all requirements.

## Architecture Patterns

### Existing Backend Pattern (Express + Kysely)

```typescript
// File: platform/backend/src/api/routes/jobs.ts

// Existing result callback endpoint pattern to follow:
router.post(
  "/:jobId/result",
  tenantMiddleware,
  validateResultCallback,
  async (req: Request, res: Response) => {
    // 1. Verify job exists and belongs to tenant
    // 2. Check idempotency (reject terminal state updates)
    // 3. Update job status
    // 4. Return response
  }
);
```

### New Endpoints to Add

```typescript
// Progress update endpoint (doubles as heartbeat)
router.post(
  "/:jobId/progress",
  tenantMiddleware,
  validateProgressUpdate,
  async (req: Request, res: Response) => {
    const { jobId } = req.params;
    const { step, message, details, timestamp } = req.body;

    // Update job.last_heartbeat
    // Store progress entry in job_progress_updates table
    // Return 200 OK
  }
);

// Log streaming endpoint
router.get("/:jobId/logs", async (req: Request, res: Response) => {
  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  // Stream new log lines as they arrive
  // Client can subscribe after page load
});
```

### Recommended Database Schema

```sql
-- Add to jobs table (new migration)
ALTER TABLE jobs ADD COLUMN last_heartbeat timestamp;
ALTER TABLE jobs ADD COLUMN last_heartbeat_grace_period_seconds integer DEFAULT 300;
CREATE INDEX idx_jobs_last_heartbeat ON jobs(last_heartbeat) WHERE status = 'active';

-- New table for progress history
CREATE TABLE job_progress_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id varchar(255) NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  step varchar(100),
  message text NOT NULL,
  details jsonb,
  created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_progress_updates_job_id ON job_progress_updates(job_id, created_at DESC);

-- New table for log lines
CREATE TABLE job_log_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id varchar(255) NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  level varchar(20) NOT NULL, -- 'info', 'warn', 'error', 'debug'
  message text NOT NULL,
  source varchar(100), -- optional component name
  created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_log_lines_job_id ON job_log_lines(job_id, created_at DESC);
```

### Worker-Side Pattern

```typescript
// File: viberator/app/src/workers/CallbackClient.ts
// Extend existing CallbackClient with progress method

export class CallbackClient {
  // Existing sendResult method - keep as-is

  async sendProgress(
    jobId: string,
    tenantId: string,
    progress: {
      step: string;
      message: string;
      details?: Record<string, unknown>;
    }
  ): Promise<void> {
    const url = `${this.apiUrl}/api/jobs/${jobId}/progress`;

    await axios.post(url, progress, {
      headers: {
        "Content-Type": "application/json",
        "X-Tenant-Id": tenantId,
      },
      timeout: 10000, // Shorter timeout for progress updates
    });
  }

  async sendLog(
    jobId: string,
    tenantId: string,
    log: {
      level: 'info' | 'warn' | 'error' | 'debug';
      message: string;
      source?: string;
    }
  ): Promise<void> {
    const url = `${this.apiUrl}/api/jobs/${jobId}/logs`;

    await axios.post(url, log, {
      headers: {
        "Content-Type": "application/json",
        "X-Tenant-Id": tenantId,
      },
      timeout: 5000,
    });
  }
}
```

### Frontend Pattern (Existing)

The frontend already has a polling pattern via `useJobStatus` hook. Extend it to include:

1. **Progress updates:** Already included in `job.progress` - just need to display timeline
2. **Last seen:** Add display of `last_heartbeat` timestamp with "stale" indicator
3. **Log viewer:** New component using SSE or polling

```typescript
// Extend existing JobStatus type
export interface JobStatus {
  // ... existing fields
  lastHeartbeat?: string;
  progressUpdates?: ProgressUpdate[]; // New: history
  logCount?: number; // For log viewer
}

export interface ProgressUpdate {
  step: string;
  message: string;
  details?: Record<string, unknown>;
  createdAt: string;
}
```

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Heartbeat tracking | Custom timeout logic | Database timestamp + cron | Existing OrphanSweeper pattern |
| Real-time updates | WebSocket server | SSE (native) or polling | SSE is browser-native, polling already exists |
| Log buffering | In-memory queue | Database table | Survives restarts, scales across instances |
| Retry logic | Custom exponential backoff | axios retries (existing) | CallbackClient already does this |

## Common Pitfalls

### Pitfall 1: Stale Job Detection Race Conditions
**What goes wrong:** Multiple processes marking same job as failed
**Why it happens:** Concurrent stale job sweeps
**How to avoid:** Use database row-level locking or compare-and-update pattern
```sql
UPDATE jobs
SET status = 'failed'
WHERE id = $1 AND status = 'active' AND last_heartbeat < $2;
-- Check rows affected; if 0, another process already handled it
```

### Pitfall 2: SSE Connection Leaks
**What goes wrong:** Server doesn't detect disconnected clients
**Why it happens:** No keepalive, silent TCP drops
**How to avoid:**
- Send comment every 30s: `: keep-alive\n\n`
- Handle `req.on('close')` to clean up
- Set client-side timeout/reconnect

### Pitfall 3: Log Spam Overwhelming Database
**What goes wrong:** Workers send too many logs, database bloats
**Why it happens:** No rate limiting or log rotation
**How to avoid:**
- Batch log inserts (worker-side)
- Consider log level filtering
- Add TTL/partitioning for old logs
- Optional: Stream logs directly to external service (CloudWatch, etc.)

### Pitfall 4: Progress Update Loss During Worker Crash
**What goes wrong:** Worker crashes mid-update, progress lost
**Why it happens:** No atomicity between step and heartbeat
**How to avoid:** Each progress update is idempotent - database write happens before step completes

### Pitfall 5: Tenant Isolation Bypass
**What goes wrong:** Worker can update another tenant's job status
**Why it happens:** Missing tenant validation
**How to avoid:** Follow existing `tenantMiddleware` pattern from result endpoint

## Code Examples

### Backend: Progress Update Handler

```typescript
// Source: Based on existing /api/jobs/:jobId/result pattern
router.post(
  "/:jobId/progress",
  tenantMiddleware,
  async (req: Request, res: Response) => {
    const { jobId } = req.params;
    const tenantId = req.tenantId!;
    const { step, message, details = {} } = req.body;

    // Verify job belongs to tenant
    const job = await jobService.getJobStatus(jobId);
    if (!job || job.data.tenantId !== tenantId) {
      return res.status(404).json({ error: "Job not found" });
    }

    // Update heartbeat and store progress
    await db.transaction().execute(async (trx) => {
      // Update jobs table
      await trx
        .updateTable('jobs')
        .set({
          last_heartbeat: new Date(),
          progress: { step, message, details }
        })
        .where('id', '=', jobId)
        .execute();

      // Store in progress history
      await trx
        .insertInto('job_progress_updates')
        .values({
          job_id: jobId,
          step,
          message,
          details: JSON.stringify(details),
          created_at: new Date()
        })
        .execute();
    });

    return res.json({ success: true });
  }
);
```

### Backend: Stale Job Sweeper

```typescript
// Source: Extension of existing OrphanSweeper pattern
export class JobHeartbeatSweeper {
  private intervalId: NodeJS.Timeout | null = null;
  private jobService = new JobService();
  private gracePeriodMs: number;

  constructor(gracePeriodSeconds: number = 300) { // 5 minutes default
    this.gracePeriodMs = gracePeriodSeconds * 1000;
  }

  start(): void {
    this.intervalId = setInterval(async () => {
      await this.sweep();
    }, 60_000); // Check every minute
  }

  async sweep(): Promise<void> {
    const staleThreshold = new Date(Date.now() - this.gracePeriodMs);

    // Find active jobs that haven't sent heartbeat
    const staleJobs = await this.jobService.findStaleJobs(staleThreshold);

    for (const job of staleJobs) {
      // Check if within grace period (show stale warning, don't fail yet)
      // Already exceeded grace period (mark as failed)
      await this.jobService.updateJobStatus(job.id, 'failed', {
        errorMessage: 'Job failed: No heartbeat received within grace period'
      });
    }
  }
}
```

### Frontend: Progress Timeline Component

```typescript
// Source: Based on existing job detail page structure
interface ProgressTimelineProps {
  progressUpdates: ProgressUpdate[];
  currentStatus: string;
}

export function ProgressTimeline({ progressUpdates, currentStatus }: ProgressTimelineProps) {
  return (
    <div className="space-y-4">
      <Subheading>Execution Progress</Subheading>

      {/* Current status (prominent) */}
      {progressUpdates.length > 0 && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
          <p className="text-sm font-medium text-blue-900">
            {progressUpdates[0].message}
          </p>
          <p className="mt-1 text-xs text-blue-600">
            Step: {progressUpdates[0].step}
          </p>
        </div>
      )}

      {/* Full history (timeline) */}
      <div className="space-y-2">
        {progressUpdates.map((update, idx) => (
          <div key={idx} className="flex items-start gap-3 text-sm">
            <div className="mt-1 h-2 w-2 rounded-full bg-zinc-400" />
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="font-medium">{update.step}</span>
                <span className="text-zinc-500">
                  {new Date(update.createdAt).toLocaleTimeString()}
                </span>
              </div>
              <p className="text-zinc-600">{update.message}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

### Frontend: SSE Log Viewer

```typescript
// Source: Standard SSE pattern for Next.js
export function JobLogViewer({ jobId }: { jobId: string }) {
  const [logs, setLogs] = useState<string[]>([]);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const eventSource = new EventSource(`/api/jobs/${jobId}/logs/stream`);

    eventSource.onopen = () => setIsConnected(true);
    eventSource.onerror = () => setIsConnected(false);

    eventSource.addEventListener('log', (e: MessageEvent) => {
      const logEntry = JSON.parse(e.data);
      setLogs(prev => [...prev, logEntry]);
    });

    eventSource.addEventListener('done', () => {
      eventSource.close();
      setIsConnected(false);
    });

    return () => eventSource.close();
  }, [jobId]);

  return (
    <div className="font-mono text-sm">
      <div className="flex items-center gap-2 mb-2">
        <div className={`h-2 w-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-zinc-400'}`} />
        <span>{isConnected ? 'Live' : 'Disconnected'}</span>
      </div>
      <pre className="bg-zinc-900 text-zinc-100 p-4 rounded-lg overflow-auto max-h-96">
        {logs.map((log, i) => (
          <div key={i}>{log}</div>
        ))}
      </pre>
    </div>
  );
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| WebSocket for all real-time | SSE for server-to-client streaming | ~2023 | SSE is simpler, browser-native, auto-reconnects |
| Long polling | SSE or short polling | ~2024 | SSE reduces server load, short polling simpler fallback |
| In-memory job state | Database-backed state tracking | Industry standard | Survives restarts, scales horizontally |

**Deprecated/outdated:**
- **Long polling** for new implementations: Use SSE or WebSockets instead
- **Custom WebSocket heartbeat:** SSE has built-in reconnection
- **In-memory queues:** Use database or message broker for persistence

## Open Questions

1. **Log retention policy**
   - What we know: Logs need to be stored and displayed
   - What's unclear: How long to keep logs, whether to archive
   - Recommendation: Start with simple retention (e.g., 30 days), add TTL/partitioning later

2. **SSE vs polling for logs**
   - What we know: SSE is more efficient for streaming
   - What's unclear: Deployment environment (Vercel doesn't support SSE well)
   - Recommendation: Implement polling first for logs, SSE as enhancement if environment allows

3. **Progress update volume limits**
   - What we know: Workers send progress updates during execution
   - What's unclear: Maximum expected updates per job
   - Recommendation: Start unthrottled, add rate limiting if issues arise

## Sources

### Primary (HIGH confidence)
- Existing codebase analysis:
  - `/platform/backend/src/api/routes/jobs.ts` - Result callback pattern
  - `/platform/backend/src/services/JobService.ts` - Job status tracking
  - `/platform/backend/src/workers/OrphanSweeper.ts` - Stale job detection pattern
  - `/platform/backend/src/workers/CallbackClient.ts` - Worker callback client
  - `/platform/frontend/src/hooks/useJobStatus.ts` - Polling pattern
  - `/platform/frontend/src/hooks/usePolling.ts` - Generic polling hook
  - `/platform/frontend/src/app/(app)/project/[project]/jobs/[jobId]/page.tsx` - Job detail UI
  - `/packages/types/src/clanker.ts` - Type definitions

### Secondary (MEDIUM confidence)
- [Server-Sent Events (SSE) vs WebSockets vs Long Polling: What's Best in 2025](https://dev.to/haraf/server-sent-events-sse-vs-websockets-vs-long-polling-whats-best-in-2025-5ep8) - Comparison of real-time technologies
- [Streaming in Next.js 15: WebSockets vs Server-Sent Events](https://hackernoon.com/streaming-in-nextjs-15-websockets-vs-server-sent-events) - Next.js SSE patterns
- [Understanding the Heartbeat Pattern in Distributed Systems](https://medium.com/@a.mousavi/understanding-the-heartbeat-pattern-in-distributed-systems-5d2264bbfda6) - Heartbeat design patterns

### Tertiary (LOW confidence)
- [Streaming data in Next.js using API route](https://www.saad.sh/posts/nextjs-streaming) - SSE implementation example (verify with official docs)
- [Design a Distributed Job Scheduler: System Design Guide](https://www.systemdesignhandbook.com/guides/design-a-distributed-job-scheduler/) - Job scheduler architecture (general patterns)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Based on existing codebase analysis
- Architecture: HIGH - Patterns extracted from working code
- Database schema: HIGH - Kysely/PostgreSQL patterns match existing migrations
- API design: HIGH - Follows existing Express route patterns
- Real-time strategy: MEDIUM - SSE recommendations from web sources, polling proven in codebase

**Research date:** 2026-01-21
**Valid until:** 2026-02-20 (30 days - stable domain)
