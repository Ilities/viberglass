'use client'

import { Badge } from '@/components/badge'
import type { IntegrationSummary, TicketSystem } from '@viberglass/types'
import {
  CheckCircledIcon,
  CircleIcon,
  ExclamationTriangleIcon,
  GitHubLogoIcon,
} from '@radix-ui/react-icons'
import Link from 'next/link'

// Icon mapping for integrations
const INTEGRATION_ICON_COMPONENTS: Record<
  TicketSystem,
  React.ComponentType<{ className?: string }>
> = {
  github: GitHubLogoIcon,
  gitlab: GitLabIcon,
  bitbucket: BitbucketIcon,
  jira: JiraIcon,
  linear: LinearIcon,
  azure: AzureIcon,
  asana: AsanaIcon,
  trello: TrelloIcon,
  monday: MondayIcon,
  clickup: ClickUpIcon,
  shortcut: ShortcutIcon,
  slack: SlackIcon,
}

// Placeholder icons for integrations without specific icons
function GitLabIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 21.35l3.65-11.23H8.35L12 21.35zM5.65 10.12L2 21.35h6.65L5.65 10.12zm12.7 0L22 21.35h-6.65l2.3-11.23zM12 2L8.35 10.12h7.3L12 2z" />
    </svg>
  )
}

function BitbucketIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M3.5 5.5L5.2 19.2c.1.7.7 1.3 1.5 1.3h11.6c.7 0 1.3-.5 1.5-1.2l1.7-13.8H3.5zm11.2 10.4H9.3l-.9-5.4h7.2l-.9 5.4z" />
    </svg>
  )
}

function JiraIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M11.5 24h6.9a.5.5 0 00.5-.5V12h-6.9a.5.5 0 00-.5.5v11zM11.5 0h-6.9a.5.5 0 00-.5.5v11h7.4a.5.5 0 00.5-.5V0h-.5z" />
    </svg>
  )
}

function LinearIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M3 12a9 9 0 0113.8-7.6l-9.4 9.4A9 9 0 013 12zm9 9a9 9 0 009-9 9 9 0 00-.6-3.2L11.8 18.4A9 9 0 0012 21zm6.2-16.2a9 9 0 00-12 12l12-12z" />
    </svg>
  )
}

function AzureIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M5.5 3v13.23l4.34 2.32 8.9-3.05L5.5 3zm2.1 2.8l6.7 7.2-5.6 1.9-1.1-9.1zM13 11l7 7.5-11.2 3.8L13 11z" />
    </svg>
  )
}

function AsanaIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.5 11.5a5.5 5.5 0 100-11 5.5 5.5 0 000 11zm-13 0a5.5 5.5 0 100-11 5.5 5.5 0 000 11zm13 2a5.5 5.5 0 110 11 5.5 5.5 0 010-11zm-13 0a5.5 5.5 0 110 11 5.5 5.5 0 010-11z" />
    </svg>
  )
}

function TrelloIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M4 3a2 2 0 00-2 2v14a2 2 0 002 2h16a2 2 0 002-2V5a2 2 0 00-2-2H4zm12.5 3a.5.5 0 01.5.5v9a.5.5 0 01-.5.5h-4a.5.5 0 01-.5-.5v-9a.5.5 0 01.5-.5h4zm-7 0a.5.5 0 01.5.5v5a.5.5 0 01-.5.5h-4a.5.5 0 01-.5-.5v-5a.5.5 0 01.5-.5h4z" />
    </svg>
  )
}

function MondayIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm-1 15l-5-5 1.4-1.4L11 14.2l5.6-5.6L18 10l-7 7z" />
    </svg>
  )
}

function ClickUpIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2L2 12l10 10 10-10L12 2zm0 4l6 6-6 6-6-6 6-6z" />
    </svg>
  )
}

function ShortcutIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
    </svg>
  )
}

function SlackIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M5.042 15.165a2.528 2.528 0 01-2.52 2.523A2.528 2.528 0 010 15.165a2.527 2.527 0 012.522-2.52h2.52v2.52zm1.271 0a2.527 2.527 0 012.521-2.52 2.527 2.527 0 012.521 2.52v6.313A2.528 2.528 0 018.834 24a2.528 2.528 0 01-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 01-2.521-2.52A2.528 2.528 0 018.834 0a2.528 2.528 0 012.521 2.522v2.52H8.834zm0 1.271a2.528 2.528 0 012.521 2.521 2.528 2.528 0 01-2.521 2.521H2.522A2.528 2.528 0 010 8.834a2.528 2.528 0 012.522-2.521h6.312zm10.124 2.521a2.528 2.528 0 012.52-2.521A2.528 2.528 0 0124 8.834a2.528 2.528 0 01-2.522 2.521h-2.52V8.834zm-1.271 0a2.528 2.528 0 01-2.521 2.521 2.528 2.528 0 01-2.521-2.521V2.522A2.528 2.528 0 0115.166 0a2.528 2.528 0 012.521 2.522v6.312zm-2.521 10.124a2.528 2.528 0 012.521 2.52A2.528 2.528 0 0115.166 24a2.528 2.528 0 01-2.521-2.522v-2.52h2.521zm0-1.271a2.528 2.528 0 01-2.521-2.521 2.528 2.528 0 012.521-2.521h6.313A2.528 2.528 0 0124 15.166a2.528 2.528 0 01-2.522 2.521h-6.312z" />
    </svg>
  )
}

interface IntegrationCardProps {
  integration: IntegrationSummary
  hrefBase?: string
}

export function IntegrationCard({ integration, hrefBase = '/settings/integrations' }: IntegrationCardProps) {
  const IconComponent = INTEGRATION_ICON_COMPONENTS[integration.id]
  const basePath = hrefBase.endsWith('/') ? hrefBase.slice(0, -1) : hrefBase
  const href = `${basePath}/${integration.id}`

  const statusConfig = {
    configured: {
      icon: CheckCircledIcon,
      label: 'Configured',
      color: 'green' as const,
      badgeVariant: 'soft' as const,
    },
    not_configured: {
      icon: CircleIcon,
      label: 'Not Configured',
      color: 'zinc' as const,
      badgeVariant: 'soft' as const,
    },
    stub: {
      icon: ExclamationTriangleIcon,
      label: 'Coming Soon',
      color: 'amber' as const,
      badgeVariant: 'soft' as const,
    },
  }

  const status = statusConfig[integration.configStatus]
  const StatusIcon = status.icon

  return (
    <Link
      href={href}
      className="group relative flex flex-col rounded-xl border border-zinc-950/10 bg-white p-6 shadow-sm transition-all hover:border-brand-burnt-orange/30 hover:shadow-md dark:border-white/10 dark:bg-zinc-900 dark:hover:border-brand-burnt-orange/30"
    >
      {/* Status Badge */}
      <div className="absolute right-4 top-4">
        <Badge color={status.color}>
          <StatusIcon className="mr-1 inline-block size-3" />
          {status.label}
        </Badge>
      </div>

      {/* Icon */}
      <div className="mb-4 flex size-12 items-center justify-center rounded-lg bg-zinc-50 text-zinc-900 dark:bg-zinc-800 dark:text-white">
        <IconComponent className="size-6" />
      </div>

      {/* Content */}
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <h3 className="text-base font-semibold text-zinc-950 dark:text-white">
            {integration.label}
          </h3>
          {integration.category === 'scm' ? (
            <Badge color="blue" className="text-xs">
              SCM
            </Badge>
          ) : (
            <Badge color="purple" className="text-xs">
              Ticketing
            </Badge>
          )}
        </div>
        <p className="mt-2 line-clamp-2 text-sm text-zinc-500 dark:text-zinc-400">
          {integration.description}
        </p>
      </div>

      {/* Footer */}
      <div className="mt-4 flex items-center gap-2 text-sm font-medium text-brand-burnt-orange">
        <span>{integration.configStatus === 'configured' ? 'Manage' : 'Configure'}</span>
        <span aria-hidden="true">→</span>
      </div>
    </Link>
  )
}

// Skeleton loading state for integration cards
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
