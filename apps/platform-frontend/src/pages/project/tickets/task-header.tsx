import { Link } from '@/components/link'
import { Timestamp } from '@/components/timestamp'
import { situationPhrase, type TaskSituationState, type Ticket } from '@viberglass/types'
import clsx from 'clsx'

const STATE_DOT: Record<TaskSituationState, string> = {
  not_started: 'bg-[var(--gray-8)]',
  agent_working: 'bg-blue-500 animate-pulse',
  paused: 'bg-[var(--gray-9)]',
  question: 'bg-amber-600',
  artifact_ready: 'bg-amber-600',
  discussing: 'bg-amber-600',
  failed: 'bg-red-500',
  pr_open: 'bg-green-600',
  done: 'bg-green-600',
}

/** The task's top: its space and key, its title, where it stands, and its actions on the right. */
export function TaskHeader({
  ticket,
  spaceName,
  project,
  actions,
}: {
  ticket: Ticket
  spaceName: string
  project: string
  actions: React.ReactNode
}) {
  const situation = ticket.situation
  return (
    <header>
      <p className="mb-3 text-xs text-[var(--gray-10)]">
        <Link href={`/spaces/${project}`} className="hover:text-[var(--gray-12)] hover:underline">
          {spaceName}
        </Link>{' '}
        › {ticket.key}
      </p>
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h1 className="text-[28px] leading-tight font-bold tracking-[-0.025em] text-[var(--gray-12)]">
            {ticket.title}
          </h1>
          <p aria-label="Situation" className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[var(--gray-10)]">
            {situation && <span aria-hidden className={clsx('size-[7px] rounded-full', STATE_DOT[situation.state])} />}
            {situation && (
              <strong className="font-semibold text-[var(--gray-11)]">
                {situation.yourMove && 'Your move · '}
                {situationPhrase(situation)}
              </strong>
            )}
            <span>
              · Updated <Timestamp date={ticket.updatedAt} />
            </span>
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      </div>
    </header>
  )
}
