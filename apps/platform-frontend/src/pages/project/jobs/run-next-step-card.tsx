import { Button } from '@/components/button'
import { CancelRunButton } from '@/components/cancel-run-button'
import { failureGuidance } from '@/components/failure-guidance'
import { Link } from '@/components/link'
import { RevisionModal } from '@/components/revision-modal'
import { useAuth } from '@/context/auth-context'
import { formatJobKind } from '@/data'
import type { JobStatus } from '@/service/api/job-api'
import type { Clanker, Ticket } from '@viberglass/types'
import { ExternalLinkIcon } from '@radix-ui/react-icons'
import { useState } from 'react'
import { ApprovePhaseButton } from '../tickets/approve-phase-button'
import { HandoffCard } from './handoff-card'
import type { RunNextStep } from './run-next-step'
import { useRunNextStepActions } from './use-run-next-step-actions'

interface RunNextStepCardProps {
  step: RunNextStep
  job: JobStatus
  project: string
  ticket: Ticket | null
  clankers: Clanker[]
  cancel: { isCancelling: boolean; onConfirm: () => void }
  onChanged: () => void
  /** On the task page the document sits just above the run, so the card points to it instead of previewing it. */
  documentShownAbove?: boolean
}

function DocumentPreview({ preview, href }: { preview: string; href: string }) {
  return (
    <>
      <pre className="max-h-44 overflow-hidden rounded border border-[var(--gray-5)] bg-[var(--gray-2)] p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap text-[var(--gray-11)] [mask-image:linear-gradient(to_bottom,black_70%,transparent)]">
        {preview}
      </pre>
      <Link href={href} className="mt-2 inline-block text-sm text-[var(--accent-11)] underline decoration-[var(--gray-7)] underline-offset-2 hover:decoration-current">
        Read the whole document
      </Link>
    </>
  )
}

