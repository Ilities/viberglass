import type { ReactNode } from 'react'

/** A titled group of quiet label and value rows, as in a page's side column. */
export function FactList({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-[11px] font-semibold tracking-[0.12em] text-[var(--gray-10)] uppercase">{title}</h2>
      <dl className="mt-2">{children}</dl>
    </section>
  )
}

export function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-3 py-1.5 text-sm">
      <dt className="text-[var(--gray-9)]">{label}</dt>
      <dd className="min-w-0 break-words text-[var(--gray-12)]">{children}</dd>
    </div>
  )
}
