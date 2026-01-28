'use client'

import { IntegrationCard, IntegrationCardSkeleton } from '@/components/integration-card'
import type { IntegrationSummary } from '@viberglass/types'

interface IntegrationGridProps {
  integrations: IntegrationSummary[]
  hrefBase?: string
  isLoading?: boolean
}

export function IntegrationGrid({ integrations, hrefBase = '/settings/integrations', isLoading }: IntegrationGridProps) {
  if (isLoading) {
    return (
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <IntegrationCardSkeleton key={i} />
        ))}
      </div>
    )
  }

  if (integrations.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-12 text-center dark:border-zinc-700 dark:bg-zinc-900">
        <h3 className="text-lg font-semibold text-zinc-950 dark:text-white">No integrations available</h3>
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
          There are no integrations configured yet.
        </p>
      </div>
    )
  }

  // Sort integrations: configured first, then ready, then stubs
  const sortedIntegrations = [...integrations].sort((a, b) => {
    const statusOrder = { configured: 0, not_configured: 1, stub: 2 }
    const statusDiff = statusOrder[a.configStatus] - statusOrder[b.configStatus]
    if (statusDiff !== 0) return statusDiff
    return a.label.localeCompare(b.label)
  })

  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {sortedIntegrations.map((integration) => (
        <IntegrationCard key={integration.id} integration={integration} hrefBase={hrefBase} />
      ))}
    </div>
  )
}
