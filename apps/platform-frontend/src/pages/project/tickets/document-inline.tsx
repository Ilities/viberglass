import type { ReactNode } from 'react'

// Code first, so `**` inside backticks stays literal. Underscores only count
// at word edges, as in CommonMark, so snake_case names stay as written.
const INLINE_TOKEN = /(`[^`]+`)|(\*\*[^*]+\*\*|(?<!\w)__[^_]+__(?!\w))|(\*[^*\s][^*]*\*|(?<!\w)_[^_\s][^_]*_(?!\w))/g

/** Inline markdown for one line of a document: code, bold and italic. */
export function renderInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = []
  let last = 0
  for (const match of text.matchAll(INLINE_TOKEN)) {
    const index = match.index ?? 0
    if (index > last) nodes.push(text.slice(last, index))
    const [token, code, bold] = match
    if (code) {
      nodes.push(
        <code key={index} className="rounded bg-[var(--gray-3)] px-1 font-mono text-[0.9em]">
          {token.slice(1, -1)}
        </code>
      )
    } else if (bold) {
      nodes.push(<strong key={index}>{renderInline(token.slice(2, -2))}</strong>)
    } else {
      nodes.push(<em key={index}>{token.slice(1, -1)}</em>)
    }
    last = index + token.length
  }
  if (last < text.length) nodes.push(text.slice(last))
  return nodes
}
