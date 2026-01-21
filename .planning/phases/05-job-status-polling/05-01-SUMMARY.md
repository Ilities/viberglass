---
phase: 05-job-status-polling
plan: 01
subsystem: frontend
tags: [react, hooks, polling, visibility-api, typescript]

# Dependency graph
requires:
  - phase: 04.4
    provides: E2E flow verification, job API endpoints
provides:
  - useInterval hook for declarative setInterval
  - usePolling hook with Page Visibility API integration
affects: [05-02]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Dan Abramov's useInterval pattern for declarative intervals
    - Page Visibility API for resource-efficient polling
    - Generic TypeScript hooks for reusability

key-files:
  created:
    - platform/frontend/src/hooks/useInterval.ts
    - platform/frontend/src/hooks/usePolling.ts
  modified: []

key-decisions:
  - "useInterval hook based on Dan Abramov's pattern prevents stale closures and memory leaks"
  - "Page Visibility API pauses polling when tab hidden (saves bandwidth/server resources)"
  - "isPolling flag prevents overlapping requests"
  - "Generic TypeScript design allows hooks to work with any data type"

patterns-established:
  - "Hooks export with JSDoc documentation for API reference"
  - "Callback ref pattern to avoid stale closures in intervals"
  - "Proper cleanup in useEffect return functions"
  - "Null parameter pattern for pause/disable behavior"

# Metrics
duration: 4min
completed: 2026-01-21
---

# Phase 05 Plan 01: Polling Hooks Foundation Summary

**Declarative polling hooks with Dan Abramov's useInterval pattern and Page Visibility API for resource-efficient job status polling**

## Performance

- **Duration:** 4 min
- **Started:** 2026-01-21T11:46:51Z
- **Completed:** 2026-01-21T11:50:00Z
- **Tasks:** 2
- **Files created:** 2
- **Files modified:** 0

## Accomplishments

- Created useInterval hook (40 lines) implementing Dan Abramov's declarative setInterval pattern
- Created usePolling hook (148 lines) with Page Visibility API integration and generic TypeScript support
- Both hooks properly typed with full JSDoc documentation
- Zero ESLint warnings or TypeScript errors

## Task Commits

Each task was committed atomically:

1. **Task 1: Create useInterval hook** - `ca2235a` (feat)
2. **Task 2: Create usePolling hook with visibility detection** - `b4a5696` (feat)

**Plan metadata:** (will be committed separately)

## Files Created

- `platform/frontend/src/hooks/useInterval.ts` - Declarative setInterval hook based on Dan Abramov's pattern with useRef for callback storage and proper cleanup
- `platform/frontend/src/hooks/usePolling.ts` - Generic polling hook with visibility detection, onComplete callback, and overlapping request prevention

## Hook API

### useInterval

```typescript
useInterval(callback: () => void, delay: number | null): void
```

- **callback:** Function to call on each interval
- **delay:** Interval in milliseconds, or `null` to pause polling
- Uses `useRef` to store latest callback (handles updates without re-running interval)
- Cleanup function clears interval on unmount or delay change

### usePolling

```typescript
interface UsePollingOptions<T> {
  fn: () => Promise<T>           // Async function to poll
  interval: number                // Polling interval in ms
  immediate?: boolean             // Call immediately on mount (default: true)
  enabled?: boolean               // Enable/disable polling (default: true)
  onComplete?: (data: T) => boolean // Return true to stop polling
}

interface UsePollingResult<T> {
  data: T | null                  // Latest data from polling
  error: Error | null             // Error from last poll
  isPolling: boolean              // Is a request in flight
  isPaused: boolean               // Is polling paused (tab hidden)
  poll: () => Promise<void>       // Manually trigger poll
  refetch: () => Promise<void>    // Trigger immediate poll and reset timer
}
```

## Decisions Made

- **Dan Abramov's useInterval pattern:** Prevents stale closures by storing callback in a ref, allowing interval to continue running without resetting when callback changes
- **Page Visibility API integration:** Automatically pauses polling when tab is hidden (`document.hidden`), saving bandwidth and server resources
- **Generic TypeScript design:** Both hooks use TypeScript generics for maximum reusability across any data type
- **Null parameter for pause:** Following React conventions, passing `null` as delay pauses the interval cleanly

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - hooks are self-contained and ready to use.

## Next Phase Readiness

- useInterval and usePolling hooks are ready for use in job status polling (05-02)
- Page visibility detection ensures efficient resource usage
- Generic design allows reuse for other polling scenarios (tickets, projects, etc.)
- Proper cleanup prevents memory leaks in component unmount scenarios

## Verification Checklist

| Criteria | Status |
|----------|--------|
| Both hooks are TypeScript with proper type definitions | DONE |
| useInterval passes null delay to pause (no errors) | DONE |
| usePolling visibility listener added/cleaned up properly | DONE |
| No ESLint warnings about missing dependencies | DONE |

---
*Phase: 05-job-status-polling*
*Plan: 01*
*Completed: 2026-01-21*
