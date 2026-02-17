import {
  CheckCircledIcon,
  CircleIcon,
  ExclamationTriangleIcon,
  GitHubLogoIcon,
} from '@radix-ui/react-icons'
import type {
  IntegrationCategory,
  IntegrationConfigStatus,
  TicketSystem,
} from '@viberglass/types'
import type { ComponentType } from 'react'

export type IntegrationIconComponent = ComponentType<{ className?: string }>

export const INTEGRATION_ICON_COMPONENTS: Record<TicketSystem, IntegrationIconComponent> = {
  github: GitHubLogoIcon,
  gitlab: GitLabIcon,
  bitbucket: BitbucketIcon,
  jira: JiraIcon,
  linear: LinearIcon,
  monday: MondayIcon,
  shortcut: ShortcutIcon,
  slack: SlackIcon,
  custom: CustomIcon,
}

const INTEGRATION_STATUS_CONFIG: Record<
  IntegrationConfigStatus,
  {
    icon: IntegrationIconComponent
    label: string
    color: 'green' | 'zinc' | 'amber'
  }
> = {
  configured: {
    icon: CheckCircledIcon,
    label: 'Configured',
    color: 'green',
  },
  not_configured: {
    icon: CircleIcon,
    label: 'Not Configured',
    color: 'zinc',
  },
  stub: {
    icon: ExclamationTriangleIcon,
    label: 'Coming Soon',
    color: 'amber',
  },
}

const INTEGRATION_CATEGORY_CONFIG: Record<
  IntegrationCategory,
  {
    label: string
    color: 'blue' | 'teal' | 'purple'
  }
> = {
  scm: {
    label: 'SCM',
    color: 'blue',
  },
  inbound: {
    label: 'Inbound',
    color: 'teal',
  },
  ticketing: {
    label: 'Ticketing',
    color: 'purple',
  },
}

export function getIntegrationIcon(integrationId?: TicketSystem): IntegrationIconComponent {
  if (!integrationId) {
    return CircleIcon
  }

  return INTEGRATION_ICON_COMPONENTS[integrationId] || CircleIcon
}

export function getIntegrationStatusConfig(configStatus: IntegrationConfigStatus) {
  return INTEGRATION_STATUS_CONFIG[configStatus]
}

export function getIntegrationCategoryConfig(category: IntegrationCategory) {
  return INTEGRATION_CATEGORY_CONFIG[category]
}

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

function CustomIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 3v18M3 12h18M5.64 5.64l12.72 12.72M5.64 18.36L18.36 5.64" />
      <circle cx="12" cy="12" r="9" />
    </svg>
  )
}
