import { Link } from '@/components/link'
import { SectionHeader } from '@/components/section-header'
import { Timestamp } from '@/components/timestamp'
import { taskPath } from '@/lib/taskPath'
import type { OverviewTask } from '@viberglass/types'
import { useState } from 'react'

/** What finished this week and how: a merged pull request, or closed by hand. */
export function OverviewOutcomes({ tasks }: { tasks: OverviewTask[] }) {
  const [expanded, setExpanded] = useState(false)
  const visible = expanded ? tasks : tasks.slice(0, 5)
  return (
    <section aria-labelledby="overview-outcomes" className="mb-8">
      <SectionHeader id="overview-outcomes" title="Recent outcomes" />
      {tasks.length === 0 ? (
        <p className="text-sm text-[var(--gray-10)]">Nothing completed in the last 7 days.</p>
      ) : (
        <ul aria-label="Recent outcomes" className="divide-y divide-[var(--gray-5)] border-y border-[var(--gray-5)] text-sm">
          {visible.map(({ task, situation, pullRequestUrl, completionKind }) => (
            <li key={task.id} className="py-4">
              <div className="min-w-0">
                <Link
                  href={taskPath(task.spaceSlug, task)}
                  className="font-semibold text-[var(--gray-12)] hover:underline"
                >
                  {task.title}
                </Link>
              </div>
              <div className="mt-1 text-xs text-[var(--gray-10)]">
                {completionKind === 'merged' ? (pullRequestUrl ? (
                  <a href={pullRequestUrl} target="_blank" rel="noreferrer" className="underline">Pull request merged</a>
                ) : 'Pull request merged') : 'Closed manually'}
                {' · '}<Timestamp date={situation.since} /> · {task.spaceName}
              </div>
            </li>
          ))}
        </ul>
      )}
      {tasks.length > 5 && <button type="button" className="mt-3 text-sm text-[var(--gray-11)] underline" onClick={() => setExpanded((value) => !value)}>{expanded ? 'Show less' : `View all ${tasks.length} outcomes`}</button>}
    </section>
  )
}
