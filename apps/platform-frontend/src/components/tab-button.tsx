import { cn } from '@/lib/utils'
import type { ButtonHTMLAttributes, KeyboardEvent } from 'react'

export interface TabButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'> {
  active: boolean
  onClick: () => void
  children: React.ReactNode
  icon?: React.ReactNode
  className?: string
}

/**
 * A tab-styled button. Inside an element with `role="tablist"` pass `role="tab"`:
 * it then carries `aria-selected` and is the only tab in the Tab order, and
 * `onTabListKeyDown` on the list moves between tabs with the arrow keys.
 */
export function TabButton({ active, onClick, children, icon, className, role, ...rest }: TabButtonProps) {
  const isTab = role === 'tab'
  return (
    <button
      type="button"
      role={role}
      {...(isTab ? { 'aria-selected': active, tabIndex: active ? 0 : -1 } : {})}
      {...rest}
      onClick={onClick}
      className={cn(
        'relative flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-8)]',
        active ? 'text-[var(--accent-11)]' : 'text-[var(--gray-9)] hover:text-[var(--gray-11)]',
        className
      )}
    >
      {icon}
      {children}
      {active && <div className="absolute right-0 bottom-0 left-0 h-0.5 rounded-full bg-[var(--accent-9)]" />}
    </button>
  )
}

/** Arrow keys, Home and End move to a tab in the list and select it. */
export function onTabListKeyDown(event: KeyboardEvent<HTMLElement>) {
  const tabs = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[role="tab"]'))
  const current = tabs.findIndex((tab) => tab === document.activeElement)
  if (current < 0) return
  const next =
    event.key === 'ArrowRight' || event.key === 'ArrowDown'
      ? (current + 1) % tabs.length
      : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
        ? (current - 1 + tabs.length) % tabs.length
        : event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? tabs.length - 1
            : null
  if (next === null) return
  event.preventDefault()
  tabs[next].focus()
  tabs[next].click()
}
