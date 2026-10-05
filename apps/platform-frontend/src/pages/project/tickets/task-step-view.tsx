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
import { type TaskNextMove, type TaskStep } from './task-next-move'
import { countNewComments } from './task-suggestions'
import type { TaskPageData } from './use-task-page'

/** Comments expand below the artifact; runs belong to the conversation. */
export type StepView = 'document' | 'comments'

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
  move: TaskNextMove
  onDocumentSaved: (step: 'research' | 'planning', document: PhaseDocumentResponse) => void
  /** The shown document's open comments made since its latest version, as they change here. */
  onNewComments: (step: 'research' | 'planning', count: number) => void
}

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

/** The artifact, with its comments available below it. */
export function TaskStepView({
  step,
  view,
  version = null,
  comparing = false,
  onCompare,
  onView,
  data,
  move,
  onDocumentSaved,
  onNewComments,
}: TaskStepViewProps) {
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

  return (
    <div role="tabpanel" id={stepPanelId(step)} aria-labelledby={stepTabId(step)}>
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
      {hasDocument && documentStep && !version && (
        <details
          open={view === 'comments'}
          onToggle={(event) => {
            if (event.currentTarget.open !== (view === 'comments')) onView(event.currentTarget.open ? 'comments' : 'document')
          }}
          className="mt-6 border-t border-[var(--gray-5)] pt-4"
        >
          <summary className="cursor-pointer text-sm text-[var(--gray-11)]">
            Comments{comments.openCount > 0 && ` · ${comments.openCount} open`}
          </summary>
          {view === 'comments' && <div className="mt-4"><CommentList comments={comments} onApplySuggestion={applySuggestion} /></div>}
        </details>
      )}
    </div>
  )
}
