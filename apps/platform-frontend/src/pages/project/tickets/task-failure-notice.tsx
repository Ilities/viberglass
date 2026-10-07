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
 * A failure trying again won't get past, such as a setup problem: who can fix
 * it and where, until something happens after it. Failures worth retrying are
 * shown on the failed turn itself, with its retry and run details.
 */
export function TaskFailureNotice({ move, project, runner }: TaskFailureNoticeProps) {
  const { user } = useAuth()
  if (move.kind !== 'failed') return null
  const isAdmin = user?.role === 'admin'
  const guidance = failureGuidance(move.failure ?? undefined, isAdmin, project, runner)
  if (guidance.canRetry) return null
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
      <p className="mt-1 text-[var(--gray-10)]">{guidance.nextStep}</p>
    </HandoffCard>
  )
}
