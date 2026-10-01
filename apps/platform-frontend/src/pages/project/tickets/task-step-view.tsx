import { Button } from '@/components/button'
import { TabButton } from '@/components/tab-button'
import { useAuth } from '@/context/auth-context'
import { usePersonName } from '@/hooks/usePeople'
import { reopenTaskStep } from '@/service/api/build-api'
import {
  savePlanningDocument,
  saveResearchDocument,
  type PhaseDocumentCommentResponse,
  type PhaseDocumentResponse,
} from '@/service/api/ticket-api'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { BuildPullRequestPanel } from './build-pull-request-panel'
import { CommentableDocument } from './commentable-document'
import { CommentList, useDocumentComments, type ApplySuggestion, type DocumentComments } from './document-comments'
import { PhaseSessionPanel } from './phase-session-panel'
import { STEP_NAME, TASK_STEPS, type TaskNextMove, type TaskStep } from './task-next-move'
import { TaskRunLine } from './task-run-line'
import { openSessionFor, type TaskPageData } from './use-task-page'

/** What a step shows: its document (or the build's pull request), its runs, or every comment on its document. */
export type StepView = 'document' | 'runs' | 'comments'

interface TaskStepViewProps {
  step: TaskStep
  view: StepView
  onView: (view: StepView) => void
  data: TaskPageData
  project: string
  move: TaskNextMove
  openRunId: string | null
  /** The run opened by link or from the banner, scrolled to once. */
  focusedRunId: string | null
  /** The view the linked run opens on (`?runTab=`). */
  focusedRunTab: string | null
  onToggleRun: (runId: string) => void
  onDocumentSaved: (step: 'research' | 'planning', document: PhaseDocumentResponse) => void
  onChanged: () => void
}

const DOCUMENT_NOUN = { research: 'research', planning: 'plan' } as const

