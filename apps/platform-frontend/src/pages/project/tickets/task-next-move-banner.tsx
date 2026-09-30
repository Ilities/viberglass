import { Button } from '@/components/button'
import { CancelRunButton } from '@/components/cancel-run-button'
import { failureGuidance } from '@/components/failure-guidance'
import { BuildChangesModal } from '@/components/build-changes-modal'
import { RevisionModal } from '@/components/revision-modal'
import { RunTicketModal } from '@/components/run-ticket-modal'
import { useAuth } from '@/context/auth-context'
import { cancelJob } from '@/service/api/job-api'
import { ExternalLinkIcon } from '@radix-ui/react-icons'
import { useState } from 'react'
import { toast } from 'sonner'
import { HandoffCard } from '../jobs/handoff-card'
import { useRunNextStepActions } from '../jobs/use-run-next-step-actions'
import { ApprovePhaseButton } from './approve-phase-button'
import type { TaskNextMove, TaskStep } from './task-next-move'
import type { TaskPageData } from './use-task-page'

const STEP_NOUN: Record<TaskStep, string> = { research: 'research', planning: 'plan', execution: 'build' }

const START: Record<TaskStep, { title: string; body: string; label: string }> = {
  research: {
    title: 'Start the research',
    body: 'The agent reads the code and writes up what it finds, for you to review before anything changes.',
    label: 'Start research',
  },
  planning: {
    title: 'Start the plan',
    body: 'The agent turns the approved research into a step-by-step plan for you to review.',
    label: 'Start the plan',
  },
  execution: {
    title: 'Start the build',
    body: 'The agent makes the change on a branch and opens a pull request for review.',
    label: 'Start the build',
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
  const { ticket, clankers, runs } = data
  const [starting, setStarting] = useState<TaskStep | null>(null)
  const [revising, setRevising] = useState<'research' | 'planning' | null>(null)
  const [changingBuild, setChangingBuild] = useState(false)
  const hasPlan = data.documents.planning.content.trim().length > 0
  const [isCancelling, setIsCancelling] = useState(false)
  const [isResolving, setIsResolving] = useState(false)

  // Follow-up runs use the agent of the step's last run, or the first agent that can run.
  const step = 'step' in move ? move.step : ticket.workflowPhase
  const defaultAgentId =
    runs.find((run) => run.jobKind === step && run.clankerId)?.clankerId ??
    clankers.find((clanker) => clanker.status === 'active' && clanker.deploymentStrategyId)?.id ??
    null
  const actions = useRunNextStepActions({ project, ticketId: ticket.id, clankerId: defaultAgentId, onChanged })

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

  const banner = (() => {
    switch (move.kind) {
      case 'start': {
        const copy = START[move.step]
        return (
          <HandoffCard
            owner="you"
            eyebrow="Next step"
            title={copy.title}
            actions={
              <Button color="brand" onClick={() => setStarting(move.step)}>
                {copy.label}
              </Button>
            }
          >
            {copy.body}
          </HandoffCard>
        )
      }
      case 'working':
        return (
          <HandoffCard
            owner="agent"
            eyebrow="Agent working"
            title={`The agent is working on the ${STEP_NOUN[move.step]}`}
            actions={
              move.sessionId ? (
                <Button href={`/spaces/${project}/sessions/${move.sessionId}`} color="brand">
                  Open the live session
                </Button>
              ) : move.runId ? (
                <>
                  <CancelRunButton label="Cancel run" isCancelling={isCancelling} onConfirm={() => void cancelRun(move.runId!)} />
                  <LinkButton onClick={() => onShowRun(move.runId!)}>Watch progress</LinkButton>
                </>
              ) : null
            }
          >
            Each run starts in a fresh agent sandbox, which can take a minute or two to start, longer on AWS. You can
            leave this page; it updates when the agent is done.
          </HandoffCard>
        )
      case 'reply_in_session':
        return (
          <HandoffCard
            owner="you"
            eyebrow="Your move"
            title="The agent replied in the live session"
            actions={
              <Button href={`/spaces/${project}/sessions/${move.sessionId}`} color="brand">
                Open the session
              </Button>
            }
          >
            Reply to carry on, or approve what it wrote.
          </HandoffCard>
        )
      case 'review':
        return move.step === 'research' ? (
          <HandoffCard
            owner="you"
            eyebrow="Your move"
            title="The research is ready for your review"
            actions={
              <>
                <ApprovePhaseButton
                  ticketId={ticket.id}
                  phase="research"
                  label={actions.busy === 'approve' ? 'Approving…' : 'Approve & plan'}
                  runInProgress={false}
                  isApproving={actions.busy !== null}
                  onApprove={() => void actions.approveResearchAndPlan({ planExists: hasPlan })}
                />
                <Button outline disabled={actions.busy !== null} onClick={() => setRevising('research')}>
                  Ask for changes
                </Button>
              </>
            }
          >
            {hasPlan
              ? 'Read it below. Approving takes you to the existing plan, to review it again.'
              : 'Read it below. Approving starts the plan.'}
          </HandoffCard>
        ) : (
          <HandoffCard
            owner="you"
            eyebrow="Your move"
            title="The plan is ready for your review"
            actions={
              <>
                <ApprovePhaseButton
                  ticketId={ticket.id}
                  phase="planning"
                  label={actions.busy === 'approve' ? 'Approving…' : 'Approve plan'}
                  runInProgress={false}
                  isApproving={actions.busy !== null}
                  onApprove={() => void actions.approvePlan()}
                />
                <Button outline disabled={actions.busy !== null} onClick={() => setRevising('planning')}>
                  Ask for changes
                </Button>
              </>
            }
          >
            Read it below. Once it&apos;s approved, the build can start.
          </HandoffCard>
        )
      case 'failed': {
        const guidance = failureGuidance(move.failure ?? undefined, user?.role === 'admin', project)
        // A task with a pull request has shown its repository accepts pushes,
        // so a failed build on it can always be run again or asked to change.
        const buildOnPullRequest = move.step === 'execution' && Boolean(ticket.pullRequestUrl)
        const retry = buildOnPullRequest ? (
          <>
            <Button color="brand" onClick={() => setStarting('execution')}>
              Run the build again
            </Button>
            <Button outline onClick={() => setChangingBuild(true)}>
              Ask for changes
            </Button>
          </>
        ) : !guidance.canRetry ? null : move.step === 'execution' ? (
            <Button color="brand" onClick={() => setStarting('execution')}>
              Try again
            </Button>
          ) : (
            <Button color="brand" disabled={actions.busy !== null} onClick={() => void actions.runAgain(move.step === 'planning' ? 'planning' : 'research')}>
              {actions.busy === 'retry' ? 'Starting…' : 'Try again'}
            </Button>
          )
        return (
          <HandoffCard
            owner="problem"
            eyebrow={`The ${STEP_NOUN[move.step]} failed`}
            title={guidance.title}
            actions={
              <>
                {guidance.fix && !buildOnPullRequest && (
                  <Button href={guidance.fix.href} color="brand">
                    {guidance.fix.label}
                  </Button>
                )}
                {retry}
                <LinkButton onClick={() => onShowRun(move.runId)}>See what happened</LinkButton>
              </>
            }
          >
            <p>{guidance.summary}</p>
            {!guidance.canRetry && !buildOnPullRequest && <p className="mt-1 text-[var(--gray-10)]">{guidance.nextStep.replace(/ from the task/, '')}</p>}
          </HandoffCard>
        )
      }
      case 'cancelled':
        return (
          <HandoffCard
            owner="settled"
            eyebrow="Cancelled"
            title={`The last ${STEP_NOUN[move.step]} run was cancelled`}
            actions={
              <Button color="brand" onClick={() => setStarting(move.step)}>
                Start again
              </Button>
            }
          >
            Nothing from it was saved.
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
                <Button outline onClick={() => setChangingBuild(true)}>
                  Ask for changes
                </Button>
                <Button outline onClick={() => setStarting('execution')}>
                  Run the build again
                </Button>
                {markDone}
              </>
            }
          >
            Review and merge it, then mark the task as done. Ask for changes, or run the build again, and the agent adds
            commits to the same pull request.
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
                <Button outline onClick={() => setStarting('execution')}>
                  Run the build again
                </Button>
                {markDone}
                <LinkButton onClick={() => onShowRun(move.runId)}>See what happened</LinkButton>
              </>
            }
          >
            The run below says what it changed.
          </HandoffCard>
        )
      case 'done':
        return <HandoffCard owner="settled" eyebrow="Done" title="This task is done" />
    }
  })()

  return (
    <>
      {banner}
      <RunTicketModal
        ticket={ticket}
        clankers={clankers}
        project={project}
        open={starting !== null}
        onClose={() => {
          setStarting(null)
          onChanged()
        }}
        mode={starting ?? 'research'}
      />
      {changingBuild && (
        <BuildChangesModal
          ticket={ticket}
          clankers={clankers}
          project={project}
          defaultClankerId={defaultAgentId}
          onClose={() => {
            setChangingBuild(false)
            onChanged()
          }}
        />
      )}
      {revising && (
        <RevisionModal
          ticket={ticket}
          clankers={clankers}
          project={project}
          open
          mode={revising}
          onClose={() => {
            setRevising(null)
            onChanged()
          }}
        />
      )}
    </>
  )
}
