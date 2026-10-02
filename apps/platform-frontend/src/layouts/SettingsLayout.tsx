import { SettingsNav } from '@/components/settings-nav'
import { useProject } from '@/context/project-context'
import { Navigate, Outlet, useLocation, useParams } from 'react-router-dom'

const MAINTAINERS_ONLY = ['connections', 'prompt-templates']

/** A space's settings. Everyone may read what the space is and who's in it; only its maintainers see the rest. */
export function SettingsLayout() {
  const pathname = useLocation().pathname
  const { project: slug } = useParams<{ project: string }>()
  const { project, isLoading } = useProject()
  const base = `/spaces/${slug}/settings`
  const canMaintain = Boolean(project?.viewerAccess?.canMaintain)

  if (isLoading || !project) return null
  if (!canMaintain && MAINTAINERS_ONLY.some((tab) => pathname.startsWith(`${base}/${tab}`))) return <Navigate to={`${base}/general`} replace />

  const items = [
    { name: canMaintain ? 'Space' : 'About', href: `${base}/general` },
    { name: 'Members', href: `${base}/members` },
    ...(canMaintain
      ? [
          { name: 'Connections', href: `${base}/connections` },
          { name: 'Agent instructions', href: `${base}/prompt-templates` },
        ]
      : []),
  ].map((item) => ({ ...item, current: pathname === item.href }))

  return (
    <div className="lg:flex lg:gap-8">
      <aside className="hidden lg:block lg:w-48 lg:flex-none lg:border-r lg:border-zinc-950/10 dark:lg:border-white/10">
        <SettingsNav sections={[{ items }]} />
      </aside>
      <main className="min-w-0 flex-1 p-6 lg:p-8">
        <Outlet />
      </main>
    </div>
  )
}
