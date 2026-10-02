import { Avatar } from '@/components/avatar'
import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { FunLoading } from '@/components/fun-loading'
import { Heading, Subheading } from '@/components/heading'
import { PageMeta } from '@/components/page-meta'
import { EmptyState } from '@/components/empty-state'
import { getClankersList, formatClankerStatus, formatDeploymentStrategy } from '@/data'
import type { Clanker } from '@/data'
import { PlusIcon } from '@radix-ui/react-icons'
import { Link } from '@/components/link'
import { listAllSecrets, type Secret } from '@/service/api/secret-api'
import { getAgentLabel } from '@viberglass/types'
import { useEffect, useState } from 'react'
import { summarizeRunner } from './config/runnerSummary'

export function ClankersPage() {
  const [clankers, setClankers] = useState<Clanker[]>([])
  const [secrets, setSecrets] = useState<Secret[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function loadData() {
      const [data, allSecrets] = await Promise.all([getClankersList(), listAllSecrets().catch(() => [])])
      setClankers(data)
      setSecrets(allSecrets)
      setIsLoading(false)
    }
    loadData()
  }, [])

  if (isLoading) {
    return <FunLoading message="Loading agent runners" retro />
  }

  return (
    <>
      <PageMeta title="Agent runners" />
      <div className="flex items-end justify-between">
        <div>
          <Heading>Agent runners</Heading>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Which agent runs a task, with which model key, on which compute.</p>
        </div>
        <Button href="/settings/agents/new" color="brand">
          <PlusIcon data-slot="icon" />
          New agent runner
        </Button>
      </div>

      <div className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 font-mono">
        <span className="text-zinc-400">&gt;</span> Agent runners connect coding agents to task research, planning and builds.
      </div>

      <Subheading className="mt-8">Runners</Subheading>

      {clankers.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            title="No agent runners yet"
            description="Setup creates a default one. Add more to use another agent, model or compute."
            action={
              <Button href="/settings/agents/new" color="brand">
                <PlusIcon data-slot="icon" />
                Create agent runner
              </Button>
            }
          />
        </div>
      ) : (
        <div className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {clankers.map((clanker, index) => {
            const statusInfo = formatClankerStatus(clanker.status)
            const summary = summarizeRunner(clanker, secrets)
            return (
              <Link
                key={clanker.id}
                href={`/settings/agents/${clanker.slug}`}
                className="group relative overflow-hidden rounded-xl border border-zinc-950/10 bg-white p-5 shadow-sm hover-lift dark:border-white/10 dark:bg-zinc-900 slide-up"
                style={{ animationDelay: `${index * 0.1}s` }}
              >
                <div className="flex items-start gap-3">
                  <Avatar
                    initials={clanker.name.substring(0, 2).toUpperCase()}
                    className="bg-brand-gradient size-10 text-brand-charcoal"
                  />
                  <div className="min-w-0 flex-1">
                    <h3 className="text-[15px] font-semibold leading-5 text-zinc-950 dark:text-white">{clanker.name}</h3>
                    <p className="mt-0.5 text-sm leading-5 text-zinc-700 dark:text-zinc-300">
                      {clanker.agent ? getAgentLabel(clanker.agent) : 'No agent'}
                      {summary.usesChatGptLogin
                        ? ' · ChatGPT login'
                        : summary.providerLabel && ` · ${summary.providerLabel}`}
                    </p>
                    {summary.problem ? (
                      <p className="mt-0.5 text-xs leading-4 text-amber-700 dark:text-amber-400">No usable model key</p>
                    ) : (
                      summary.model && (
                        <p className="mt-0.5 truncate font-mono text-xs leading-4 text-zinc-500 dark:text-zinc-400">
                          {summary.model}
                        </p>
                      )
                    )}
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3 border-t border-zinc-950/5 pt-3 dark:border-white/5">
                  <div>
                    <div className="text-xs text-zinc-500 dark:text-zinc-400">Status</div>
                    <Badge className={statusInfo.color}>{statusInfo.label}</Badge>
                    {clanker.statusMessage && (
                      <div className="mt-0.5 text-xs leading-4 text-zinc-500 dark:text-zinc-400">
                        {clanker.statusMessage}
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="text-sm font-medium leading-5 text-brand-burnt-orange">
                      {formatDeploymentStrategy(clanker.deploymentStrategy)}
                    </div>
                    <div className="text-xs text-zinc-500 dark:text-zinc-400">Deployment</div>
                  </div>
                </div>

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
              </Link>
            )
          })}
        </div>
      )}
    </>
  )
}
