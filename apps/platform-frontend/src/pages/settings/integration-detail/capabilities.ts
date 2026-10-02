import type { TicketSystem } from '@viberglass/types'

export interface IntegrationDetailCapabilities {
  supportsInboundWebhooks: boolean
  showCustomInboundPayloadHelp: boolean
}

const DEFAULT_CAPABILITIES: IntegrationDetailCapabilities = {
  supportsInboundWebhooks: false,
  showCustomInboundPayloadHelp: false,
}

const INTEGRATION_CAPABILITIES: Partial<Record<TicketSystem, IntegrationDetailCapabilities>> = {
  github: {
    supportsInboundWebhooks: true,
    showCustomInboundPayloadHelp: false,
  },
  jira: {
    supportsInboundWebhooks: true,
    showCustomInboundPayloadHelp: false,
  },
  shortcut: {
    supportsInboundWebhooks: true,
    showCustomInboundPayloadHelp: false,
  },
  custom: {
    supportsInboundWebhooks: true,
    showCustomInboundPayloadHelp: true,
  },
}

export function getIntegrationDetailCapabilities(
  integrationId?: TicketSystem
): IntegrationDetailCapabilities {
  if (!integrationId) {
    return DEFAULT_CAPABILITIES
  }

  return INTEGRATION_CAPABILITIES[integrationId] || DEFAULT_CAPABILITIES
}
