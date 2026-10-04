import { Avatar } from '@/components/avatar'
import { Badge } from '@/components/badge'
import { Checkbox } from '@/components/checkbox'
import { Link } from '@/components/link'
import { taskPath } from '@/lib/taskPath'
import { lastMessageLine } from '@/pages/home/home-threads'
import { SituationLine } from '@/pages/project/tickets/situation-line'
import type { Ticket } from '@viberglass/types'

export function ownerInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  return parts.length === 1 ? parts[0].slice(0, 2).toUpperCase() : `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
}

interface SpaceTaskCardProps {
  task: Ticket
  space: string
  /** Set only for people who may archive, who get a checkbox. */
  selection?: { selected: boolean; onToggle: () => void }
}

/** One task on the space page: key, title, where it stands, its owner, what's new, and the last word. */
export function SpaceTaskCard({ task, space, selection }: SpaceTaskCardProps) {
  const line = lastMessageLine(task.lastMessage)
  return (
    <li className="flex items-start gap-3 rounded-lg border border-zinc-950/10 bg-white p-3 dark:border-white/10 dark:bg-zinc-900">
      {selection && (
        <Checkbox className="mt-0.5" checked={selection.selected} onChange={selection.onToggle} aria-label={`Select ${task.key}`} />
      )}
      <Link href={taskPath(space, task)} className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-zinc-500 dark:text-zinc-400">{task.key}</span>
          <span className="truncate text-sm font-medium text-zinc-950 hover:underline dark:text-white">{task.title}</span>
          {(task.unread ?? 0) > 0 && (
            <Badge color="amber" aria-label={`${task.unread} new message${task.unread === 1 ? '' : 's'}`}>
              {task.unread}
            </Badge>
          )}
        </div>
        {task.situation && <SituationLine situation={task.situation} className="mt-1 !text-xs" />}
        {line && <p className="mt-1 truncate text-xs text-zinc-500 dark:text-zinc-400">{line}</p>}
      </Link>
      {task.owner && (
        <span title={`Owner: ${task.owner.name}`}>
          <Avatar size="1" initials={ownerInitials(task.owner.name)} className="bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200" />
        </span>
      )}
    </li>
  )
}
