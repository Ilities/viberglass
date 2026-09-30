import { Link } from '@/components/link'
import { buildLogTimeline } from '@/components/agent-log-model'
import type { JobStatus } from '@/service/api/job-api'
import clsx from 'clsx'
import { useMemo, type ReactNode } from 'react'
import { describeAgentWork, summariseAgentWork } from './agent-work-summary'
import { buildRunSteps, type RunStep, type RunStepState } from './run-steps'

interface RunActivityProps {
  job: JobStatus
  project: string
  /** Shown as a pull-quote under the steps: whose move it is next. */
  nextStep: ReactNode
  onShowRawLog: () => void
}

const MARKER: Record<RunStepState, string> = {
  done: 'border-[var(--gray-11)] bg-[var(--gray-11)]',
  current: 'border-blue-500 bg-blue-500 animate-pulse',
  upcoming: 'border-[var(--gray-7)] bg-transparent',
  failed: 'border-red-500 bg-red-500',
  stopped: 'border-[var(--gray-9)] bg-[var(--gray-9)]',
  not_reached: 'border-[var(--gray-5)] bg-transparent',
}

const TITLE_TONE: Record<RunStepState, string> = {
  done: 'text-[var(--gray-12)]',
  current: 'text-blue-700 dark:text-blue-300',
  upcoming: 'text-[var(--gray-9)]',
  failed: 'text-red-700 dark:text-red-300',
  stopped: 'text-[var(--gray-11)]',
  not_reached: 'text-[var(--gray-8)]',
}

function formatClock(iso: string | null): string | null {
  if (!iso) return null
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function StepRow({ step, isLast, children }: { step: RunStep; isLast: boolean; children?: ReactNode }) {
  return (
    <li className="relative flex gap-4 pb-6">
      {!isLast && <span aria-hidden className="absolute top-4 left-[5px] h-full w-px bg-[var(--gray-6)]" />}
      <span aria-hidden className={clsx('relative mt-1.5 size-[11px] shrink-0 rounded-full border-2', MARKER[step.state])} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className={clsx('text-sm font-semibold', TITLE_TONE[step.state])}>
            {step.title}
            {step.state === 'failed' && <span className="ml-2 font-normal">· failed here</span>}
            {step.state === 'stopped' && <span className="ml-2 font-normal">· cancelled here</span>}
          </h3>
          <span className="font-mono text-xs text-[var(--gray-9)] tabular-nums">{formatClock(step.startedAt)}</span>
        </div>
        {children && <div className="mt-1.5 text-sm text-[var(--gray-11)]">{children}</div>}
      </div>
    </li>
  )
}

function PrepareDetail({ job }: { job: JobStatus }) {
  const baseBranch = job.data.baseBranch || 'main'
  const agent = job.clanker ? `${job.clanker.name}${job.clanker.agent ? ` (${job.clanker.agent})` : ''}` : null
  return (
    <p>
      {job.data.repository ? (
        <>
          <span className="font-mono text-[13px]">{job.data.repository.replace(/^https?:\/\/(www\.)?github\.com\//, '')}</span> at{' '}
          <span className="font-mono text-[13px]">{baseBranch}</span>
        </>
      ) : (
        'No repository'
      )}
      {agent && <span className="text-[var(--gray-9)]"> · {agent}</span>}
    </p>
  )
}

function WorkDetail({ job, project, onShowRawLog }: { job: JobStatus; project: string; onShowRawLog: () => void }) {
  const summary = useMemo(() => summariseAgentWork(buildLogTimeline(job.logs ?? [])), [job.logs])
  const chips = describeAgentWork(summary)
  const lastMessage = summary.messages.at(-1)

  if (job.agentSessionId) {
    return (
      <p>
        This run is a turn of a live session; the conversation is{' '}
        <Link href={`/spaces/${project}/sessions/${job.agentSessionId}`} className="text-[var(--accent-11)] underline decoration-[var(--gray-7)] underline-offset-2 hover:decoration-current">
          in the session
        </Link>
        .
      </p>
    )
  }
  if (chips.length === 0 && !lastMessage) return null

  return (
    <div className="space-y-2.5">
      {chips.length > 0 && (
        // A summary, not controls: the one way into the detail is the raw log link.
        <p className="text-[var(--gray-11)]">
          {chips.join(' · ')}
          <span className="text-[var(--gray-8)]"> — </span>
          <button
            type="button"
            onClick={onShowRawLog}
            className="text-[var(--accent-11)] underline decoration-[var(--gray-7)] underline-offset-2 hover:decoration-current"
          >
            see every step in the raw log
          </button>
        </p>
      )}
      {lastMessage && (
        <blockquote className="border-l-2 border-[var(--gray-6)] pl-3 whitespace-pre-wrap text-[var(--gray-12)]">
          {lastMessage}
        </blockquote>
      )}
      {summary.changedFiles.length > 0 && job.jobKind === 'execution' && (
        <ul className="font-mono text-xs text-[var(--gray-10)]">
          {summary.changedFiles.map((file) => (
            <li key={file}>{file}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** The run as a short story: its three steps, then whose move it is. */
export function RunActivity({ job, project, nextStep, onShowRawLog }: RunActivityProps) {
  const steps = buildRunSteps(job)

  return (
    <div>
      <ol>
        {steps.map((step, index) => (
          <StepRow key={step.key} step={step} isLast={index === steps.length - 1}>
            {step.key === 'prepare' && step.state !== 'upcoming' && <PrepareDetail job={job} />}
            {step.key === 'work' && step.state !== 'upcoming' && step.state !== 'not_reached' && (
              <WorkDetail job={job} project={project} onShowRawLog={onShowRawLog} />
            )}
          </StepRow>
        ))}
      </ol>
      {nextStep}
    </div>
  )
}