function DocumentStep({
  step,
  data,
  move,
  comments,
  onApplySuggestion,
  onDocumentSaved,
  onChanged,
}: Pick<TaskStepViewProps, 'data' | 'move' | 'onDocumentSaved' | 'onChanged'> & {
  step: 'research' | 'planning'
  comments: DocumentComments
  onApplySuggestion: ApplySuggestion
}) {
  const document = data.documents[step]
  const [draft, setDraft] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const noun = DOCUMENT_NOUN[step]
  const isCurrent = data.ticket.workflowPhase === step
  const isUpcoming = TASK_STEPS.indexOf(step) > TASK_STEPS.indexOf(data.ticket.workflowPhase)
  const isBehind = TASK_STEPS.indexOf(step) < TASK_STEPS.indexOf(data.ticket.workflowPhase)
  const hasContent = document.content.trim().length > 0
  // A step the task has moved past is reopened before it's edited, so an edit
  // can't quietly un-approve a plan the build depends on.
  const canEdit = isCurrent
  const [isReopening, setIsReopening] = useState(false)
  const personName = usePersonName()
  const { user } = useAuth()

  const save = async (content: string) => {
    setIsSaving(true)
    try {
      const saved = step === 'research' ? await saveResearchDocument(data.ticket.id, content) : await savePlanningDocument(data.ticket.id, content)
      onDocumentSaved(step, saved)
      setDraft(null)
      toast.success(`The ${noun} is saved`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save')
      throw error
    } finally {
      setIsSaving(false)
    }
  }

  const reopen = async () => {
    setIsReopening(true)
    try {
      await reopenTaskStep(data.ticket.id, step)
      toast.success(`The ${noun} is open again`, {
        description:
          step === 'research'
            ? 'Revise it, then approve it and the plan again. The pull request stays open for the next build.'
            : 'Revise it, then approve it again. The pull request stays open for the next build.',
      })
      onChanged()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `Failed to reopen the ${noun}`)
    } finally {
      setIsReopening(false)
    }
  }

  if (draft !== null) {
    return (
      <div className="space-y-3">
        <textarea
          autoFocus
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          className="min-h-[320px] w-full resize-y rounded-lg border border-[var(--gray-6)] bg-[var(--gray-1)] p-4 font-mono text-sm text-[var(--gray-12)] focus:border-[var(--accent-8)] focus:ring-1 focus:ring-[var(--accent-8)] focus:outline-none"
          placeholder={`Write the ${noun} in markdown…`}
        />
        <div className="flex justify-end gap-2">
          <Button plain onClick={() => setDraft(null)} disabled={isSaving}>
            Cancel
          </Button>
          <Button color="brand" onClick={() => void save(draft).catch(() => undefined)} disabled={isSaving || draft === document.content}>
            {isSaving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>
    )
  }

  if (!hasContent) {
    const empty = isUpcoming
      ? `The ${noun} comes after the ${step === 'planning' ? 'research' : 'plan'} is approved.`
      : move.kind === 'working'
        ? `The agent is writing the ${noun}. It appears here when it's done.`
        : move.kind === 'failed'
          ? `No ${noun} yet: the last run failed before writing it.`
          : `No ${noun} yet. Start it above, or write it yourself.`
    return (
      <div className="py-6 text-sm text-[var(--gray-10)]">
        <p>{empty}</p>
        {canEdit && !isUpcoming && move.kind !== 'working' && (
          <button type="button" onClick={() => setDraft('')} className="mt-2 text-[var(--accent-11)] underline decoration-[var(--gray-7)] underline-offset-2 hover:decoration-current">
            Write it yourself
          </button>
        )}
      </div>
    )
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--gray-10)]">
        <span>
          {document.approvalState === 'approved' && document.approvedAt
            ? `Approved ${document.approvedBy ? `by ${personName(document.approvedBy)} ` : ''}on ${new Date(document.approvedAt).toLocaleString()}`
            : `Last changed ${new Date(document.updatedAt).toLocaleString()}`}
        </span>
        <span className="flex items-center gap-3">
          {isBehind && (
            <button type="button" disabled={isReopening} onClick={() => void reopen()} className="hover:text-[var(--gray-12)] disabled:opacity-50">
              {isReopening ? 'Reopening…' : `Reopen the ${noun}`}
            </button>
          )}
          {canEdit && (
            <button type="button" onClick={() => setDraft(document.content)} className="hover:text-[var(--gray-12)]">
              Edit
            </button>
          )}
        </span>
      </div>
      <CommentableDocument
        source={document.content}
        comments={comments}
        canComment={Boolean(user && user.role !== 'viewer')}
        onApplySuggestion={onApplySuggestion}
      />
    </div>
  )
}

/** Puts a suggestion's wording in place of the text it was on, and resolves it. */
function useApplySuggestion(
  step: 'research' | 'planning',
  data: TaskPageData,
  comments: DocumentComments,
  onDocumentSaved: TaskStepViewProps['onDocumentSaved']
): ApplySuggestion {
  return async (comment: PhaseDocumentCommentResponse, suggestedText: string) => {
    if (!comment.location) return
    const source = data.documents[step].content
    const content = source.slice(0, comment.location.start) + suggestedText + source.slice(comment.location.end)
    try {
      const saved = step === 'research' ? await saveResearchDocument(data.ticket.id, content) : await savePlanningDocument(data.ticket.id, content)
      onDocumentSaved(step, saved)
      await comments.toggleStatus(comment)
      toast.success('Suggestion applied')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to apply the suggestion')
      throw error
    }
  }
}

function BuildStep({ data }: { data: TaskPageData }) {
  const isUpcoming = data.ticket.workflowPhase !== 'execution'
  if (data.ticket.pullRequestUrl) {
    return <BuildPullRequestPanel ticketId={data.ticket.id} pullRequestUrl={data.ticket.pullRequestUrl} runs={data.runs} />
  }
  return (
    <p className="py-6 text-sm text-[var(--gray-10)]">
      {isUpcoming
        ? 'The build comes after the plan is approved. It makes the change on a branch and opens a pull request.'
        : 'No pull request yet. The build opens one when it finishes.'}
    </p>
  )
}

