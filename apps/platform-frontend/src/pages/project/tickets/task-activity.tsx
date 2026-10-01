import { Timestamp } from '@/components/timestamp'
import { usePersonName } from '@/hooks/usePeople'
import { getTaskActivity } from '@/service/api/discussion-api'
import type { TaskActivityEntry } from '@viberglass/types'
import { useEffect, useState } from 'react'
import { describeActivity } from './activity-sentence'

/** Everything that happened on the task, oldest first, each with who and when. */
export function TaskActivity({ taskId }: { taskId: string }) {
  const [entries, setEntries] = useState<TaskActivityEntry[] | null>(null)
  const personName = usePersonName()

  useEffect(() => {
    getTaskActivity(taskId)
      .then(setEntries)
      .catch(() => setEntries([]))
  }, [taskId])

  if (!entries) return null
  if (entries.length === 0) return <p className="text-sm text-[var(--gray-10)]">Nothing recorded yet.</p>

  return (
    <ol className="space-y-2">
      {entries.map((entry) => (
        <li key={entry.id} className="flex items-baseline justify-between gap-4 text-sm">
          <span className="text-[var(--gray-12)]">{describeActivity(entry, (id) => personName(id) ?? 'someone')}</span>
          <Timestamp date={entry.createdAt} className="shrink-0 text-xs text-[var(--gray-10)]" />
        </li>
      ))}
    </ol>
  )
}
