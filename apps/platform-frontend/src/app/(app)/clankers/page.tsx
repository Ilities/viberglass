import { Avatar } from '@/components/avatar'
import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { Heading, Subheading } from '@/components/heading'
import { getClankersList, formatClankerStatus, formatDeploymentStrategy } from '@/data'
import { PlusIcon } from '@heroicons/react/16/solid'
import Link from 'next/link'

export default async function ClankersPage() {
  const clankers = await getClankersList()

  return (
    <>
      <div className="flex items-end justify-between">
        <Heading>Your Clankers</Heading>
        <Button href="/clankers/new" color="brand">
          <PlusIcon />
          New Clanker
        </Button>
      </div>

      <div className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
        Creating a clanker saves its configuration. Use Start on a clanker to provision it and update its status.
      </div>

      <Subheading className="mt-8">Clankers</Subheading>

      {clankers.length === 0 ? (
        <div className="mt-8 rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-12 text-center dark:border-zinc-700 dark:bg-zinc-900">
          <h3 className="text-lg font-semibold text-zinc-950 dark:text-white">No clankers yet</h3>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
            Create your first clanker to coordinate tasks, then start it when you are ready to provision.
          </p>
          <Button href="/clankers/new" color="brand" className="mt-6">
            <PlusIcon />
            Create Clanker
          </Button>
        </div>
      ) : (
        <div className="mt-4 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {clankers.map((clanker) => {
            const statusInfo = formatClankerStatus(clanker.status)
            return (
              <Link
                key={clanker.id}
                href={`/clankers/${clanker.slug}`}
                className="group hover:shadow-brand-lg relative overflow-hidden rounded-xl border border-zinc-950/10 bg-white p-6 shadow-sm transition-all hover:border-brand-burnt-orange/30 dark:border-white/10 dark:bg-zinc-900 dark:hover:border-brand-burnt-orange/30"
              >
                <div className="flex items-start gap-4">
                  <Avatar
                    initials={clanker.name.substring(0, 2).toUpperCase()}
                    className="bg-brand-gradient size-12 text-brand-charcoal"
                  />
                  <div className="min-w-0 flex-1">
                    <h3 className="text-base font-semibold text-zinc-950 dark:text-white">{clanker.name}</h3>
                    <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                      {clanker.description || 'No description'}
                    </p>
                  </div>
                </div>

                <div className="mt-6 grid grid-cols-2 gap-4 border-t border-zinc-950/5 pt-4 dark:border-white/5">
                  <div>
                    <div className="text-xs text-zinc-500 dark:text-zinc-400">Status</div>
                    <Badge className={statusInfo.color}>{statusInfo.label}</Badge>
                    {clanker.statusMessage && (
                      <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                        {clanker.statusMessage}
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="text-sm font-medium text-brand-burnt-orange">
                      {formatDeploymentStrategy(clanker.deploymentStrategy)}
                    </div>
                    <div className="text-xs text-zinc-500 dark:text-zinc-400">Deployment</div>
                  </div>
                </div>

                {clanker.configFiles.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-1">
                    {clanker.configFiles.map((file) => (
                      <span
                        key={file.fileType}
                        className="inline-flex items-center rounded bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
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
