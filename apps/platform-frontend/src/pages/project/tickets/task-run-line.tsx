import { TabButton } from '@/components/tab-button'
import { Timestamp } from '@/components/timestamp'
import { formatJobStatus } from '@/data'
import { useJobStatus } from '@/hooks/useJobStatus'
import type { JobListItem } from '@/service/api/job-api'
import { ChevronDownIcon, ChevronRightIcon } from '@radix-ui/react-icons'
import clsx from 'clsx'
import { useEffect, useRef, useState } from 'react'
import { CodexDeviceAuthCard, resolveCodexDeviceAuthPrompt } from '../jobs/codex-device-auth-card'
import { RunActivity } from '../jobs/run-activity'
import { formatRunDuration } from '../jobs/run-facts'
import { RunLog } from '../jobs/run-log'
import { RunPrompt } from '../jobs/run-prompt'
import { RunRecordPanel } from '../jobs/run-record-panel'
import { resolveRunTab, type RunTab } from '../jobs/run-tab'
import { runName } from './step-runs'

const STATUS_DOT: Record<JobListItem['status'], string> = {
  queued: 'bg-amber-500',
  active: 'bg-blue-500 animate-pulse',
  completed: 'bg-green-600',
  failed: 'bg-red-500',
  cancelled: 'bg-[var(--gray-8)]',
}

interface TaskRunLineProps {
  run: JobListItem
  /** The run's number within its step, oldest first. */
  number: number
  agentName: string | null
  project: string
  isOpen: boolean
  onToggle: () => void
  /** Scroll to the run when it's opened by link or from the banner. */
  scrollIntoView: boolean
  /** The view a link asked this run to open on (`?runTab=`). */
  linkedTab?: string | null
}

/** A run of a step as one line; open it for the agent's steps, the prompt and the raw log. */
export function TaskRunLine({ run, number, agentName, project, isOpen, onToggle, scrollIntoView, linkedTab }: TaskRunLineProps) {
  const { job, isPolling } = useJobStatus(isOpen ? run.jobId : undefined)
  const [tab, setTab] = useState<RunTab>(() => resolveRunTab(linkedTab))
  const ref = useRef<HTMLDivElement>(null)
  const duration = formatRunDuration(run.processedAt, run.finishedAt)

  useEffect(() => {
    if (!scrollIntoView || !isOpen || !job) return
    const frame = requestAnimationFrame(() => ref.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }))
    return () => cancelAnimationFrame(frame)
  }, [scrollIntoView, isOpen, job])

  const codexPrompt = job?.status === 'active' ? resolveCodexDeviceAuthPrompt(job.progressUpdates ?? [], job.progress) : null

  return (
    <div ref={ref} className="scroll-mt-6">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        className="flex w-full items-center gap-2.5 py-2 text-left text-sm text-[var(--gray-11)] hover:text-[var(--gray-12)]"
      >
        {isOpen ? <ChevronDownIcon className="size-4 shrink-0" /> : <ChevronRightIcon className="size-4 shrink-0" />}
        <span aria-hidden className={clsx('size-2 shrink-0 rounded-full', STATUS_DOT[run.status])} />
        <span className="min-w-0 flex-1 truncate">
          <span className="font-medium text-[var(--gray-12)]">
            {runName(run.jobKind)} #{number}
          </span>
          <span className="text-[var(--gray-10)]">
            {' '}
            · {formatJobStatus(run.status).label.toLowerCase()}
            {agentName && <> · {agentName}</>}
            {duration && <> · {duration}</>}
          </span>
        </span>
        <Timestamp date={run.createdAt} className="shrink-0 text-xs text-[var(--gray-9)]" />
      </button>

      {isOpen && (
        <div className="mt-2 mb-4 ml-6 rounded-lg border border-[var(--gray-5)] bg-[var(--gray-1)] p-5">
          <div className="mb-4 flex gap-1 border-b border-[var(--gray-5)]">
            <TabButton active={tab === 'activity'} onClick={() => setTab('activity')}>
              What it did
            </TabButton>
            <TabButton active={tab === 'prompt'} onClick={() => setTab('prompt')}>
              Prompt
            </TabButton>
            <TabButton active={tab === 'log'} onClick={() => setTab('log')}>
              Raw log
            </TabButton>
            <TabButton active={tab === 'record'} onClick={() => setTab('record')}>
              Record
            </TabButton>
          </div>
          {!job ? (
            <p className="text-sm text-[var(--gray-9)]">Loading run…</p>
          ) : tab === 'activity' ? (
            <RunActivity
              job={job}
              project={project}
              onShowRawLog={() => setTab('log')}
              nextStep={codexPrompt ? <CodexDeviceAuthCard prompt={codexPrompt} /> : null}
            />
          ) : tab === 'prompt' ? (
            <RunPrompt job={job} />
          ) : tab === 'record' ? (
            <RunRecordPanel jobId={job.jobId} />
          ) : (
            <RunLog job={job} isPolling={isPolling} />
          )}
        </div>
      )}
    </div>
  )
}
