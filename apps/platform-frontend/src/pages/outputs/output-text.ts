import { taskPath } from '@/lib/taskPath'
import type { OutputItem, OutputKind, OutputReleaseStatus, OutputsSummary, PinTarget } from '@viberglass/types'

export const KIND_LABEL: Record<OutputKind, string> = {
  app: 'Apps',
  deck: 'Decks',
  doc: 'Docs',
  data: 'Data',
  pdf: 'PDFs',
  image: 'Images',
}

/** One item's kind, for a list row. */
export const KIND_SINGULAR: Record<OutputKind, string> = {
  app: 'App',
  deck: 'Deck',
  doc: 'Doc',
  data: 'Data',
  pdf: 'PDF',
  image: 'Image',
}

export const RELEASE_STATUS_LABEL: Record<OutputReleaseStatus, string> = {
  live: 'Live',
  building: 'Building',
  failed: 'Build failed',
  rolled_back: 'Rolled back',
  was_live: 'Was live',
  ready: "Didn't go live",
}

export function outputTitle(item: OutputItem): string {
  if (item.type === 'artifact') return item.title
  if (item.type === 'release') return item.spaceName
  return item.taskTitle
}

/** Where the item lives in the app: the artifact at this version, the App page, or the change's task. */
export function outputHref(item: OutputItem): string {
  if (item.type === 'artifact') return `/spaces/${item.spaceSlug}/artifacts/${item.artifactId}?version=${item.versionId}`
  if (item.type === 'release' || !item.taskId) return `/spaces/${item.spaceSlug}/app`
  return taskPath(item.spaceSlug, { id: item.taskId, key: item.taskKey ?? undefined })
}

/** The short label beside the space: a version number, a release's commit, or the change's task. */
export function outputLabel(item: OutputItem): string {
  if (item.type === 'artifact') return `v${item.number}`
  if (item.type === 'release') return item.commitSha.slice(0, 7)
  return item.taskKey ?? 'Change'
}

/** Why it's here, in a few words. */
export function outputReason(item: OutputItem): string {
  if (item.type === 'release') {
    const forTask = item.taskKey ? ` for ${item.taskKey}` : ''
    if (item.status === 'live') return `Live now${forTask}`
    if (item.status === 'building') return `Building${forTask}`
    if (item.status === 'failed') return `Build failed${forTask}`
    return `${RELEASE_STATUS_LABEL[item.status]}${forTask}`
  }
  if (item.type === 'preview') return item.state === 'failed' ? "Preview couldn't start" : 'Ready to try in a preview'
  if (item.expired) return 'No longer kept'
  if (item.producedBy.kind === 'person') return `Edited by ${item.producedBy.name ?? 'someone'}`
  const forTask = item.taskKey ? ` for ${item.taskKey}` : ''
  return item.number > 1 ? `New version from the agent${forTask}` : `Made by the agent${forTask}`
}

export type DateGroup = 'Today' | 'Yesterday' | 'This week' | 'Earlier'

export function dateGroup(createdAt: string, now: Date): DateGroup {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const at = new Date(createdAt).getTime()
  const day = 24 * 60 * 60 * 1000
  if (at >= startOfToday) return 'Today'
  if (at >= startOfToday - day) return 'Yesterday'
  if (at >= startOfToday - 6 * day) return 'This week'
  return 'Earlier'
}

/** Consecutive items under their date heading; items arrive newest first. */
export function groupByDate(items: OutputItem[], now: Date): Array<{ group: DateGroup; items: OutputItem[] }> {
  const groups: Array<{ group: DateGroup; items: OutputItem[] }> = []
  for (const item of items) {
    const group = dateGroup(item.createdAt, now)
    const last = groups[groups.length - 1]
    if (last?.group === group) last.items.push(item)
    else groups.push({ group, items: [item] })
  }
  return groups
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`

export function weekLine(week: OutputsSummary['week']): string {
  if (week.made === 0) return 'Nothing new this week.'
  const made = `${plural(week.made, 'thing', 'things')} made this week across ${plural(week.spaces, 'space', 'spaces')}`
  return week.releasesLive > 0 ? `${made} · ${plural(week.releasesLive, 'release', 'releases')} went live` : made
}

/** What pinning the item pins: the artifact, which then follows its latest version, or the app. A change in preview isn't pinned. */
export function outputPinTarget(item: OutputItem): PinTarget | null {
  if (item.type === 'artifact') return { kind: 'artifact', artifactId: item.artifactId }
  if (item.type === 'release') return { kind: 'app', spaceId: item.spaceId }
  return null
}
