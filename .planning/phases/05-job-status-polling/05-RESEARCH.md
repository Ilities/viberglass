# Phase 5: Job Status Polling - Research

**Researched:** 2026-01-21
**Domain:** Frontend polling for job status with React 19, Next.js 15
**Confidence:** HIGH

## Summary

This phase implements frontend polling to display job status to users. The codebase already has a complete backend API (`GET /api/jobs/:jobId`), a frontend job detail page at `/project/[project]/jobs/[jobId]/page.tsx`, and basic components. However, the current implementation uses `router.refresh()` which requires manual user action - not automatic polling.

The standard approach for job status polling in Next.js 15/React 19 combines **Server Components for initial data** with **client-side polling for active jobs**. For job status specifically, polling is the correct choice (not WebSockets/SSE) because: (1) jobs have discrete states, (2) frontend already polls the API endpoint, (3) SSE complexity is unjustified for v1, and (4) polling can be optimized with visibility detection and interval adjustment.

The implementation uses a **custom `usePolling` hook** built on Dan Abramov's `useInterval` pattern, with `sonner` (already in package.json) for toast notifications on status changes. The hook respects page visibility (pauses when tab hidden), stops polling for terminal states, and includes proper cleanup.

**Primary recommendation:** Create `usePolling` hook for automatic job status refresh, integrate with existing `job-api.ts` and job detail page, use `sonner` for status change notifications, and implement visual status indicators using existing `Badge` component.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `useInterval` pattern | Dan Abramov 2019 | Declarative setInterval for React | Canonical pattern for React intervals, handles dependency cleanup |
| `sonner` | ^2.0.7 | Toast notifications for status changes | Already in package.json, modern, built-in styling |
| React hooks | built-in | useEffect, useRef, useState | Standard React 19 hooks for polling logic |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `next/navigation` | built-in | router.refresh() for manual refresh | Fallback for manual refresh |
| `@heroicons/react` | ^2.2.0 | Icons for status indicators | Already in package.json, use ClockIcon, CheckCircleIcon |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Custom usePolling | SWR with refreshInterval | SWR adds 50kb, requires fetcher setup; custom hook simpler for single use case |
| Polling | Server-Sent Events (SSE) | SSE is real-time but more complex; requires backend changes, connection management |
| Polling | WebSockets | Bidirectional, always-on connection; overkill for status polling |
| sonner | react-hot-toast | Similar, but sonner already installed and well-maintained |

**Installation:**
```bash
# No new packages needed - sonner, @heroicons/react already installed
```

## Architecture Patterns

### Recommended Project Structure
```
platform/frontend/src/
├── hooks/
│   ├── usePolling.ts          # New: Generic polling hook with pause/resume
│   └── useJobStatus.ts        # New: Job-specific polling hook
├── service/
│   └── api/
│       └── job-api.ts         # Already exists: getJob()
├── components/
│   ├── badge.ts               # Already exists: status colors
│   └── job-status-indicator.tsx  # New: Animated status component
└── app/
    └── (app)/project/[project]/jobs/[jobId]/
        ├── page.tsx           # Already exists: add polling integration
        └── job-refresh-button.tsx  # Already exists: manual refresh
```

### Pattern 1: useInterval (Dan Abramov Pattern)

**What:** Declarative setInterval hook that handles cleanup and supports pausing

**When to use:** Any component that needs periodic execution with proper cleanup

**Example:**
```typescript
// Source: https://overreacted.io/making-setinterval-declarative-with-react-hooks/
// Verified: Canonical pattern for React intervals

import { useEffect, useRef } from 'react'

export function useInterval(callback: () => void, delay: number | null) {
  const savedCallback = useRef(callback)

  // Remember the latest callback if it changes
  useEffect(() => {
    savedCallback.current = callback
  }, [callback])

  // Set up the interval
  useEffect(() => {
    if (delay === null) return  // Paused

    const id = setInterval(() => savedCallback.current(), delay)

    return () => clearInterval(id)  // Cleanup on unmount or delay change
  }, [delay])
}
```

### Pattern 2: usePolling Hook with Visibility Detection

**What:** Generic polling hook that pauses when page is hidden (saves resources)

**When to use:** Polling any API that doesn't need updates when user can't see them

