/** The views of a run, shared by the run page and a task's run lines. */
export type RunTab = 'activity' | 'prompt' | 'log' | 'record'

/** `?runTab=` opens a run on a given view; otherwise it opens on the log. */
export function resolveRunTab(value: string | null | undefined): RunTab {
  if (value === 'prompt' || value === 'activity' || value === 'record') return value
  return 'log'
}
