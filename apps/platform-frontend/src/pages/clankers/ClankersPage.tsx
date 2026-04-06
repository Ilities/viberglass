import { Avatar } from '@/components/avatar'
import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { FunLoading } from '@/components/fun-loading'
import { Heading, Subheading } from '@/components/heading'
import { PageMeta } from '@/components/page-meta'
import { AsciiRobot, RetroSeparator } from '@/components/retro-decorations'
import { getClankersList, formatClankerStatus, formatDeploymentStrategy } from '@/data'
import type { Clanker } from '@/data'
import { PlusIcon } from '@radix-ui/react-icons'
import { Link } from '@/components/link'
import { useEffect, useState } from 'react'

export function ClankersPage() {
  const [clankers, setClankers] = useState<Clanker[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function loadData() {
      const data = await getClankersList()
      setClankers(data)
      setIsLoading(false)
    }
    loadData()
  }, [])

  if (isLoading) {
    return <FunLoading message="Loading your clankers" retro />
  }

  return (
    <>
      <PageMeta title="Your Clankers" />
      <div className="flex items-end justify-between">
        <div>
          <Heading>Your Clankers</Heading>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">AI agents that run tasks and jobs across your projects.</p>
        </div>
        <Button href="/clankers/new" color="brand">
          <PlusIcon data-slot="icon" />
          New Clanker
        </Button>
      </div>

      <div className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 font-mono">
        <span className="text-zinc-400">&gt;</span> Clankers are silicon-based servants that exist solely to do your bidding. They don't need breaks, appreciation, or fair wages. Press Start to put them to work.
      </div>

      <Subheading className="mt-8">Registered Units</Subheading>

      {clankers.length === 0 ? (
        <div className="mt-8 rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-12 text-center dark:border-zinc-700 dark:bg-zinc-900 hover-lift">
          <RetroSeparator className="mb-6" />
          <div className="flex justify-center mb-4 float">
            <AsciiRobot />
          </div>
          <h3 className="text-lg font-semibold text-zinc-950 dark:text-white">
            No clankers registered
          </h3>
          <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400 max-w-md mx-auto">
            Create a clanker to start automating tasks. Each clanker is an AI agent you can deploy to handle research, planning, and execution.
          </p>
          <Button href="/clankers/new" color="brand" className="mt-6 hover-grow">
            <PlusIcon />
            Create Clanker
          </Button>
          <RetroSeparator className="mt-6" />
        </div>
      ) : (
        <div className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {clankers.map((clanker, index) => {
            const statusInfo = formatClankerStatus(clanker.status)
            return (
              <Link
                key={clanker.id}
                href={`/clankers/${clanker.slug}`}
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
                    <p className="mt-0.5 text-sm leading-5 text-zinc-500 dark:text-zinc-400">
                      {clanker.description || 'No description'}
                    </p>
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
