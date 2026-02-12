import { cn } from '@/lib/utils'

export interface SectionProps {
  title: string
  children: React.ReactNode
  className?: string
  titleClassName?: string
}

/**
 * Section - A reusable container component for grouping related content.
 * 
 * Provides a consistent section header with uppercase, tracking-wide styling
 * and a content area. Commonly used in sidebar panels and detail views.
 * 
 * @example
 * <Section title="Job Information">
 *   <InfoItem icon={<Icon />} label="ID" value="123" />
 *   <InfoItem icon={<Icon />} label="Name" value="Test" />
 * </Section>
 */
export function Section({ title, children, className, titleClassName }: SectionProps) {
  return (
    <div className={cn("mb-6", className)}>
      <h3 className={cn(
        "text-xs font-semibold uppercase tracking-wider text-[var(--gray-9)] mb-2 px-1",
        titleClassName
      )}>
        {title}
      </h3>
      <div className="space-y-0">
        {children}
      </div>
    </div>
  )
}
