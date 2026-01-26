import { Badge } from '@/components/badge'
import { ClockIcon, CheckCircledIcon, CrossCircledIcon } from '@radix-ui/react-icons'
import { motion } from 'motion/react'

export type JobStatusType = 'queued' | 'active' | 'completed' | 'failed'

export interface JobStatusIndicatorProps {
  status: JobStatusType
  isPolling?: boolean
}

const statusConfig = {
  queued: {
    label: 'Queued',
    color: 'amber' as const,
    icon: ClockIcon,
  },
  active: {
    label: 'Running',
    color: 'blue' as const,
    icon: ClockIcon,
  },
  completed: {
    label: 'Completed',
    color: 'green' as const,
    icon: CheckCircledIcon,
  },
  failed: {
    label: 'Failed',
    color: 'red' as const,
    icon: CrossCircledIcon,
  },
} as const

/**
 * Animated job status indicator component.
 *
 * Shows the current job status with appropriate color, icon, and
 * animated pulse when the job is actively running and polling is enabled.
 */
export function JobStatusIndicator({ status, isPolling = false }: JobStatusIndicatorProps) {
  const { label, color, icon: Icon } = statusConfig[status]
  const shouldAnimate = status === 'active' && isPolling

  return (
    <Badge color={color}>
      <motion.div
        className="flex items-center gap-1"
        animate={shouldAnimate ? { opacity: [1, 0.5, 1] } : {}}
        transition={{ duration: 1.5, repeat: Infinity }}
      >
        <Icon className="h-4 w-4" data-slot="icon" />
        <span>{label}</span>
        {shouldAnimate && (
          <span className="ml-1 relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
          </span>
        )}
      </motion.div>
    </Badge>
  )
}
