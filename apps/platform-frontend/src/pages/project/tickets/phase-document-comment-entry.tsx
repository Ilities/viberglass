import { Button } from '@/components/button'
import type { PhaseDocumentCommentResponse } from '@/service/api/ticket-api'

export const SUGGESTION_PREFIX = '@@SUGGESTION@@\n'

export function decodeSuggestion(content: string): { isSuggestion: boolean; text: string } {
  if (content.startsWith(SUGGESTION_PREFIX))
    return { isSuggestion: true, text: content.slice(SUGGESTION_PREFIX.length) }
  return { isSuggestion: false, text: content }
}

export interface CommentEntryProps {
  comment: PhaseDocumentCommentResponse
  lineContent: string
  isSaving: boolean
  onToggleStatus: (comment: PhaseDocumentCommentResponse) => Promise<void>
  onApplySuggestion?: (suggestedText: string) => void
  onSendToSession?: () => void
}

export function CommentEntry({
  comment,
  lineContent,
  isSaving,
  onToggleStatus,
  onApplySuggestion,
  onSendToSession,
}: CommentEntryProps) {
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
          {onSendToSession && comment.status === 'open' && (
            <Button plain onClick={onSendToSession} disabled={isSaving}>
              → Session
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
