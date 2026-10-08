import { Button } from '@/components/button'
import { EmptyState } from '@/components/empty-state'
import { Heading } from '@/components/heading'
import { PageMeta } from '@/components/page-meta'
import { Text } from '@/components/text'
import { useProject } from '@/context/project-context'
import { integrationFrontendRegistry } from '@/integrations/registerFrontendIntegrationPlugins'
import {
  getAvailableIntegrationTypes,
  getConnectionIssueRules,
  getIntegrationInboundWebhooks,
  getIntegrations,
  type TrackerIssueRule,
} from '@/service/api/integration-api'
import { getProjectScmConfig } from '@/service/api/project-api'
import { useCallback, useEffect, useState } from 'react'
import { TrackerIssuesCard, type TrackerConnection } from './TrackerIssuesCard'

const GITHUB_REPOSITORY = /github\.com[/:]([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/i
const OWNER_REPO = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/

function githubRepository(address: string | undefined): string | null {
  const match = address?.trim().match(GITHUB_REPOSITORY) ?? address?.trim().match(OWNER_REPO)
  return match ? `${match[1]}/${match[2]}` : null
}

/** Which issues from the workspace's trackers become the space's tasks. */
export function SpaceIssuesPage() {
  const { project } = useProject()
  const [connections, setConnections] = useState<TrackerConnection[] | null>(null)
  const [repository, setRepository] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const projectId = project?.id
  const load = useCallback(async () => {
    if (!projectId) return
    setError(null)
    try {
      const [workspaceConnections, types, scm] = await Promise.all([
        getIntegrations(),
        getAvailableIntegrationTypes(),
        getProjectScmConfig(projectId),
      ])
      setRepository(scm?.integrationSystem === 'github' ? githubRepository(scm.sourceRepository) : null)
      const ready = new Set(types.filter((type) => type.status !== 'stub').map((type) => type.id))
      const trackers = workspaceConnections.flatMap((connection) => {
        const tracker = integrationFrontendRegistry.get(connection.system)?.trackerWebhook
        return tracker && ready.has(connection.system) ? [{ connection, tracker }] : []
      })
      setConnections(
        await Promise.all(
          trackers.map(async ({ connection, tracker }) => {
            const [webhooks, rules] = await Promise.all([
              getIntegrationInboundWebhooks(connection.id).catch(() => []),
              getConnectionIssueRules(connection.id),
            ])
            return { id: connection.id, name: connection.name, system: connection.system, tracker, hasWebhook: webhooks.length > 0, rules }
          })
        )
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load the trackers')
    }
  }, [projectId])

  useEffect(() => {
    void load()
  }, [load])

  function saved(connection: TrackerConnection, own: TrackerIssueRule[]) {
    if (!project) return
    const others = connection.rules.filter((rule) => rule.projectId !== project.id)
    const mine = own.map((rule) => ({ ...rule, projectName: project.name, projectSlug: project.slug }))
    setConnections((current) => current?.map((item) => (item.id === connection.id ? { ...item, rules: [...others, ...mine] } : item)) ?? null)
  }

  return (
    <>
      <PageMeta title={project ? `${project.name} | Incoming issues` : 'Incoming issues'} />
      <Heading>Incoming issues</Heading>
      <Text className="mt-2 max-w-2xl">
        Issues the space takes become its tasks, linked to the issue: comments go both ways, and the plan, questions,
        pull request and done are posted back to it. An issue several spaces take gets a task in each.
      </Text>

      {error && <p className="mt-6 text-sm text-red-600 dark:text-red-400">{error}</p>}

      {!connections ? (
        !error && <Text className="mt-6">Loading…</Text>
      ) : connections.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title="No trackers connected"
            description="Connect GitHub, Jira or Shortcut in the workspace settings first."
            action={
              <Button outline href="/settings/connections">
                Workspace connections
              </Button>
            }
          />
        </div>
      ) : (
        <div className="mt-8 space-y-6">
          {project &&
            connections.map((connection) => (
              <TrackerIssuesCard
                key={connection.id}
                projectId={project.id}
                connection={connection}
                repository={repository}
                onSaved={(rules) => saved(connection, rules)}
              />
            ))}
        </div>
      )}
    </>
  )
}
