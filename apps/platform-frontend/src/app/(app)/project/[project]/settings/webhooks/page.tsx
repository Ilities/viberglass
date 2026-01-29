import { getProjectIntegrations } from '@/service/api/integration-api'
import type { IntegrationSummary } from '@viberglass/types'
import { WebhookSettingsClient } from './webhook-settings-client'

export const generateStaticParams = async () => {
  return []
}

export default async function WebhookSettingsPage({ params }: { params: Promise<{ project: string }> }) {
  const { project } = await params
  let integrations: IntegrationSummary[] = []
  let integrationsLoadError: string | null = null

  try {
    integrations = await getProjectIntegrations()
  } catch (error) {
    integrationsLoadError = error instanceof Error ? error.message : 'Failed to load integrations'
  }

  const configuredWebhookSystems = integrations
    .filter((integration) => integration.configStatus === 'configured')
    .map((integration) => integration.id)

  return (
    <WebhookSettingsClient
      project={project}
      configuredWebhookSystems={configuredWebhookSystems}
      integrationsLoadError={integrationsLoadError}
    />
  )
}
