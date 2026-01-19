# Phase 2: Result Callback - Research

**Researched:** 2026-01-19
**Domain:** Worker result callback API with job status management
**Confidence:** HIGH

## Summary

This phase implements the callback mechanism where workers POST execution results to the platform API, updating job status in the database. The codebase already has foundational infrastructure: `JobService` with status update methods, `JobResult` type defining the result payload, and Express routing patterns. The standard approach uses existing `axios` (already in codebase) for HTTP client from workers, Express router for the callback endpoint, and Kysely for database updates.

The key architectural decision is a **simple POST callback pattern** where workers submit results to `/api/jobs/:jobId/result` with tenant-scoped validation using existing `tenantMiddleware`. The callback includes commit SHA, PR URL, error messages, and logs as specified in CB-03. Idempotency is handled by allowing status transitions only (e.g., queued->active->completed/failed) and rejecting duplicate completions.

**Primary recommendation:** Use existing `axios` patterns from `GitService` for worker HTTP client, create new callback route following existing `/api/jobs` patterns, and leverage `JobService.updateJobStatus()` method for database updates.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `axios` | ^1.6.2 | HTTP client for worker callbacks | Already in codebase, Promise-based, TypeScript-friendly, used in GitService |
| `express` | ^4.16.1 | HTTP server for callback endpoint | Existing platform backend framework |
| `kysely` | ^0.27.3 | Type-safe database queries for job status updates | Existing query builder, used by JobService |
| `joi` | ^17.11.0 | Request payload validation | Existing project standard for schema validation |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `winston` | ^3.11.0 | Structured logging (worker side) | Existing worker logging standard |
| `morgan` | ~1.9.1 | HTTP request logging (platform) | Already configured in Express app |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| axios | fetch API | fetch is built-in but axios has better error handling, interceptors, and is already used in codebase |
| POST callback | WebSocket/SSE | WebSocket is real-time but more complex; POST simpler and sufficient for v1 (deferred per REQUIREMENTS.md) |
| Direct DB update | Message queue (Bull) | Direct callback simpler for this milestone; Bull queue already exists but adds complexity |

**Installation:**
```bash
# No new packages needed - axios, express, kysely, joi already installed
```

## Architecture Patterns

### Recommended Project Structure
```
platform/backend/src/
├── api/
│   └── routes/
│       └── jobs.ts              # Add POST /:jobId/result callback endpoint
├── services/
│   └── JobService.ts            # Already has updateJobStatus() method
├── types/
│   └── Job.ts                   # Already has JobResult interface
└── utils/
    └── logRedaction.ts          # Existing log redaction for sensitive data

viberator/app/src/
├── workers/
│   └── CallbackClient.ts        # New: HTTP client for posting results
└── types/
    └── index.ts                 # May need shared types
```

### Pattern 1: Callback Endpoint (Express Router)

**What:** POST endpoint receiving worker results with tenant validation

**When to use:** Workers complete execution (success or failure) and need to report results

