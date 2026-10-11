import { savePlan, type PhaseDocumentCommentResponse, type PhaseDocumentResponse } from '@/service/api/ticket-api'
import { useEffect } from 'react'
import { toast } from 'sonner'
import { BuildPullRequests } from './build-pull-requests'
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
  onDocumentSaved: (document: PhaseDocumentResponse) => void
  /** The plan's open comments made since its latest version, as they change here. */
  onNewComments: (count: number) => void
  /** Someone asked the agent from the artifact, such as for a part's build. */
  onAsked: () => void
}

/** The artifact tabs (Plan, Code) and the panel they show. */
export const stepTabId = (step: TaskStep) => `task-artifact-tab-${step}`
export const stepPanelId = (step: TaskStep) => `task-artifact-panel-${step}`

/** Puts a suggestion's wording in place of the text it was on, and resolves it. */
function useApplySuggestion(
  data: TaskPageData,
  comments: DocumentComments,
  onDocumentSaved: TaskStepViewProps['onDocumentSaved']
): ApplySuggestion {
  return async (comment: PhaseDocumentCommentResponse, suggestedText: string) => {
    if (!comment.location) return
    const source = data.plan.content
    const content = source.slice(0, comment.location.start) + suggestedText + source.slice(comment.location.end)
    try {
      const saved = await savePlan(data.ticket.id, content)
      onDocumentSaved(saved)
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
    return <BuildPullRequests ticketId={data.ticket.id} latestUrl={data.ticket.pullRequestUrl} runs={data.runs} />
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
  onAsked,
}: TaskStepViewProps) {
  const isPlan = step === 'planning'
  const hasPlan = isPlan && data.plan.content.trim().length > 0
  const comments = useDocumentComments(data.ticket.id, hasPlan)
  const applySuggestion = useApplySuggestion(data, comments, onDocumentSaved)
  const planContent = isPlan ? data.plan.content : ''
  const reloadComments = comments.reload
  const newCount = isPlan ? countNewComments(comments.comments, data.plan.updatedAt) : 0

  // A revision or an edit moves text around: find each comment's text again.
  useEffect(() => {
    void reloadComments()
  }, [planContent, reloadComments])

  useEffect(() => {
    if (hasPlan) onNewComments(newCount)
  }, [hasPlan, newCount, onNewComments])

  return (
    <div role="tabpanel" id={stepPanelId(step)} aria-labelledby={stepTabId(step)}>
      {isPlan && version ? (
        <DocumentVersion
          ticketId={data.ticket.id}
          version={version}
          comparing={comparing}
          onShowCurrent={() => onView('document')}
        />
      ) : isPlan ? (
        <DocumentStep
          data={data}
          move={step === data.ticket.workflowPhase ? move : { kind: 'done' }}
          comments={comments}
          onApplySuggestion={applySuggestion}
          onDocumentSaved={onDocumentSaved}
          onCompare={onCompare}
          onAsked={onAsked}
        />
      ) : (
        <BuildStep data={data} />
      )}
      {hasPlan && !version && (
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
