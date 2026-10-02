import { quoteAt, type TextQuote } from '@viberglass/types'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { CommentComposer, type ApplySuggestion, type DocumentComments } from './document-comments'
import { MarkdownDocument } from './markdown/markdown-document'
import { selectionToSource } from './markdown/selectionToSource'
import { CommentEntry } from './phase-document-comment-entry'

type Placement = { top: number; left: number }

function placementBelow(rect: DOMRect, container: HTMLElement): Placement {
  const box = container.getBoundingClientRect()
  return { top: rect.bottom - box.top + 6, left: Math.max(0, rect.left - box.left) }
}

/** A card floating over the document, under what it's about. Escape or a click elsewhere closes it. */
function Popover({ label, placement, onClose, children }: { label: string; placement: Placement; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose()
    const onPointer = (event: MouseEvent) => {
      if (event.target instanceof Node && !ref.current?.contains(event.target) && !(event.target instanceof HTMLElement && event.target.closest('mark'))) onClose()
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onPointer)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onPointer)
    }
  }, [onClose])
  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={label}
      style={{ top: placement.top }}
      className="absolute right-0 left-0 z-20 mx-auto max-w-md space-y-3 rounded-lg border border-[var(--gray-6)] bg-[var(--gray-1)] p-4 shadow-lg"
    >
      {children}
    </div>
  )
}

interface CommentableDocumentProps {
  source: string
  comments: DocumentComments
  /** Viewers read comments but can't add them. */
  canComment: boolean
  onApplySuggestion: ApplySuggestion
}

/**
 * The rendered document with its open comments highlighted. Selecting
 * text offers to comment on it or suggest new wording; clicking a highlight
 * opens what was said about it.
 */
export function CommentableDocument({ source, comments, canComment, onApplySuggestion }: CommentableDocumentProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const documentRef = useRef<HTMLDivElement>(null)
  const [selection, setSelection] = useState<{ quote: TextQuote; placement: Placement; composing: boolean } | null>(null)
  const [thread, setThread] = useState<{ ids: string[]; placement: Placement } | null>(null)

  const located = comments.comments.filter((comment) => comment.status === 'open' && comment.location)
  const highlights = located.flatMap((comment) => (comment.location ? [{ id: comment.id, start: comment.location.start, end: comment.location.end }] : []))
  const threadComments = thread ? located.filter((comment) => thread.ids.includes(comment.id)) : []

  function captureSelection() {
    if (!canComment || selection?.composing || !documentRef.current || !containerRef.current) return
    const current = window.getSelection()
    const range = current && current.rangeCount > 0 ? current.getRangeAt(0) : null
    const span = range ? selectionToSource(range, documentRef.current, source) : null
    if (!range || !span) return setSelection(null)
    setThread(null)
    setSelection({ quote: quoteAt(source, span.start, span.end), placement: placementBelow(range.getBoundingClientRect(), containerRef.current), composing: false })
  }

  async function submit(content: string): Promise<boolean> {
    if (!selection) return false
    const added = await comments.add(selection.quote, content)
    if (added) {
      setSelection(null)
      window.getSelection()?.removeAllRanges()
    }
    return added
  }

  return (
    <div ref={containerRef} className="relative">
      <div ref={documentRef} onMouseUp={captureSelection} onKeyUp={captureSelection}>
        <MarkdownDocument
          source={source}
          highlights={highlights}
          activeHighlightId={thread?.ids[0] ?? null}
          onHighlightClick={(_id, element) => {
            if (!containerRef.current || window.getSelection()?.isCollapsed === false) return
            setSelection(null)
            setThread({ ids: (element.dataset.commentIds ?? '').split(' '), placement: placementBelow(element.getBoundingClientRect(), containerRef.current) })
          }}
        />
      </div>

      {selection && !selection.composing && (
        <button
          type="button"
          style={{ top: selection.placement.top, left: selection.placement.left }}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => setSelection({ ...selection, composing: true })}
          className="absolute z-10 rounded-md bg-[var(--accent-9)] px-2.5 py-1 text-xs font-medium text-white shadow"
        >
          Comment
        </button>
      )}

      {selection?.composing && (
        <Popover label="New comment" placement={selection.placement} onClose={() => setSelection(null)}>
          <CommentComposer quote={selection.quote} isSaving={comments.isSaving} onSubmit={submit} onCancel={() => setSelection(null)} />
        </Popover>
      )}

      {thread && threadComments.length > 0 && (
        <Popover label="Comments on this text" placement={thread.placement} onClose={() => setThread(null)}>
          {threadComments.map((comment) => (
            <CommentEntry
              key={comment.id}
              comment={comment}
              isSaving={comments.isSaving}
              onToggleStatus={async (target) => {
                await comments.toggleStatus(target)
                setThread(null)
              }}
              onApplySuggestion={canComment ? onApplySuggestion : undefined}
            />
          ))}
        </Popover>
      )}
    </div>
  )
}
