import { Badge } from '@/components/badge'
import { Link } from '@/components/link'
import { Timestamp } from '@/components/timestamp'
import { taskPath } from '@/lib/taskPath'
import { situationPhrase, type HomeThread } from '@viberglass/types'
import { lastMessageLine } from './home-threads'

/** One task thread on Home: key, title, where it stands, what's new, and the last word in it. */
export function HomeThreadRow({ thread }: { thread: HomeThread }) {
  const line = lastMessageLine(thread.lastMessage)
  const { situation } = thread
  return (
    <li>
      <Link
        href={taskPath(thread.task.spaceSlug, thread.task)}
        className="hover-lift flex items-start justify-between gap-4 rounded-lg border border-zinc-950/10 bg-white p-3 dark:border-white/10 dark:bg-zinc-900"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-zinc-500 dark:text-zinc-400">{thread.task.key}</span>
            <span className="truncate text-sm font-medium text-zinc-950 dark:text-white">{thread.task.title}</span>
            {thread.unread > 0 && (
              <Badge color="amber" aria-label={`${thread.unread} unread`}>
                {thread.unread}
              </Badge>
            )}
          </div>
          <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">
            {situation.yourMove && <span className="font-semibold text-[var(--accent-11)]">Your move · </span>}
            {situationPhrase(situation)}
            <span className="text-zinc-400"> · {thread.task.spaceName}</span>
          </p>
          {line && <p className="mt-1 truncate text-xs text-zinc-500 dark:text-zinc-400">{line}</p>}
        </div>
        <Timestamp date={thread.latestActivityAt} className="text-xs whitespace-nowrap text-zinc-500 dark:text-zinc-400" />
      </Link>
    </li>
  )
}
