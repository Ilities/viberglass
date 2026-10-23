import { useAuth } from '@/context/auth-context'
import { useProject } from '@/context/project-context'
import { Link } from '@/components/link'
import { isRunner } from '@/lib/roles'
import { cn } from '@/lib/utils'
import { LockClosedIcon } from '@radix-ui/react-icons'
import { Outlet, useLocation, useParams } from 'react-router-dom'
import { spaceTabs } from './spaceTabs'

/** A space's own pages under one header: its name and a tab per page. A task's page and other single records go without it. */
export function SpaceSectionLayout() {
  const { project: slug = '' } = useParams<{ project: string }>()
  const { pathname } = useLocation()
  const { user } = useAuth()
  const { project: space } = useProject()
  const tabs = spaceTabs({
    slug,
    pathname,
    files: space?.backingKind === 'files',
    runner: isRunner(user?.role),
    canMaintain: Boolean(space?.viewerAccess?.canMaintain),
  })

  return (
    <>
      <header className="mb-6">
        <h1 className="flex items-center gap-2 text-[28px] leading-tight font-bold tracking-[-0.025em] text-[var(--gray-12)]">
          {space?.name ?? slug}
          {space?.isPrivate && <LockClosedIcon aria-label="Private space" className="size-4 text-[var(--gray-10)]" />}
        </h1>
        <nav aria-label="Space" className="mt-4 flex overflow-x-auto border-b border-[var(--gray-5)]">
          {tabs.map((tab) => (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={tab.current ? 'page' : undefined}
              className={cn(
                'relative shrink-0 px-3 py-2.5 text-sm font-medium whitespace-nowrap transition-colors first:-ml-3',
                tab.current ? 'text-[var(--gray-12)]' : 'text-[var(--gray-10)] hover:text-[var(--gray-12)]'
              )}
            >
              {tab.label}
              {tab.current && <span aria-hidden className="absolute right-3 bottom-0 left-3 h-0.5 rounded-full bg-[var(--accent-9)]" />}
            </Link>
          ))}
        </nav>
      </header>
      <Outlet />
    </>
  )
}
