/** The line under a space's tabs: what the page shows, and its main action. */
export function SpacePageBar({ description, actions }: { description?: React.ReactNode; actions?: React.ReactNode }) {
  if (!description && !actions) return null
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
      <div className="min-w-0 text-sm text-[var(--gray-10)]">{description}</div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}
