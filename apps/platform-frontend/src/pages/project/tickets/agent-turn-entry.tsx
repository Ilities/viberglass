import { CancelRunButton } from '@/components/cancel-run-button'
import { Link } from '@/components/link'
import { Timestamp } from '@/components/timestamp'
import { useAuth } from '@/context/auth-context'
import { isRunner } from '@/lib/roles'
import { cancelJob } from '@/service/api/job-api'
import { toast } from 'sonner'
import type { TaskTimelineEntry, TaskTurnAction } from '@viberglass/types'
import { useState } from 'react'

type AgentTurn = Extract<TaskTimelineEntry, { kind: 'agent_turn' }>

const ASKED_FOR: Record<TaskTurnAction, string> = {
  research: 'the research',
  plan: 'the plan',
  code: 'the build',
  reply: 'a reply',
  summarise: 'a summary',
}

/** Lines of a reply shown before "Show the whole reply". */
const PREVIEW_LINES = 4

function sessionLine(resumed: boolean | null): string | null {
  if (resumed === true) return 'continued its session'
  if (resumed === false) return 'started a fresh session'
  return null
}

/** "Context 75% full", or the tokens in it when the harness didn't say how big it is. */
export function contextLine(usage: { used: number; size: number | null } | null | undefined): string | null {
  if (!usage) return null
  if (usage.size) return `Context ${Math.round((usage.used / usage.size) * 100)}% full`
  return `${Math.round(usage.used / 1000)}k tokens in context`
}

/** "Tomi", "Tomi and Aino", "Tomi, Aino and Maria". */
function joinNames(names: string[]): string {
  return names.length < 2 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

/** Stops a running turn; the page picks up the cancelled run when it next refreshes. */
function CancelTurn({ jobId }: { jobId: string }) {
  const [isCancelling, setIsCancelling] = useState(false)
  const cancel = async () => {
    setIsCancelling(true)
    try {
      await cancelJob(jobId)
      toast.success('Run cancelled')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to cancel run')
      setIsCancelling(false)
    }
  }
  return <CancelRunButton label="Cancel run" isCancelling={isCancelling} onConfirm={() => void cancel()} />
}

/** One of the agent's turns in the thread: what it said it would do, and what it said. */
export function AgentTurnEntry({ entry, project, summaryVersion }: { entry: AgentTurn; project: string; summaryVersion?: number }) {
  const [expanded, setExpanded] = useState(false)
  const { outcome } = entry
  const working = entry.status === 'queued' || entry.status === 'running'
  const { user } = useAuth()
  // A run's page is an engineers' view; guests and viewers see the turn in the thread only.
  const runLink = entry.jobId && isRunner(user?.role) ? `/spaces/${project}/runs/${entry.jobId}` : null
  // The intent is shown on its own, so the reply starts after it.
  const rest = outcome?.reply.trim().split('\n').slice(outcome.intent ? 1 : 0).join('\n').trim() ?? ''
  const restLines = rest.split('\n')
  const shown = expanded ? rest : restLines.slice(0, PREVIEW_LINES).join('\n')
  const session = outcome ? sessionLine(outcome.resumed) : null
  const context = contextLine(outcome?.contextUsage)

  return (
    <li aria-label={`${entry.agent.name}'s turn`} className="space-y-1 border-l-2 border-[var(--accent-7)] pl-3">
      <p className="text-xs text-[var(--gray-10)]">
        <span className="font-medium text-[var(--gray-11)]">{entry.agent.name}</span> · asked for {ASKED_FOR[entry.action]} ·{' '}
        <Timestamp date={entry.at} />
        {session && ` · ${session}`}
      </p>
      {working && (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-[var(--gray-11)]">
            Working on it…{' '}
            {runLink && (
              <Link href={runLink} className="underline">
                Watch
              </Link>
            )}
          </p>
          {/* Cancelling is for those who run agents, as on the server. */}
          {runLink && entry.jobId && <CancelTurn jobId={entry.jobId} />}
        </div>
      )}
      {entry.status === 'failed' && (
        <p className="text-sm text-red-700">
          This turn failed.{' '}
          {runLink && (
            <Link href={runLink} className="underline">
              See what happened
            </Link>
          )}
        </p>
      )}
      {entry.status === 'cancelled' && <p className="text-sm text-[var(--gray-11)]">This turn was cancelled.</p>}
      {outcome?.intent && <p className="text-sm font-medium text-[var(--gray-12)]">{outcome.intent}</p>}
      {shown && <p className="text-sm whitespace-pre-wrap text-[var(--gray-12)]">{shown}</p>}
      {restLines.length > PREVIEW_LINES && (
        <button type="button" onClick={() => setExpanded(!expanded)} className="text-xs text-[var(--gray-10)] hover:text-[var(--gray-12)]">
          {expanded ? 'Show less' : 'Show the whole reply'}
        </button>
      )}
      {outcome?.mentioned && outcome.mentioned.length > 0 && (
        <p className="text-xs text-[var(--gray-10)]">
          Asked <span className="font-medium text-[var(--gray-11)]">{joinNames(outcome.mentioned.map((person) => person.name))}</span> to
          take a look
        </p>
      )}
      {outcome?.produced.includes('summary') && (
        <p className="text-xs text-[var(--gray-10)]">{summaryVersion ? `Wrote Summary v${summaryVersion}` : 'Wrote a summary'}</p>
      )}
      {outcome?.compacted && <p className="text-xs text-[var(--gray-10)]">Compacted its context with the summary</p>}
      {context && <p className="text-xs text-[var(--gray-10)]">{context}</p>}
      {outcome?.codeDiscarded && (
        <p className="text-xs text-[var(--gray-10)]">
          It changed code, but nobody asked it to build this time, so the changes weren&apos;t kept. Ask it to build it to keep them.
        </p>
      )}
    </li>
  )
}
