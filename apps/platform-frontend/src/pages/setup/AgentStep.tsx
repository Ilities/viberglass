import { Button } from '@/components/button'
import { Spinner } from '@/components/spinner'
import { Text } from '@/components/text'
import { usePolling } from '@/hooks/usePolling'
import { getClanker } from '@/service/api/clanker-api'
import { prepareDefaultAgent } from '@/service/api/setup-api'
import type { ModelProviderId } from '@viberglass/types'
import { useCallback, useEffect, useState } from 'react'
import { SetupError, SetupFrame } from './SetupFrame'

const POLL_INTERVAL_MS = 2000

interface AgentState {
  clankerId: string
  status: string
  statusMessage: string | null
}

/** Follows one start attempt; a retry mounts a fresh one so no earlier result lingers. */
function AgentProgress({
  agent,
  onReady,
  onRetry,
  isRetrying,
}: {
  agent: AgentState
  onReady: (clankerId: string) => void
  onRetry: () => void
  isRetrying: boolean
}) {
  const { data: polled } = usePolling({
    fn: () => getClanker(agent.clankerId),
    interval: POLL_INTERVAL_MS,
    enabled: agent.status === 'deploying',
    onComplete: (clanker) => clanker.status !== 'deploying',
  })
  const status = polled?.status ?? agent.status
  const statusMessage = polled ? (polled.statusMessage ?? null) : agent.statusMessage

  useEffect(() => {
    if (status === 'active') onReady(agent.clankerId)
  }, [status, agent.clankerId, onReady])

  if (status === 'failed') {
    return (
      <>
        <SetupError message={statusMessage ?? 'The agent could not start.'} />
        <Button className="w-full" onClick={onRetry} disabled={isRetrying}>
          {isRetrying ? 'Starting again…' : 'Try again'}
        </Button>
      </>
    )
  }

  return (
    <div className="flex items-start gap-3" aria-live="polite">
      <span className="mt-0.5 shrink-0">
        <Spinner size="small" />
      </span>
      <div className="grid gap-1">
        <Text className="font-medium">Preparing your agent…</Text>
        {statusMessage && <Text className="text-sm">{statusMessage}</Text>}
      </div>
    </div>
  )
}

export function AgentStep({
  provider,
  agent: initialAgent,
  onReady,
}: {
  provider: ModelProviderId
  agent: AgentState | null
  onReady: (clankerId: string) => void
}) {
  const [agent, setAgent] = useState<AgentState | null>(initialAgent)
  const [attempt, setAttempt] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [isStarting, setIsStarting] = useState(false)

  const start = useCallback(async () => {
    setError(null)
    setIsStarting(true)
    try {
      setAgent(await prepareDefaultAgent(provider))
      setAttempt((value) => value + 1)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't prepare the agent.")
    } finally {
      setIsStarting(false)
    }
  }, [provider])

  // Resuming with no agent yet, or one that was stopped: start it.
  const needsStart = !agent || agent.status === 'inactive'
  useEffect(() => {
    if (needsStart && !isStarting && !error) void start()
  }, [needsStart, isStarting, error, start])

  return (
    <SetupFrame
      step={4}
      title="Getting your agent ready"
      intro="The first time, this downloads the agent and takes a couple of minutes. Later tasks start right away."
    >
      {error ? (
        <>
          <SetupError message={error} />
          <Button className="w-full" onClick={() => void start()} disabled={isStarting}>
            {isStarting ? 'Starting again…' : 'Try again'}
          </Button>
        </>
      ) : agent && !needsStart ? (
        <AgentProgress
          key={attempt}
          agent={agent}
          onReady={onReady}
          onRetry={() => void start()}
          isRetrying={isStarting}
        />
      ) : (
        <Text>Starting your agent…</Text>
      )}
    </SetupFrame>
  )
}
