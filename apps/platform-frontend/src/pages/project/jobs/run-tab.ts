/** The views of a run, shared by the run page and a task's run lines. */
export type RunTab = 'activity' | 'prompt' | 'log' | 'record'

/** `?runTab=` opens a run on a given view; otherwise, and for Record unless you're an admin, it opens on the log. */
export function resolveRunTab(value: string | null | undefined, isAdmin: boolean): RunTab {
  if (value === 'prompt' || value === 'activity') return value
  if (value === 'record' && isAdmin) return 'record'
  return 'log'
}
