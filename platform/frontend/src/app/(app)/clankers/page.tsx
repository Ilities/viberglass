import { Avatar } from '@/components/avatar'
import { Button } from '@/components/button'
import { Heading, Subheading } from '@/components/heading'
import { getProjectsList } from '@/data'
import { PlusIcon } from '@heroicons/react/16/solid'
import Link from 'next/link'

export default async function RootPage() {
  const projects = await getProjectsList()

  return (
    <>
      <div className="flex items-end justify-between">
        <Heading>Your Clankers</Heading>
        <Button href="/new" color="brand">
          <PlusIcon />
          New Clanker
        </Button>
      </div>

      <Subheading className="mt-8">Active clankers</Subheading>

      {projects.length === 0 ? (
        <div className="mt-8 rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-12 text-center dark:border-zinc-700 dark:bg-zinc-900">
          <h3 className="text-lg font-semibold text-zinc-950 dark:text-white">No clankers yet</h3>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
            Create your first clanker to coordinate tasks, triage issues, and automate workflows.
          </p>
          <Button href="/new" color="brand" className="mt-6">
            <PlusIcon />
            Create Clanker
          </Button>
        </div>
      ) : (
        <div className="mt-4 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <Link
              key={project.id}
              href={`/project/${project.slug}`}
              className="group hover:shadow-brand-lg relative overflow-hidden rounded-xl border border-zinc-950/10 bg-white p-6 shadow-sm transition-all hover:border-brand-burnt-orange/30 dark:border-white/10 dark:bg-zinc-900 dark:hover:border-brand-burnt-orange/30"
            >
              <div className="flex items-start gap-4">
                <Avatar
                  initials={project.name.substring(0, 2).toUpperCase()}
                  className="bg-brand-gradient size-12 text-brand-charcoal"
                />
                <div className="min-w-0 flex-1">
                  <h3 className="text-base font-semibold text-zinc-950 dark:text-white">{project.name}</h3>
                  <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                    {project.ticketSystem.charAt(0).toUpperCase() + project.ticketSystem.slice(1)} integration
                  </p>
                </div>
              </div>

              <div className="mt-6 grid grid-cols-2 gap-4 border-t border-zinc-950/5 pt-4 dark:border-white/5">
                <div>
                  <div className="text-sm font-medium text-zinc-950 dark:text-white">
                    {project.autoFixEnabled ? 'Enabled' : 'Disabled'}
                  </div>
                  <div className="text-xs text-zinc-500 dark:text-zinc-400">Autonomy</div>
                </div>
                <div>
                  <div className="text-sm font-medium text-brand-burnt-orange">
                    {project.autoFixTags.length > 0 ? project.autoFixTags.length : '—'}
                  </div>
                  <div className="text-xs text-zinc-500 dark:text-zinc-400">Skills</div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  )
}
