import { Link } from '@/components/link'
import { SectionHeader } from '@/components/section-header'
import { Timestamp } from '@/components/timestamp'
import { taskPath } from '@/lib/taskPath'
import type { OverviewTask } from '@viberglass/types'

/** What finished this week and how: a merged pull request, or closed by hand. */
export function OverviewOutcomes({ tasks }: { tasks: OverviewTask[] }) {
  return (
    <section aria-labelledby="overview-outcomes" className="mb-8">
      <SectionHeader id="overview-outcomes" title="Recent outcomes" />
      {tasks.length === 0 ? (
        <p className="text-sm text-[var(--gray-10)]">Nothing done this week yet.</p>
      ) : (
        <div
          role="table"
          aria-label="Recent outcomes"
          className="overflow-hidden rounded-[9px] border border-[var(--gray-5)] bg-[var(--color-panel-solid)] text-sm"
        >
          <div
            role="row"
            className="grid grid-cols-[2fr_1fr_1fr] gap-5 bg-[var(--gray-2)] px-5 py-3 text-xs text-[var(--gray-10)] max-sm:gap-2 max-sm:px-3"
          >
            <span role="columnheader">Task</span>
            <span role="columnheader">Outcome</span>
            <span role="columnheader">Finished</span>
          </div>
          {tasks.map(({ task, situation, pullRequestUrl }) => (
            <div
              key={task.id}
              role="row"
              className="grid grid-cols-[2fr_1fr_1fr] gap-5 border-t border-[var(--gray-5)] px-5 py-4 max-sm:gap-2 max-sm:px-3"
            >
              <span role="cell" className="min-w-0">
                <Link
                  href={taskPath(task.spaceSlug, task)}
                  className="font-semibold text-[var(--gray-12)] hover:underline"
                >
                  {task.title}
                </Link>
              </span>
              <span role="cell">
                {pullRequestUrl ? (
                  <a href={pullRequestUrl} target="_blank" rel="noreferrer" className="underline">
                    Pull request merged
                  </a>
                ) : (
                  'Closed manually'
                )}
              </span>
              <span role="cell" className="text-[var(--gray-10)]">
                <Timestamp date={situation.since} /> · {task.spaceName}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
