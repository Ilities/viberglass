import { cn } from '@/lib/utils'

export interface TabButtonProps {
  active: boolean
  onClick: () => void
  children: React.ReactNode
  icon?: React.ReactNode
  className?: string
}

/**
 * TabButton - A reusable tab navigation button component.
 * 
 * Provides consistent tab styling with an optional icon, active state indicator,
 * and hover effects. Used for tabbed interfaces in detail pages.
 * 
 * @example
 * <TabButton 
 *   active={activeTab === 'overview'} 
 *   onClick={() => setActiveTab('overview')}
 *   icon={<FileTextIcon className="h-4 w-4" />}
 * >
 *   Overview
 * </TabButton>
 */
export function TabButton({ active, onClick, children, icon, className }: TabButtonProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors relative",
        active 
          ? "text-[var(--accent-11)]" 
          : "text-[var(--gray-9)] hover:text-[var(--gray-11)]",
        className
      )}
    >
      {icon}
      {children}
      {active && (
        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[var(--accent-9)] rounded-full" />
      )}
    </button>
  )
}
