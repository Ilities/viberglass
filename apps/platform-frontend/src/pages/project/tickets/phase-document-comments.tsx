import { Button } from '@/components/button'
import { Textarea } from '@/components/textarea'
import {
  createPhaseDocumentComment,
  getPhaseDocumentComments,
  updatePhaseDocumentComment,
  type PhaseDocumentCommentResponse,
} from '@/service/api/ticket-api'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'

const SUGGESTION_PREFIX = '@@SUGGESTION@@\n'

function encodeSuggestion(text: string) {
  return SUGGESTION_PREFIX + text
}

function decodeSuggestion(content: string): { isSuggestion: boolean; text: string } {
  if (content.startsWith(SUGGESTION_PREFIX))
    return { isSuggestion: true, text: content.slice(SUGGESTION_PREFIX.length) }
  return { isSuggestion: false, text: content }
}

interface PhaseDocumentCommentsProps {
  ticketId: string
  phase: 'research' | 'planning'
  content: string
  onApplySuggestion?: (lineNumber: number, suggestedText: string) => Promise<void>
}

export function PhaseDocumentComments({ ticketId, phase, content, onApplySuggestion }: PhaseDocumentCommentsProps) {
  const [comments, setComments] = useState<PhaseDocumentCommentResponse[]>([])
  const [isSaving, setIsSaving] = useState(false)
  const [activeLineNumber, setActiveLineNumber] = useState<number | null>(null)
  const lines = content.split('\n')
  const commentsByLine = groupCommentsByLine(comments)

  const loadComments = useCallback(async () => {
    try {
      const nextComments = await getPhaseDocumentComments(ticketId, phase)
      setComments(nextComments)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load comments')
    }
  }, [ticketId, phase])

  useEffect(() => {
    void loadComments()
  }, [loadComments])

  const onCreateComment = useCallback(
    async (lineNumber: number, commentContent: string): Promise<boolean> => {
      try {
        setIsSaving(true)
        await createPhaseDocumentComment(ticketId, phase, {
          lineNumber,
          content: commentContent,
        })
        await loadComments()
        toast.success(`Comment added to line ${lineNumber}`)
        setActiveLineNumber(null)
        return true
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed to add comment')
        return false
      } finally {
        setIsSaving(false)
      }
    },
    [loadComments, phase, ticketId],
  )

  const onToggleStatus = useCallback(
    async (comment: PhaseDocumentCommentResponse) => {
      const nextStatus = comment.status === 'open' ? 'resolved' : 'open'
      try {
        setIsSaving(true)
        await updatePhaseDocumentComment(ticketId, phase, comment.id, { status: nextStatus })
        await loadComments()
        toast.success(nextStatus === 'resolved' ? 'Comment resolved' : 'Comment reopened')
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed to update comment')
      } finally {
        setIsSaving(false)
      }
    },
    [loadComments, phase, ticketId],
  )

  const toggleLine = useCallback((lineNumber: number) => {
    setActiveLineNumber((prev) => (prev === lineNumber ? null : lineNumber))
  }, [])

  return (
    <div className="overflow-hidden rounded-lg border border-[var(--gray-6)] bg-[var(--gray-1)] font-mono text-sm">
      {lines.map((line, index) => {
        const lineNumber = index + 1
        return (
          <DocumentLine
            key={lineNumber}
            lineNumber={lineNumber}
            content={line}
            comments={commentsByLine.get(lineNumber) ?? []}
            formOpen={activeLineNumber === lineNumber}
            isSaving={isSaving}
            onToggleLine={toggleLine}
            onCreateComment={onCreateComment}
            onToggleStatus={onToggleStatus}
            onApplySuggestion={onApplySuggestion}
          />
        )
      })}
    </div>
  )
}

