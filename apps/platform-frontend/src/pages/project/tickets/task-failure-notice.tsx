import { Button } from '@/components/button'
import { failureGuidance } from '@/components/failure-guidance'
import { useAuth } from '@/context/auth-context'
import { HandoffCard } from '../jobs/handoff-card'
import type { TaskNextMove, TaskStep } from './task-next-move'

const STEP_NOUN: Record<TaskStep, string> = { research: 'research', planning: 'plan', execution: 'build' }

/** Why the agent's last run failed and what can be done, until something happens after it. */
export function TaskFailureNotice({ move, project }: { move: TaskNextMove; project: string }) {
  const { user } = useAuth()
  if (move.kind !== 'failed') return null
  const guidance = failureGuidance(move.failure ?? undefined, user?.role === 'admin', project)
  return (
    <HandoffCard
      owner="problem"
      eyebrow={`The ${STEP_NOUN[move.step]} failed`}
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
      <p className="mt-1 text-[var(--gray-10)]">{guidance.canRetry ? 'Ask the agent to try again below, with instructions if it needs them, or take the work over.' : guidance.nextStep.replace(/ from the task/, '')}</p>
    </HandoffCard>
  )
}