**Example:**
```typescript
// Source: Medium - Implementing Polling in React (2025)
// Verified against useInterval pattern

import { useState, useEffect } from 'react'
import { useInterval } from './useInterval'

export interface UsePollingOptions<T> {
  fn: () => Promise<T>
  interval: number           // Polling interval in ms
  immediate?: boolean        // Call immediately on mount
  enabled?: boolean          // Pause/resume polling
  onComplete?: (data: T) => boolean  // Return true to stop polling
}

export function usePolling<T>(options: UsePollingOptions<T>) {
  const { fn, interval, immediate = true, enabled = true, onComplete } = options
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const [isPolling, setIsPolling] = useState(false)
  const [isPaused, setIsPaused] = useState(!enabled)

  // Track page visibility to pause polling when tab hidden
  useEffect(() => {
    const handleVisibilityChange = () => {
      setIsPaused(document.hidden)
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [])

  const poll = async () => {
    if (isPaused) return

    setIsPolling(true)
    try {
      const result = await fn()
      setData(result)
      setError(null)

      // Check if polling should stop (e.g., terminal state reached)
      if (onComplete?.(result)) {
        setIsPolling(false)
      }
    } catch (err) {
      setError(err as Error)
    } finally {
      setIsPolling(false)
    }
  }

  // Initial fetch
  useEffect(() => {
    if (immediate && enabled) {
      poll()
    }
  }, [])  // Only on mount

  // Set up polling interval
  useInterval(() => {
    poll()
  }, isPaused || !enabled ? null : interval)

  return { data, error, isPolling, isPaused, poll, refetch: poll }
}
```

### Pattern 3: useJobStatus Hook (Job-Specific)

**What:** Specialized hook for job status polling with toast notifications

**When to use:** Job detail pages that need live status updates

**Example:**
```typescript
// Source: Built on usePolling + existing job-api.ts patterns

import { usePolling } from './usePolling'
import { getJob, JobStatus } from '@/service/api/job-api'
import { toast } from 'sonner'

export function useJobStatus(jobId: string) {
  const [previousStatus, setPreviousStatus] = useState<string | null>(null)

  const { data, error, isPolling, refetch } = usePolling<JobStatus>({
    fn: () => getJob(jobId),
    interval: 3000,  // Poll every 3 seconds
    immediate: true,
    enabled: !!jobId,
    onComplete: (job) => {
      // Stop polling when job reaches terminal state
      const isTerminal = job.status === 'completed' || job.status === 'failed'

      // Show toast notification on status change
      if (previousStatus && previousStatus !== job.status) {
        if (job.status === 'completed') {
          toast.success('Job completed successfully', {
            description: 'Your changes have been applied',
            action: job.result?.pullRequestUrl ? {
              label: 'View PR',
              onClick: () => window.open(job.result!.pullRequestUrl!, '_blank')
            } : undefined
          })
        } else if (job.status === 'failed') {
          toast.error('Job failed', {
            description: job.result?.errorMessage || job.failedReason || 'An error occurred'
          })
        }
      }

      setPreviousStatus(job.status)
      return isTerminal
    }
  })

  return {
    job: data,
    isLoading: !data && !error,
    error,
    isPolling,
    refetch
  }
}
```

### Pattern 4: Job Status Indicator Component

**What:** Visual component showing animated status with appropriate colors

**When to use:** Anywhere job status is displayed to users

**Example:**
```typescript
// Source: Based on existing Badge component pattern + motion library (in package.json)

import { Badge } from '@/components/badge'
import { ClockIcon, CheckCircleIcon, XCircleIcon } from '@heroicons/react/20/solid'
import { motion } from 'motion'

interface JobStatusIndicatorProps {
  status: 'queued' | 'active' | 'completed' | 'failed'
  isPolling?: boolean
}

export function JobStatusIndicator({ status, isPolling }: JobStatusIndicatorProps) {
  const config = {
    queued: {
      label: 'Queued',
      color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-500/20 dark:text-yellow-200',
      icon: ClockIcon
    },
    active: {
      label: 'Running',
      color: 'bg-blue-100 text-blue-800 dark:bg-blue-500/20 dark:text-blue-200',
      icon: ClockIcon
    },
    completed: {
      label: 'Completed',
      color: 'bg-green-100 text-green-800 dark:bg-green-500/20 dark:text-green-200',
      icon: CheckCircleIcon
    },
    failed: {
      label: 'Failed',
      color: 'bg-red-100 text-red-800 dark:bg-red-500/20 dark:text-red-200',
      icon: XCircleIcon
    }
  }

  const { label, color, icon: Icon } = config[status]

  return (
    <Badge className={color}>
      <motion.div
        className="flex items-center gap-1"
        animate={isPolling && status === 'active' ? { opacity: [1, 0.5, 1] } : {}}
        transition={{ duration: 1.5, repeat: Infinity }}
      >
        <Icon className="h-4 w-4" />
        <span>{label}</span>
        {isPolling && status === 'active' && (
          <span className="ml-1 flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
          </span>
        )}
      </motion.div>
    </Badge>
  )
}
```

