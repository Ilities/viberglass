import { getTickets, type TicketListParams } from '@/service/api/ticket-api'
import { useApiRefresh } from '@/hooks/useApiRefresh'
import type { Ticket } from '@viberglass/types'
import { useCallback, useEffect, useRef, useState } from 'react'

export interface PagedTasks {
  tasks: Ticket[]
  total: number
  isLoading: boolean
  error: string | null
  hasMore: boolean
  loadMore: () => void
  reload: () => void
}

/**
 * One list of a space's tasks, a page at a time. Starts over whenever the
 * query changes (memoise it); `enabled` false leaves it unloaded until it's wanted.
 */
export function usePagedTasks(query: TicketListParams, pageSize: number, enabled = true): PagedTasks {
  const [tasks, setTasks] = useState<Ticket[]>([])
  const [total, setTotal] = useState(0)
  const [isLoading, setIsLoading] = useState(enabled)
  const [error, setError] = useState<string | null>(null)
  const [reloads, setReloads] = useState(0)
  const revision = useApiRefresh('/api/tasks')
  // Which load is current, so a slow earlier one can't overwrite a newer one.
  const latest = useRef(0)

  const load = useCallback(
    async (offset: number) => {
      const request = ++latest.current
      setIsLoading(true)
      setError(null)
      try {
        const page = await getTickets({ ...query, limit: pageSize, offset })
        if (request !== latest.current) return
        setTasks((current) => (offset === 0 ? page.tickets : [...current, ...page.tickets]))
        setTotal(page.pagination.total)
      } catch (loadError) {
        if (request === latest.current) setError(loadError instanceof Error ? loadError.message : 'Failed to load tasks')
      } finally {
        if (request === latest.current) setIsLoading(false)
      }
    },
    [query, pageSize]
  )

  useEffect(() => {
    if (enabled) void load(0)
    return () => {
      latest.current += 1
    }
  }, [enabled, load, reloads, revision])

  return {
    tasks,
    total,
    isLoading,
    error,
    hasMore: tasks.length < total,
    loadMore: () => void load(tasks.length),
    reload: () => setReloads((count) => count + 1),
  }
}
