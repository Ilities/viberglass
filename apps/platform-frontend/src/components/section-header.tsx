import { Badge } from './badge'

/** A section's title, with how many it holds when that matters, and a quiet line on the right saying what's in it. */
export function SectionHeader({
  title,
  count,
  hint,
  id,
}: {
  title: string
  count?: number
  hint?: React.ReactNode
  id?: string
}) {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
      <h2 id={id} className="flex items-center gap-2 text-base font-semibold text-[var(--gray-12)]">
        {title}
        {count !== undefined && <Badge color="amber">{count}</Badge>}
      </h2>
      {hint && <p className="text-xs text-[var(--gray-10)]">{hint}</p>}
    </div>
  )
}