/** The end of a run's story: whose move it is and the move itself. */
export function RunNextStepCard({
  step,
  job,
  project,
  ticket,
  clankers,
  cancel,
  onChanged,
  documentShownAbove = false,
}: RunNextStepCardProps) {
  const { user } = useAuth()
  const [revising, setRevising] = useState<'research' | 'planning' | null>(null)
  const actions = useRunNextStepActions({ project, ticketId: job.ticketId, clankerId: job.clankerId, onChanged })
  const taskHref = job.ticketId ? `/spaces/${project}/tasks/${job.ticketId}` : null
  const agentName = job.clanker?.name ?? 'The agent'
  const kind = formatJobKind(job.jobKind).toLowerCase()
  const openTask = taskHref ? (
    <Button href={taskHref} outline>
      Open task
    </Button>
  ) : null

  const card = (() => {
    switch (step.kind) {
      case 'queued':
        return (
          <HandoffCard
            owner="agent"
            eyebrow="Agent's move"
            title={`Waiting for ${agentName} to start`}
            actions={<CancelRunButton label="Cancel run" {...cancel} />}
          >
            The run starts as soon as the agent picks it up.
          </HandoffCard>
        )
      case 'running':
        return (
          <HandoffCard
            owner="agent"
            eyebrow="Agent's move"
            title={`${agentName} is working`}
            actions={<CancelRunButton label="Cancel run" {...cancel} />}
          >
            {typeof job.progress?.message === 'string' ? `${job.progress.message}. ` : ''}
            You can leave this page; the run carries on and the task shows the result.
          </HandoffCard>
        )
      case 'failed': {
        const guidance = failureGuidance(job.result?.failure, user?.role === 'admin', project)
        const canRunAgain =
          guidance.canRetry && (job.jobKind === 'research' || job.jobKind === 'planning') && ticket?.workflowPhase === job.jobKind
        const technicalDetail =
          job.result?.failure?.technicalDetail || job.result?.errorMessage || job.failedReason || 'No technical details were reported.'
        return (
          <HandoffCard
            owner="problem"
            eyebrow="Run failed"
            title={guidance.title}
            actions={
              <>
                {guidance.fix && (
                  <Button href={guidance.fix.href} color="brand">
                    {guidance.fix.label}
                  </Button>
                )}
                {canRunAgain && (
                  <Button
                    color="brand"
                    disabled={actions.busy !== null}
                    onClick={() => void actions.runAgain(job.jobKind === 'planning' ? 'planning' : 'research')}
                  >
                    {actions.busy === 'retry' ? 'Starting…' : 'Try again'}
                  </Button>
                )}
                {openTask}
              </>
            }
          >
            <p>{guidance.summary}</p>
            {!canRunAgain && <p className="mt-1 text-[var(--gray-10)]">{guidance.nextStep}</p>}
            <details className="mt-3">
              <summary className="cursor-pointer text-xs font-medium text-[var(--gray-10)]">Technical details</summary>
              <pre className="mt-2 overflow-auto font-mono text-xs whitespace-pre-wrap">{technicalDetail}</pre>
            </details>
          </HandoffCard>
        )
      }
      case 'cancelled':
        return (
          <HandoffCard
            owner="settled"
            eyebrow="Cancelled"
            title="This run was cancelled"
            actions={
              <>
                {step.canRunAgain && (
                  <Button
                    color="brand"
                    disabled={actions.busy !== null}
                    onClick={() => void actions.runAgain(job.jobKind === 'planning' ? 'planning' : 'research')}
                  >
                    {actions.busy === 'retry' ? 'Starting…' : `Run ${kind} again`}
                  </Button>
                )}
                {openTask}
              </>
            }
          >
            Nothing from it was saved.
          </HandoffCard>
        )
      case 'superseded':
        return (
          <HandoffCard
            owner="settled"
            eyebrow="Replaced"
            title={`A newer ${kind} run replaced this one`}
            actions={
              <Button href={`/spaces/${project}/runs/${step.newerRunId}`} outline>
                Open the newer run
              </Button>
            }
          >
            What to do next depends on the newer run.
          </HandoffCard>
        )
      case 'session':
        return (
          <HandoffCard
            owner="settled"
            eyebrow="Live session"
            title="This run was one turn of a live session"
            actions={
              <Button href={`/spaces/${project}/sessions/${step.sessionId}`} color="brand">
                Open the session
              </Button>
            }
          >
            The conversation, and whatever comes next, is in the session.
          </HandoffCard>
        )
      case 'review_research':
        return (
          <HandoffCard
            owner="you"
            eyebrow="Your move · research ready"
            title="Review the research"
            actions={
              <>
                {job.ticketId && (
                  // Warns about open comments before approving, like the task page always has.
                  <ApprovePhaseButton
                    ticketId={job.ticketId}
                    phase="research"
                    label={actions.busy === 'approve' ? 'Approving…' : 'Approve & plan'}
                    runInProgress={false}
                    isApproving={actions.busy !== null}
                    onApprove={() => void actions.approveResearchAndPlan()}
                  />
                )}
                <Button outline disabled={actions.busy !== null} onClick={() => setRevising('research')}>
                  Ask for changes
                </Button>
              </>
            }
          >
            {documentShownAbove ? (
              'The research is above. Approving starts planning; asking for changes starts a revision.'
            ) : (
              <DocumentPreview preview={step.preview} href={`${taskHref}?tab=research`} />
            )}
          </HandoffCard>
        )
      case 'review_plan':
        return (
          <HandoffCard
            owner="you"
            eyebrow="Your move · plan ready"
            title="Review the plan"
            actions={
              <>
                {job.ticketId && (
                  <ApprovePhaseButton
                    ticketId={job.ticketId}
                    phase="planning"
                    label={actions.busy === 'approve' ? 'Approving…' : 'Approve plan'}
                    runInProgress={false}
                    isApproving={actions.busy !== null}
                    onApprove={() => void actions.approvePlan()}
                  />
                )}
                <Button outline disabled={actions.busy !== null} onClick={() => setRevising('planning')}>
                  Ask for changes
                </Button>
              </>
            }
          >
            {documentShownAbove ? (
              'The plan is above. Once approved, the build is next.'
            ) : (
              <DocumentPreview preview={step.preview} href={`${taskHref}?tab=planning`} />
            )}
          </HandoffCard>
        )
      case 'moved_on':
        return step.phase === 'research' ? (
          <HandoffCard owner="settled" eyebrow="Research approved" title="The task has moved on to planning" actions={openTask} />
        ) : (
          <HandoffCard
            owner="you"
            eyebrow="Your move · plan approved"
            title="The build is next"
            actions={
              taskHref && (
                <Button href={`${taskHref}?tab=execution`} color="brand">
                  Go to the build
                </Button>
              )
            }
          >
            The build pushes a branch and opens a pull request. Start it from the task, where you can check where it goes first.
          </HandoffCard>
        )
      case 'pull_request':
        return (
          <HandoffCard
            owner="you"
            eyebrow="Your move · pull request open"
            title="Review the pull request"
            actions={
              <Button href={step.url} target="_blank" color="brand">
                <ExternalLinkIcon data-slot="icon" />
                View pull request
              </Button>
            }
          >
            {job.result?.branch ? (
              <>
                The changes are on <span className="font-mono text-[13px]">{job.result.branch}</span>.
              </>
            ) : (
              'The agent opened a pull request with its changes.'
            )}
          </HandoffCard>
        )
      case 'build_done':
        return (
          <HandoffCard owner="settled" eyebrow="Build finished" title="The build finished without a pull request" actions={openTask}>
            {job.result?.branch ? (
              <>
                Its changes are on <span className="font-mono text-[13px]">{job.result.branch}</span>.
              </>
            ) : null}
          </HandoffCard>
        )
      case 'done':
        return <HandoffCard owner="settled" eyebrow="Done" title="This run finished" actions={openTask} />
    }
  })()

  return (
    <>
      {card}
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
