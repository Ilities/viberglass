import { planParts } from '@viberglass/types'

/** The parts a plan is built in, each one pull request; nothing for a plan that's one part. */
export function PlanPartsOutline({ plan }: { plan: string }) {
  const parts = planParts(plan)
  if (parts.length < 2) return null
  return (
    <nav aria-label="Parts" className="mb-4 rounded-lg border border-[var(--gray-5)] px-4 py-3">
      <p className="text-sm font-medium text-[var(--gray-12)]">Built in {parts.length} parts, one pull request each</p>
      <ol className="mt-2 space-y-1 text-sm text-[var(--gray-11)]">
        {parts.map((part) => (
          <li key={`${part.number}:${part.title ?? ''}`}>
            <span className="text-[var(--gray-10)]">Part {part.number}</span>
            {part.title && <> · {part.title}</>}
          </li>
        ))}
      </ol>
    </nav>
  )
}