interface DocumentLineProps {
  lineNumber: number
  content: string
  comments: PhaseDocumentCommentResponse[]
  formOpen: boolean
  isSaving: boolean
  onToggleLine: (lineNumber: number) => void
  onCreateComment: (lineNumber: number, content: string) => Promise<boolean>
  onToggleStatus: (comment: PhaseDocumentCommentResponse) => Promise<void>
  onApplySuggestion?: (lineNumber: number, suggestedText: string) => Promise<void>
}

function DocumentLine({
  lineNumber,
  content,
  comments,
  formOpen,
  isSaving,
  onToggleLine,
  onCreateComment,
  onToggleStatus,
  onApplySuggestion,
}: DocumentLineProps) {
  const [draft, setDraft] = useState('')
  const [commentMode, setCommentMode] = useState<'comment' | 'suggestion'>('comment')
  const [suggestionDraft, setSuggestionDraft] = useState(content)
  const [showResolved, setShowResolved] = useState(false)

  useEffect(() => {
    if (commentMode === 'suggestion') {
      setSuggestionDraft(content)
    }
  }, [commentMode, content])

  const openComments = comments.filter((c) => c.status === 'open')
  const resolvedComments = comments.filter((c) => c.status === 'resolved')
  const openCount = openComments.length

  const handleSubmit = async () => {
    const commentContent = commentMode === 'suggestion' ? encodeSuggestion(suggestionDraft) : draft
    const success = await onCreateComment(lineNumber, commentContent)
    if (success) {
      setDraft('')
      setSuggestionDraft(content)
      setCommentMode('comment')
    }
  }

  const handleApply = async (comment: PhaseDocumentCommentResponse, suggestedText: string) => {
    try {
      await onApplySuggestion!(lineNumber, suggestedText)
      await onToggleStatus(comment)
    } catch {
      // onApplySuggestion already toasted the error; do nothing
    }
  }

  return (
    <div className="border-b border-[var(--gray-5)] last:border-b-0">
      {/* Line header — always visible, toggles the form */}
      <button
        type="button"
        onClick={() => onToggleLine(lineNumber)}
        className="flex w-full items-start py-1 text-left"
      >
        <span className="w-16 shrink-0 select-none bg-[var(--gray-2)] px-2 text-right text-xs text-[var(--gray-8)]">
          {lineNumber}
        </span>
        <span className="flex-1 break-words whitespace-pre-wrap px-3 text-[var(--gray-11)]">
          {content || ' '}
        </span>
        {openCount > 0 && (
          <span className="shrink-0 px-2 text-xs text-[var(--accent-9)]">{openCount} open</span>
        )}
      </button>

      {/* Open comments thread — always visible when there are open comments */}
      {openComments.length > 0 && (
        <div className="ml-16 space-y-3 border-l-4 border-[var(--accent-6)] bg-[var(--accent-2)] p-3">
          {openComments.map((comment) => (
            <CommentEntry
              key={comment.id}
              comment={comment}
              lineContent={content}
              isSaving={isSaving}
              onToggleStatus={onToggleStatus}
              onApplySuggestion={onApplySuggestion ? (suggestedText) => handleApply(comment, suggestedText) : undefined}
            />
          ))}

          {resolvedComments.length > 0 && (
            <>
              <button
                type="button"
                onClick={() => setShowResolved((v) => !v)}
                className="cursor-pointer text-xs text-[var(--gray-8)] hover:text-[var(--gray-11)]"
              >
                {resolvedComments.length} resolved · {showResolved ? 'Hide' : 'Show'}
              </button>
              {showResolved &&
                resolvedComments.map((comment) => (
                  <div key={comment.id} className="opacity-60">
                    <CommentEntry
                      comment={comment}
                      lineContent={content}
                      isSaving={isSaving}
                      onToggleStatus={onToggleStatus}
                      onApplySuggestion={undefined}
                    />
                  </div>
                ))}
            </>
          )}
        </div>
      )}

      {/* Inline form — only shown for the active line */}
      {formOpen && (
        <div className="ml-16 space-y-2 border-l-4 border-[var(--accent-6)] bg-[var(--gray-2)] p-3">
          {/* Mode tabs */}
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => setCommentMode('comment')}
              className={`rounded px-2 py-0.5 text-xs ${
                commentMode === 'comment'
                  ? 'bg-[var(--accent-9)] text-white'
                  : 'text-[var(--gray-9)] hover:text-[var(--gray-11)]'
              }`}
            >
              Comment
            </button>
            <button
              type="button"
              onClick={() => setCommentMode('suggestion')}
              className={`rounded px-2 py-0.5 text-xs ${
                commentMode === 'suggestion'
                  ? 'bg-[var(--accent-9)] text-white'
                  : 'text-[var(--gray-9)] hover:text-[var(--gray-11)]'
              }`}
            >
              Suggestion
            </button>
          </div>

          {commentMode === 'comment' ? (
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={`Comment on line ${lineNumber}...`}
              rows={3}
            />
          ) : (
            <div className="space-y-1">
              <div className="rounded bg-red-50 px-3 py-1.5 font-mono text-xs text-red-700">
                - {content || ' '}
              </div>
              <Textarea
                value={suggestionDraft}
                onChange={(e) => setSuggestionDraft(e.target.value)}
                placeholder="Suggested replacement..."
                rows={3}
              />
              <div className="text-xs text-[var(--gray-8)]">Suggestion</div>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button
              plain
              onClick={() => {
                onToggleLine(lineNumber)
                setDraft('')
                setSuggestionDraft(content)
                setCommentMode('comment')
              }}
            >
              Cancel
            </Button>
            <Button
              color="brand"
              onClick={() => void handleSubmit()}
              disabled={isSaving || (commentMode === 'comment' ? !draft.trim() : !suggestionDraft.trim())}
            >
              {isSaving ? 'Saving...' : 'Add Comment'}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

interface CommentEntryProps {
  comment: PhaseDocumentCommentResponse
  lineContent: string
  isSaving: boolean
  onToggleStatus: (comment: PhaseDocumentCommentResponse) => Promise<void>
  onApplySuggestion?: (suggestedText: string) => void
}

function CommentEntry({ comment, lineContent, isSaving, onToggleStatus, onApplySuggestion }: CommentEntryProps) {
  const { isSuggestion, text } = decodeSuggestion(comment.content)

  return (
    <div>
      <div className="flex items-center justify-between gap-2 text-xs text-[var(--gray-9)]">
        <span>
          {comment.actor || 'Unknown reviewer'} · {new Date(comment.createdAt).toLocaleString()}
        </span>
        <div className="flex items-center gap-2">
          {isSuggestion && onApplySuggestion && comment.status === 'open' && (
            <Button color="green" onClick={() => onApplySuggestion(text)} disabled={isSaving}>
              Apply Suggestion
            </Button>
          )}
          <Button plain onClick={() => void onToggleStatus(comment)} disabled={isSaving}>
            {comment.status === 'open' ? 'Resolve' : 'Reopen'}
          </Button>
        </div>
      </div>

      {isSuggestion ? (
        <div className="mt-1 space-y-0.5 font-mono text-xs">
          <div className="rounded bg-red-50 px-3 py-1 text-red-700">- {lineContent || ' '}</div>
          <div className="rounded bg-green-50 px-3 py-1 text-green-700">+ {text}</div>
        </div>
      ) : (
        <div className="mt-1 whitespace-pre-wrap font-sans text-sm text-[var(--gray-11)]">{comment.content}</div>
      )}
    </div>
  )
}

function groupCommentsByLine(comments: PhaseDocumentCommentResponse[]): Map<number, PhaseDocumentCommentResponse[]> {
  const grouped = new Map<number, PhaseDocumentCommentResponse[]>()
  for (const comment of comments) {
    const existing = grouped.get(comment.lineNumber)
    if (existing) {
      existing.push(comment)
      continue
    }
    grouped.set(comment.lineNumber, [comment])
  }
  return grouped
}