### Pattern 5: Integration with Existing Job Detail Page

**What:** Convert existing server-only page to client component with polling

**When to use:** Job detail page needs automatic refresh

**Example:**
```typescript
// Source: Modifying existing /project/[project]/jobs/[jobId]/page.tsx

// Before: Server component only, manual refresh
export default async function JobDetailPage({ params }: Props) {
  const { jobId } = await params
  const job = await getJob(jobId)
  return <JobDetailView job={job} />
}

// After: Client component with automatic polling
'use client'

import { useJobStatus } from '@/hooks/useJobStatus'
import { JobStatusIndicator } from '@/components/job-status-indicator'

export default function JobDetailPage({ jobId }: { jobId: string }) {
  const { job, isLoading, error, isPolling } = useJobStatus(jobId)

  if (isLoading) return <div>Loading...</div>
  if (error || !job) return <div>Job not found</div>

  return (
    <div>
      <JobStatusIndicator status={job.status} isPolling={isPolling} />
      {/* Rest of job details */}
    </div>
  )
}
```

### Anti-Patterns to Avoid

- **Polling when tab is hidden:** Wastes bandwidth, server resources. Use visibility API to pause.
- **Polling after terminal state:** Stop polling when job is completed/failed.
- **Missing cleanup in useEffect:** Always return cleanup function that clears interval.
- **Fixed intervals for all states:** Use shorter intervals for active jobs, longer for queued.
- **Not handling concurrent requests:** Use AbortController or flags to prevent overlapping requests.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Toast notifications | Custom toast components | `sonner` (already installed) | Built-in styling, queue management, promise support |
| setInterval management | Raw setInterval in useEffect | `useInterval` pattern | Handles cleanup, delay changes, pausing |
| Page visibility detection | Custom focus/blur handlers | `document.visibilitychange` API | Standard API, handles all visibility cases |
| Status color mapping | Inline className logic | Existing `Badge` component | Consistent styling, already defined |
| HTTP fetch with error handling | fetch() with try/catch | Existing `getJob()` from job-api.ts | Handles errors, typing, base URL |

**Key insight:** Polling seems simple (setInterval + fetch), but proper implementation requires visibility detection, pause/resume, cleanup, terminal state detection, and request deduplication - all of which have established patterns.

## Common Pitfalls

### Pitfall 1: Memory Leaks from Unmounted Components

**What goes wrong:** Intervals continue running after component unmounts, causing state updates on unmounted components.

**Why it happens:** Not returning cleanup function from useEffect that clears the interval.

**How to avoid:**
- Always return `() => clearInterval(id)` from useEffect
- Use `useInterval` pattern which handles this automatically
- Test by navigating away from job page and checking console

**Warning signs:** React warnings about "Can't perform a React state update on an unmounted component"

```typescript
// BAD: Missing cleanup
useEffect(() => {
  setInterval(() => refetch(), 3000)
}, [])

// GOOD: Cleanup function
useEffect(() => {
  const id = setInterval(() => refetch(), 3000)
  return () => clearInterval(id)
}, [])
```

### Pitfall 2: Polling When Tab Is Hidden

**What goes wrong:** App continues making requests when user isn't looking, wasting bandwidth and server resources.

**Why it happens:** Not checking `document.hidden` or listening to visibility change events.

**How to avoid:**
- Use visibility API to pause polling when tab hidden
- Resume polling when tab becomes visible again
- Consider immediate refetch on tab resume

**Warning signs:** Network tab shows requests while tab is in background

```typescript
// GOOD: Visibility-based pausing
useEffect(() => {
  const handleVisibilityChange = () => {
    if (document.hidden) {
      setIsPaused(true)
    } else {
      setIsPaused(false)
      refetch() // Immediate fetch when user returns
    }
  }
  document.addEventListener('visibilitychange', handleVisibilityChange)
  return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
}, [])
```

### Pitfall 3: Overlapping Polling Requests

**What goes wrong:** Previous poll request hasn't finished when next one starts, causing race conditions.

