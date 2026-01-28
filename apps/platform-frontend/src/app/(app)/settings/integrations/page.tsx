import { IntegrationGrid } from '@/components/integration-grid'
import { Heading, Subheading } from '@/components/heading'
import { Text } from '@/components/text'
import { getProjectIntegrations } from '@/service/api/integration-api'
import type { IntegrationSummary } from '@viberglass/types'

export default async function IntegrationsPage() {
  let integrations: IntegrationSummary[] = []
  let loadError: string | null = null

  try {
    integrations = await getProjectIntegrations()
  } catch (error) {
    loadError = error instanceof Error ? error.message : 'Failed to load integrations'
  }

  const configuredCount = integrations.filter((i) => i.configStatus === 'configured').length
  const readyCount = integrations.filter((i) => i.status === 'ready').length

  return (
    <div className="space-y-8 p-6 lg:p-8">
      {/* Header */}
      <div>
        <Heading>Integrations</Heading>
        <Text className="mt-2">
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
        <div className="rounded-xl border border-zinc-950/10 bg-white p-4 dark:border-white/10 dark:bg-zinc-900">
          <div className="text-2xl font-semibold text-zinc-950 dark:text-white">{configuredCount}</div>
          <div className="text-sm text-zinc-500 dark:text-zinc-400">Configured</div>
        </div>
        <div className="rounded-xl border border-zinc-950/10 bg-white p-4 dark:border-white/10 dark:bg-zinc-900">
          <div className="text-2xl font-semibold text-zinc-950 dark:text-white">
            {integrations.length - configuredCount}
          </div>
          <div className="text-sm text-zinc-500 dark:text-zinc-400">Available</div>
        </div>
        <div className="rounded-xl border border-zinc-950/10 bg-white p-4 dark:border-white/10 dark:bg-zinc-900">
          <div className="text-2xl font-semibold text-zinc-950 dark:text-white">{readyCount}</div>
          <div className="text-sm text-zinc-500 dark:text-zinc-400">Ready to Use</div>
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
      <section className="rounded-xl border border-zinc-950/10 bg-zinc-50 p-6 dark:border-white/10 dark:bg-zinc-900">
        <Subheading className="text-base">Need Help?</Subheading>
        <Text className="mt-2">
          Learn how to set up integrations and get the most out of Viberglass.
        </Text>
        <div className="mt-4 flex gap-4">
          <a href="#" className="text-sm font-medium text-brand-burnt-orange hover:underline">
            View Documentation
          </a>
          <a href="#" className="text-sm font-medium text-brand-burnt-orange hover:underline">
            Contact Support
          </a>
        </div>
      </section>
    </div>
  )
}
