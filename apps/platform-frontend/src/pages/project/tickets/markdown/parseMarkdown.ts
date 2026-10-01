import type { Root } from 'mdast'
import { fromMarkdown } from 'mdast-util-from-markdown'
import { gfmFromMarkdown } from 'mdast-util-gfm'
import { gfm } from 'micromark-extension-gfm'

/** A document's markdown as a syntax tree whose nodes know their offsets in the source. */
export function parseMarkdown(source: string): Root {
  return fromMarkdown(source, { extensions: [gfm()], mdastExtensions: [gfmFromMarkdown()] })
}

/**
 * Where a node's text starts in the source, when the text is written there as
 * is. Escapes and entities (`\*`, `&amp;`) make the text differ from its
 * source; those nodes get null, and a selection in them snaps to the node's edges.
 */
export function textOffset(source: string, node: { position?: { start: { offset?: number }; end: { offset?: number } } }, value: string): number | null {
  const start = node.position?.start.offset
  const end = node.position?.end.offset
  if (start === undefined || end === undefined || value.length === 0) return null
  const at = source.slice(start, end).indexOf(value)
  return at === -1 ? null : start + at
}