**Why it happens:** Fixed interval without checking if request is in flight.

**How to avoid:**
- Track `isLoading` state and skip poll if already loading
- Use AbortController to cancel previous requests
- Ensure interval > expected response time

**Warning signs:** Network tab shows multiple simultaneous requests to same endpoint

```typescript
// GOOD: Skip if already loading
const poll = async () => {
  if (isLoading) return  // Don't start new request
  setIsLoading(true)
  try {
    const result = await fn()
    setData(result)
  } finally {
    setIsLoading(false)
  }
}
```

### Pitfall 4: Not Stopping on Terminal State

**What goes wrong:** App continues polling jobs that are already completed/failed forever.

**Why it happens:** Polling logic doesn't check if job reached terminal state.

**How to avoid:**
- Implement `onComplete` callback that returns true to stop polling
- Check for `completed` and `failed` statuses
- Clear interval when terminal state reached

**Warning signs:** Network tab shows requests for finished jobs

```typescript
// GOOD: Stop on terminal state
const isTerminal = job.status === 'completed' || job.status === 'failed'
if (isTerminal) {
  clearInterval(intervalId)
  return
}
```

### Pitfall 5: Stale Closure in useEffect Dependencies

**What goes wrong:** Polling uses stale data (e.g., old jobId) after props change.

**Why it happens:** Missing dependencies in useEffect array or not using ref for callback.

**How to avoid:**
- Use `useRef` to store latest callback without causing re-renders
- Include all dependencies in useEffect arrays
- Or use custom `useInterval` that handles callback updates

**Warning signs:** Polling requests use wrong IDs or parameters

```typescript
// GOOD: useRef to always have latest callback
const savedCallback = useRef(callback)
useEffect(() => {
  savedCallback.current = callback  // Always latest
}, [callback])

useEffect(() => {
  const id = setInterval(() => savedCallback.current(), delay)
  return () => clearInterval(id)
}, [delay])  // Only re-run on delay change
```

## Code Examples

Verified patterns from official sources:

### useInterval Hook (Dan Abramov)
```typescript
// Source: https://overreacted.io/making-setinterval-declarative-with-react-hooks/
// This is the canonical React interval pattern

import { useEffect, useRef } from 'react'

function useInterval(callback: () => void, delay: number | null) {
  const savedCallback = useRef(callback)

  // Remember the latest callback
  useEffect(() => {
    savedCallback.current = callback
  }, [callback])

  // Set up the interval
  useEffect(() => {
    if (delay === null) return
    const id = setInterval(() => savedCallback.current(), delay)
    return () => clearInterval(id)
  }, [delay])
}
```

### Sonner Toast Notifications
```typescript
// Source: https://sonner.emilkowal.ski/
// Verified: Already in package.json

import { toast } from 'sonner'

// Success toast
toast.success('Job completed', {
  description: 'Pull request created',
  action: {
    label: 'View',
    onClick: () => window.open(prUrl, '_blank')
  }
})

// Error toast
toast.error('Job failed', {
  description: errorMessage
})

// Promise toast (shows loading state)
toast.promise(
  executeJob(),
  {
    loading: 'Starting job...',
    success: 'Job started',
    error: 'Failed to start job'
  }
)
```

