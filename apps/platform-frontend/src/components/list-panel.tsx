import { cn } from '@/lib/utils'
import { Fragment } from 'react'
import { Link } from './link'

/** A bordered list of rows, the shape of every list of tasks. */
export function ListPanel({ className, ...props }: React.ComponentPropsWithoutRef<'ul'>) {
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

/**
 * One row: an optional avatar, a badge above the title, the task's key and
 * title, a line under it, and the row's action on the right. The title's link
 * stretches over the whole row; the action sits above it and stays clickable,
 * and so must any control passed as `leading` (give it `relative z-10`).
 */
export function ListRow({
  leading,
  badge,
  taskKey,
  title,
  titleExtra,
  href,
  meta,
  action,
  label,
}: {
  leading?: React.ReactNode
  badge?: React.ReactNode
  taskKey?: string
  title: React.ReactNode
  titleExtra?: React.ReactNode
  href?: string
  meta?: React.ReactNode
  action?: React.ReactNode
  /** The row's accessible name, when its title alone doesn't say enough. */
  label?: string
}) {
  return (
    <li
      aria-label={label}
      className={cn(
        'relative flex items-center justify-between gap-4 px-5 py-4 max-sm:gap-2 max-sm:px-3',
        href && 'hover:bg-[var(--gray-2)]'
      )}
    >
      {leading && <div className="shrink-0">{leading}</div>}
      <div className="min-w-0 flex-1">
        {badge && <div className="mb-1">{badge}</div>}
        <p className="my-1 flex min-w-0 flex-wrap items-baseline gap-x-2 font-semibold text-[var(--gray-12)]">
          {taskKey && <span className="text-[11px] font-medium text-[var(--gray-10)]">{taskKey}</span>}
          {href ? (
            <Link href={href} className="min-w-0 after:absolute after:inset-0 after:content-['']">
              {title}
            </Link>
          ) : (
            <span className="min-w-0">{title}</span>
          )}
          {titleExtra}
        </p>
        {meta && <div className="mt-1 truncate text-xs text-[var(--gray-10)]">{meta}</div>}
      </div>
      {action && <div className="relative z-10 flex shrink-0 items-center gap-2">{action}</div>}
    </li>
  )
}

/** A row's line: its parts with a middle dot between them, the empty ones left out. */
export function MetaLine({ parts }: { parts: React.ReactNode[] }) {
  const shown = parts.filter((part) => part !== null && part !== undefined && part !== '' && part !== false)
  return (
    <>
      {shown.map((part, index) => (
        <Fragment key={index}>
          {index > 0 && <span aria-hidden> · </span>}
          <span>{part}</span>
        </Fragment>
      ))}
    </>
  )
}
