import { Heading, Subheading } from '@/components/heading'
import { Button } from '@/components/button'
import { PlusIcon } from '@heroicons/react/16/solid'
import Link from 'next/link'
import { Avatar } from '@/components/avatar'

const projects = [
  {
    id: 'vibug',
    name: 'Vibug',
    description: 'Bug tracking and automated fixing system',
    avatar: '/teams/viberator.svg',
    stats: {
      openBugs: 12,
      resolvedThisWeek: 8,
      autoFixRequests: 5,
    },
  },
  {
    id: 'viberator',
    name: 'Viberator',
    description: 'AI-powered code enhancement platform',
    initials: 'VB',
    stats: {
      openBugs: 3,
      resolvedThisWeek: 15,
      autoFixRequests: 2,
    },
  },
]

export default function RootPage() {
  return (
    <>
      <div className="flex items-end justify-between">
        <Heading>Your Projects</Heading>
        <Button href="/new" color="brand">
          <PlusIcon />
          New Project
        </Button>
      </div>

      <Subheading className="mt-8">Active projects</Subheading>

      <div className="mt-4 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {projects.map((project) => (
          <Link
            key={project.id}
            href={`/project/${project.id}`}
            className="group relative overflow-hidden rounded-xl border border-zinc-950/10 bg-white p-6 shadow-sm transition-all hover:border-brand-burnt-orange/30 hover:shadow-brand-lg dark:border-white/10 dark:bg-zinc-900 dark:hover:border-brand-burnt-orange/30"
          >
            <div className="flex items-start gap-4">
              {project.avatar ? (
                <Avatar src={project.avatar} className="size-12" />
              ) : (
                <Avatar
                  initials={project.initials}
                  className="size-12 bg-brand-gradient text-brand-charcoal"
                />
              )}
              <div className="min-w-0 flex-1">
                <h3 className="text-base font-semibold text-zinc-950 dark:text-white">{project.name}</h3>
                <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{project.description}</p>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-3 gap-4 border-t border-zinc-950/5 pt-4 dark:border-white/5">
              <div>
                <div className="text-2xl font-semibold text-zinc-950 dark:text-white">
                  {project.stats.openBugs}
                </div>
                <div className="text-xs text-zinc-500 dark:text-zinc-400">Open bugs</div>
              </div>
              <div>
                <div className="text-2xl font-semibold text-brand-burnt-orange">
                  {project.stats.resolvedThisWeek}
                </div>
                <div className="text-xs text-zinc-500 dark:text-zinc-400">Resolved</div>
              </div>
              <div>
                <div className="text-2xl font-semibold text-zinc-950 dark:text-white">
                  {project.stats.autoFixRequests}
                </div>
                <div className="text-xs text-zinc-500 dark:text-zinc-400">Auto-fix</div>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </>
  )
}
