/**
 * A part of a plan: a `## Part N: <title>` section, sized to be built and
 * reviewed as one pull request.
 */
export interface PlanPart {
  number: number
  /** Null when the heading has none, and for a plan written without parts, which is one part. */
  title: string | null
  /** The section's text under its heading. */
  body: string
}

const PART_HEADING = /^##\s+Part\s+(\d+)\b\s*[:.–—-]?\s*(.*?)\s*#*\s*$/i
const HEADING = /^#{1,2}\s/
const FENCE = /^\s*(```|~~~)/

/**
 * The parts of a plan, in the order they're written. A plan without part
 * headings is one part. A part ends at the next heading of its level or
 * above, so sections after the parts (such as how to test) aren't in the last part.
 */
export function planParts(markdown: string): PlanPart[] {
  const lines = markdown.split('\n')
  const parts: Array<{ number: number; title: string; lines: string[] }> = []
  let current: (typeof parts)[number] | null = null
  let fence: string | null = null

  for (const line of lines) {
    const fenceMark = FENCE.exec(line)?.[1] ?? null
    if (fenceMark && (fence === null || fence === fenceMark)) fence = fence === null ? fenceMark : null
    const inFence = fence !== null || fenceMark !== null
    const heading = inFence ? null : PART_HEADING.exec(line)
    if (heading) {
      current = { number: Number(heading[1]), title: heading[2] ?? '', lines: [] }
      parts.push(current)
    } else if (!inFence && HEADING.test(line)) {
      current = null
    } else if (current) {
      current.lines.push(line)
    }
  }

  if (parts.length === 0) return markdown.trim() ? [{ number: 1, title: null, body: markdown.trim() }] : []
  return parts.map((part) => ({ number: part.number, title: part.title || null, body: part.lines.join('\n').trim() }))
}
