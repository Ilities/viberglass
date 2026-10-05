import { onTabListKeyDown } from '@/components/tab-button'
import { Button } from '@/components/button'
import { Textarea } from '@/components/textarea'
import {
  createPhaseDocumentComment,
  getPhaseDocumentComments,
  updatePhaseDocumentComment,
  type PhaseDocumentCommentResponse,
} from '@/service/api/ticket-api'
import type { TextQuote } from '@viberglass/types'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { CommentEntry, encodeSuggestion } from './phase-document-comment-entry'
import { readableQuote } from './readable-quote'

export type ApplySuggestion = (comment: PhaseDocumentCommentResponse, suggestedText: string) => Promise<void>

/** A document's comments, kept current as people add and resolve them. */
export function useDocumentComments(ticketId: string, phase: 'research' | 'planning' | null) {
  const [comments, setComments] = useState<PhaseDocumentCommentResponse[]>([])
  const [isSaving, setIsSaving] = useState(false)

  const reload = useCallback(async () => {
    if (!phase) return setComments([])
    try {
      setComments(await getPhaseDocumentComments(ticketId, phase))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load comments')
    }
  }, [ticketId, phase])

  useEffect(() => {
    void reload()
  }, [reload])

  const add = useCallback(
    async (quote: TextQuote, content: string): Promise<boolean> => {
      if (!phase) return false
      setIsSaving(true)
      try {
        await createPhaseDocumentComment(ticketId, phase, { quote, content })
        await reload()
        toast.success('Comment added')
        return true
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed to add comment')
        return false
      } finally {
        setIsSaving(false)
      }
    },
    [phase, reload, ticketId]
  )

  const toggleStatus = useCallback(
    async (comment: PhaseDocumentCommentResponse) => {
      if (!phase) return
      const status = comment.status === 'open' ? 'resolved' : 'open'
      setIsSaving(true)
      try {
        await updatePhaseDocumentComment(ticketId, phase, comment.id, { status })
        await reload()
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed to update comment')
      } finally {
        setIsSaving(false)
      }
    },
    [phase, reload, ticketId]
  )

  const openCount = comments.filter((comment) => comment.status === 'open').length
  return { comments, openCount, isSaving, reload, add, toggleStatus }
}

export type DocumentComments = ReturnType<typeof useDocumentComments>

/** Writes a comment on the selected text, or suggests new wording for it. */
export function CommentComposer({
  quote,
  isSaving,
  onSubmit,
  onCancel,
}: {
  quote: TextQuote
  isSaving: boolean
  onSubmit: (content: string) => Promise<boolean>
  onCancel: () => void
}) {
  const [mode, setMode] = useState<'comment' | 'suggestion'>('comment')
  const [comment, setComment] = useState('')
  const [suggestion, setSuggestion] = useState(quote.exact)
  const content = mode === 'comment' ? comment.trim() : suggestion

  return (
    <div className="space-y-2">
      <blockquote className="line-clamp-3 border-l-2 border-amber-400 pl-2 text-xs text-[var(--gray-10)]">{readableQuote(quote.exact)}</blockquote>
      <div role="tablist" aria-label="Comment or suggest" className="flex gap-1" onKeyDown={onTabListKeyDown}>
        {(['comment', 'suggestion'] as const).map((option) => (
          <button
            key={option}
            type="button"
            role="tab"
            aria-selected={mode === option}
            tabIndex={mode === option ? 0 : -1}
            onClick={() => setMode(option)}
            className={`rounded px-2 py-0.5 text-xs ${mode === option ? 'bg-[var(--accent-9)] text-white' : 'text-[var(--gray-10)] hover:text-[var(--gray-12)]'}`}
          >
            {option === 'comment' ? 'Comment' : 'Suggest a change'}
          </button>
        ))}
      </div>
      {mode === 'comment' ? (
        <Textarea autoFocus aria-label="Comment" value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Add a comment…" rows={3} />
      ) : (
        <Textarea autoFocus aria-label="Suggested wording" value={suggestion} onChange={(event) => setSuggestion(event.target.value)} rows={3} />
      )}
      <div className="flex justify-end gap-2">
        <Button outline onClick={onCancel}>
          Cancel
        </Button>
        <Button
          color="brand"
          disabled={isSaving || !content || (mode === 'suggestion' && suggestion === quote.exact)}
          onClick={() => void onSubmit(mode === 'comment' ? content : encodeSuggestion(suggestion))}
        >
          {isSaving ? 'Saving…' : 'Add comment'}
        </Button>
      </div>
    </div>
  )
}

/** Every comment on the document, open ones first, including those whose text has changed. */
export function CommentList({ comments, onApplySuggestion }: { comments: DocumentComments; onApplySuggestion: ApplySuggestion }) {
  const [showResolved, setShowResolved] = useState(false)
  const open = comments.comments.filter((comment) => comment.status === 'open')
  const resolved = comments.comments.filter((comment) => comment.status === 'resolved')

  return (
    <div className="space-y-6">
      <p className="text-sm text-[var(--gray-10)]">
        Select text in the document to comment on it or suggest new wording. Asking for changes sends the open comments to
        the agent.
      </p>
      {open.length === 0 ? (
        <p className="text-sm text-[var(--gray-10)]">No open comments.</p>
      ) : (
        <ul className="divide-y divide-[var(--gray-4)]">
          {open.map((comment) => (
            <li key={comment.id} className="py-3">
              <CommentEntry comment={comment} isSaving={comments.isSaving} showQuote onToggleStatus={comments.toggleStatus} onApplySuggestion={onApplySuggestion} />
            </li>
          ))}
        </ul>
      )}
      {resolved.length > 0 && (
        <div>
          <button type="button" onClick={() => setShowResolved((shown) => !shown)} className="text-xs text-[var(--gray-9)] hover:text-[var(--gray-12)]">
            {resolved.length} resolved · {showResolved ? 'Hide' : 'Show'}
          </button>
          {showResolved && (
            <ul className="mt-2 divide-y divide-[var(--gray-4)] opacity-70">
              {resolved.map((comment) => (
                <li key={comment.id} className="py-3">
                  <CommentEntry comment={comment} isSaving={comments.isSaving} showQuote onToggleStatus={comments.toggleStatus} />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
