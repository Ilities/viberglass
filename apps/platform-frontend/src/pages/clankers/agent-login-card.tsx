import { Button } from '@/components/button'
import { Subheading } from '@/components/heading'
import { Timestamp } from '@/components/timestamp'
import { useJobStatus } from '@/hooks/useJobStatus'
import { startAgentLogin } from '@/service/api/clanker-api'
import type { Secret } from '@/service/api/secret-api'
import { useEffect, useState } from 'react'
import { getAgentLabel, type Clanker } from '@viberglass/types'
import { DeviceCodeCard, resolveDeviceCodePrompt } from '../project/jobs/device-code-card'

interface AgentLoginCardProps {
  clanker: Clanker
  /** What the agent signs in with, e.g. "ChatGPT account". */
  accountLabel: string
  /** The stored login, once the runner has been connected. */
  login: Secret | null
  onConnected: () => void
}

/** Connects a runner's agent to its account: a login-only job shows a code to enter, then stores the login. */
export function AgentLoginCard({ clanker, accountLabel, login, onConnected }: AgentLoginCardProps) {
  const [jobId, setJobId] = useState<string>()
  const [error, setError] = useState<string | null>(null)
  const [isStarting, setIsStarting] = useState(false)
  const { job } = useJobStatus(jobId)

  const finished = job?.status === 'completed' || job?.status === 'failed' || job?.status === 'cancelled'
  useEffect(() => {
    if (job?.status === 'completed') onConnected()
    if (job?.status === 'failed') setError(job.result?.errorMessage ?? 'The login did not finish.')
  }, [job?.status, job?.result?.errorMessage, onConnected])

  const prompt = job?.status === 'active' ? resolveDeviceCodePrompt(job.progressUpdates ?? [], job.progress) : null
  const inProgress = Boolean(jobId) && !finished
  const isRunning = clanker.status === 'active'
  const agentLabel = getAgentLabel(clanker.agent)

  async function connect() {
    setError(null)
    setIsStarting(true)
    try {
      setJobId((await startAgentLogin(clanker.id)).jobId)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't start the login")
    } finally {
      setIsStarting(false)
    }
  }

  return (
    <div className="app-frame rounded-lg p-6">
      <Subheading className="mb-2">{accountLabel}</Subheading>
      <p className="text-sm text-[var(--gray-11)]">
        {login ? (
          <>
            Connected. {agentLabel} keeps the login fresh after each run; last updated <Timestamp date={login.updatedAt} />.
          </>
        ) : (
          `Not connected. Connect its ${accountLabel} so ${agentLabel} can run tasks.`
        )}
      </p>

      {prompt && (
        <div className="mt-4">
          <DeviceCodeCard prompt={prompt} />
        </div>
      )}
      {inProgress && !prompt && <p className="mt-4 text-sm text-[var(--gray-9)]">Starting the login on the agent…</p>}
      {error && <p className="mt-4 text-sm text-red-600 dark:text-red-400">{error}</p>}

      {!inProgress && (
        <div className="mt-4 flex items-center gap-3">
          {login ? (
            <Button outline onClick={() => void connect()} disabled={!isRunning || isStarting}>
              Reconnect
            </Button>
          ) : (
            <Button color="brand" onClick={() => void connect()} disabled={!isRunning || isStarting}>
              Connect
            </Button>
          )}
          {!isRunning && <span className="text-sm text-[var(--gray-9)]">Start the agent first; the login runs on it.</span>}
        </div>
      )}
    </div>
  )
}
