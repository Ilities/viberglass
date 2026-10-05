import { RunnerReadinessBadge } from '@/components/runner-readiness-badge'
import { getNextAgent, type NextAgent } from '@/service/api/discussion-api'
import { getAgentLabel, type Clanker } from '@viberglass/types'
import { useEffect, useState } from 'react'
import { summarizeRunner } from '@/pages/clankers/config/runnerSummary'

const VIA: Record<NonNullable<NextAgent['via']>, string> = {
  named: 'asked for by name',
  on_task: 'already on this task',
  default: "the workspace's default agent",
  first_ready: 'the first ready agent',
}

interface NextAgentLineProps {
  taskId: string
  /** Changes when the task's runs or sessions do, which can change who's next. */
  refreshKey: string
  clankers: Clanker[]
  /** Agents that already have a conversation on this task. */
  agentsOnTask: ReadonlySet<string>
}

/**
 * Which agent an ask goes to before anyone asks: its harness, the model it's
 * configured with, and whether it picks up its conversation here or starts
 * fresh. The model is as configured; what the provider actually ran isn't known here.
 */
export function NextAgentLine({ taskId, refreshKey, clankers, agentsOnTask }: NextAgentLineProps) {
  const [next, setNext] = useState<NextAgent | null>(null)

  useEffect(() => {
    let current = true
    getNextAgent(taskId)
      .then((loaded) => current && setNext(loaded))
      .catch(() => current && setNext(null))
    return () => {
      current = false
    }
  }, [taskId, refreshKey])

  if (!next) return null
  const clanker = clankers.find((each) => each.id === next.clankerId)
  if (!next.clankerId) {
    return (
      <p role="status" className="text-xs text-[var(--red-11)]">
        {next.problem ?? 'No agent would run this.'}
      </p>
    )
  }
  // Runner details only for those who can list runners; everyone else still sees the agent's name.
  const model = clanker ? summarizeRunner(clanker, []).model : null
  const continues = agentsOnTask.has(next.clankerId)
  return (
    <div role="status" aria-label="Agent for the next ask" className="space-y-0.5 text-xs text-[var(--gray-10)]">
      <p className="flex flex-wrap items-center gap-2">
        <span>
          Asks go to <span className="font-medium text-[var(--gray-12)]">{clanker?.name ?? next.name ?? 'the agent'}</span>
          {next.via && `, ${VIA[next.via]}`}.
        </span>
        {clanker && clanker.readiness?.state !== 'ready' && <RunnerReadinessBadge readiness={clanker.readiness} />}
      </p>
      {next.problem && <p className="text-[var(--red-11)]">{next.problem}</p>}
      <p>
        {clanker && (
          <>
            {clanker.agent ? getAgentLabel(clanker.agent) : 'No agent'} with {model ? `model ${model} as configured` : "the agent's default model"}.{' '}
          </>
        )}
        {continues ? 'It picks up its conversation here.' : 'It starts fresh from the task and its documents.'} To ask another agent,
        @mention it or bring one in below.
      </p>
    </div>
  )
}
