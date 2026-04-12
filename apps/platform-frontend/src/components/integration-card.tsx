import { Badge } from '@/components/badge'
import {
  getIntegrationCategoryConfig,
  getIntegrationIcon,
  getIntegrationStatusConfig,
} from '@/components/integration-visuals'
import { Link } from '@/components/link'
import type { IntegrationInstance } from '@/service/api/integration-api'
import type { IntegrationCategory, IntegrationConfigStatus, TicketSystem } from '@viberglass/types'

export interface IntegrationCardData {
  id: string
  system: TicketSystem
  label: string
  category: IntegrationCategory
  description: string
  configStatus: IntegrationConfigStatus
  integrationEntityId?: string
  integrationName?: string
  /** Configured instances of this integration type */
  instances?: IntegrationInstance[]
}

interface IntegrationCardProps {
  integration: IntegrationCardData
  hrefBase?: string
  isConfigured?: boolean
}

export function IntegrationCard({
  integration,
  hrefBase = '/settings/integrations',
  isConfigured,
}: IntegrationCardProps) {
  const IconComponent = getIntegrationIcon(integration.system)
  const status = getIntegrationStatusConfig(integration.configStatus)
  const category = getIntegrationCategoryConfig(integration.category)
  const StatusIcon = status.icon
  const basePath = hrefBase.endsWith('/') ? hrefBase.slice(0, -1) : hrefBase

  const instanceCount = integration.instances?.length ?? 0
  const hasInstances = instanceCount > 0
  const hasMultipleInstances = instanceCount > 1
  const singleInstance = hasInstances && !hasMultipleInstances ? integration.instances![0] : null
  const firstInstanceId = integration.instances?.[0]?.id

  // Card links to first instance if configured, or to create new page
  const cardHref = firstInstanceId ? `${basePath}/${firstInstanceId}` : `${basePath}/new/${integration.system}`

  // Always use the integration type label as the main title (e.g., "GitHub", "Shortcut")
  // This avoids showing date-based names as the primary identifier
  const cardTitle = integration.label

  const cardAction =
    integration.configStatus === 'configured'
      ? hasMultipleInstances
        ? 'View All'
        : 'Manage'
      : integration.configStatus === 'stub'
        ? 'View'
        : 'Configure'

  const configurationStatus = isConfigured ?? integration.configStatus === 'configured'
  const isStub = integration.configStatus === 'stub'

  return (
    <div
      className={`group relative flex flex-col rounded-xl border p-6 shadow-sm transition-all ${
        isStub
          ? 'border-zinc-950/5 bg-zinc-50/50 opacity-70 dark:border-white/5 dark:bg-zinc-900/50'
          : configurationStatus
            ? 'border-green-200 bg-white hover:border-green-300 hover:shadow-md dark:border-green-900/30 dark:bg-zinc-900 dark:hover:border-green-800/40'
            : 'border-zinc-950/10 bg-white hover:border-brand-burnt-orange/30 hover:shadow-md dark:border-white/10 dark:bg-zinc-900 dark:hover:border-brand-burnt-orange/30'
      }`}
    >
      <div className="absolute top-4 right-4">
        {configurationStatus ? (
          <Badge color="green">
            <span className="mr-1.5 inline-block size-1.5 rounded-full bg-current" />
            Connected
          </Badge>
        ) : (
          <Badge color={status.color}>
            <StatusIcon className="mr-1 inline-block size-3" />
            {status.label}
          </Badge>
        )}
      </div>

      <Link href={cardHref} className="flex-1">
        <div className="mb-4 flex size-12 items-center justify-center rounded-lg bg-zinc-50 text-zinc-900 dark:bg-zinc-800 dark:text-white">
          <IconComponent className="size-6" />
        </div>

        <div className="flex items-center gap-2">
          <h3 className="text-base font-semibold text-zinc-950 dark:text-white">{cardTitle}</h3>
          <Badge color={category.color} className="text-xs">
            {category.label}
          </Badge>
        </div>

        {/* Show single instance name as subtitle (even if it's date-based, it's now secondary) */}
        {singleInstance && <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{singleInstance.name}</p>}

        <p className="mt-2 line-clamp-2 text-sm text-zinc-500 dark:text-zinc-400">{integration.description}</p>
      </Link>

      {/* Show instances list when there are multiple */}
      {hasMultipleInstances && integration.instances && (
        <div className="mt-3 border-t border-zinc-200 pt-3 dark:border-zinc-700">
          <ul className="space-y-1">
            {integration.instances.map((instance) => (
              <li key={instance.id}>
                <Link
                  href={`${basePath}/${instance.id}`}
                  className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm text-zinc-600 transition-colors hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  <span className="truncate">{instance.name}</span>
                  <span className="ml-2 text-xs text-zinc-400">→</span>
                </Link>
              </li>
            ))}
          </ul>
          <Link
            href={`${basePath}/new/${integration.system}`}
            className="mt-2 flex items-center gap-1 rounded-md px-2 py-1.5 text-sm font-medium text-brand-burnt-orange transition-colors hover:bg-brand-burnt-orange/10"
          >
            <span>+ Add new</span>
          </Link>
        </div>
      )}

      {/* Single instance or not configured - show action link */}
      {!hasMultipleInstances && (
        <Link href={cardHref} className="mt-4 flex items-center gap-2 text-sm font-medium text-brand-burnt-orange">
          <span>{cardAction}</span>
          <span aria-hidden="true">→</span>
        </Link>
      )}
    </div>
  )
}

export function IntegrationCardSkeleton() {
  return (
    <div className="relative flex flex-col rounded-xl border border-zinc-950/10 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-zinc-900">
      <div className="absolute top-4 right-4">
        <div className="h-6 w-20 animate-pulse rounded-full bg-zinc-200 dark:bg-zinc-700" />
      </div>
      <div className="mb-4 size-12 animate-pulse rounded-lg bg-zinc-200 dark:bg-zinc-700" />
      <div className="h-5 w-24 animate-pulse rounded bg-zinc-200 dark:bg-zinc-700" />
      <div className="mt-2 h-4 w-full animate-pulse rounded bg-zinc-200 dark:bg-zinc-700" />
      <div className="mt-1 h-4 w-2/3 animate-pulse rounded bg-zinc-200 dark:bg-zinc-700" />
      <div className="mt-4 h-4 w-16 animate-pulse rounded bg-zinc-200 dark:bg-zinc-700" />
    </div>
  )
}
