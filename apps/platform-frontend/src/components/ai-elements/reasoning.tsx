import { cn } from '@/lib/utils'
import type { ComponentPropsWithoutRef } from 'react'

interface ReasoningProps extends ComponentPropsWithoutRef<'details'> {
  title?: string
  defaultOpen?: boolean
}

/**
 * Reasoning — collapsible block for displaying agent thinking/reasoning.
 * Starts collapsed by default (auto-collapsed when reasoning is complete).
 */
export function Reasoning({
  className,
  title = 'Reasoning',
  defaultOpen = false,
  children,
  ...props
}: ReasoningProps) {
  return (
    <details
      open={defaultOpen}
      className={cn(
        'group rounded-lg border border-[var(--gray-6)] bg-[var(--gray-2)] px-3 py-2 text-sm text-[var(--gray-11)]',
        className,
      )}
      {...props}
    >
      <summary className="cursor-pointer list-none select-none font-medium text-[var(--gray-11)] marker:content-none after:ml-2 after:text-[10px] after:text-[var(--gray-9)] after:content-['(expand)'] group-open:after:content-['(collapse)']">
        <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-[var(--accent-9)] align-middle opacity-60" />
        {title}
      </summary>
      <div className="mt-2 whitespace-pre-wrap break-words text-[13px] leading-relaxed text-[var(--gray-12)]">
        {children}
      </div>
    </details>
  )
}
