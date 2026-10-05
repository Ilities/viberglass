import { listRunEvents, type RunEvent } from '@/service/api/job-api'
import { useEffect, useState } from 'react'

const POLL_INTERVAL = 2000

export interface UseRunEventsResult {
  events: RunEvent[]
  isLoading: boolean
  error: Error | null
}

/**
 * A run's events, followed while it runs: each poll asks only for what came
 * after the last event it has. When the run ends the effect starts over once,
 * which picks up what it sent on its way out.
 */
export function useRunEvents(jobId: string, live: boolean): UseRunEventsResult {
  const [events, setEvents] = useState<RunEvent[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let after = 0

    const fetchMore = async () => {
      try {
        const more = await listRunEvents(jobId, after)
        if (cancelled) return
        if (more.length > 0) {
          after = Number(more[more.length - 1].sequence)
          setEvents((known) => [...known, ...more])
        }
        setError(null)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err : new Error(String(err)))
      } finally {
        if (!cancelled) setIsLoading(false)
      }
      if (!cancelled && live) timer = setTimeout(() => void fetchMore(), POLL_INTERVAL)
    }

    setEvents([])
    setIsLoading(true)
    void fetchMore()
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [jobId, live])

  return { events, isLoading, error }
}
