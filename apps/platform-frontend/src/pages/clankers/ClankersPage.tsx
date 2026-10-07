import { Avatar } from '@/components/avatar'
import { Button } from '@/components/button'
import { FunLoading } from '@/components/fun-loading'
import { Heading } from '@/components/heading'
import { PageMeta } from '@/components/page-meta'
import { RunnerReadinessBadge } from '@/components/runner-readiness-badge'
import { EmptyState } from '@/components/empty-state'
import { getClankersList, formatDeploymentStrategy } from '@/data'
import type { Clanker } from '@/data'
import { PlusIcon } from '@radix-ui/react-icons'
import { Link } from '@/components/link'
import { listAllSecrets, type Secret } from '@/service/api/secret-api'
import { getAgentLabel, type ModelEndpoint } from '@viberglass/types'
import { useEffect, useState } from 'react'
import { summarizeRunner } from './config/runnerSummary'
import { listModelEndpoints } from '@/service/api/model-endpoint-api'
import { canStartClanker, StartClankerButton } from './clanker-actions'
import { useAuth } from '@/context/auth-context'
import { toast } from 'sonner'

export function ClankersPage() {
  const [clankers, setClankers] = useState<Clanker[]>([])
  const [secrets, setSecrets] = useState<Secret[]>([])
  const [endpoints, setEndpoints] = useState<ModelEndpoint[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const isAdmin = useAuth().user?.role === 'admin'

  useEffect(() => {
    async function loadData() {
      const [data, allSecrets, allEndpoints] = await Promise.all([
        getClankersList(),
        listAllSecrets().catch(() => []),
        listModelEndpoints().catch(() => []),
      ])
      setClankers(data)
      setSecrets(allSecrets)
      setEndpoints(allEndpoints)
      setIsLoading(false)
    }
    loadData()
  }, [])

  if (isLoading) {
    return <FunLoading message="Loading agents" retro />
  }

  function replaceClanker(updated: Clanker) {
    setClankers((previous) => previous.map((clanker) => (clanker.id === updated.id ? updated : clanker)))
  }

  return (
    <>
      <PageMeta title="Agents" />
      <div className="flex items-end justify-between">
        <div>
          <Heading>Agents</Heading>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Which agent runs a task, with which model key, on which compute.</p>
        </div>
        {clankers.length > 0 && (
          <Button href="/settings/agents/new" color="brand">
            <PlusIcon data-slot="icon" />
            New agent
          </Button>
        )}
      </div>

      {clankers.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            title="No agents yet"
            description="Setup creates a default one. Add more to use another agent, model or compute."
            action={
              <Button href="/settings/agents/new" color="brand">
                <PlusIcon data-slot="icon" />
                New agent
              </Button>
            }
          />
        </div>
      ) : (
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {clankers.map((clanker, index) => {
            const summary = summarizeRunner(clanker, secrets, endpoints)
            const startable = isAdmin && canStartClanker(clanker)
            // An admin gets the Start button instead of being told an admin can start it.
            const problem = startable && clanker.status === 'inactive' ? null : clanker.readiness?.problem
            return (
              <div
                key={clanker.id}
                className="group relative overflow-hidden rounded-xl border border-zinc-950/10 bg-white p-5 shadow-sm hover-lift dark:border-white/10 dark:bg-zinc-900 slide-up"
                style={{ animationDelay: `${index * 0.1}s` }}
              >
                <div className="flex items-start gap-3">
                  <Avatar
                    initials={clanker.name.substring(0, 2).toUpperCase()}
                    className="bg-brand-gradient size-10 text-brand-charcoal"
                  />
                  <div className="min-w-0 flex-1">
                    <h3 className="text-[15px] font-semibold leading-5 text-zinc-950 dark:text-white">
                      <Link href={`/settings/agents/${clanker.slug}`} className="after:absolute after:inset-0">
                        {clanker.name}
                      </Link>
                    </h3>
                    <p className="mt-0.5 text-sm leading-5 text-zinc-700 dark:text-zinc-300">
                      {clanker.agent ? getAgentLabel(clanker.agent) : 'No agent'}
                      {summary.usesChatGptLogin
                        ? ' · ChatGPT login'
                        : summary.providerLabel && ` · ${summary.providerLabel}`}
                    </p>
                    {summary.model && (
                      <p className="mt-0.5 truncate font-mono text-xs leading-4 text-zinc-500 dark:text-zinc-400">
                        {summary.model}
                      </p>
                    )}
                  </div>
                </div>

                <div
                  className="mt-4 flex items-center gap-2 border-t border-zinc-950/5 pt-3 text-sm dark:border-white/5"
                  title={clanker.statusMessage ?? undefined}
                >
                  <RunnerReadinessBadge readiness={clanker.readiness} />
                  <span className="text-zinc-500 dark:text-zinc-400">{formatDeploymentStrategy(clanker.deploymentStrategy)}</span>
                </div>
                {problem && <p className="mt-2 text-xs leading-4 text-zinc-600 dark:text-zinc-400">{problem}</p>}
                {startable && (
                  <div className="relative z-10 mt-3">
                    <StartClankerButton
                      clanker={clanker}
                      outline
                      onClankerUpdated={replaceClanker}
                      onError={(message) => message && toast.error("Couldn't start the agent", { description: message })}
                    />
                  </div>
                )}

                {clanker.configFiles.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1">
                    {clanker.configFiles.map((file) => (
                      <span
                        key={file.fileType}
                        className="inline-flex items-center rounded bg-zinc-100 px-1.5 py-0.5 text-[11px] text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                      >
                        {file.fileType}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}
