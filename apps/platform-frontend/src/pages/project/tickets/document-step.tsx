import { Button } from '@/components/button'
import { useAuth } from '@/context/auth-context'
import { savePlan, type PhaseDocumentResponse } from '@/service/api/ticket-api'
import { useState } from 'react'
import { toast } from 'sonner'
import { CommentableDocument } from './commentable-document'
import type { ApplySuggestion, DocumentComments } from './document-comments'
import { DocumentHead, useLatestRevision, VersionByline, VersionTitle } from './document-head'
import { FullScreenReader } from './full-screen-reader'
import { PlanPartsOutline } from './plan-parts-outline'
import type { TaskNextMove } from './task-next-move'
import type { TaskPageData } from './use-task-page'

/** The plan: the current version to read, comment on and edit, or what to do while there's none yet. */
export function DocumentStep({
  data,
  move,
  comments,
  onApplySuggestion,
  onDocumentSaved,
  onCompare,
  onAsked,
}: {
  data: TaskPageData
  move: TaskNextMove
  comments: DocumentComments
  onApplySuggestion: ApplySuggestion
  onDocumentSaved: (document: PhaseDocumentResponse) => void
  /** Opens an earlier version, compared with the current one. */
  onCompare: (version: number) => void
  /** Someone asked the agent for a part's build. */
  onAsked: () => void
}) {
  const document = data.plan
  const [draft, setDraft] = useState<string | null>(null)
  const [fullScreen, setFullScreen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const noun = 'plan'
  const hasContent = document.content.trim().length > 0
  const latest = useLatestRevision(data.ticket.id, document.updatedAt, hasContent)
  const { user } = useAuth()
  // Nothing is approved, so any document can be edited; an edit is its next version.
  const canEdit = Boolean(user && user.role !== 'viewer')

  const save = async (content: string) => {
    setIsSaving(true)
    try {
      const saved = await savePlan(data.ticket.id, content)
      onDocumentSaved(saved)
      setDraft(null)
      toast.success(`The ${noun} is saved`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save')
      throw error
    } finally {
      setIsSaving(false)
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
          <Button outline onClick={() => setDraft(null)} disabled={isSaving}>
            Cancel
          </Button>
          <Button
            color="brand"
            onClick={() => void save(draft).catch(() => undefined)}
            disabled={isSaving || draft === document.content}
          >
            {isSaving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>
    )
  }

  if (!hasContent) {
    // Read-only people are told who can make it and where to follow it, never to do what they can't.
    const canAsk = Boolean(data.capabilities?.canAsk)
    const empty =
      move.kind === 'working'
        ? `The agent is writing the ${noun}. It appears here when it's done.`
        : move.kind === 'failed'
          ? `No ${noun} yet: the last run failed before writing it.`
          : canAsk
            ? `No ${noun} yet. Ask the agent for it in the thread, or write it yourself.`
            : canEdit
              ? `No ${noun} yet. You can write it yourself; people on the task can ask the agent for it.`
              : `No ${noun} yet. People on this task can ask the agent for it; it appears here, and in the thread, when it's written.`
    return (
      <div className="py-6 text-sm text-[var(--gray-10)]">
        <p>{empty}</p>
        {canEdit && move.kind !== 'working' && (
          <button
            type="button"
            onClick={() => setDraft('')}
            className="mt-2 text-[var(--accent-11)] underline decoration-[var(--gray-7)] underline-offset-2 hover:decoration-current"
          >
            Write it yourself
          </button>
        )}
      </div>
    )
  }

  return (
    <div>
      <DocumentHead
        latest={latest}
        updatedAt={document.updatedAt}
        onCompare={onCompare}
        onFullScreen={() => setFullScreen(true)}
        onEdit={canEdit ? () => setDraft(document.content) : undefined}
      />
      <PlanPartsOutline
        plan={document.content}
        state={data.planParts}
        ticketId={data.ticket.id}
        canBuild={Boolean(data.capabilities?.canAskForCode) && move.kind !== 'working'}
        onAsked={onAsked}
      />
      <CommentableDocument
        source={document.content}
        comments={comments}
        canComment={Boolean(user && user.role !== 'viewer')}
        onApplySuggestion={onApplySuggestion}
      />
      <FullScreenReader
        open={fullScreen}
        onClose={() => setFullScreen(false)}
        title={<VersionTitle version={latest?.version ?? null} />}
        meta={
          <>
            {data.ticket.key} · {data.ticket.title} · <VersionByline revision={latest} updatedAt={document.updatedAt} />
          </>
        }
      >
        <CommentableDocument
          reading
          source={document.content}
          comments={comments}
          canComment={Boolean(user && user.role !== 'viewer')}
          onApplySuggestion={onApplySuggestion}
        />
      </FullScreenReader>
    </div>
  )
}