**Example:**
```typescript
// Source: Based on existing platform/backend/src/api/routes/jobs.ts pattern
import { Request, Response, Router } from 'express';
import { JobService } from '../../services/JobService';
import { tenantMiddleware } from '../../middleware/tenantValidation';
import Joi from 'joi';

const router = Router();
const jobService = new JobService();

// Result payload schema (CB-03 requirements)
const resultSchema = Joi.object({
  success: Joi.boolean().required(),
  commitHash: Joi.string().allow(null, ''),
  pullRequestUrl: Joi.string().uri().allow(null, ''),
  errorMessage: Joi.string().allow(null, ''),
  logs: Joi.array().items(Joi.string()).default([]),
  changedFiles: Joi.array().items(Joi.string()).default([]),
  executionTime: Joi.number().integer().min(0).required(),
});

// POST /api/jobs/:jobId/result - Worker callback endpoint
router.post(
  '/:jobId/result',
  tenantMiddleware,  // Tenant validation from Phase 1
  async (req: Request, res: Response) => {
    try {
      const { jobId } = req.params;
      const tenantId = req.tenantId!;

      // Validate request body
      const { error, value } = resultSchema.validate(req.body);
      if (error) {
        return res.status(400).json({
          error: 'Validation error',
          details: error.details[0].message,
        });
      }

      // Verify job belongs to tenant (SEC-03)
      const job = await jobService.getJobStatus(jobId);
      if (!job) {
        return res.status(404).json({ error: 'Job not found' });
      }
      if (job.data.tenantId !== tenantId) {
        return res.status(403).json({ error: 'Access denied' });
      }

      // Determine status based on result
      const status = value.success ? 'completed' : 'failed';

      // Update job status
      await jobService.updateJobStatus(jobId, status, {
        result: {
          success: value.success,
          branch: value.branch,
          pullRequestUrl: value.pullRequestUrl,
          changedFiles: value.changedFiles,
          executionTime: value.executionTime,
          errorMessage: value.errorMessage,
          commitHash: value.commitHash,
        },
        errorMessage: value.errorMessage,
      });

      res.json({
        success: true,
        jobId,
        status,
      });
    } catch (error) {
      console.error('Failed to process job result', { error });
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  }
);

export default router;
```

### Pattern 2: Worker Callback Client (axios)

**What:** HTTP client in worker to POST results with retry logic

**When to use:** Worker completes task execution (success or failure)

**Example:**
```typescript
// Source: Based on existing viberator/app/src/services/GitService.ts axios pattern
import axios, { AxiosError } from 'axios';
import { Logger } from 'winston';

export interface CallbackResult {
  success: boolean;
  commitHash?: string;
  pullRequestUrl?: string;
  errorMessage?: string;
  logs: string[];
  changedFiles: string[];
  executionTime: number;
  branch?: string;
}

export class CallbackClient {
  private apiUrl: string;
  private maxRetries: number;
  private retryDelay: number;

  constructor(
    private logger: Logger,
    config: {
      platformUrl?: string;
      maxRetries?: number;
      retryDelay?: number;
    } = {}
  ) {
    this.apiUrl = config.platformUrl || process.env.PLATFORM_API_URL || 'http://localhost:3000';
    this.maxRetries = config.maxRetries || 3;
    this.retryDelay = config.retryDelay || 1000;
  }

  async sendResult(
    jobId: string,
    tenantId: string,
    result: CallbackResult
  ): Promise<void> {
    const url = `${this.apiUrl}/api/jobs/${jobId}/result`;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        this.logger.info('Sending job result to platform', {
          jobId,
          attempt: attempt + 1,
        });

        const response = await axios.post(
          url,
          {
            ...result,
            logs: result.logs.map(log =>
              this.redactSensitiveInfo(log)
            ),
          },
          {
            headers: {
              'Content-Type': 'application/json',
              'X-Tenant-Id': tenantId,
            },
            timeout: 30000, // 30 second timeout
          }
        );

        this.logger.info('Job result sent successfully', {
          jobId,
          status: response.status,
        });

        return; // Success, exit retry loop
      } catch (error) {
        const isLastAttempt = attempt === this.maxRetries;
        const delay = this.retryDelay * Math.pow(2, attempt); // Exponential backoff

        if (axios.isAxiosError(error)) {
          const statusCode = error.response?.status;
          const isRetryable = !statusCode || statusCode >= 500 || statusCode === 429;

          if (!isRetryable) {
            // Don't retry client errors (4xx)
            this.logger.error('Non-retryable error sending result', {
              jobId,
              statusCode,
              message: error.response?.data?.error || error.message,
            });
            throw new Error(`Callback failed: ${error.response?.data?.error || error.message}`);
          }

          if (isLastAttempt) {
            this.logger.error('Max retries exceeded sending job result', {
              jobId,
              lastError: error.message,
            });
            throw new Error(`Callback failed after ${this.maxRetries + 1} attempts`);
          }

          this.logger.warn('Retryable error, will retry', {
            jobId,
            attempt: attempt + 1,
            statusCode,
            delay,
          });
        } else {
          this.logger.error('Unexpected error sending result', {
            jobId,
            error: error instanceof Error ? error.message : String(error),
          });
          throw error;
        }

        // Wait before retry (exponential backoff)
        if (!isLastAttempt) {
          await this.sleep(delay);
        }
      }
    }
  }

  // Simple redaction for logs (sync with platform redaction)
  private redactSensitiveInfo(log: string): string {
    const sensitivePatterns = [
      /token[a-z]*["\s:=]+[a-zA-Z0-9_\-]{20,}/gi,
      /password["\s:=]+[^\s]+/gi,
      /sk-[a-zA-Z0-9]{20,}/g,  // API keys
      /ghp_[a-zA-Z0-9]{36}/g,   // GitHub tokens
    ];

    let redacted = log;
    for (const pattern of sensitivePatterns) {
      redacted = redacted.replace(pattern, '[REDACTED]');
    }
    return redacted;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

### Pattern 3: Worker Integration

**What:** Integrate callback client into worker execution flow

**When to use:** Worker completes task, in finally block of execution

**Example:**
```typescript
// Source: Based on existing viberator/app/src/workers/viberator.ts pattern
import { CallbackClient, CallbackResult } from './CallbackClient';

