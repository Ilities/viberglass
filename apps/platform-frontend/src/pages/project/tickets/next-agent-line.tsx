import { Button } from '@/components/button'
import { RunnerReadinessBadge } from '@/components/runner-readiness-badge'
import { useAuth } from '@/context/auth-context'
import { canStartClanker, StartClankerButton } from '@/pages/clankers/clanker-actions'
import { getNextAgent, type NextAgent } from '@/service/api/discussion-api'
import { getAgentLabel, type Clanker } from '@viberglass/types'
import { useEffect, useState } from 'react'
import { summarizeRunner } from '@/pages/clankers/config/runnerSummary'

const VIA: Record<NonNullable<NextAgent['via']>, string> = {
  named: 'asked for by name',
  on_task: 'already on this task',
  space_default: "this space's default agent",
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

/** The harness and configured model; what the provider actually ran isn't known here. */
function agentDetails(clanker: Clanker | undefined, continues: boolean): string {
  const resumes = continues ? 'Picks up its conversation here.' : 'Starts fresh from the task and its documents.'
  if (!clanker) return resumes
  const model = summarizeRunner(clanker, []).model
  const harness = clanker.agent ? getAgentLabel(clanker.agent) : 'No agent'
  return `${harness}, ${model ? `model ${model}` : 'default model'}. ${resumes}`
}

/** Which agent an ask goes to before anyone asks, and what stops it when it can't run. */
export function NextAgentLine({ taskId, refreshKey, clankers, agentsOnTask }: NextAgentLineProps) {
  const { user } = useAuth()
  const [next, setNext] = useState<NextAgent | null>(null)
  const [started, setStarted] = useState(false)
  const [startError, setStartError] = useState<string | null>(null)

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
  if (!next.clankerId) {
    return (
      <p role="status" className="text-xs text-[var(--red-11)]">
        {next.problem ?? 'No agent would run this.'}
      </p>
    )
  }
  // Runner details only for those who can list runners; everyone else still sees the agent's name.
  const clanker = clankers.find((each) => each.id === next.clankerId)
  const isAdmin = user?.role === 'admin'
  const readiness = clanker?.readiness
  const notReady = clanker ? readiness?.state !== 'ready' : Boolean(next.problem)

  function problem() {
    if (!clanker) return <span className="text-[var(--red-11)]">{next?.problem}</span>
    if (started) return <span>Starting up</span>
    const badge = <RunnerReadinessBadge readiness={readiness} />
    if (clanker.status === 'deploying') return <span>Starting up</span>
    if (readiness?.state === 'not_running' && canStartClanker(clanker)) {
      return (
        <>
          {badge}
          {isAdmin ? (
            <StartClankerButton
              clanker={clanker}
              outline
              name="Start agent"
              onClankerUpdated={() => setStarted(true)}
              onError={setStartError}
            />
          ) : (
            <span>An admin needs to start it.</span>
          )}
        </>
      )
    }
    return (
      <>
        {badge}
        {isAdmin ? (
          <Button outline href={`/settings/agents/${clanker.slug}`}>
            Open agent
          </Button>
        ) : (
          readiness?.problem && <span>{readiness.problem}</span>
        )}
      </>
    )
  }

  return (
    <div role="status" aria-label="Agent for the next ask" className="flex flex-wrap items-center gap-2 text-xs text-[var(--gray-10)]">
      <span>
        Asks go to{' '}
        <span className="font-medium text-[var(--gray-12)]" title={agentDetails(clanker, agentsOnTask.has(next.clankerId))}>
          {clanker?.name ?? next.name ?? 'the agent'}
        </span>
        {next.via && `, ${VIA[next.via]}`}.
      </span>
      {notReady && <div className="flex w-full items-center gap-2">{problem()}</div>}
      {startError && <span className="text-[var(--red-11)]">{startError}</span>}
    </div>
  )
}
