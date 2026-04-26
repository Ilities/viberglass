import { useCallback, useEffect, useRef, useState } from 'react'
import { useInterval } from './useInterval'

export interface UsePollingOptions<T> {
  /** Async function to call for each poll */
  fn: () => Promise<T>
  /** Polling interval in milliseconds */
  interval: number
  /** Call immediately on mount (default: true) */
  immediate?: boolean
  /** Enable/disable polling (default: true) */
  enabled?: boolean
  /** Callback to check if polling should stop. Return true to stop. */
  onComplete?: (data: T) => boolean
}

export interface UsePollingResult<T> {
  /** Latest data from polling */
  data: T | null
  /** Error from last poll attempt */
  error: Error | null
  /** Is a poll request currently in flight */
  isPolling: boolean
  /** Is polling paused due to tab being hidden */
  isPaused: boolean
  /** Manually trigger a poll */
  poll: () => Promise<void>
  /** Manually trigger a poll and reset interval timer */
  refetch: () => Promise<void>
}

/**
 * Generic polling hook with Page Visibility API integration.
 *
 * This hook automatically:
 * - Polls data at the specified interval
 * - Pauses when the tab is hidden (saves bandwidth/server resources)
 * - Resumes when the tab becomes visible again
 * - Stops polling when onComplete callback returns true
 * - Prevents overlapping requests with isPolling flag
 *
 * @template T - The type of data returned by the polling function
 * @param options - Polling configuration options
 * @returns Polling state and control functions
 */
export function usePolling<T>(options: UsePollingOptions<T>): UsePollingResult<T> {
  const { fn, interval, immediate = true, enabled = true, onComplete } = options

  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const [isPolling, setIsPolling] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [shouldStop, setShouldStop] = useState(false)

  // Track if we've completed the initial immediate fetch
  const hasCompletedInitialFetch = useRef(false)

  // Track if component is mounted (only set to false on true unmount)
  const isMounted = useRef(true)

  // Use a ref for in-flight guard so it doesn't cause poll to change identity
  const isPollingRef = useRef(false)

  // Keep latest values in refs so poll can read them without being in deps
  const fnRef = useRef(fn)
  const isPausedRef = useRef(isPaused)
  const shouldStopRef = useRef(shouldStop)
  const enabledRef = useRef(enabled)
  const onCompleteRef = useRef(onComplete)

  useEffect(() => { fnRef.current = fn }, [fn])
  useEffect(() => { isPausedRef.current = isPaused }, [isPaused])
  useEffect(() => { shouldStopRef.current = shouldStop }, [shouldStop])
  useEffect(() => { enabledRef.current = enabled }, [enabled])
  useEffect(() => { onCompleteRef.current = onComplete }, [onComplete])

  const poll = useCallback(async () => {
    // Skip if already polling, paused, stopped, or disabled
    if (isPollingRef.current || isPausedRef.current || shouldStopRef.current || !enabledRef.current || !isMounted.current) {
      return
    }

    isPollingRef.current = true
    setIsPolling(true)
    setError(null)

    try {
      const result = await fnRef.current()

      // Only update state if component is still mounted
      if (isMounted.current) {
        setData(result)

        // Check if we should stop polling
        if (onCompleteRef.current && onCompleteRef.current(result)) {
          setShouldStop(true)
        }
      }
    } catch (err) {
      if (isMounted.current) {
        setError(err instanceof Error ? err : new Error('Polling failed'))
      }
    } finally {
      isPollingRef.current = false
      if (isMounted.current) {
        setIsPolling(false)
        hasCompletedInitialFetch.current = true
      }
    }
  }, []) // stable — reads all values via refs

  // Manual refetch - triggers immediate poll and resets timer
  const refetch = useCallback(async () => {
    await poll()
  }, [poll])

  // Handle visibility change
  useEffect(() => {
    const handleVisibilityChange = () => {
      const isHidden = document.hidden
      setIsPaused(isHidden)

      // When tab becomes visible again, trigger immediate refetch
      if (!isHidden && !shouldStopRef.current && enabledRef.current) {
        void poll()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    // Initialize paused state based on current visibility
    setIsPaused(document.hidden)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [poll])

  // Set up interval polling using useInterval
  // Pass null to pause when disabled, paused, or should stop
  const delay = enabled && !isPaused && !shouldStop ? interval : null

  useInterval(() => {
    void poll()
  }, delay)

  // Immediate fetch on mount if requested; set isMounted=false on true unmount
  useEffect(() => {
    isMounted.current = true
    if (immediate && enabled && !hasCompletedInitialFetch.current) {
      void poll()
    }

    return () => {
      isMounted.current = false
    }
  }, []) // runs only on mount/unmount

  // Re-trigger immediate poll when enabled transitions from false to true
  useEffect(() => {
    if (enabled && !hasCompletedInitialFetch.current) {
      void poll()
    }
  }, [enabled, poll])

  return {
    data,
    error,
    isPolling,
    isPaused,
    poll,
    refetch,
  }
}
