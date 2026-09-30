import type { ReactNode } from 'react'

interface EmptyStateProps {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-6 text-center dark:border-zinc-700 dark:bg-zinc-900">
      {icon && <div className="text-[var(--gray-8)]">{icon}</div>}
      <div>
        <p className="text-sm font-medium text-[var(--gray-11)]">{title}</p>
        {description && <p className="mt-1 text-sm text-[var(--gray-9)]">{description}</p>}
      </div>
      {action && <div className="mt-1">{action}</div>}
    </div>
  )
}
