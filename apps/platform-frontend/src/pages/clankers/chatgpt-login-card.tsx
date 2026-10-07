import { Button } from '@/components/button'
import { Subheading } from '@/components/heading'
import { Timestamp } from '@/components/timestamp'
import { useJobStatus } from '@/hooks/useJobStatus'
import { startAgentLogin } from '@/service/api/clanker-api'
import type { Secret } from '@/service/api/secret-api'
import type { Clanker } from '@viberglass/types'
import { useEffect, useState } from 'react'
import { CodexDeviceAuthCard, resolveCodexDeviceAuthPrompt } from '../project/jobs/codex-device-auth-card'

interface ChatGptLoginCardProps {
  clanker: Clanker
  /** The stored login, once the runner has been connected. */
  login: Secret | null
  onConnected: () => void
}

/** Connects a Codex runner to a ChatGPT account: a login-only job shows a code to enter, then stores the login. */
export function ChatGptLoginCard({ clanker, login, onConnected }: ChatGptLoginCardProps) {
  const [jobId, setJobId] = useState<string>()
  const [error, setError] = useState<string | null>(null)
  const [isStarting, setIsStarting] = useState(false)
  const { job } = useJobStatus(jobId)

  const finished = job?.status === 'completed' || job?.status === 'failed' || job?.status === 'cancelled'
  useEffect(() => {
    if (job?.status === 'completed') onConnected()
    if (job?.status === 'failed') setError(job.result?.errorMessage ?? 'The login did not finish.')
  }, [job?.status, job?.result?.errorMessage, onConnected])

  const prompt = job?.status === 'active' ? resolveCodexDeviceAuthPrompt(job.progressUpdates ?? [], job.progress) : null
  const inProgress = Boolean(jobId) && !finished
  const isRunning = clanker.status === 'active'

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
      <Subheading className="mb-2">ChatGPT login</Subheading>
      <p className="text-sm text-[var(--gray-11)]">
        {login ? (
          <>
            Connected. Codex keeps the login fresh after each run; last updated <Timestamp date={login.updatedAt} />.
          </>
        ) : (
          'Not connected. Connect a ChatGPT account so Codex can run tasks.'
        )}
      </p>

      {prompt && (
        <div className="mt-4">
          <CodexDeviceAuthCard prompt={prompt} />
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
              Connect ChatGPT
            </Button>
          )}
          {!isRunning && <span className="text-sm text-[var(--gray-9)]">Start the agent first; the login runs on it.</span>}
        </div>
      )}
    </div>
  )
}
