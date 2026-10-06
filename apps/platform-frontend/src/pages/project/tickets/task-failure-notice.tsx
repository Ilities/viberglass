import { Button } from '@/components/button'
import { failureGuidance, type FailedRunner } from '@/components/failure-guidance'
import { useAuth } from '@/context/auth-context'
import { HandoffCard } from '../jobs/handoff-card'
import type { TaskNextMove, TaskStep } from './task-next-move'

const STEP_NOUN: Record<TaskStep, string> = { planning: 'plan', execution: 'build' }

interface TaskFailureNoticeProps {
  move: TaskNextMove
  project: string
  /** The runner the failed run used, when known. */
  runner?: FailedRunner
}

/**
 * Why the agent's last run failed, who can fix it, and what to do next, until
 * something happens after it. Admins also see what the agent reported.
 */
export function TaskFailureNotice({ move, project, runner }: TaskFailureNoticeProps) {
  const { user } = useAuth()
  if (move.kind !== 'failed') return null
  const isAdmin = user?.role === 'admin'
  const guidance = failureGuidance(move.failure ?? undefined, isAdmin, project, runner)
  const detail = move.failure?.technicalDetail?.trim()
  return (
    <HandoffCard
      owner="problem"
      eyebrow={`The ${STEP_NOUN[move.step]} failed${runner ? ` on ${runner.name}` : ''}`}
      title={guidance.title}
      actions={
        guidance.fix && (
          <Button href={guidance.fix.href} color="brand">
            {guidance.fix.label}
          </Button>
        )
      }
    >
      <p>{guidance.summary}</p>
      <p className="mt-1 text-[var(--gray-10)]">
        {guidance.canRetry ? 'Ask the agent to try again below, with instructions if it needs them, or take the work over.' : guidance.nextStep}
      </p>
      <p className="mt-1 text-[var(--gray-10)]">What was asked stays in the thread, so trying again asks for the same thing.</p>
      {isAdmin && detail && (
        <details className="mt-3 text-xs">
          <summary className="cursor-pointer text-[var(--gray-11)]">What the agent reported</summary>
          <pre className="mt-2 max-h-48 overflow-auto rounded border border-[var(--gray-5)] bg-[var(--gray-2)] p-2 whitespace-pre-wrap text-[var(--gray-11)]">{detail}</pre>
        </details>
      )}
    </HandoffCard>
  )
}
