import { cn } from '@/lib/utils'

export interface InfoItemProps {
  icon: React.ReactNode
  label: string
  value: React.ReactNode
  className?: string
}

/**
 * InfoItem - A reusable component for displaying label-value pairs with an icon.
 * 
 * Used in detail pages to show structured information like:
 * - Job details (ID, repository, branch)
 * - Execution metadata (timestamps, duration)
 * - Status information
 * 
 * @example
 * <InfoItem 
 *   icon={<CubeIcon className="h-4 w-4" />}
 *   label="Repository"
 *   value="github.com/user/repo"
 * />
 */
export function InfoItem({ icon, label, value, className }: InfoItemProps) {
  return (
    <div className={cn("flex items-start gap-3 py-3", className)}>
      <div className="mt-0.5 flex h-5 w-5 items-center justify-center text-[var(--gray-8)]">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium uppercase tracking-wider text-[var(--gray-9)]">
          {label}
        </div>
        <div className="mt-0.5 text-sm font-medium text-[var(--gray-12)] truncate">
          {value}
        </div>
      </div>
    </div>
  )
}
