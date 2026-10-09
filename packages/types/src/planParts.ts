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

/** The parts a build covers: from `first` through `last`, or through the plan's last part when `last` is null. */
export interface PartRange {
  first: number
  last: number | null
}

export function isPartRange(value: unknown): value is PartRange {
  if (typeof value !== 'object' || value === null || !('first' in value) || !('last' in value)) return false
  const { first, last } = value
  return Number.isInteger(first) && Number(first) >= 1 && (last === null || (Number.isInteger(last) && Number(last) >= Number(first)))
}

/**
 * Where a part stands: from its pull request, never from the plan's text, or
 * from someone marking it done or skipped when that's known some other way.
 */
export type TaskPlanPartStatus = 'not_built' | 'building' | 'open' | 'merged' | 'done' | 'skipped'

/** What someone can mark a part instead of merging its pull request. */
export type TaskPlanPartMark = 'done' | 'skipped'

export function isTaskPlanPartMark(value: unknown): value is TaskPlanPartMark {
  return value === 'done' || value === 'skipped'
}

/** A part counts as finished, for building in order and closing the task, once merged, done or skipped. */
export function isPartFinished(status: TaskPlanPartStatus): boolean {
  return status === 'merged' || status === 'done' || status === 'skipped'
}

export interface TaskPlanPart {
  number: number
  title: string | null
  status: TaskPlanPartStatus
  /** The pull request that builds it, once there is one. */
  pullRequestUrl: string | null
}

/** A task's plan, part by part, and what can be built next. */
export interface TaskPlanParts {
  parts: TaskPlanPart[]
  /** The parts a pull request that isn't merged or marked finished yet builds; further builds go into it. */
  open: PartRange | null
  /** The part the open pull request could take next, built into it rather than one of its own. */
  addable: number | null
  /** The first part that isn't built, when nothing is open; null when every part is built. */
  next: number | null
}

/** "part 2", "parts 2–3", "parts 2 to the end", or "the plan" for a range from part 1 to the end. */
export function partRangeName(range: PartRange): string {
  if (range.last === null) return range.first === 1 ? 'the plan' : `parts ${range.first} to the end`
  return range.first === range.last ? `part ${range.first}` : `parts ${range.first}–${range.last}`
}

/** What asking for a build of these parts says in the thread: "Build part 2", "Build the rest". */
export function buildPartsMessage(range: PartRange): string {
  if (range.last === null) return range.first === 1 ? 'Build it' : 'Build the rest'
  return `Build ${partRangeName(range)}`
}

/** What adding a part to the open pull request says in the thread. */
export function addPartMessage(part: number): string {
  return `Add part ${part} to the open pull request`
}

/**
 * The build to offer next: a plan in one part, or none, is built as a whole;
 * a plan in parts, its next part on its own, once nothing is open. A build
 * that stopped before opening its pull request is offered again, on its branch.
 */
export function nextBuild(state: TaskPlanParts): { label: string; parts?: PartRange } | null {
  if (state.parts.length <= 1) return { label: 'Build it' }
  const open = state.open
  if (open) {
    const unopened = state.parts.some((part) => part.status === 'building' && part.number >= open.first && (open.last === null || part.number <= open.last))
    return unopened ? { label: `${buildPartsMessage(open)} again`, parts: open } : null
  }
  if (state.next === null) return null
  const parts = { first: state.next, last: state.next }
  return { label: buildPartsMessage(parts), parts }
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
