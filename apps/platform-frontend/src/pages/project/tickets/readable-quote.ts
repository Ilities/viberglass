/** A quote from the markdown source as a reader sees it: without emphasis marks, code ticks or line markers. */
export function readableQuote(exact: string): string {
  return exact
    .replace(/\*\*|__|~~|`/g, '')
    .replace(/^\s*(?:#{1,6}\s+|[-*+]\s+|\d+[.)]\s+|>\s?)/gm, '')
    .trim()
}