### Visibility API Integration
```typescript
// Source: MDN - Page Visibility API
// https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API

useEffect(() => {
  const handleVisibilityChange = () => {
    if (document.hidden) {
      console.log('Page hidden, pausing polling')
      setIsPaused(true)
    } else {
      console.log('Page visible, resuming polling')
      setIsPaused(false)
      // Optional: immediate refresh when user returns
      refetch()
    }
  }

  document.addEventListener('visibilitychange', handleVisibilityChange)
  return () => {
    document.removeEventListener('visibilitychange', handleVisibilityChange)
  }
}, [])
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual refresh only | Automatic polling with visibility detection | Established pattern | Better UX without constant refresh |
| setInterval in useEffect | useInterval pattern | Dan Abramov 2019 | Better cleanup, pause support |
| Toast messages inline | Sonner toast library | 2023+ | Cleaner UI, queue management |
| Polling hidden tabs | Visibility-aware polling | Modern browsers | Reduced bandwidth/server load |
| No status animation | Animated indicators | With Framer Motion/motion | Better user feedback |

**Deprecated/outdated:**
- Manual refresh only: Users must see stale data or manually refresh
- Inline loading spinners without toast: Users miss status changes when away
- Continuous polling regardless of visibility: Wastes resources
- Server-Sent Events for simple status: Overkill for discrete state changes (defer to future phase)

**Note:** Server-Sent Events (SSE) are gaining popularity in 2025 for true real-time updates, but for job status polling (discrete states, infrequent changes), polling remains the simpler and more appropriate choice for v1. SSE can be added later if needed.

## Open Questions

Things that couldn't be fully resolved:

1. **Optimal polling interval**
   - What we know: 3-5 seconds is common for job status polling
   - What's unclear: User expectation for "live" updates vs server load
   - Recommendation: Start with 3 seconds, make configurable, add jitter (±500ms) to prevent thundering herd

2. **Toast notification timing**
   - What we know: Should notify on completed/failed state
   - What's unclear: Whether to notify if user is on another tab
   - Recommendation: Show toast only if tab is visible (use visibility API), otherwise mark as "missed" notification

3. **Server-Sent Events vs Polling**
   - What we know: SSE provides true real-time updates
   - What's unclear: When SSE complexity becomes justified
   - Recommendation: Use polling for v1, consider SSE if users complain about lag or if many concurrent jobs

4. **Polling for list views**
   - What we know: Job detail page needs polling
   - What's unclear: Should job list pages also poll?
   - Recommendation: No for v1 - polling lists is expensive; users can click refresh

5. **router.refresh() vs client-side polling**
   - What we know: Next.js 15 supports router.refresh() for manual refresh
   - What's unclear: How to combine with automatic polling
   - Recommendation: Use client-side polling for active jobs, keep router.refresh() for manual refresh button

## Sources

### Primary (HIGH confidence)
- [Making setInterval Declarative with React Hooks - Dan Abramov](https://overreacted.io/making-setinterval-declarative-with-react-hooks/) - Canonical useInterval pattern
- [Sonner Documentation](https://sonner.emilkowal.ski/) - Toast notification library (already in package.json)
- [Page Visibility API - MDN](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API) - Visibility detection for pausing polls
- [Next.js 15 Documentation - Fetching Data](https://nextjs.org/docs/app/getting-started/fetching-data) - Data fetching patterns
- Existing codebase:
  - `/home/jussi/Development/viberator/platform/frontend/package.json` - Verified installed packages
  - `/home/jussi/Development/viberator/platform/frontend/src/app/(app)/project/[project]/jobs/[jobId]/page.tsx` - Existing job detail page
  - `/home/jussi/Development/viberator/platform/frontend/src/service/api/job-api.ts` - Existing getJob() function
  - `/home/jussi/Development/viberator/platform/frontend/src/components/badge.tsx` - Existing Badge component
  - `/home/jussi/Development/viberator/platform/backend/src/api/routes/jobs.ts` - Backend API endpoint

### Secondary (MEDIUM confidence)
- [Implementing Polling in React: A Guide for Efficient Real-Time Data Fetching (Medium, 2025)](https://medium.com/@sfcofc/implementing-polling-in-react-a-guide-for-efficient-real-time-data-fetching-47f0887c54a7) - Polling patterns including visibility detection
- [Polling in React Using the useInterval Custom Hook (Bits and Pieces, 2020)](https://blog.bitsrc.io/polling-in-react-using-the-useinterval-custom-hook-e2bcefda4197) - Practical useInterval for polling
- [Automatic Revalidation - SWR Documentation](https://swr.vercel.app/docs/revalidation) - SWR's approach to polling (refreshInterval)
- [Using AbortControllers in React Hooks (Medium, 2025)](https://medium.com/@armunhoz/using-abortcontrollers-in-react-hooks-creating-a-hook-for-canceling-pending-requests-39bbcaf01d22) - Request cancellation patterns

### Tertiary (LOW confidence)
- [SWR vs TanStack Query vs React Query: A 2025 Comparison](https://refine.dev/blog/react-query-vs-tanstack-query-vs-swr-2025/) - Comparison of data fetching libraries
- [Comparing the top React toast libraries (LogRocket, 2025)](https://blog.logrocket.com/react-toast-libraries-compared-2025/) - Toast library comparison confirming Sonner choice

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries verified from package.json, useInterval is canonical pattern
- Architecture: HIGH - Based on existing codebase patterns and established React polling practices
- Pitfalls: HIGH - Identified from common React polling failures and verified against documentation

**Research date:** 2026-01-21
**Valid until:** 2026-02-20 (30 days - React polling patterns are stable and well-established)
