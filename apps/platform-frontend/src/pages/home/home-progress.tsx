import { Link } from '@/components/link'
import { Timestamp } from '@/components/timestamp'
import { taskPath } from '@/lib/taskPath'
import type { HomeThread } from '@viberglass/types'

/** A compact view of the person's active conversations and recent outcomes. */
export function HomeProgress({ threads }: { threads: HomeThread[] }) {
  const tasks = [...new Map(threads.map((thread) => [thread.task.id, thread])).values()]
  const working = tasks.filter((thread) => thread.situation.state === 'agent_working')
  const done = tasks.filter((thread) => thread.situation.state === 'done')
  return (
    <aside aria-label="Your work in progress" className="space-y-9">
      <section aria-labelledby="home-working">
        <div className="flex items-center justify-between gap-3"><h2 id="home-working" className="text-base font-semibold">Work in motion</h2><span className="text-xs text-[var(--gray-10)]">{working.length}</span></div>
        <p className="mt-1 text-xs text-[var(--gray-10)]">Agents working on your conversations.</p>
        {working.length === 0 ? <p className="mt-4 text-sm text-[var(--gray-10)]">No agents working on your conversations.</p> : (
          <ul className="mt-2 divide-y divide-[var(--gray-5)]">
            {working.slice(0, 3).map((thread) => <li key={thread.task.id} className="py-4"><Link href={taskPath(thread.task.spaceSlug, thread.task)} className="text-sm font-medium hover:underline">{thread.task.title}</Link><p className="mt-1 text-xs text-[var(--gray-10)]">{thread.situation.label} · {thread.task.spaceName}</p></li>)}
          </ul>
        )}
        {working.length > 3 && <p className="mt-3 text-xs text-[var(--gray-10)]">{working.length - 3} more in Your conversations</p>}
      </section>
      <section aria-labelledby="home-outcomes">
        <h2 id="home-outcomes" className="text-base font-semibold">Recent outcomes</h2>
        <p className="mt-1 text-xs text-[var(--gray-10)]">Completed conversations you are on.</p>
        {done.length === 0 ? <p className="mt-4 text-sm text-[var(--gray-10)]">No completed conversations yet.</p> : (
          <ul className="mt-2 divide-y divide-[var(--gray-5)]">
            {done.slice(0, 3).map((thread) => <li key={thread.task.id} className="py-4"><Link href={taskPath(thread.task.spaceSlug, thread.task)} className="text-sm font-medium hover:underline">{thread.task.title}</Link><p className="mt-1 text-xs text-[var(--gray-10)]">{thread.situation.label} · {thread.task.spaceName} · <Timestamp date={thread.latestActivityAt} /></p></li>)}
          </ul>
        )}
      </section>
    </aside>
  )
}
