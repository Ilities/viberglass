import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { Link } from '@/components/link'
import { Timestamp } from '@/components/timestamp'
import { taskPath } from '@/lib/taskPath'
import { pickComparisonWinner } from '@/service/api/comparison-api'
import { ExternalLinkIcon } from '@radix-ui/react-icons'
import type { TaskComparison, TaskComparisonArm, TaskComparisonsView } from '@viberglass/types'
import clsx from 'clsx'
import { useState } from 'react'
import { toast } from 'sonner'
import { armFacts, armState } from './comparison-facts'

const STATE_DOT = (arm: TaskComparisonArm) =>
  arm.running
    ? 'bg-blue-500 animate-pulse'
    : arm.lastRunStatus === 'failed'
      ? 'bg-red-500'
      : arm.runs === 0
        ? 'bg-[var(--gray-8)]'
        : 'bg-green-600'

function ArmCard({
  arm,
  space,
  winner,
  onPick,
  picking,
}: {
  arm: TaskComparisonArm
  space: string
  winner: boolean
  onPick?: () => void
  picking: boolean
}) {
  const facts = armFacts(arm)
  return (
    <li
      className={clsx(
        'flex min-w-0 flex-col gap-2 rounded-[9px] border bg-[var(--color-panel-solid)] px-4 py-3 text-sm',
        winner ? 'border-green-600' : 'border-[var(--gray-5)]'
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-[var(--gray-12)]">{arm.runner.name}</p>
          <Link href={taskPath(space, { id: arm.ticketId, key: arm.key })} className="text-xs text-[var(--gray-10)] hover:text-[var(--accent-11)] hover:underline">
            {arm.key}
          </Link>
        </div>
        {winner && <Badge color="green">Picked</Badge>}
      </div>
      <p className="flex items-center gap-2 text-xs text-[var(--gray-11)]">
        <span aria-hidden className={clsx('size-[7px] shrink-0 rounded-full', STATE_DOT(arm))} />
        {armState(arm)}
      </p>
      {arm.intent && <p className="line-clamp-3 text-[var(--gray-12)]">{arm.intent}</p>}
      {facts.length > 0 && <p className="text-xs text-[var(--gray-10)]">{facts.join(' · ')}</p>}
      {arm.branch && <p className="truncate font-mono text-xs text-[var(--gray-10)]" title={arm.branch}>{arm.branch}</p>}
      <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
        {arm.pullRequestUrl && (
          <a
            href={arm.pullRequestUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-[var(--gray-11)] hover:text-[var(--accent-11)]"
          >
            Pull request <ExternalLinkIcon className="size-3" />
          </a>
        )}
        {onPick && (
          <Button outline size="small" className="!ml-auto" disabled={picking} onClick={onPick}>
            {winner ? 'Unpick' : 'Pick this'}
          </Button>
        )}
      </div>
    </li>
  )
}

function Comparison({
  taskId,
  comparison,
  space,
  canPick,
  onChanged,
}: {
  taskId: string
  comparison: TaskComparison
  space: string
  canPick: boolean
  onChanged: (view: TaskComparisonsView) => void
}) {
  const [picking, setPicking] = useState(false)

  async function pick(ticketId: string | null) {
    setPicking(true)
    try {
      onChanged(await pickComparisonWinner(taskId, comparison.id, ticketId))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't pick the winner")
    } finally {
      setPicking(false)
    }
  }

  return (
    <section aria-label="Comparison" className="space-y-3">
      <p className="text-xs text-[var(--gray-10)]">
        {comparison.forkedFromTurnId ? 'Forked after a turn' : 'Forked as the task was'} · <Timestamp date={comparison.forkedAt} />
        {comparison.createdBy && ` · ${comparison.createdBy.name}`}
        {comparison.baseCommit && (
          <>
            {' · '}
            <span className="font-mono">{comparison.baseCommit.slice(0, 7)}</span>
          </>
        )}
      </p>
      <ul className="grid gap-3 sm:grid-cols-2">
        {comparison.arms.map((arm) => {
          const winner = comparison.winnerTicketId === arm.ticketId
          return (
            <ArmCard
              key={arm.ticketId}
              arm={arm}
              space={space}
              winner={winner}
              picking={picking}
              onPick={canPick ? () => void pick(winner ? null : arm.ticketId) : undefined}
            />
          )
        })}
      </ul>
    </section>
  )
}

/** The agents compared on forks of this task, side by side, newest comparison first. */
export function TaskComparisons({
  taskId,
  view,
  space,
  canPick,
  onChanged,
}: {
  taskId: string
  view: TaskComparisonsView
  space: string
  canPick: boolean
  onChanged: (view: TaskComparisonsView) => void
}) {
  if (view.comparisons.length === 0) return null
  return (
    <details open id="comparisons" className="rounded-[9px] border border-[var(--gray-5)] bg-[var(--gray-2)] px-5 py-4">
      <summary className="cursor-pointer text-sm text-[var(--gray-11)]">
        Agent comparisons · {view.comparisons.length}
      </summary>
      <div className="mt-4 space-y-6">
        {view.comparisons.map((comparison) => (
          <Comparison key={comparison.id} taskId={taskId} comparison={comparison} space={space} canPick={canPick} onChanged={onChanged} />
        ))}
      </div>
    </details>
  )
}

/** On a fork: which task it was forked from, for which agent, and whether it was picked. */
export function ComparisonForkBanner({ armOf, space }: { armOf: NonNullable<TaskComparisonsView['armOf']>; space: string }) {
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-[9px] border border-[var(--gray-5)] bg-[var(--gray-2)] px-4 py-2.5 text-sm text-[var(--gray-11)]">
      <span>
        {armOf.runner.name}&apos;s fork of{' '}
        <Link href={`${taskPath(space, armOf.parent)}#comparisons`} className="font-medium text-[var(--gray-12)] hover:underline">
          {armOf.parent.key} {armOf.parent.title}
        </Link>{' '}
        · <Timestamp date={armOf.forkedAt} />
      </span>
      {armOf.winner && <Badge color="green">Picked</Badge>}
    </p>
  )
}
