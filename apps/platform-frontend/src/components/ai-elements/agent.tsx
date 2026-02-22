import { cn } from '@/lib/utils'
import {
  CheckCircledIcon,
  ExclamationTriangleIcon,
  InfoCircledIcon,
  ReloadIcon,
} from '@radix-ui/react-icons'
import type { ComponentPropsWithoutRef } from 'react'

type AgentState =
  | 'running'
  | 'complete'
  | 'error'
  | 'input-streaming'
  | 'input-available'
  | 'output-available'
  | 'output-error'

function normalizeState(state: AgentState): 'running' | 'complete' | 'error' {
  if (state === 'running' || state === 'input-streaming') return 'running'
  if (state === 'error' || state === 'output-error') return 'error'
  return 'complete'
}

function getStateLabel(state: AgentState): string {
  const normalizedState = normalizeState(state)
  if (normalizedState === 'running') return 'RUNNING'
  if (normalizedState === 'error') return 'ERROR'
  return 'DONE'
}

function StateIcon({ state }: { state: AgentState }) {
  const normalizedState = normalizeState(state)

  if (normalizedState === 'running') {
    return <ReloadIcon className="h-3.5 w-3.5 animate-spin text-[var(--accent-10)]" />
  }

  if (normalizedState === 'error') {
    return <ExclamationTriangleIcon className="h-3.5 w-3.5 text-red-600" />
  }

  return <CheckCircledIcon className="h-3.5 w-3.5 text-green-600" />
}

export function Agent({ className, ...props }: ComponentPropsWithoutRef<'div'>) {
  return <div className={cn('flex w-full flex-col gap-2', className)} {...props} />
}

export function AgentMessage({ className, ...props }: ComponentPropsWithoutRef<'div'>) {
  return (
    <article
      className={cn(
        'rounded-lg border border-[var(--gray-6)] bg-[var(--gray-2)] px-3 py-2 text-sm text-[var(--gray-12)]',
        className,
      )}
      {...props}
    />
  )
}

interface AgentActionProps extends ComponentPropsWithoutRef<'div'> {
  title: string
  state?: AgentState
}

export function AgentAction({
  className,
  title,
  state = 'complete',
  children,
  ...props
}: AgentActionProps) {
  const normalizedState = normalizeState(state)

  return (
    <section
      data-state={normalizedState}
      className={cn(
        'rounded-lg border border-[var(--gray-6)] bg-[var(--gray-2)] px-3 py-2',
        normalizedState === 'running' ? 'border-[var(--accent-6)]' : '',
        normalizedState === 'error' ? 'border-red-300 bg-red-50/50 dark:border-red-900 dark:bg-red-950/20' : '',
        className,
      )}
      {...props}
    >
      <header className="mb-2 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <StateIcon state={state} />
          <h4 className="truncate font-mono text-[11px] font-semibold text-[var(--gray-12)]">{title}</h4>
        </div>
        <span className="rounded border border-[var(--gray-6)] bg-[var(--gray-1)] px-1.5 py-0.5 font-mono text-[10px] font-semibold text-[var(--gray-11)]">
          {getStateLabel(state)}
        </span>
      </header>
      <div className="space-y-2">{children}</div>
    </section>
  )
}

interface AgentObservationProps extends ComponentPropsWithoutRef<'div'> {
  title?: string
  state?: AgentState
}

export function AgentObservation({
  className,
  title = 'Observation',
  state = 'complete',
  children,
  ...props
}: AgentObservationProps) {
  const normalizedState = normalizeState(state)

  return (
    <section
      data-state={normalizedState}
      className={cn(
        'rounded-lg border border-[var(--gray-6)] bg-[var(--gray-2)] px-3 py-2 text-sm',
        normalizedState === 'error' ? 'border-red-300 bg-red-50/50 dark:border-red-900 dark:bg-red-950/20' : '',
        className,
      )}
      {...props}
    >
      <header className="mb-1 flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-wide text-[var(--gray-10)]">
        <InfoCircledIcon className="h-3.5 w-3.5" />
        {title}
      </header>
      <div className="whitespace-pre-wrap break-words text-[13px] leading-relaxed text-[var(--gray-12)]">{children}</div>
    </section>
  )
}

interface AgentThinkingProps extends ComponentPropsWithoutRef<'details'> {
  title?: string
  defaultOpen?: boolean
}

export function AgentThinking({
  className,
  title = 'Reasoning',
  defaultOpen = false,
  children,
  ...props
}: AgentThinkingProps) {
  return (
    <details
      open={defaultOpen}
      className={cn(
        'group rounded-lg border border-[var(--gray-6)] bg-[var(--gray-2)] px-3 py-2 text-sm text-[var(--gray-11)]',
        className,
      )}
      {...props}
    >
      <summary className="cursor-pointer list-none font-medium text-[var(--gray-12)] marker:content-none after:ml-2 after:text-xs after:text-[var(--gray-9)] after:content-['(expand)'] group-open:after:content-['(collapse)']">
        {title}
      </summary>
      <div className="mt-2 whitespace-pre-wrap break-words text-[13px] leading-relaxed text-[var(--gray-12)]">
        {children}
      </div>
    </details>
  )
}
