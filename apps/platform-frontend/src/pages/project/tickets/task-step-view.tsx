import { onTabListKeyDown, TabButton } from '@/components/tab-button'
import {
  savePlanningDocument,
  saveResearchDocument,
  type PhaseDocumentCommentResponse,
  type PhaseDocumentResponse,
} from '@/service/api/ticket-api'
import { useEffect } from 'react'
import { toast } from 'sonner'
import { BuildPullRequestPanel } from './build-pull-request-panel'
import { CommentList, useDocumentComments, type ApplySuggestion, type DocumentComments } from './document-comments'
import { DocumentStep } from './document-step'
import { DocumentVersion } from './document-version'
import { STEP_NAME, type TaskNextMove, type TaskStep } from './task-next-move'
import { TaskRunLine } from './task-run-line'
import { countNewComments } from './task-suggestions'
import type { TaskPageData } from './use-task-page'

/** What a step shows: its document (or the build's pull request), its runs, or every comment on its document. */
export type StepView = 'document' | 'runs' | 'comments'

interface TaskStepViewProps {
  step: TaskStep
  view: StepView
  /** An earlier version of the document to show read-only, instead of the current one. */
  version?: number | null
  /** Whether that version opens compared with the current one. */
  comparing?: boolean
  /** Opens an earlier version of the document, compared with the current one. */
  onCompare: (version: number) => void
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
  /** The shown document's open comments made since its latest version, as they change here. */
  onNewComments: (step: 'research' | 'planning', count: number) => void
}

const VIEW_PANEL_ID = 'task-step-view-panel'
const viewTabId = (view: StepView) => `task-step-view-tab-${view}`
/** The artifact tabs (Research, Plan, Code) and the panel they show. */
export const stepTabId = (step: TaskStep) => `task-artifact-tab-${step}`
export const stepPanelId = (step: TaskStep) => `task-artifact-panel-${step}`

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
      const saved =
        step === 'research'
          ? await saveResearchDocument(data.ticket.id, content)
          : await savePlanningDocument(data.ticket.id, content)
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
    return (
      <BuildPullRequestPanel ticketId={data.ticket.id} pullRequestUrl={data.ticket.pullRequestUrl} runs={data.runs} />
    )
  }
  return (
    <p className="py-6 text-sm text-[var(--gray-10)]">
      {!isUpcoming
        ? 'No pull request yet. The build opens one when it finishes.'
        : data.capabilities?.canAskForCode
          ? 'No build yet. Ask the agent to build it in the thread: it makes the change on a branch and opens a pull request.'
          : 'No build yet. People who can ask for code on this task can have the agent build it; its pull request shows here.'}
    </p>
  )
}

/** One step's work, one view at a time: its document, its runs, or comments on the document. */
export function TaskStepView({
  step,
  view,
  version = null,
  comparing = false,
  onCompare,
  onView,
  data,
  project,
  move,
  openRunId,
  focusedRunId,
  focusedRunTab,
  onToggleRun,
  onDocumentSaved,
  onNewComments,
}: TaskStepViewProps) {
  const stepRuns = data.runs.filter((run) => run.jobKind === step)
  const agentNames = new Map(data.clankers.map((clanker) => [clanker.id, clanker.name]))
  const isDocumentStep = step !== 'execution'
  const hasDocument = isDocumentStep && data.documents[step].content.trim().length > 0
  const documentStep = step === 'execution' ? null : step
  const comments = useDocumentComments(data.ticket.id, hasDocument ? documentStep : null)
  const applySuggestion = useApplySuggestion(documentStep ?? 'research', data, comments, onDocumentSaved)
  const documentContent = documentStep ? data.documents[documentStep].content : ''
  const reloadComments = comments.reload
  const newCount = documentStep ? countNewComments(comments.comments, data.documents[documentStep].updatedAt) : 0

  // A revision or an edit moves text around: find each comment's text again.
  useEffect(() => {
    void reloadComments()
  }, [documentContent, reloadComments])

  useEffect(() => {
    if (documentStep && hasDocument) onNewComments(documentStep, newCount)
  }, [documentStep, hasDocument, newCount, onNewComments])

  const shown: StepView = view === 'comments' && !hasDocument ? 'document' : view

  return (
    <div role="tabpanel" id={stepPanelId(step)} aria-labelledby={stepTabId(step)}>
      <div
        role="tablist"
        aria-label={`${STEP_NAME[step]} views`}
        className="mb-6 flex gap-1 border-b border-[var(--gray-5)]"
        onKeyDown={onTabListKeyDown}
      >
        <TabButton
          role="tab"
          id={viewTabId('document')}
          aria-controls={VIEW_PANEL_ID}
          active={shown === 'document'}
          onClick={() => onView('document')}
        >
          {isDocumentStep ? 'Document' : 'Pull request'}
        </TabButton>
        <TabButton
          role="tab"
          id={viewTabId('runs')}
          aria-controls={VIEW_PANEL_ID}
          active={shown === 'runs'}
          onClick={() => onView('runs')}
        >
          Runs{stepRuns.length > 0 ? ` · ${stepRuns.length}` : ''}
        </TabButton>
        {hasDocument && (
          <TabButton
            role="tab"
            id={viewTabId('comments')}
            aria-controls={VIEW_PANEL_ID}
            active={shown === 'comments'}
            onClick={() => onView('comments')}
          >
            Comments{comments.openCount > 0 ? ` · ${comments.openCount}` : ''}
          </TabButton>
        )}
      </div>

      <div role="tabpanel" id={VIEW_PANEL_ID} aria-labelledby={viewTabId(shown)}>
        {shown === 'document' && (
          <div className="space-y-8">
            {documentStep && version ? (
              <DocumentVersion
                ticketId={data.ticket.id}
                step={documentStep}
                version={version}
                comparing={comparing}
                onShowCurrent={() => onView('document')}
              />
            ) : documentStep ? (
              <DocumentStep
                step={documentStep}
                data={data}
                move={step === data.ticket.workflowPhase ? move : { kind: 'done' }}
                comments={comments}
                onApplySuggestion={applySuggestion}
                onDocumentSaved={onDocumentSaved}
                onCompare={onCompare}
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

        {shown === 'comments' && documentStep && (
          <CommentList comments={comments} onApplySuggestion={applySuggestion} />
        )}
      </div>
    </div>
  )
}
