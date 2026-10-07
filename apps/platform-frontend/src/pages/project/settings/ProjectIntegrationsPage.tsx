import { Button } from '@/components/button'
import { EmptyState } from '@/components/empty-state'
import { Heading, Subheading } from '@/components/heading'
import { getIntegrationIcon, type IntegrationIconComponent } from '@/components/integration-visuals'
import { PageMeta } from '@/components/page-meta'
import { Text } from '@/components/text'
import { useProject } from '@/context/project-context'
import {
  getAvailableIntegrationTypes,
  getIntegrations,
  getProjectIntegrations,
  linkIntegrationToProject,
  unlinkIntegrationFromProject,
} from '@/service/api/integration-api'
import type { IntegrationCategory } from '@viberglass/types'
import { useCallback, useEffect, useState } from 'react'

const CATEGORY_LABEL: Record<IntegrationCategory, string> = {
  scm: 'Code host',
  ticketing: 'Issue tracker',
  inbound: 'Webhook',
  chat: 'Chat',
}

interface SpaceConnection {
  id: string
  name: string
  kind: string
  Icon: IntegrationIconComponent
  isLinked: boolean
}

/** Which of the workspace's connections a space uses. */
export function ProjectIntegrationsPage() {
  const { project, isLoading: isProjectLoading } = useProject()
  const [connections, setConnections] = useState<SpaceConnection[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionInProgress, setActionInProgress] = useState<string | null>(null)

  const loadConnections = useCallback(async () => {
    if (!project?.id) {
      setIsLoading(false)
      return
    }
    setIsLoading(true)
    setLoadError(null)
    try {
      const [workspaceConnections, links, types] = await Promise.all([
        getIntegrations(),
        getProjectIntegrations(project.id),
        getAvailableIntegrationTypes(),
      ])
      const linkedIds = new Set(links.map((link) => link.integration.id))
      const typeBySystem = new Map(types.map((type) => [type.id, type]))
      setConnections(
        workspaceConnections.map((connection) => {
          const type = typeBySystem.get(connection.system)
          return {
            id: connection.id,
            name: connection.name,
            kind: [type?.label ?? connection.system, type ? CATEGORY_LABEL[type.category] : null]
              .filter(Boolean)
              .join(' · '),
            Icon: getIntegrationIcon(connection.system),
            isLinked: linkedIds.has(connection.id),
          }
        })
      )
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Failed to load connections')
    } finally {
      setIsLoading(false)
    }
  }, [project?.id])

  useEffect(() => {
    void loadConnections()
  }, [loadConnections])

  async function toggleLink(connection: SpaceConnection) {
    if (!project?.id) return
    setActionInProgress(connection.id)
    try {
      if (connection.isLinked) await unlinkIntegrationFromProject(project.id, connection.id)
      else await linkIntegrationToProject(project.id, connection.id)
      await loadConnections()
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Failed to change the connection')
    } finally {
      setActionInProgress(null)
    }
  }

  const linked = connections.filter((connection) => connection.isLinked)
  const available = connections.filter((connection) => !connection.isLinked)

  return (
    <>
      <PageMeta title="Connections" />
      <div className="flex items-center justify-between gap-4">
        <Heading>Connections</Heading>
        <Button outline href="/settings/connections">
          Create connection
        </Button>
      </div>

      {loadError && (
        <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-900/20 dark:text-red-400">
          {loadError}
        </div>
      )}

      {isProjectLoading || isLoading ? (
        <Text className="mt-6">Loading connections…</Text>
      ) : connections.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title="No connections yet"
            action={
              <Button color="brand" href="/settings/connections">
                Create connection
              </Button>
            }
          />
        </div>
      ) : (
        <div className="mt-8 space-y-10">
          {linked.length > 0 && (
            <ConnectionList
              title="Linked"
              connections={linked}
              actionInProgress={actionInProgress}
              onToggle={toggleLink}
            />
          )}
          {available.length > 0 && (
            <ConnectionList
              title="Available connections"
              connections={available}
              actionInProgress={actionInProgress}
              onToggle={toggleLink}
            />
          )}
        </div>
      )}
    </>
  )
}

function ConnectionList({
  title,
  connections,
  actionInProgress,
  onToggle,
}: {
  title: string
  connections: SpaceConnection[]
  actionInProgress: string | null
  onToggle: (connection: SpaceConnection) => void
}) {
  return (
    <section>
      <Subheading>{title}</Subheading>
      <ul className="mt-3 divide-y divide-zinc-950/5 rounded-xl border border-zinc-950/10 dark:divide-white/5 dark:border-white/10">
        {connections.map((connection) => {
          const busy = actionInProgress === connection.id
          return (
            <li key={connection.id} className="flex items-center gap-4 px-4 py-3">
              <connection.Icon className="size-5 shrink-0 text-zinc-700 dark:text-zinc-300" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-zinc-950 dark:text-white">{connection.name}</p>
                <p className="text-sm text-zinc-500 dark:text-zinc-400">{connection.kind}</p>
              </div>
              <Button outline disabled={busy} onClick={() => onToggle(connection)}>
                {connection.isLinked ? (busy ? 'Unlinking…' : 'Unlink') : busy ? 'Linking…' : 'Link'}
              </Button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
