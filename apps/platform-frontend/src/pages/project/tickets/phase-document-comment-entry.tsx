import { Button } from '@/components/button'
import { usePersonName } from '@/hooks/usePeople'
import type { PhaseDocumentCommentResponse } from '@/service/api/ticket-api'
import { readableQuote } from './readable-quote'

export const SUGGESTION_PREFIX = '@@SUGGESTION@@\n'

export function decodeSuggestion(content: string): { isSuggestion: boolean; text: string } {
  if (content.startsWith(SUGGESTION_PREFIX)) return { isSuggestion: true, text: content.slice(SUGGESTION_PREFIX.length) }
  return { isSuggestion: false, text: content }
}

export function encodeSuggestion(text: string): string {
  return SUGGESTION_PREFIX + text
}

export interface CommentEntryProps {
  comment: PhaseDocumentCommentResponse
  isSaving: boolean
  /** Shows the text the comment is on, for lists away from the document. */
  showQuote?: boolean
  onToggleStatus: (comment: PhaseDocumentCommentResponse) => Promise<void>
  /** Replaces the quoted text with the suggestion; offered while the text is still in the document. */
  onApplySuggestion?: (comment: PhaseDocumentCommentResponse, suggestedText: string) => Promise<void>
}

export function CommentEntry({ comment, isSaving, showQuote = false, onToggleStatus, onApplySuggestion }: CommentEntryProps) {
  const { isSuggestion, text } = decodeSuggestion(comment.content)
  const personName = usePersonName()
  const quoted = comment.quote?.exact ?? ''

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--gray-9)]">
        <span>
          {personName(comment.actor) || 'Unknown reviewer'} · {new Date(comment.createdAt).toLocaleString()}
          {comment.outdated && <span className="ml-2 rounded bg-[var(--gray-4)] px-1.5 py-0.5 text-[var(--gray-11)]">Outdated: the text changed</span>}
        </span>
        <span className="flex items-center gap-2">
          {isSuggestion && onApplySuggestion && comment.status === 'open' && comment.location && (
            <Button color="green" onClick={() => void onApplySuggestion(comment, text).catch(() => undefined)} disabled={isSaving}>
              Apply suggestion
            </Button>
          )}
          <Button plain onClick={() => void onToggleStatus(comment)} disabled={isSaving}>
            {comment.status === 'open' ? 'Resolve' : 'Reopen'}
          </Button>
        </span>
      </div>

      {showQuote && !isSuggestion && quoted && (
        <blockquote className="line-clamp-3 border-l-2 border-amber-400 pl-2 text-xs text-[var(--gray-10)]">{readableQuote(quoted)}</blockquote>
      )}
      {isSuggestion ? (
        <div className="space-y-0.5 font-mono text-xs">
          <div className="rounded bg-red-50 px-3 py-1 whitespace-pre-wrap text-red-700 dark:bg-red-950/40 dark:text-red-300">- {quoted || ' '}</div>
          <div className="rounded bg-green-50 px-3 py-1 whitespace-pre-wrap text-green-700 dark:bg-green-950/40 dark:text-green-300">+ {text}</div>
        </div>
      ) : (
        <div className="text-sm whitespace-pre-wrap text-[var(--gray-11)]">{comment.content}</div>
      )}
    </div>
  )
}
