/** The views of a run, shared by the run page and a task's run lines. */
export type RunTab = 'activity' | 'prompt' | 'log' | 'record'

/** `?runTab=` opens a run on a given view; Record is admin only, so others land on Activity. */
export function resolveRunTab(value: string | null | undefined, isAdmin: boolean): RunTab {
  if (value === 'prompt' || value === 'log') return value
  if (value === 'record' && isAdmin) return 'record'
  return 'activity'
}
