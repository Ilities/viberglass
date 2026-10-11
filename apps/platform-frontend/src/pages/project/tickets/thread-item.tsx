import { Avatar } from '@/components/avatar'
import { Timestamp } from '@/components/timestamp'
import { initialsOf } from '@/lib/initials'

/**
 * One message-shaped entry in the conversation: who, when, and what they
 * said. The agent's entries carry "AI" rather than the runner's initials.
 */
export function ThreadItem({
  who,
  isAgent = false,
  outsider = false,
  at,
  note,
  label,
  children,
}: {
  who: string
  isAgent?: boolean
  /** Someone without a Viberglass account, such as a commenter on a linked tracker issue: a square avatar sets them apart from members. */
  outsider?: boolean
  at: string
  /** Said after the time, quieter: "to the agent", "asked for the plan". */
  note?: React.ReactNode
  label?: string
  children: React.ReactNode
}) {
  return (
    <li aria-label={label} className="flex gap-2.5">
      <Avatar size="2" square={outsider} initials={isAgent ? 'AI' : initialsOf(who) || '?'} className="mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-xs">
          <span className="font-semibold text-[var(--gray-12)]">{who}</span>
          <Timestamp date={at} className="ml-1.5 text-[var(--gray-10)]" />
          {note && <span className="text-[var(--gray-10)]"> · {note}</span>}
        </p>
        <div className="mt-1.5 space-y-2 text-[13px] leading-relaxed">{children}</div>
      </div>
    </li>
  )
}
