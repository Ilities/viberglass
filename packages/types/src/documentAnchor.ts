/**
 * Where a comment sits in a plan document: the text it's on plus a
 * little context either side (the W3C "text quote selector"). A quote survives
 * edits that line numbers don't, and is found again in each new version of the
 * document; a comment whose text is gone is outdated, not lost.
 */
export interface TextQuote {
  exact: string
  prefix: string
  suffix: string
}

/** A quote found in a document's markdown source: `[start, end)` offsets and its 1-based line. */
export interface QuoteLocation {
  start: number
  end: number
  line: number
}

const CONTEXT_LENGTH = 32

/** The 1-based line an offset into the source falls on. */
export function lineAt(source: string, offset: number): number {
  let line = 1
  for (let index = 0; index < offset && index < source.length; index++) {
    if (source[index] === '\n') line++
  }
  return line
}

/** The quote for a stretch of the source, with context to tell repeats apart. */
export function quoteAt(source: string, start: number, end: number): TextQuote {
  return {
    exact: source.slice(start, end),
    prefix: source.slice(Math.max(0, start - CONTEXT_LENGTH), start),
    suffix: source.slice(end, end + CONTEXT_LENGTH),
  }
}

/** A whole line's text as a quote, for comments placed by line number. Null for a blank or missing line. */
export function quoteForLine(source: string, lineNumber: number): TextQuote | null {
  const lines = source.split('\n')
  const text = lines[lineNumber - 1]
  if (text === undefined || text.trim().length === 0) return null
  const lineStart = lines.slice(0, lineNumber - 1).reduce((offset, line) => offset + line.length + 1, 0)
  const start = lineStart + (text.length - text.trimStart().length)
  return quoteAt(source, start, start + text.trim().length)
}

function commonSuffixLength(a: string, b: string): number {
  let length = 0
  while (length < a.length && length < b.length && a[a.length - 1 - length] === b[b.length - 1 - length]) length++
  return length
}

function commonPrefixLength(a: string, b: string): number {
  let length = 0
  while (length < a.length && length < b.length && a[length] === b[length]) length++
  return length
}

/**
 * Finds a quote in a (possibly revised) document. Of several matches, the one
 * whose surroundings best match the quote's context wins, then the one nearest
 * `nearLine`. Null when the quoted text is no longer there.
 */
export function locateQuote(source: string, quote: TextQuote, nearLine?: number): QuoteLocation | null {
  if (!quote.exact) return null
  let best: { start: number; score: number; distance: number } | null = null
  for (let start = source.indexOf(quote.exact); start !== -1; start = source.indexOf(quote.exact, start + 1)) {
    const end = start + quote.exact.length
    const score =
      commonSuffixLength(source.slice(Math.max(0, start - quote.prefix.length), start), quote.prefix) +
      commonPrefixLength(source.slice(end, end + quote.suffix.length), quote.suffix)
    const distance = nearLine === undefined ? 0 : Math.abs(lineAt(source, start) - nearLine)
    if (!best || score > best.score || (score === best.score && distance < best.distance)) best = { start, score, distance }
  }
  if (!best) return null
  return { start: best.start, end: best.start + quote.exact.length, line: lineAt(source, best.start) }
}
