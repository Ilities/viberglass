import { Button } from '@/components/button'
import { DEVICE_CODE_PROGRESS, isObjectRecord } from '@viberglass/types'
import { ExternalLinkIcon } from '@radix-ui/react-icons'
import { HandoffCard } from './handoff-card'

interface DeviceCodePrompt {
  verificationUri: string
  userCode: string
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null
}

/** The latest device-code sign-in request among a run's progress updates, if one is still waiting. */
export function resolveDeviceCodePrompt(
  progressUpdates: Array<{ details: Record<string, unknown> | null }>,
  currentProgress: Record<string, unknown> | null
): DeviceCodePrompt | null {
  const detailCandidates: Array<Record<string, unknown>> = []
  const currentDetails = currentProgress?.details
  if (isObjectRecord(currentDetails)) detailCandidates.push(currentDetails)
  for (let i = progressUpdates.length - 1; i >= 0; i -= 1) {
    const details = progressUpdates[i].details
    if (isObjectRecord(details)) detailCandidates.push(details)
  }

  for (const details of detailCandidates) {
    // Newest first: a completed sign-in after the request means nobody needs to act.
    if (details.kind === DEVICE_CODE_PROGRESS.completed) return null
    if (details.kind !== DEVICE_CODE_PROGRESS.required && details.kind !== DEVICE_CODE_PROGRESS.pending) continue
    const verificationUri = readString(details.verificationUri)
    const userCode = readString(details.userCode)
    if (verificationUri && userCode) return { verificationUri, userCode }
  }
  return null
}

/** The agent waits for someone to sign in with a device code before the run can go on. */
export function DeviceCodeCard({ prompt }: { prompt: DeviceCodePrompt }) {
  return (
    <HandoffCard
      owner="you"
      eyebrow="Your move · sign-in needed"
      title="The agent needs you to sign in"
      actions={
        <>
          <Button href={prompt.verificationUri} target="_blank" color="brand">
            <ExternalLinkIcon data-slot="icon" />
            Open sign-in page
          </Button>
          <Button outline onClick={() => void navigator.clipboard.writeText(prompt.userCode)}>
            Copy code
          </Button>
        </>
      }
    >
      Open <span className="font-mono text-[13px]">{prompt.verificationUri}</span> and enter{' '}
      <span className="rounded bg-[var(--gray-3)] px-1.5 py-0.5 font-mono font-bold text-[var(--gray-12)]">{prompt.userCode}</span>. The
      run continues once you have signed in.
    </HandoffCard>
  )
}
