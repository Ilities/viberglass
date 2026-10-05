import { Button } from '@/components/button'
import { buildLogTimeline } from '@/components/agent-log-model'
import { LogViewer } from '@/components/log-viewer'
import { formatJobStatus } from '@/data'
import { useJobStatus } from '@/hooks/useJobStatus'
import { Cross2Icon } from '@radix-ui/react-icons'
import { Dialog } from '@radix-ui/themes'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { describeAgentWork, summariseAgentWork } from '../jobs/agent-work-summary'
import { CodexDeviceAuthCard, resolveCodexDeviceAuthPrompt } from '../jobs/codex-device-auth-card'
import { formatRunDuration } from '../jobs/run-facts'
import { RunLog } from '../jobs/run-log'
import { RunPrompt } from '../jobs/run-prompt'
import { RunRecordPanel } from '../jobs/run-record-panel'
import type { RunTab } from '../jobs/run-tab'
import { TurnRunFacts } from './turn-run-facts'

interface TaskRunInspectorProps {
  jobId: string | null
  title: string
  linkedTab: string | null
  onClose: () => void
}

function InspectorSection({ title, open, onToggle, children }: {
  title: string
  open: boolean
  onToggle: (open: boolean) => void
  children: ReactNode
}) {
  return (
    <details open={open} onToggle={(event) => onToggle(event.currentTarget.open)} className="border-t border-[var(--gray-5)] py-4">
      <summary className="cursor-pointer text-sm font-semibold text-[var(--gray-12)]">{title}</summary>
      {open && <div className="mt-4 min-w-0">{children}</div>}
    </details>
  )
}

function InspectorBody({ jobId, linkedTab }: { jobId: string; linkedTab: string | null }) {
  const { job, error, isLoading, isPolling, refetch } = useJobStatus(jobId)
  const initialSection: RunTab = linkedTab === 'prompt' || linkedTab === 'log' || linkedTab === 'record' ? linkedTab : 'activity'
  const [openSections, setOpenSections] = useState<RunTab[]>([initialSection])
  const summary = useMemo(() => summariseAgentWork(buildLogTimeline(job?.logs ?? [])), [job?.logs])
  const actions = describeAgentWork(summary)
  const toggle = (section: RunTab, open: boolean) => setOpenSections((current) =>
    open ? current.includes(section) ? current : [...current, section] : current.filter((item) => item !== section)
  )

  if (isLoading) return <p className="p-5 text-sm text-[var(--gray-10)]">Loading run…</p>
  if (!job) return (
    <div className="space-y-4 p-5">
      <p role="alert" className="text-sm text-red-700 dark:text-red-400">{error?.message ?? 'Run unavailable'}</p>
      <Button outline onClick={() => void refetch()}>Try again</Button>
    </div>
  )

  const duration = formatRunDuration(job.processedAt, job.finishedAt)
  const codexPrompt = job.status === 'active' ? resolveCodexDeviceAuthPrompt(job.progressUpdates ?? [], job.progress) : null
  const lastMessage = summary.messages.at(-1)
  const failure = job.result?.errorMessage || job.failedReason

  return (
    <div className="p-5">
      <dl className="mb-4 grid grid-cols-[5rem_minmax(0,1fr)] gap-x-3 gap-y-2 text-sm">
        <dt className="text-[var(--gray-10)]">Status</dt>
        <dd className="text-[var(--gray-12)]">{formatJobStatus(job.status).label}</dd>
        {job.clanker && <><dt className="text-[var(--gray-10)]">Agent</dt><dd className="break-words text-[var(--gray-12)]">{job.clanker.name}</dd></>}
        {duration && <><dt className="text-[var(--gray-10)]">Duration</dt><dd className="text-[var(--gray-12)]">{duration}</dd></>}
        <dt className="text-[var(--gray-10)]">Started</dt>
        <dd className="text-[var(--gray-12)]">{job.processedAt ? new Date(job.processedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Not yet'}</dd>
        {job.finishedAt && <><dt className="text-[var(--gray-10)]">Finished</dt><dd className="text-[var(--gray-12)]">{new Date(job.finishedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</dd></>}
      </dl>
      <div className="mb-5 text-xs text-[var(--gray-10)]"><TurnRunFacts jobId={jobId} /></div>
      {error && <p role="alert" className="mb-4 text-xs text-red-700 dark:text-red-400">Updates unavailable: {error.message}</p>}
      {failure && <p role="alert" className="mb-5 text-sm whitespace-pre-wrap text-red-700 dark:text-red-400">{failure}</p>}
      {codexPrompt && <div className="mb-5"><CodexDeviceAuthCard prompt={codexPrompt} /></div>}
      {(lastMessage || actions.length > 0) && (
        <section className="mb-5 space-y-2">
          <h3 className="text-sm font-semibold text-[var(--gray-12)]">Summary</h3>
          {actions.length > 0 && <p className="text-sm text-[var(--gray-11)]">{actions.join(' · ')}</p>}
          {lastMessage && <p className="text-sm whitespace-pre-wrap text-[var(--gray-11)]">{lastMessage}</p>}
        </section>
      )}
      <InspectorSection title="Activity" open={openSections.includes('activity')} onToggle={(open) => toggle('activity', open)}>
        <RunLog job={job} isPolling={isPolling} />
      </InspectorSection>
      <InspectorSection title="Prompt" open={openSections.includes('prompt')} onToggle={(open) => toggle('prompt', open)}>
        <RunPrompt job={job} />
      </InspectorSection>
      <InspectorSection title="Logs" open={openSections.includes('log')} onToggle={(open) => toggle('log', open)}>
        <LogViewer logs={job.logs ?? []} isConnected={isPolling} />
      </InspectorSection>
      <InspectorSection title="Technical details" open={openSections.includes('record')} onToggle={(open) => toggle('record', open)}>
        <RunRecordPanel jobId={jobId} compact />
      </InspectorSection>
    </div>
  )
}

/** Opens over the artifact without changing the task's columns or scroll position. */
export function TaskRunInspector({ jobId, title, linkedTab, onClose }: TaskRunInspectorProps) {
  const opener = useRef<HTMLElement | null>(null)
  // Keep the run visible while the closing animation finishes.
  const [lastRun, setLastRun] = useState({ jobId, title, linkedTab })
  useEffect(() => {
    if (jobId) setLastRun({ jobId, title, linkedTab })
  }, [jobId, title, linkedTab])
  const shown = jobId ? { jobId, title, linkedTab } : lastRun
  return (
    <Dialog.Root open={Boolean(jobId)} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Content
        className="ui-run-inspector-dialog"
        aria-describedby={undefined}
        onOpenAutoFocus={() => {
          opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          if (opener.current?.isConnected) opener.current.focus({ preventScroll: true })
        }}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--gray-5)] bg-[var(--color-panel-solid)] px-6 py-5">
          <div>
            <p className="mb-1 text-xs text-[var(--gray-10)]">Run details</p>
            <Dialog.Title className="!m-0 text-base font-semibold text-[var(--gray-12)]">{shown.title}</Dialog.Title>
          </div>
          <button type="button" aria-label="Close run details" onClick={onClose} className="rounded p-2 text-[var(--gray-10)] hover:bg-[var(--gray-3)] hover:text-[var(--gray-12)]">
            <Cross2Icon className="size-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {shown.jobId && <InspectorBody key={`${shown.jobId}:${shown.linkedTab ?? ''}`} jobId={shown.jobId} linkedTab={shown.linkedTab} />}
        </div>
      </Dialog.Content>
    </Dialog.Root>
  )
}