/** One step's work, one view at a time: its document, its runs, or comments on the document. */
export function TaskStepView({
  step,
  view,
  onView,
  data,
  project,
  move,
  openRunId,
  focusedRunId,
  focusedRunTab,
  onToggleRun,
  onDocumentSaved,
  onChanged,
}: TaskStepViewProps) {
  const stepRuns = data.runs.filter((run) => run.jobKind === step)
  const session = openSessionFor(data.sessions, step)
  const agentNames = new Map(data.clankers.map((clanker) => [clanker.id, clanker.name]))
  const isDocumentStep = step !== 'execution'
  const hasDocument = isDocumentStep && data.documents[step].content.trim().length > 0
  const documentStep = step === 'execution' ? null : step
  const comments = useDocumentComments(data.ticket.id, hasDocument ? documentStep : null)
  const applySuggestion = useApplySuggestion(documentStep ?? 'research', data, comments, onDocumentSaved)
  const documentContent = documentStep ? data.documents[documentStep].content : ''
  const reloadComments = comments.reload

  // A revision or an edit moves text around: find each comment's text again.
  useEffect(() => {
    void reloadComments()
  }, [documentContent, reloadComments])

  const shown: StepView = view === 'comments' && !hasDocument ? 'document' : view

  return (
    <div role="tabpanel" aria-label={STEP_NAME[step]}>
      <div role="tablist" aria-label={`${STEP_NAME[step]} views`} className="mb-6 flex gap-1 border-b border-[var(--gray-5)]">
        <TabButton active={shown === 'document'} onClick={() => onView('document')}>
          {isDocumentStep ? 'Document' : 'Pull request'}
        </TabButton>
        <TabButton active={shown === 'runs'} onClick={() => onView('runs')}>
          Runs{stepRuns.length > 0 ? ` · ${stepRuns.length}` : ''}
        </TabButton>
        {hasDocument && (
          <TabButton active={shown === 'comments'} onClick={() => onView('comments')}>
            Comments{comments.openCount > 0 ? ` · ${comments.openCount}` : ''}
          </TabButton>
        )}
      </div>

      {shown === 'document' && (
        <div className="space-y-8">
          {session && <PhaseSessionPanel session={session} project={project} onSessionEnded={onChanged} onTurnCompleted={onChanged} />}
          {documentStep ? (
            <DocumentStep
              step={documentStep}
              data={data}
              move={step === data.ticket.workflowPhase ? move : { kind: 'done' }}
              comments={comments}
              onApplySuggestion={applySuggestion}
              onDocumentSaved={onDocumentSaved}
              onChanged={onChanged}
            />
          ) : (
            <BuildStep data={data} />
          )}
        </div>
      )}

      {shown === 'runs' &&
        (stepRuns.length === 0 ? (
          <p className="py-6 text-sm text-[var(--gray-10)]">No {STEP_NAME[step].toLowerCase()} runs yet.</p>
        ) : (
          <div className="divide-y divide-[var(--gray-4)]">
            {stepRuns.map((run, index) => (
              <TaskRunLine
                key={run.jobId}
                run={run}
                number={stepRuns.length - index}
                agentName={run.clankerId ? (agentNames.get(run.clankerId) ?? null) : null}
                project={project}
                isOpen={openRunId === run.jobId}
                onToggle={() => onToggleRun(run.jobId)}
                scrollIntoView={focusedRunId === run.jobId}
                linkedTab={focusedRunId === run.jobId ? focusedRunTab : null}
              />
            ))}
          </div>
        ))}

      {shown === 'comments' && documentStep && <CommentList comments={comments} onApplySuggestion={applySuggestion} />}
    </div>
  )
}
