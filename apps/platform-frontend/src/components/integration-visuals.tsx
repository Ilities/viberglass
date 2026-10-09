import { integrationFrontendRegistry } from '@/integrations/registerFrontendIntegrationPlugins'
import { CheckCircledIcon, CircleIcon, ExclamationTriangleIcon } from '@radix-ui/react-icons'
import type { IntegrationCategory, IntegrationConfigStatus, TicketSystem } from '@viberglass/types'
import type { ComponentType } from 'react'

export type IntegrationIconComponent = ComponentType<{ className?: string }>

const INTEGRATION_STATUS_CONFIG: Record<
  IntegrationConfigStatus,
  {
    icon: IntegrationIconComponent
    label: string
    color: 'green' | 'zinc' | 'amber'
  }
> = {
  configured: {
    icon: CheckCircledIcon,
    label: 'Connected',
    color: 'green',
  },
  not_configured: {
    icon: CircleIcon,
    label: 'Not set up',
    color: 'zinc',
  },
  stub: {
    icon: ExclamationTriangleIcon,
    label: 'Coming soon',
    color: 'amber',
  },
}

const INTEGRATION_CATEGORY_CONFIG: Record<
  IntegrationCategory,
  {
    label: string
    color: 'blue' | 'teal' | 'purple' | 'pink'
  }
> = {
  scm: {
    label: 'Code host',
    color: 'blue',
  },
  inbound: {
    label: 'Webhook',
    color: 'teal',
  },
  ticketing: {
    label: 'Issue tracker',
    color: 'purple',
  },
  chat: {
    label: 'Chat',
    color: 'pink',
  },
}

export function getIntegrationIcon(integrationId?: TicketSystem): IntegrationIconComponent {
  return (integrationId && integrationFrontendRegistry.get(integrationId)?.Icon) || CircleIcon
}

export function getIntegrationStatusConfig(configStatus: IntegrationConfigStatus) {
  return INTEGRATION_STATUS_CONFIG[configStatus]
}

export function getIntegrationCategoryConfig(category: IntegrationCategory) {
  return INTEGRATION_CATEGORY_CONFIG[category]
}
