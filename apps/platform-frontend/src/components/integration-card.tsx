import { Badge } from '@/components/badge'
import {
  getIntegrationCategoryConfig,
  getIntegrationIcon,
  getIntegrationStatusConfig,
} from '@/components/integration-visuals'
import { Link } from '@/components/link'
import type {
  IntegrationCategory,
  IntegrationConfigStatus,
  TicketSystem,
} from '@viberglass/types'

export interface IntegrationCardData {
  id: string
  system: TicketSystem
  label: string
  category: IntegrationCategory
  description: string
  configStatus: IntegrationConfigStatus
  integrationEntityId?: string
  integrationName?: string
}

interface IntegrationCardProps {
  integration: IntegrationCardData
  hrefBase?: string
}

export function IntegrationCard({ integration, hrefBase = '/settings/integrations' }: IntegrationCardProps) {
  const IconComponent = getIntegrationIcon(integration.system)
  const status = getIntegrationStatusConfig(integration.configStatus)
  const category = getIntegrationCategoryConfig(integration.category)
  const StatusIcon = status.icon
  const basePath = hrefBase.endsWith('/') ? hrefBase.slice(0, -1) : hrefBase
  const href = integration.integrationEntityId
    ? `${basePath}/${integration.integrationEntityId}`
    : `${basePath}/new/${integration.system}`
  const cardTitle = integration.integrationName || integration.label
  const cardAction =
    integration.configStatus === 'configured'
      ? 'Manage'
      : integration.configStatus === 'stub'
        ? 'View'
        : 'Configure'

  return (
    <Link
      href={href}
      className="group relative flex flex-col rounded-xl border border-zinc-950/10 bg-white p-6 shadow-sm transition-all hover:border-brand-burnt-orange/30 hover:shadow-md dark:border-white/10 dark:bg-zinc-900 dark:hover:border-brand-burnt-orange/30"
    >
      <div className="absolute right-4 top-4">
        <Badge color={status.color}>
          <StatusIcon className="mr-1 inline-block size-3" />
          {status.label}
        </Badge>
      </div>

      <div className="mb-4 flex size-12 items-center justify-center rounded-lg bg-zinc-50 text-zinc-900 dark:bg-zinc-800 dark:text-white">
        <IconComponent className="size-6" />
      </div>

      <div className="flex-1">
        <div className="flex items-center gap-2">
          <h3 className="text-base font-semibold text-zinc-950 dark:text-white">{cardTitle}</h3>
          <Badge color={category.color} className="text-xs">
            {category.label}
          </Badge>
        </div>
        {integration.integrationName && (
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{integration.label}</p>
        )}
        <p className="mt-2 line-clamp-2 text-sm text-zinc-500 dark:text-zinc-400">{integration.description}</p>
      </div>

      <div className="mt-4 flex items-center gap-2 text-sm font-medium text-brand-burnt-orange">
        <span>{cardAction}</span>
        <span aria-hidden="true">→</span>
      </div>
    </Link>
  )
}

export function IntegrationCardSkeleton() {
  return (
    <div className="relative flex flex-col rounded-xl border border-zinc-950/10 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-zinc-900">
      <div className="absolute right-4 top-4">
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
