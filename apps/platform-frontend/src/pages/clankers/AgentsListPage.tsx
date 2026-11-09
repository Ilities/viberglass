import { Avatar } from '@/components/avatar'
import { EmptyState } from '@/components/empty-state'
import { FunLoading } from '@/components/fun-loading'
import { Heading } from '@/components/heading'
import { PageMeta } from '@/components/page-meta'
import { RunnerReadinessBadge } from '@/components/runner-readiness-badge'
import { getAgentDirectory } from '@/service/api/agent-directory-api'
import { getAgentLabel, type AgentDirectoryEntry } from '@viberglass/types'
import { useEffect, useState } from 'react'

/** The workspace's agents for members and viewers: what each one is and whether it can run, read-only. */
export function AgentsListPage() {
  const [agents, setAgents] = useState<AgentDirectoryEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getAgentDirectory()
      .then(setAgents)
      .catch((loadError: unknown) => setError(loadError instanceof Error ? loadError.message : "Couldn't load the agents"))
  }, [])

  if (!agents && !error) return <FunLoading message="Loading agents" retro />

  return (
    <>
      <PageMeta title="Agents" />
      <Heading>Agents</Heading>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Which agents take the workspace's tasks, and on which model. Admins set them up.</p>
      {error && <p className="mt-6 text-sm text-red-700 dark:text-red-400">{error}</p>}
      {agents && agents.length === 0 && (
        <div className="mt-8">
          <EmptyState title="No agents yet" description="An admin adds the agents that run tasks." />
        </div>
      )}
      {agents && agents.length > 0 && (
        <ul className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {agents.map((agent) => (
            <li key={agent.id} className="rounded-xl border border-zinc-950/10 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-zinc-900">
              <div className="flex items-start gap-3">
                <Avatar initials={agent.name.substring(0, 2).toUpperCase()} className="bg-brand-gradient size-10 text-brand-charcoal" />
                <div className="min-w-0 flex-1">
                  <h3 className="text-[15px] leading-5 font-semibold text-zinc-950 dark:text-white">{agent.name}</h3>
                  <p className="mt-0.5 text-sm leading-5 text-zinc-700 dark:text-zinc-300">{agent.agent ? getAgentLabel(agent.agent) : 'No agent'}</p>
                  <p className="mt-0.5 truncate font-mono text-xs leading-4 text-zinc-500 dark:text-zinc-400" title={agent.model ?? undefined}>
                    {agent.model ?? 'Default model'}
                  </p>
                </div>
              </div>
              {agent.readiness !== undefined && (
                <div className="mt-4 border-t border-zinc-950/5 pt-3 text-sm dark:border-white/5">
                  <RunnerReadinessBadge readiness={agent.readiness} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
