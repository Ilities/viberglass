import { cn } from '@/lib/utils'

/** A page's top: where you are, its title, one line on what it's for, and its main action on the right. */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: React.ReactNode
  title: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  className?: string
}) {
  return (
    <header className={cn('mb-7', className)}>
      {eyebrow && <p className="mb-3 text-xs text-[var(--gray-10)]">{eyebrow}</p>}
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h1 className="text-[28px] leading-tight font-bold tracking-[-0.025em] text-[var(--gray-12)]">{title}</h1>
          {description && <div className="mt-2 text-sm text-[var(--gray-10)]">{description}</div>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  )
}
