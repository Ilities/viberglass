import { useAuth } from '@/context/auth-context'
import { useProject } from '@/context/project-context'
import { seesRuns } from '@/lib/roles'
import { LockClosedIcon } from '@radix-ui/react-icons'
import { Outlet, useLocation, useParams } from 'react-router-dom'
import { SpaceTabStrip } from './space-tab-strip'
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
    app: space?.backingKind === 'app',
    seesRuns: seesRuns(user?.role),
    canMaintain: Boolean(space?.viewerAccess?.canMaintain),
  })

  return (
    <>
      <header className="mb-6">
        <h1 className="flex items-center gap-2 text-[28px] leading-tight font-bold tracking-[-0.025em] text-[var(--gray-12)]">
          {space?.name ?? slug}
          {space?.isPrivate && <LockClosedIcon aria-label="Private space" className="size-4 text-[var(--gray-10)]" />}
        </h1>
        <SpaceTabStrip tabs={tabs} />
      </header>
      <Outlet />
    </>
  )
}
