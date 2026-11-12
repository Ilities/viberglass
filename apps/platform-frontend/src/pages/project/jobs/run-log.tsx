import { Reasoning } from '@/components/ai-elements/reasoning'
import { LogViewer } from '@/components/log-viewer'
import { useRunEvents } from '@/hooks/useRunEvents'
import type { JobStatus } from '@/service/api/job-api'
import { ChevronRightIcon } from '@radix-ui/react-icons'
import clsx from 'clsx'
import { useEffect, useMemo, useRef } from 'react'
import { buildRunTranscript, toolCallCount, type ToolCallStep, type TranscriptStep } from './run-transcript'

const TOOL_DOT: Record<ToolCallStep['status'], string> = {
  running: 'bg-blue-500 animate-pulse',
  done: 'bg-green-600',
  failed: 'bg-red-500',
}

function ToolCallLine({ step }: { step: ToolCallStep }) {
  // The repository's root comes through as "."; it says nothing about the call.
  const files = step.locations.filter((path) => path !== step.detail && path !== '.')
  const detail = step.detail && step.detail !== step.title ? step.detail : null
  const line = (
    <>
      <span aria-hidden className={clsx('size-1.5 shrink-0 rounded-full', TOOL_DOT[step.status])} />
      <span title={step.title} className={clsx('truncate font-medium text-[var(--gray-12)]', detail ? 'max-w-[50%] shrink-0' : 'min-w-0')}>
        {step.title}
      </span>
      {detail && (
        <span title={detail} className="min-w-0 flex-1 truncate font-mono text-[var(--gray-11)]">
          {detail}
        </span>
      )}
      {step.status === 'failed' && <span className="shrink-0 text-red-700 dark:text-red-400">failed</span>}
    </>
  )
  const filesLine = files.length > 0 && (
    <span title={files.join(', ')} className="ml-3.5 block truncate font-mono text-xs text-[var(--gray-10)]">
      {files.join(', ')}
    </span>
  )
  if (!step.output && !detail) {
    return (
      <div className="min-w-0">
        <p className="flex min-h-8 min-w-0 items-center gap-2 text-xs">{line}</p>
        {filesLine}
      </div>
    )
  }
  // The whole line opens it: the full command, which the line truncates, and what it printed.
  return (
    <details className="group min-w-0">
      <summary className="block cursor-pointer list-none rounded hover:bg-[var(--gray-3)] [&::-webkit-details-marker]:hidden">
        <span className="flex min-h-8 min-w-0 items-center gap-2 text-xs">
          {line}
          <span className="ml-auto flex shrink-0 items-center gap-0.5 pl-2 text-[var(--gray-10)]">
            {!step.output ? 'Details' : step.status === 'failed' ? 'Error' : 'Output'}
            <ChevronRightIcon aria-hidden className="size-3.5 group-open:rotate-90" />
          </span>
        </span>
        {filesLine}
      </summary>
      <div className="mt-1 ml-3.5 space-y-1">
        <p className="font-mono text-xs break-all whitespace-pre-wrap text-[var(--gray-12)]">{detail ?? step.title}</p>
        {step.output && (
          <pre className="max-h-64 overflow-auto rounded border border-[var(--gray-5)] bg-[var(--gray-2)] p-2 font-mono text-xs whitespace-pre-wrap text-[var(--gray-11)]">
            {step.output}
          </pre>
        )}
      </div>
    </details>
  )
}

function Step({ step }: { step: TranscriptStep }) {
  switch (step.kind) {
    case 'said':
      return <p className="text-sm whitespace-pre-wrap text-[var(--gray-12)]">{step.text}</p>
    case 'thought':
      return (
        <Reasoning title="Thinking" className="px-2 !py-0 text-xs open:!pb-2">
          {step.text}
        </Reasoning>
      )
    case 'note':
      return <p className="text-xs text-[var(--gray-10)] italic">{step.text}</p>
    case 'tool':
      return <ToolCallLine step={step} />
  }
}

/** Whether a scrolled box is at its end, so following new steps doesn't pull someone away from what they're reading. */
function atEnd(box: HTMLElement): boolean {
  return box.scrollHeight - box.scrollTop - box.clientHeight < 48
}

/**
 * The run's log: what the agent thought, said and ran, step by step, followed
 * live while it runs. The worker's own lines (cloning, starting the harness)
 * are folded under it; a run with no agent steps shows them on their own.
 */
export function RunLog({ job, isPolling }: { job: Pick<JobStatus, 'jobId' | 'status' | 'logs'>; isPolling: boolean }) {
  const live = job.status === 'active' || job.status === 'queued'
  const { events, isLoading, error } = useRunEvents(job.jobId, live)
  const steps = useMemo(() => buildRunTranscript(events), [events])
  const box = useRef<HTMLOListElement>(null)
  // A finished run opens at its start; a live one follows its newest step.
  const following = useRef(live)

  useEffect(() => {
    const list = box.current
    if (list && following.current) list.scrollTop = list.scrollHeight
  }, [steps])

  const workerLog = <LogViewer logs={job.logs || []} isConnected={isPolling && job.status === 'active'} />
  if (isLoading && steps.length === 0) return <p className="text-sm text-[var(--gray-9)]">Loading…</p>
  if (!live && steps.length === 0) return workerLog

  const tools = toolCallCount(steps)
  const lines = (job.logs ?? []).length
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-[var(--gray-5)] bg-[var(--gray-1)]">
        <p className="border-b border-[var(--gray-5)] px-3 py-2 text-xs text-[var(--gray-10)]">
          {tools} tool call{tools === 1 ? '' : 's'}
          {live && ' · live'}
        </p>
        {error ? (
          <p className="p-3 text-xs text-red-700 dark:text-red-400">{error.message}</p>
        ) : steps.length === 0 ? (
          <p className="p-3 text-xs text-[var(--gray-10)]">Waiting for the agent…</p>
        ) : (
          <ol
            ref={box}
            aria-label="What the agent did"
            onScroll={(event) => {
              following.current = atEnd(event.currentTarget)
            }}
            className="space-y-1 p-3 sm:max-h-[40rem] sm:overflow-auto"
          >
            {steps.map((step) => (
              <li key={step.id}>
                <Step step={step} />
              </li>
            ))}
          </ol>
        )}
      </div>
      <details>
        <summary className="cursor-pointer text-sm font-medium text-[var(--gray-11)] hover:text-[var(--gray-12)]">
          Worker log <span className="font-normal text-[var(--gray-10)]">· {lines} line{lines === 1 ? '' : 's'}</span>
        </summary>
        <div className="mt-2">{workerLog}</div>
      </details>
    </div>
  )
}
