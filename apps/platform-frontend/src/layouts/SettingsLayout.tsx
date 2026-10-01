import { SettingsNav } from '@/components/settings-nav'
import { getProjectBySlug } from '@/service/api/project-api'
import { useEffect, useState } from 'react'
import { Outlet, useLocation, useParams } from 'react-router-dom'

export function SettingsLayout() {
  const pathname = useLocation().pathname
  const params = useParams()
  const project = params.project as string
  const [canMaintain, setCanMaintain] = useState<boolean | null>(null)

  useEffect(() => {
    getProjectBySlug(project)
      .then((loaded) => setCanMaintain(loaded.viewerAccess?.canMaintain ?? true))
      .catch(() => setCanMaintain(null))
  }, [project])

  const items = [
    { name: 'Space', href: `/spaces/${project}/settings/general` },
    { name: 'Members', href: `/spaces/${project}/settings/members` },
    { name: 'Integrations', href: `/spaces/${project}/settings/connections` },
    { name: 'Prompt Templates', href: `/spaces/${project}/settings/prompt-templates` },
  ].map((item) => ({ ...item, current: pathname === item.href }))

  return (
    <div className="lg:flex lg:gap-8">
      {/* Sidebar Navigation */}
      <aside className="hidden lg:block lg:w-48 lg:flex-none lg:border-r lg:border-zinc-950/10 dark:lg:border-white/10">
        <SettingsNav sections={[{ items }]} />
      </aside>

      {/* Main Content */}
      <main className="min-w-0 flex-1 p-6 lg:p-8">
        {canMaintain === false && (
          <p className="mb-6 rounded-lg border border-zinc-950/10 bg-zinc-50 px-4 py-3 text-sm text-zinc-700 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-300">
            You can see this space's settings. Only its maintainers and workspace admins can change them.
          </p>
        )}
        <Outlet />
      </main>
    </div>
  )
}