export class ViberatorWorker {
  private callbackClient: CallbackClient;
  // ... existing properties

  async initialize(): Promise<void> {
    // ... existing initialization
    this.callbackClient = new CallbackClient(this.logger, {
      platformUrl: process.env.PLATFORM_API_URL,
    });
  }

  async executeTask(data: CodingJobData): Promise<JobResult> {
    const { id: jobId, tenantId } = data;

    try {
      // ... existing task execution logic

      const result: JobResult = {
        success: true,
        branch: featureBranch,
        pullRequestUrl,
        changedFiles: result.changedFiles,
        executionTime,
        commitHash,
      };

      // Send result to platform (non-blocking for worker flow)
      await this.callbackClient.sendResult(jobId, tenantId, {
        ...result,
        logs: this.collectExecutionLogs(),
      });

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      // Send failure result to platform
      await this.callbackClient.sendResult(jobId, tenantId, {
        success: false,
        executionTime: Date.now() - startTime,
        errorMessage,
        logs: this.collectExecutionLogs(),
        changedFiles: [],
      });

      throw error;
    }
  }

  private collectExecutionLogs(): string[] {
    // Collect relevant execution logs for callback
    // Implementation depends on logging setup
    return [];
  }
}
```

### Anti-Patterns to Avoid

- **Synchronous callback waiting:** Don't block worker termination on callback success. Log failures and exit.
- **Duplicate result submissions:** Implement idempotency check - reject status changes from completed/failed states.
- **Omitting tenant headers:** Always include X-Tenant-Id header for multi-tenant security (SEC-03).
- **Logging sensitive data:** Use existing `redactSensitiveInfo()` pattern before sending logs in callback.
- **Missing retry logic:** Network failures are common; implement exponential backoff retry.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| HTTP request retry logic | Custom retry loops | axios with exponential backoff pattern | Handles edge cases, timeout management, jitter |
| Request validation | Manual type checking | `joi` schema validation | Already in codebase, consistent error messages |
| Tenant validation | Custom auth checks | Existing `tenantMiddleware` | Phase 1 deliverable, already tested |
| Database updates | Raw SQL queries | `JobService.updateJobStatus()` | Existing abstraction, handles timestamps, status transitions |
| Log redaction | Custom regex | Existing `redact.ts` utilities | Phase 1 deliverable for SEC-04 compliance |

**Key insight:** The callback mechanism seems simple (POST payload, update DB), but proper implementation requires retry logic, validation, tenant isolation, log redaction, and idempotency - all of which have existing patterns in the codebase.

## Common Pitfalls

### Pitfall 1: Race conditions in status updates

**What goes wrong:** Multiple callbacks or duplicate requests update job status incorrectly, causing completed jobs to revert to failed or vice versa.

**Why it happens:** No idempotency check; allowing any status transition regardless of current state.

**How to avoid:**
- Implement status transition validation (queued -> active -> completed/failed)
- Reject updates to already completed/failed jobs
- Use database constraints or atomic updates if needed

**Warning signs:** Jobs changing from completed to failed, status inconsistency

```typescript
// GOOD: Status transition validation
const VALID_TRANSITIONS: Record<string, string[]> = {
  queued: ['active'],
  active: ['completed', 'failed'],
  completed: [], // No transitions from terminal state
  failed: [],
};

