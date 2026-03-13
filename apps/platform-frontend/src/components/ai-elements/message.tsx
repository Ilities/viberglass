import { cn } from '@/lib/utils'
import type { ComponentPropsWithoutRef } from 'react'

/**
 * Message — clean prose display for agent messages.
 */
export function Message({ className, ...props }: ComponentPropsWithoutRef<'p'>) {
  return (
    <p
      className={cn('whitespace-pre-wrap break-words text-sm leading-relaxed text-[var(--gray-12)]', className)}
      {...props}
    />
  )
}
