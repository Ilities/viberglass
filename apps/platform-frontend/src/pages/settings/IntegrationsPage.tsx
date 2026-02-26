import type { IntegrationCardData } from '@/components/integration-card'
import { IntegrationGrid } from '@/components/integration-grid'
import { Heading, Subheading } from '@/components/heading'
import { PageMeta } from '@/components/page-meta'
import { Text } from '@/components/text'
import { getIntegrationSettingsListItems } from '@/service/api/integration-api'
import { useEffect, useState } from 'react'

export function IntegrationsPage() {
  const [integrations, setIntegrations] = useState<IntegrationCardData[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function loadData() {
      try {
        const data = await getIntegrationSettingsListItems()
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
        setLoadError(error instanceof Error ? error.message : 'Failed to load integrations')
      }
      setIsLoading(false)
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

  const configuredCount = integrations.filter((i) => i.configStatus === 'configured').length
  const availableCount = integrations.filter((i) => i.configStatus === 'not_configured').length
  const readyCount = new Set(
    integrations.filter((i) => i.configStatus !== 'stub').map((i) => i.system)
  ).size

  return (
    <>
      <PageMeta title="Global Integrations" />
      <div className="space-y-8 p-6 lg:p-8">
      {/* Header */}
      <div>
        <Heading>Integrations</Heading>
        <Text className="mt-2 text-[var(--gray-9)]">
          Connect your project management and source control tools to enable seamless bug tracking
          and auto-fix workflows.
        </Text>
      </div>

      {loadError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-900/20 dark:text-red-400">
          {loadError}
        </div>
      )}

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="app-frame rounded-lg p-4">
          <div className="text-2xl font-semibold text-[var(--gray-12)]">{configuredCount}</div>
          <div className="text-sm text-[var(--gray-9)]">Configured</div>
        </div>
        <div className="app-frame rounded-lg p-4">
          <div className="text-2xl font-semibold text-[var(--gray-12)]">
            {availableCount}
          </div>
          <div className="text-sm text-[var(--gray-9)]">Available</div>
        </div>
        <div className="app-frame rounded-lg p-4">
          <div className="text-2xl font-semibold text-[var(--gray-12)]">{readyCount}</div>
          <div className="text-sm text-[var(--gray-9)]">Ready to Use</div>
        </div>
      </div>

      {/* Category Sections */}
      <section>
        <Subheading>All Integrations</Subheading>
        <div className="mt-4">
          <IntegrationGrid integrations={integrations} />
        </div>
      </section>

      {/* Help Section */}
      <section className="app-frame rounded-lg p-6 bg-[var(--gray-3)]">
        <Subheading className="text-base">Need Help?</Subheading>
        <Text className="mt-2 text-[var(--gray-9)]">
          Learn how to set up integrations and get the most out of Viberglass.
        </Text>
        <div className="mt-4 flex gap-4">
          <a href="#" className="text-sm font-medium text-[var(--accent-9)] hover:underline">
            View Documentation
          </a>
          <a href="#" className="text-sm font-medium text-[var(--accent-9)] hover:underline">
            Contact Support
          </a>
        </div>
      </section>
    </div>
    </>
  )
}
