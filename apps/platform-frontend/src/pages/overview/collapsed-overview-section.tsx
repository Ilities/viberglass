import type { OverviewTask } from '@viberglass/types'
import { OverviewSection } from './overview-section'

/** Secondary work stays available without expanding every task by default. */
export function CollapsedOverviewSection({ id, title, tasks, empty }: { id: string; title: string; tasks: OverviewTask[]; empty: string }) {
  return (
    <details id={id} className="mb-6 border-b border-[var(--gray-5)] pb-4">
      <summary className="cursor-pointer text-sm font-medium text-[var(--gray-12)]">{title} <span className="text-[var(--gray-10)]">· {tasks.length}</span></summary>
      <div className="mt-4"><OverviewSection id={`${id}-list`} title={title} tasks={tasks} empty={empty} /></div>
    </details>
  )
}
