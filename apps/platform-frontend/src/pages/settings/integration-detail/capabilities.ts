import type { TicketSystem } from '@viberglass/types'

export interface IntegrationDetailCapabilities {
  supportsInboundWebhooks: boolean
  supportsOutboundWebhooks: boolean
  showCustomInboundPayloadHelp: boolean
}

const DEFAULT_CAPABILITIES: IntegrationDetailCapabilities = {
  supportsInboundWebhooks: false,
  supportsOutboundWebhooks: false,
  showCustomInboundPayloadHelp: false,
}

const INTEGRATION_CAPABILITIES: Partial<Record<TicketSystem, IntegrationDetailCapabilities>> = {
  github: {
    supportsInboundWebhooks: true,
    supportsOutboundWebhooks: true,
    showCustomInboundPayloadHelp: false,
  },
  jira: {
    supportsInboundWebhooks: true,
    supportsOutboundWebhooks: true,
    showCustomInboundPayloadHelp: false,
  },
  shortcut: {
    supportsInboundWebhooks: true,
    supportsOutboundWebhooks: true,
    showCustomInboundPayloadHelp: false,
  },
  custom: {
    supportsInboundWebhooks: true,
    supportsOutboundWebhooks: true,
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
