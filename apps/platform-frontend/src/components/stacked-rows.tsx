import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'
import { Link } from './link'

/** A table's rows as cards, for screens too narrow for its columns. */
export function StackedRows({ className, ...props }: React.ComponentPropsWithoutRef<'ul'>) {
  return (
    <ul
      className={cn(
        'divide-y divide-[var(--gray-5)] overflow-hidden rounded-[9px] border border-[var(--gray-5)] bg-[var(--color-panel-solid)]',
        className
      )}
      {...props}
    />
  )
}

export interface StackedFact {
  label: string
  value: ReactNode
  /** Takes the card's full width, for a value too long for half of it. */
  wide?: boolean
}

/**
 * One row: its title, a line under it, then each column as a label over its
 * value, two to a line. The title's link stretches over the card; `action`
 * sits above it and stays clickable.
 */
export function StackedRow({
  title,
  subtitle,
  href,
  action,
  facts,
}: {
  title: ReactNode
  subtitle?: ReactNode
  href?: string
  action?: ReactNode
  facts: StackedFact[]
}) {
  return (
    <li className={cn('relative px-4 py-3', href && 'hover:bg-[var(--gray-2)]')}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium break-words text-[var(--gray-12)]">
            {href ? (
              <Link href={href} className="after:absolute after:inset-0 after:content-['']">
                {title}
              </Link>
            ) : (
              title
            )}
          </p>
          {subtitle && <p className="text-xs break-words text-[var(--gray-10)]">{subtitle}</p>}
        </div>
        {action && <div className="relative z-10 flex shrink-0 items-center gap-1">{action}</div>}
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2">
        {facts.map((fact) => (
          <div key={fact.label} className={cn('min-w-0', fact.wide && 'col-span-2')}>
            <dt className="text-xs text-[var(--gray-10)]">{fact.label}</dt>
            <dd className="text-sm break-words text-[var(--gray-12)]">{fact.value}</dd>
          </div>
        ))}
      </dl>
    </li>
  )
}
