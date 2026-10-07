import type { DocumentHighlight } from './markdown/markdown-document'
import { diffLines, diffWords, type DiffLine } from './line-diff'

export interface DocumentComparison {
  /** The current version's markdown with the removed words put back where they were. */
  source: string
  /** The removed and added stretches of `source`. */
  highlights: DocumentHighlight[]
  changed: boolean
}

/**
 * Two versions of a document as one, to read rendered: lines are compared
 * first, then the words of the lines that changed, so changing one word marks
 * that word rather than its paragraph.
 */
export function compareDocuments(before: string, after: string): DocumentComparison {
  const lines = diffLines(before, after)
  let source = ''
  const highlights: DocumentHighlight[] = []

  const append = (piece: DiffLine) => {
    if (piece.kind === 'added' && /\S$/.test(source) && /^\S/.test(piece.text) && highlights.at(-1)?.end === source.length) {
      // A removed word right before an added one needs a space between them.
      source += ' '
    }
    const start = source.length
    source += piece.text
    if (piece.kind === 'same' || !piece.text.trim()) return
    const last = highlights.at(-1)
    // Words changed together read as one change, spaces and all.
    if (last?.tone === piece.kind && !source.slice(last.end, start).trim()) last.end = source.length
    else highlights.push({ id: `${piece.kind}-${start}`, start, end: source.length, tone: piece.kind })
  }

  let index = 0
  while (index < lines.length) {
    if (lines[index].kind === 'same') {
      append(lines[index])
      source += '\n'
      index++
      continue
    }
    const removed: string[] = []
    const added: string[] = []
    while (index < lines.length && lines[index].kind !== 'same') {
      const line = lines[index++]
      ;(line.kind === 'removed' ? removed : added).push(line.text)
    }
    diffWords(removed.join('\n'), added.join('\n')).forEach(append)
    source += '\n'
  }

  return { source, highlights, changed: lines.some((line) => line.kind !== 'same') }
}
