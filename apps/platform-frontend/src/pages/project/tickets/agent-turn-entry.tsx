import { Link } from '@/components/link'
import { Timestamp } from '@/components/timestamp'
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

/** One of the agent's turns in the thread: what it said it would do, and what it said. */
export function AgentTurnEntry({ entry, project }: { entry: AgentTurn; project: string }) {
  const [expanded, setExpanded] = useState(false)
  const { outcome } = entry
  const working = entry.status === 'queued' || entry.status === 'running'
  const runLink = entry.jobId ? `/spaces/${project}/runs/${entry.jobId}` : null
  // The intent is shown on its own, so the reply starts after it.
  const rest = outcome?.reply.trim().split('\n').slice(outcome.intent ? 1 : 0).join('\n').trim() ?? ''
  const restLines = rest.split('\n')
  const shown = expanded ? rest : restLines.slice(0, PREVIEW_LINES).join('\n')
  const session = outcome ? sessionLine(outcome.resumed) : null

  return (
    <li aria-label={`${entry.agent.name}'s turn`} className="space-y-1 border-l-2 border-[var(--accent-7)] pl-3">
      <p className="text-xs text-[var(--gray-10)]">
        <span className="font-medium text-[var(--gray-11)]">{entry.agent.name}</span> · asked for {ASKED_FOR[entry.action]} ·{' '}
        <Timestamp date={entry.at} />
        {session && ` · ${session}`}
      </p>
      {working && (
        <p className="text-sm text-[var(--gray-11)]">
          Working on it…{' '}
          {runLink && (
            <Link href={runLink} className="underline">
              Watch
            </Link>
          )}
        </p>
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
      {outcome?.codeDiscarded && (
        <p className="text-xs text-[var(--gray-10)]">
          It changed code, but nobody asked it to build this time, so the changes weren&apos;t kept. Ask it to build it to keep them.
        </p>
      )}
      {!working && (
        <p className="text-xs">
          <Link href={`/spaces/${project}/sessions/${entry.sessionId}`} className="text-[var(--gray-10)] underline">
            Open the session
          </Link>
        </p>
      )}
    </li>
  )
}
