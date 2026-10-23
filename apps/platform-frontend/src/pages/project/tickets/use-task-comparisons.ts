import { getTaskComparisons } from '@/service/api/comparison-api'
import type { TaskComparisonsView } from '@viberglass/types'
import { useCallback, useEffect, useState } from 'react'

const POLL_MS = 15_000

/** The task's comparisons, loaded again while any fork is working and whenever `refreshKey` changes. */
export function useTaskComparisons(taskId: string | undefined, refreshKey: string) {
  const [view, setView] = useState<TaskComparisonsView | null>(null)

  const reload = useCallback(async () => {
    if (!taskId) return
    setView(await getTaskComparisons(taskId))
  }, [taskId])

  useEffect(() => {
    void reload().catch(() => undefined)
  }, [reload, refreshKey])

  const working = Boolean(view?.comparisons.some((comparison) => comparison.arms.some((arm) => arm.running)))
  useEffect(() => {
    if (!working) return
    const timer = window.setInterval(() => void reload().catch(() => undefined), POLL_MS)
    return () => window.clearInterval(timer)
  }, [working, reload])

  return { view, setView }
}
