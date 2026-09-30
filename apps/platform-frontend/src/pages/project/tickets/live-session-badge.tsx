import { Link } from '@/components/link'

/** Marks a task with an open live session and links straight into it. */
export function LiveSessionBadge({ project, sessionId }: { project: string; sessionId: string }) {
  return (
    <Link
      href={`/spaces/${project}/sessions/${sessionId}`}
      title="A live session is open on this task. Join it."
      className="relative z-10 inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-[10px] font-medium text-green-700 ring-1 ring-green-600/20 hover:bg-green-100 dark:bg-green-500/10 dark:text-green-300 dark:ring-green-400/30"
    >
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-green-500" />
      Live · Join
    </Link>
  )
}
