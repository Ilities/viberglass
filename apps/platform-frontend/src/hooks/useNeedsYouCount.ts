import { getNeedsYouCount } from '@/service/api/home-api'
import { useApiRefresh } from './useApiRefresh'
import { useEffect, useState } from 'react'

const POLL_MS = 60_000

/** Threads where it's the person's move, refreshed every minute and whenever the page changes (e.g. after replying). */
export function useNeedsYouCount(enabled: boolean, pathname: string): number {
  const [count, setCount] = useState(0)
  const revision = useApiRefresh('/api/tasks', '/api/setup/demo')
  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    const load = () =>
      getNeedsYouCount()
        .then((needsYou) => !cancelled && setCount(needsYou))
        .catch(() => undefined)
    void load()
    const timer = setInterval(() => void load(), POLL_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [enabled, pathname, revision])
  return count
}
