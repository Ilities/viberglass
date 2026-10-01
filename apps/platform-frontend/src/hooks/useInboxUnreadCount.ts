import { getInboxUnreadCount } from '@/service/api/inbox-api'
import { useEffect, useState } from 'react'

const POLL_MS = 60_000

/** Unread Inbox items, refreshed every minute and whenever the page changes (e.g. after clearing items). */
export function useInboxUnreadCount(enabled: boolean, pathname: string): number {
  const [count, setCount] = useState(0)
  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    const load = () =>
      getInboxUnreadCount()
        .then((unread) => !cancelled && setCount(unread))
        .catch(() => undefined)
    void load()
    const timer = setInterval(() => void load(), POLL_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [enabled, pathname])
  return count
}
