import { useEffect, useRef } from 'react'

/**
 * Declarative setInterval hook based on Dan Abramov's pattern.
 *
 * This hook provides a declarative way to use setInterval that:
 * - Properly cleans up intervals on unmount
 * - Handles callback updates without re-running the interval
 * - Supports pausing by passing null as delay
 *
 * Reference: https://overreacted.io/making-setinterval-declarative-with-react-hooks/
 *
 * @param callback - Function to call on each interval
 * @param delay - Interval in milliseconds, or null to pause polling
 */
export function useInterval(callback: () => void, delay: number | null): void {
  // Store the latest callback using ref to avoid stale closures
  // This allows us to update the callback without resetting the interval
  const savedCallback = useRef<() => void>(callback)

  // Update the ref whenever callback changes
  useEffect(() => {
    savedCallback.current = callback
  }, [callback])

  // Set up the interval
  useEffect(() => {
    // Don't schedule if delay is null (pause)
    if (delay === null) {
      return
    }

    const id = setInterval(() => {
      savedCallback.current()
    }, delay)

    // Cleanup function - clears interval on unmount or delay change
    return () => clearInterval(id)
  }, [delay]) // Only re-run if delay changes
}
