import { Breadcrumbs } from '@/components/breadcrumbs'
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

const META_ITEM = "flex min-w-0 before:w-4 before:shrink-0 before:text-center before:content-['·']"

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
      <Breadcrumbs
        className="mb-3"
        items={[
          { label: spaceName, href: `/spaces/${project}` },
          { label: 'Tasks', href: `/spaces/${project}/tasks` },
          { label: ticket.key },
        ]}
      />
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h1 className="text-[28px] leading-tight font-bold tracking-[-0.025em] text-[var(--gray-12)]">
            {ticket.title}
          </h1>
          {/* Each item brings its separator; the one starting a line sits in the clipped margin, so no line starts with a dot. */}
          <p aria-label="Situation" className="mt-2 overflow-hidden text-xs text-[var(--gray-10)]">
            <span className="-ml-4 flex flex-wrap items-baseline">
              {situation && (
                <span className={META_ITEM}>
                  <span className="min-w-0">
                    <span aria-hidden className={clsx('mr-2 inline-block size-[7px] rounded-full align-middle', STATE_DOT[situation.state])} />
                    <strong className="font-semibold text-[var(--gray-11)]">
                      {situation.yourMove && 'Your move · '}
                      {situationPhrase(situation)}
                    </strong>
                  </span>
                </span>
              )}
              <span className={META_ITEM}>
                <span className="whitespace-nowrap">
                  Updated <Timestamp date={ticket.updatedAt} />
                </span>
              </span>
            </span>
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      </div>
    </header>
  )
}