function canTransition(current: string, next: string): boolean {
  return VALID_TRANSITIONS[current]?.includes(next) ?? false;
}
```

### Pitfall 2: Blocking worker shutdown on callback

**What goes wrong:** Workers hang or timeout because callback endpoint is slow/down, preventing proper cleanup.

**Why it happens:** Making callback synchronous and waiting for success before worker exits.

**How to avoid:**
- Set reasonable timeout on axios requests (30s max)
- Log callback failures but don't block worker exit
- Consider fire-and-forget pattern with error logging

**Warning signs:** Workers timing out, Lambda execution time exceeded

### Pitfall 3: Leaking sensitive data in callback logs

**What goes wrong:** API keys, tokens, passwords appear in callback logs sent to platform.

**Why it happens:** Sending raw logs without redaction (violates SEC-04).

**How to avoid:**
- Use existing `redact.ts` utilities before sending logs
- Redact at worker side before POST
- Implement server-side redaction as defense-in-depth

**Warning signs:** Credential values visible in platform logs, CB-03 compliance failures

```typescript
// GOOD: Redact logs before callback
const redactedLogs = logs.map(log => redactSensitiveInfo(log));
await callbackClient.sendResult(jobId, tenantId, {
  ...result,
  logs: redactedLogs,
});
```

### Pitfall 4: Missing tenant isolation in callback

**What goes wrong:** Worker from tenant A can update job status for tenant B's jobs.

**Why it happens:** Not validating tenantId on callback endpoint (violates SEC-03).

**How to avoid:**
- Use existing `tenantMiddleware` on callback route
- Verify job's tenantId matches request tenantId
- Return 403 for mismatched tenant access

**Warning signs:** Cross-tenant job updates, unauthorized status changes

### Pitfall 5: Retry storms during platform outages

**What goes wrong:** Many workers retrying simultaneously overwhelm recovering platform.

**Why it happens:** All workers using same retry delay, no jitter.

**How to avoid:**
- Add random jitter to exponential backoff
- Use jittered delay: `baseDelay * 2^attempt + random(0, 1000)ms`
- Consider circuit breaker pattern for extended outages

**Warning signs:** Platform thundering herd, cascading failures

## Code Examples

Verified patterns from official sources:

### Axios POST with Exponential Backoff Retry
```typescript
// Source: https://dev.to/scrapfly_dev/how-to-retry-in-axios-5e87 (2025)
// Verified against existing GitService.ts axios patterns
async function sendWithRetry(url: string, data: any, maxRetries = 3) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await axios.post(url, data, { timeout: 30000 });
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const isRetryable = !error.response || error.response.status >= 500;
        if (!isRetryable || attempt === maxRetries) throw error;
      }
      const delay = 1000 * Math.pow(2, attempt) + Math.random() * 1000; // Jitter
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}
```

### Joi Schema Validation for Result Payload
```typescript
// Source: Existing joi patterns in platform/backend/src/api/middleware/schemas.ts
const resultPayloadSchema = Joi.object({
  success: Joi.boolean().required(),
  commitHash: Joi.string().allow('', null).optional(),
  pullRequestUrl: Joi.string().uri().allow('', null).optional(),
  errorMessage: Joi.string().allow('', null).optional(),
  logs: Joi.array().items(Joi.string()).default([]),
  changedFiles: Joi.array().items(Joi.string()).default([]),
  executionTime: Joi.number().integer().min(0).required(),
  branch: Joi.string().optional(),
});
```

### Kysely Status Update (Existing Pattern)
```typescript
// Source: Existing JobService.updateJobStatus method in JobService.ts
// Already handles timestamp updates, status transitions, JSON serialization
await jobService.updateJobStatus(jobId, 'completed', {
  result: jobResult,
  errorMessage: undefined,
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Callback without retry | Exponential backoff retry | Ongoing best practice | Improved reliability during transient failures |
| Synchronous worker shutdown | Async callback with timeout | Modern async patterns | Workers don't hang on platform issues |
| Raw SQL updates | Kysely type-safe queries | ~2023+ | Type safety, SQL injection prevention |
| Manual auth checks | Middleware-based validation | Express 4.x+ | Reusable security patterns |

**Deprecated/outdated:**
- Direct WebSocket without fallback: POST callback simpler and more reliable for v1
- Callback without idempotency: Must handle duplicate submissions
- Unvalidated status transitions: Can cause data inconsistency

## Open Questions

Things that couldn't be fully resolved:

1. **Callback URL configuration**
   - What we know: Workers need platform API URL for callbacks
   - What's unclear: Exact env var name (`PLATFORM_API_URL` vs `CALLBACK_URL`)
   - Recommendation: Use `PLATFORM_API_URL` to match existing patterns, default to `http://localhost:3000`

2. **Log payload size limits**
   - What we know: CB-03 requires logs in result payload
   - What's unclear: Maximum log size, truncation strategy
   - Recommendation: Limit to 10KB or 100 lines, implement truncation with `[TRUNCATED]` marker

3. **Idempotency token vs status-based idempotency**
   - What we know: Need to prevent duplicate result processing
   - What's unclear: Whether to use idempotency tokens or status-based checks
   - Recommendation: Status-based (reject updates to terminal states) - simpler, matches existing `JobService` pattern

4. **Callback authentication**
   - What we know: Phase 1 established tenant-based isolation via `X-Tenant-Id`
   - What's unclear: Whether additional authentication needed (API keys, tokens)
   - Recommendation: Rely on `X-Tenant-Id` for this phase; defer additional auth to security phase

## Sources

### Primary (HIGH confidence)
- Existing codebase:
  - `/home/jussi/Development/viberator/platform/backend/src/services/JobService.ts` - Job status update methods
  - `/home/jussi/Development/viberator/platform/backend/src/api/routes/jobs.ts` - Existing jobs API patterns
  - `/home/jussi/Development/viberator/platform/backend/src/api/middleware/tenantValidation.ts` - Tenant validation from Phase 1
  - `/home/jussi/Development/viberator/viberator/app/src/services/GitService.ts` - Axios HTTP client patterns
  - `/home/jussi/Development/viberator/platform/backend/src/utils/logRedaction.ts` - Log redaction utilities
  - `/home/jussi/Development/viberator/platform/backend/src/types/Job.ts` - JobResult interface
  - `/home/jussi/Development/viberator/viberator/app/src/workers/viberator.ts` - Worker execution flow

### Secondary (MEDIUM confidence)
- [How to Retry in Axios - Dev.to (Jan 7, 2025)](https://dev.to/scrapfly_dev/how-to-retry-in-axios-5e87) - Axios retry patterns with exponential backoff
- [Rate Limits, Retries and Exponential Backoffs in TypeScript](https://levelup.gitconnected.com/handling-quota-limits-and-server-failures-in-typescript-e4d1f576c6ee) - Comprehensive retry strategies
- [Express.js TypeScript REST API Best Practices](https://www.toptal.com/developers/express-js/nodejs-typescript-rest-api-pt-1) - Route organization patterns

### Tertiary (LOW confidence)
- [StackOverflow: HTTP POST request with TypeScript](https://stackoverflow.com/questions/49014689/http-post-request-with-typescript) - General TypeScript POST patterns
- Various WebSearch results on callback patterns - verified against official documentation

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries already in codebase, verified from package.json
- Architecture: HIGH - Based on verified existing patterns in JobService, GitService, and Express routes
- Pitfalls: HIGH - Identified from common async/callback failure patterns and multi-tenant security requirements

**Research date:** 2026-01-19
**Valid until:** 2026-02-18 (30 days - stable domain with well-established patterns)
