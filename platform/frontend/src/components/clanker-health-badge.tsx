import { Badge } from '@/components/badge'
import { CheckCircleIcon, QuestionMarkCircleIcon, XCircleIcon } from '@heroicons/react/20/solid'
import type { ClankerHealthStatus } from '@viberglass/types'

const healthConfig = {
  healthy: {
    label: 'Healthy',
    color: 'green' as const,
    icon: CheckCircleIcon,
  },
  unhealthy: {
    label: 'Unhealthy',
    color: 'red' as const,
    icon: XCircleIcon,
  },
  unknown: {
    label: 'Unknown',
    color: 'zinc' as const,
    icon: QuestionMarkCircleIcon,
  },
} as const

export interface ClankerHealthBadgeProps {
  health: ClankerHealthStatus
  showChecks?: boolean // Show detailed checks in a tooltip
}

/**
 * Clanker health status badge component.
 *
 * Shows the current health status with appropriate color and icon.
 * Can optionally show detailed health checks.
 */
export function ClankerHealthBadge({ health, showChecks = false }: ClankerHealthBadgeProps) {
  const { label, color, icon: Icon } = healthConfig[health.status]

  return (
    <Badge color={color}>
      <Icon className="h-4 w-4" />
      <span>{label}</span>
    </Badge>
  )
}
