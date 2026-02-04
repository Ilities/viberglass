import { IntegrationGrid } from '@/components/integration-grid'
import { Heading, Subheading } from '@/components/heading'
import { Text } from '@/components/text'
import { useProject } from '@/context/project-context'
import {
  getIntegrations,
  getProjectIntegrations,
  linkIntegrationToProject,
  unlinkIntegrationFromProject,
  type ProjectIntegrationWithDetails,
} from '@/service/api/integration-api'
import type { Integration, IntegrationSummary } from '@viberglass/types'
import { useEffect, useState, useCallback } from 'react'
import { Button } from '@/components/button'
import {
  CheckCircledIcon,
  PlusIcon,
} from '@radix-ui/react-icons'
import { Link } from '@/components/link'

// Custom icons since they're not in radix-ui
function LinkIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  )
}

function LinkBreakIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
      <line x1="4" y1="4" x2="20" y2="20" />
    </svg>
  )
}

interface IntegrationWithLinkStatus extends IntegrationSummary {
  isLinked: boolean
  linkId?: string
  isPrimary?: boolean
}

export function ProjectIntegrationsPage() {
  const { project: projectData, isLoading: isProjectLoading } = useProject()
  const [integrations, setIntegrations] = useState<IntegrationWithLinkStatus[]>([])
  const [availableGlobalIntegrations, setAvailableGlobalIntegrations] = useState<Integration[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionInProgress, setActionInProgress] = useState<string | null>(null)

  const loadIntegrations = useCallback(async () => {
    if (!projectData?.id) {
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    setLoadError(null)

    try {
      // Fetch global integrations and project-linked integrations in parallel
      const [globalIntegrations, projectLinks] = await Promise.all([
        getIntegrations(),
        getProjectIntegrations(projectData.id),
      ])

      // Create a map of linked integrations for quick lookup
      const linkedMap = new Map<string, ProjectIntegrationWithDetails>()
      projectLinks.forEach((link) => {
        linkedMap.set(link.integration.id, link)
      })

      // Map global integrations to the format needed for display with link status
      const mappedIntegrations: IntegrationWithLinkStatus[] = globalIntegrations.map(
        (integration) => {
          const link = linkedMap.get(integration.id)
          return {
            id: integration.system,
            label: integration.name,
            category: getCategoryFromSystem(integration.system),
            description: getDescriptionFromSystem(integration.system),
            authTypes: ['token'], // Default, will be updated when editing
            configFields: [],
            supports: { issues: true },
            status: 'ready',
            configStatus: 'configured',
            isLinked: !!link,
            linkId: link?.id,
            isPrimary: link?.isPrimary,
            integrationEntityId: integration.id,
          } as IntegrationWithLinkStatus
        }
      )

      setAvailableGlobalIntegrations(globalIntegrations)
      setIntegrations(mappedIntegrations)
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Failed to load integrations')
    } finally {
      setIsLoading(false)
    }
  }, [projectData?.id])

  useEffect(() => {
    loadIntegrations()
  }, [loadIntegrations])

  const handleLinkIntegration = async (integrationEntityId: string) => {
    if (!projectData?.id) return

    setActionInProgress(integrationEntityId)
    try {
      await linkIntegrationToProject(projectData.id, integrationEntityId)
      await loadIntegrations()
    } catch (error) {
      console.error('Failed to link integration:', error)
      setLoadError(error instanceof Error ? error.message : 'Failed to link integration')
    } finally {
      setActionInProgress(null)
    }
  }

  const handleUnlinkIntegration = async (integrationEntityId: string) => {
    if (!projectData?.id) return

    setActionInProgress(integrationEntityId)
    try {
      await unlinkIntegrationFromProject(projectData.id, integrationEntityId)
      await loadIntegrations()
    } catch (error) {
      console.error('Failed to unlink integration:', error)
      setLoadError(error instanceof Error ? error.message : 'Failed to unlink integration')
    } finally {
      setActionInProgress(null)
    }
  }

  const linkedCount = integrations.filter((i) => i.isLinked).length

  if (isProjectLoading || isLoading) {
    return (
      <div className="space-y-8 p-6 lg:p-8">
        <div>
          <Heading>Integrations</Heading>
          <Text className="mt-2">Loading integrations...</Text>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8 p-6 lg:p-8">
      {/* Header */}
      <div>
        <Heading>Integrations</Heading>
        <Text className="mt-2">
          Link integrations to this project to enable ticket creation and sync with your external tools.
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
          <div className="text-2xl font-semibold text-zinc-950 dark:text-white">{linkedCount}</div>
          <div className="text-sm text-zinc-500 dark:text-zinc-400">Linked</div>
        </div>
        <div className="rounded-xl border border-zinc-950/10 bg-white p-4 dark:border-white/10 dark:bg-zinc-900">
          <div className="text-2xl font-semibold text-zinc-950 dark:text-white">
            {integrations.length - linkedCount}
          </div>
          <div className="text-sm text-zinc-500 dark:text-zinc-400">Available to Link</div>
        </div>
        <div className="rounded-xl border border-zinc-950/10 bg-white p-4 dark:border-white/10 dark:bg-zinc-900">
          <div className="text-2xl font-semibold text-zinc-950 dark:text-white">{linkedCount > 0 ? 'Ready' : 'None'}</div>
          <div className="text-sm text-zinc-500 dark:text-zinc-400">Status</div>
        </div>
      </div>

      {/* Create New Integration Link */}
      <section className="rounded-xl border border-zinc-950/10 bg-zinc-50 p-6 dark:border-white/10 dark:bg-zinc-900">
        <div className="flex items-center justify-between">
          <div>
            <Subheading className="text-base">Need a new integration?</Subheading>
            <Text className="mt-1 text-sm">
              Create a new integration in global settings, then link it to this project.
            </Text>
          </div>
          <Button href="/settings/integrations" color="brand">
            <PlusIcon className="mr-2 size-4" />
            Create Integration
          </Button>
        </div>
      </section>

      {/* Available Integrations */}
      <section>
        <Subheading>Available Integrations</Subheading>
        <Text className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          These integrations have been configured globally and can be linked to this project.
        </Text>
        
        {integrations.length === 0 ? (
          <div className="mt-4 rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-12 text-center dark:border-zinc-700 dark:bg-zinc-900">
            <h3 className="text-lg font-semibold text-zinc-950 dark:text-white">No integrations available</h3>
            <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
              No integrations have been configured yet. Create one in global settings first.
            </p>
            <div className="mt-6">
              <Button href="/settings/integrations" color="brand">
                <PlusIcon className="mr-2 size-4" />
                Create Integration
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-4 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {integrations.map((integration) => (
              <IntegrationLinkCard
                key={integration.id}
                integration={integration}
                onLink={() => handleLinkIntegration((integration as unknown as Record<string, string>).integrationEntityId)}
                onUnlink={() => handleUnlinkIntegration((integration as unknown as Record<string, string>).integrationEntityId)}
                isLoading={actionInProgress === (integration as unknown as Record<string, string>).integrationEntityId}
              />
            ))}
          </div>
        )}
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

// Helper component for integration link cards
interface IntegrationLinkCardProps {
  integration: IntegrationWithLinkStatus
  onLink: () => void
  onUnlink: () => void
  isLoading: boolean
}

function IntegrationLinkCard({ integration, onLink, onUnlink, isLoading }: IntegrationLinkCardProps) {
  return (
    <div
      className={`group relative flex flex-col rounded-xl border p-6 shadow-sm transition-all ${
        integration.isLinked
          ? 'border-brand-burnt-orange/30 bg-white dark:border-brand-burnt-orange/30 dark:bg-zinc-900'
          : 'border-zinc-950/10 bg-white dark:border-white/10 dark:bg-zinc-900'
      }`}
    >
      {/* Status Badge */}
      <div className="absolute right-4 top-4">
        {integration.isLinked ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900/30 dark:text-green-400">
            <CheckCircledIcon className="size-3" />
            Linked
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-800 dark:bg-zinc-800 dark:text-zinc-400">
            Not Linked
          </span>
        )}
      </div>

      {/* Icon */}
      <div className="mb-4 flex size-12 items-center justify-center rounded-lg bg-zinc-50 text-zinc-900 dark:bg-zinc-800 dark:text-white">
        <IntegrationIcon system={integration.id} />
      </div>

      {/* Content */}
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <h3 className="text-base font-semibold text-zinc-950 dark:text-white">
            {integration.label}
          </h3>
          {integration.category === 'scm' ? (
            <span className="rounded bg-blue-100 px-1.5 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
              SCM
            </span>
          ) : integration.category === 'inbound' ? (
            <span className="rounded bg-teal-100 px-1.5 py-0.5 text-xs font-medium text-teal-800 dark:bg-teal-900/30 dark:text-teal-400">
              Inbound
            </span>
          ) : (
            <span className="rounded bg-purple-100 px-1.5 py-0.5 text-xs font-medium text-purple-800 dark:bg-purple-900/30 dark:text-purple-400">
              Ticketing
            </span>
          )}
        </div>
        <p className="mt-2 line-clamp-2 text-sm text-zinc-500 dark:text-zinc-400">
          {integration.description}
        </p>
      </div>

      {/* Actions */}
      <div className="mt-4 flex items-center gap-2">
        {integration.isLinked ? (
          <Button
            color="red"
            outline
            size="small"
            onClick={onUnlink}
            disabled={isLoading}
            className="w-full"
          >
            <LinkBreakIcon className="mr-2 h-4 w-4" />
            {isLoading ? 'Unlinking...' : 'Unlink'}
          </Button>
        ) : (
          <Button
            color="brand"
            size="small"
            onClick={onLink}
            disabled={isLoading}
            className="w-full"
          >
            <LinkIcon className="mr-2 h-4 w-4" />
            {isLoading ? 'Linking...' : 'Link to Project'}
          </Button>
        )}
      </div>
    </div>
  )
}

// Helper to get category from system type
function getCategoryFromSystem(system: string): 'scm' | 'ticketing' | 'inbound' {
  const scmSystems = ['github', 'gitlab', 'bitbucket']
  const inboundSystems = ['custom']
  if (scmSystems.includes(system)) return 'scm'
  if (inboundSystems.includes(system)) return 'inbound'
  return 'ticketing'
}

// Helper to get description from system type
function getDescriptionFromSystem(system: string): string {
  const descriptions: Record<string, string> = {
    github: 'Native GitHub Issues integration with webhook support and PR linking.',
    gitlab: 'GitLab Issues integration with CI/CD pipeline connectivity.',
    bitbucket: 'Atlassian Bitbucket issue tracking for teams using Bitbucket Git.',
    jira: 'Create and sync issues with Atlassian Jira. Supports Jira Cloud and Server.',
    linear: 'Streamlined issue tracking with Linear. Perfect for modern product teams.',
    azure: 'Azure DevOps Boards integration for Microsoft-centric workflows.',
    asana: 'Project management and issue tracking with Asana.',
    trello: 'Kanban-style issue organization using Trello boards.',
    monday: 'Work operating system for issue and project management.',
    clickup: 'All-in-one productivity platform for issue tracking.',
    shortcut: 'Project management for software teams (formerly Clubhouse).',
    slack: 'Send notifications and create issues directly from Slack channels.',
    custom: 'Receive tickets from any external system via a simple JSON webhook.',
  }
  return descriptions[system] || `${system} integration`
}

// Simple icon component
function IntegrationIcon({ system }: { system: string }) {
  const colors: Record<string, string> = {
    github: 'bg-gray-900 text-white',
    gitlab: 'bg-orange-500 text-white',
    bitbucket: 'bg-blue-500 text-white',
    jira: 'bg-blue-600 text-white',
    linear: 'bg-purple-500 text-white',
    azure: 'bg-blue-700 text-white',
    asana: 'bg-red-500 text-white',
    trello: 'bg-blue-400 text-white',
    monday: 'bg-yellow-500 text-white',
    clickup: 'bg-purple-600 text-white',
    shortcut: 'bg-green-500 text-white',
    slack: 'bg-pink-500 text-white',
    custom: 'bg-gray-500 text-white',
  }
  
  const firstLetter = system.charAt(0).toUpperCase()
  
  return (
    <div className={`flex size-8 items-center justify-center rounded font-bold ${colors[system] || 'bg-gray-500 text-white'}`}>
      {firstLetter}
    </div>
  )
}
