import { Subheading } from '@/components/heading'
import { Link } from '@/components/link'
import { Timestamp } from '@/components/timestamp'
import { taskPath } from '@/lib/taskPath'
import { situationPhrase, type OverviewTask } from '@viberglass/types'

/** One of Overview's lists: each task with where it stands and whose move it is. */
export function OverviewSection({ title, tasks, empty }: { title: string; tasks: OverviewTask[]; empty: string }) {
  return (
    <section aria-label={title} className="mt-8">
      <Subheading>
        {title} <span className="text-sm font-normal text-[var(--gray-10)]">{tasks.length}</span>
      </Subheading>
      {tasks.length === 0 ? (
        <p className="mt-2 text-sm text-[var(--gray-10)]">{empty}</p>
      ) : (
        <ul className="mt-3 divide-y divide-[var(--gray-a4)] rounded-lg border border-zinc-950/10 bg-white dark:border-white/10 dark:bg-zinc-900">
          {tasks.map(({ task, situation, pullRequestUrl }) => (
            <li key={task.id} className="flex items-center justify-between gap-4 px-3 py-2">
              <div className="min-w-0">
                <Link href={taskPath(task.spaceSlug, task)} className="flex items-center gap-2 text-sm">
                  <span className="font-mono text-xs text-zinc-500 dark:text-zinc-400">{task.key}</span>
                  <span className="truncate font-medium text-zinc-950 dark:text-white">{task.title}</span>
                </Link>
                <p className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-300">
                  {situationPhrase(situation)}
                  <span className="text-zinc-500 dark:text-zinc-400"> · {task.spaceName}</span>
                  {pullRequestUrl && situation.state === 'done' && (
                    <>
                      {' · '}
                      <a href={pullRequestUrl} target="_blank" rel="noreferrer" className="underline">
                        Pull request
                      </a>
                    </>
                  )}
                </p>
              </div>
              <Timestamp date={situation.since} className="text-xs whitespace-nowrap text-zinc-500 dark:text-zinc-400" />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
