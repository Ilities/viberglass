/** Elements the renderer marks with their source offsets. */
const SOURCE_PIECE = '[data-src-start]'

function pieceOf(node: Node | null, root: HTMLElement): HTMLElement | null {
  const element = node instanceof HTMLElement ? node : (node?.parentElement ?? null)
  const piece = element?.closest<HTMLElement>(SOURCE_PIECE) ?? null
  return piece && root.contains(piece) ? piece : null
}

function bounds(piece: HTMLElement): { start: number; end: number; exact: boolean } {
  return { start: Number(piece.dataset.srcStart), end: Number(piece.dataset.srcEnd), exact: piece.dataset.srcApprox === undefined }
}

/** The pieces inside an element, in document order. */
function piecesIn(element: Node): HTMLElement[] {
  return element instanceof HTMLElement ? [...element.querySelectorAll<HTMLElement>(SOURCE_PIECE)] : []
}

/**
 * One end of a selection as a source offset. A point inside a piece's text maps
 * exactly (or to the piece's edge when its text differs from its source); a
 * point between elements maps to the nearest piece on the selection's side.
 */
function pointToOffset(node: Node, offset: number, root: HTMLElement, edge: 'start' | 'end'): number | null {
  if (node.nodeType === Node.TEXT_NODE) {
    const piece = pieceOf(node, root)
    if (!piece) return null
    const { start, end, exact } = bounds(piece)
    if (!exact) return edge === 'start' ? start : end
    return Math.min(start + offset, end)
  }
  const children = [...node.childNodes]
  const after = children.slice(offset).flatMap((child) => (child instanceof HTMLElement && child.matches(SOURCE_PIECE) ? [child] : piecesIn(child)))
  const before = children.slice(0, offset).flatMap((child) => (child instanceof HTMLElement && child.matches(SOURCE_PIECE) ? [child] : piecesIn(child)))
  if (edge === 'start' && after[0]) return bounds(after[0]).start
  if (edge === 'end' && before.length > 0) return bounds(before[before.length - 1]).end
  const fallback = edge === 'start' ? before[before.length - 1] : after[0]
  return fallback ? (edge === 'start' ? bounds(fallback).end : bounds(fallback).start) : null
}

/**
 * The stretch of markdown source a selection in the rendered document covers,
 * trimmed of surrounding whitespace. Null when nothing in the document is selected.
 */
export function selectionToSource(range: Range, root: HTMLElement, source: string): { start: number; end: number } | null {
  if (range.collapsed || !root.contains(range.commonAncestorContainer)) return null
  let start = pointToOffset(range.startContainer, range.startOffset, root, 'start')
  let end = pointToOffset(range.endContainer, range.endOffset, root, 'end')
  if (start === null || end === null || end <= start) return null
  while (start < end && /\s/.test(source[start])) start++
  while (end > start && /\s/.test(source[end - 1])) end--
  return end > start ? { start, end } : null
}
