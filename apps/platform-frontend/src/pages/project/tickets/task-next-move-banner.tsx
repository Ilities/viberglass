import { Button } from '@/components/button'
import { CancelRunButton } from '@/components/cancel-run-button'
import { failureGuidance } from '@/components/failure-guidance'
import { useAuth } from '@/context/auth-context'
import { cancelJob } from '@/service/api/job-api'
import { ExternalLinkIcon } from '@radix-ui/react-icons'
import { useState } from 'react'
import { toast } from 'sonner'
import { HandoffCard } from '../jobs/handoff-card'
import type { TaskNextMove, TaskStep } from './task-next-move'
import type { TaskPageData } from './use-task-page'

const STEP_NOUN: Record<TaskStep, string> = { research: 'research', planning: 'plan', execution: 'build' }

/** Starting, revising and trying again are asks in the thread below; the banner says whose move it is. */
const START: Record<TaskStep, { title: string; body: string }> = {
  research: {
    title: 'Ask the agent for the research',
    body: 'The agent reads the code and writes up what it finds, for you to review before anything changes. Ask it in the thread below.',
  },
  planning: {
    title: 'Ask the agent for the plan',
    body: 'The agent turns the research into a step-by-step plan for you to review. Ask it in the thread below.',
  },
  execution: {
    title: 'Ask the agent to build it',
    body: 'The agent makes the change on a branch and opens a pull request for review. Ask it in the thread below.',
  },
}

interface TaskNextMoveBannerProps {
  move: TaskNextMove
  data: TaskPageData
  project: string
  onChanged: () => void
  onResolve: () => Promise<void>
  /** Open a run's details below, to see what happened. */
  onShowRun: (runId: string) => void
}

function LinkButton({ onClick, children }: { onClick: () => void; children: string }) {
  return (
    <button type="button" onClick={onClick} className="text-sm text-[var(--gray-11)] underline decoration-[var(--gray-7)] underline-offset-2 hover:decoration-current">
      {children}
    </button>
  )
}

/** The one thing to do next on the task, at the top of its page. */
export function TaskNextMoveBanner({ move, data, project, onChanged, onResolve, onShowRun }: TaskNextMoveBannerProps) {
  const { user } = useAuth()
  const [isCancelling, setIsCancelling] = useState(false)
  const [isResolving, setIsResolving] = useState(false)

  const cancelRun = async (runId: string) => {
    setIsCancelling(true)
    try {
      await cancelJob(runId)
      toast.success('Run cancelled')
      onChanged()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to cancel run')
    } finally {
      setIsCancelling(false)
    }
  }

  const resolve = async () => {
    setIsResolving(true)
    try {
      await onResolve()
    } finally {
      setIsResolving(false)
    }
  }

  const markDone = (
    <Button outline disabled={isResolving} onClick={() => void resolve()}>
      {isResolving ? 'Marking…' : 'Mark as done'}
    </Button>
  )

  switch (move.kind) {
    case 'start':
      return (
        <HandoffCard owner="you" eyebrow="Next step" title={START[move.step].title}>
          {START[move.step].body}
        </HandoffCard>
      )
    case 'working':
      return (
        <HandoffCard
          owner="agent"
          eyebrow="Agent working"
          title={`The agent is working on the ${STEP_NOUN[move.step]}`}
          actions={
            move.runId ? (
              <>
                <CancelRunButton label="Cancel run" isCancelling={isCancelling} onConfirm={() => void cancelRun(move.runId!)} />
                <LinkButton onClick={() => onShowRun(move.runId!)}>Watch progress</LinkButton>
              </>
            ) : move.sessionId ? (
              <Button href={`/spaces/${project}/sessions/${move.sessionId}`} outline>
                Open the session
              </Button>
            ) : null
          }
        >
          Each turn starts in a fresh agent sandbox, which can take a minute or two to start, longer on AWS. You can leave
          this page; it updates when the agent is done, and what you write in the thread meanwhile reaches it next.
        </HandoffCard>
      )
    case 'ready':
      return (
        <HandoffCard owner="you" eyebrow="Your move" title={`The ${STEP_NOUN[move.step]} is ready`}>
          {move.step === 'research'
            ? 'Read it below. Comment on it, or use the thread to ask the agent to change it or to write the plan.'
            : data.capabilities?.canAskForCode
              ? 'Read it below. Comment on it, or use the thread to ask the agent to change it or to build it.'
              : 'Read it below. Comment on it, or ask the agent to change it in the thread. Someone on the task can ask it to build it.'}
        </HandoffCard>
      )
    case 'failed': {
      const guidance = failureGuidance(move.failure ?? undefined, user?.role === 'admin', project)
      return (
        <HandoffCard
          owner="problem"
          eyebrow={`The ${STEP_NOUN[move.step]} failed`}
          title={guidance.title}
          actions={
            <>
              {guidance.fix && (
                <Button href={guidance.fix.href} color="brand">
                  {guidance.fix.label}
                </Button>
              )}
              <LinkButton onClick={() => onShowRun(move.runId)}>See what happened</LinkButton>
            </>
          }
        >
          <p>{guidance.summary}</p>
          <p className="mt-1 text-[var(--gray-10)]">
            {guidance.canRetry ? 'Ask the agent to try again in the thread below.' : guidance.nextStep.replace(/ from the task/, '')}
          </p>
        </HandoffCard>
      )
    }
    case 'cancelled':
      return (
        <HandoffCard owner="settled" eyebrow="Cancelled" title={`The last ${STEP_NOUN[move.step]} run was cancelled`}>
          Nothing from it was saved. Ask the agent again in the thread below.
        </HandoffCard>
      )
    case 'pull_request':
      return (
        <HandoffCard
          owner="you"
          eyebrow="Your move"
          title="The pull request is ready for review"
          actions={
            <>
              <Button href={move.url} target="_blank" color="brand">
                <ExternalLinkIcon data-slot="icon" />
                View pull request
              </Button>
              {markDone}
            </>
          }
        >
          Review and merge it, then mark the task as done. To change it, ask the agent in the thread below: it adds commits to the same
          pull request.
        </HandoffCard>
      )
    case 'build_finished':
      return (
        <HandoffCard
          owner="settled"
          eyebrow="Build finished"
          title="The build finished without a pull request"
          actions={
            <>
              {markDone}
              <LinkButton onClick={() => onShowRun(move.runId)}>See what happened</LinkButton>
            </>
          }
        >
          The agent changed no code. Its reply in the thread says why.
        </HandoffCard>
      )
    case 'done':
      return <HandoffCard owner="settled" eyebrow="Done" title="This task is done" />
  }
}
