import { Heading, Subheading } from '@/components/heading'
import type { IntegrationCardData } from '@/components/integration-card'
import { IntegrationGrid } from '@/components/integration-grid'
import { PageMeta } from '@/components/page-meta'
import { Text } from '@/components/text'
import { getChatStatus, getIntegrationSettingsListItems } from '@/service/api/integration-api'
import { useEffect, useState } from 'react'

export function IntegrationsPage() {
  const [integrations, setIntegrations] = useState<IntegrationCardData[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [chatConfigured, setChatConfigured] = useState<Record<string, boolean>>({})

  useEffect(() => {
    async function loadData() {
      try {
        const data = await getIntegrationSettingsListItems()
        void loadChatStatuses(data.filter((integration) => integration.category === 'chat').map((integration) => integration.system))
        setIntegrations(
          data.map((integration) => ({
            id: integration.id,
            system: integration.system,
            label: integration.label,
            category: integration.category,
            description: integration.description,
            configStatus: integration.configStatus,
            integrationEntityId: integration.integrationEntityId,
            integrationName: integration.integrationName,
            instances: integration.instances,
          }))
        )
      } catch (error) {
        setLoadError(error instanceof Error ? error.message : 'Failed to load connections')
      }
      setIsLoading(false)
    }
    async function loadChatStatuses(systems: string[]) {
      const statuses = await Promise.all(
        systems.map((system) =>
          getChatStatus(system)
            .then(({ configured }): [string, boolean] => [system, configured])
            .catch((): [string, boolean] => [system, false])
        )
      )
      setChatConfigured(Object.fromEntries(statuses))
    }
    loadData()
  }, [])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-zinc-500 dark:text-zinc-400">Loading...</div>
      </div>
    )
  }

  // A chat integration counts as in use once its bot is set up, even without a listed instance.
  const inUse = (integration: IntegrationCardData) =>
    integration.configStatus === 'configured' || chatConfigured[integration.system] === true
  const connected = integrations.filter(inUse)
  const available = integrations.filter((integration) => !inUse(integration) && integration.configStatus === 'not_configured')

  return (
    <>
      <PageMeta title="Connections" />
      <div className="space-y-8 p-6 lg:p-8">
        {/* Header */}
        <div>
          <Heading>Connections</Heading>
          <Text className="mt-2 text-[var(--gray-9)]">
            Code hosts, issue trackers and chat the workspace is connected to. Each space picks the ones it uses.
          </Text>
        </div>

        {loadError && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-900/20 dark:text-red-400">
            {loadError}
          </div>
        )}

        <section>
          <Subheading>In use</Subheading>
          <div className="mt-4">
            {connected.length === 0 ? (
              <Text>Nothing is connected yet. Connect a code host so agents can work on a repository.</Text>
            ) : (
              <IntegrationGrid integrations={connected} configured={chatConfigured} />
            )}
          </div>
        </section>

        {available.length > 0 && (
          <section>
            <Subheading>Available</Subheading>
            <div className="mt-4">
              <IntegrationGrid integrations={available} configured={chatConfigured} />
            </div>
          </section>
        )}

      </div>
    </>
  )
}
