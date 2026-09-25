import { SettingsNav } from '@/components/settings-nav'
import { Outlet, useLocation, useParams } from 'react-router-dom'

export function SettingsLayout() {
  const pathname = useLocation().pathname
  const params = useParams()
  const project = params.project as string

  const items = [
    { name: 'Project', href: `/project/${project}/settings/project` },
    { name: 'Integrations', href: `/project/${project}/settings/integrations` },
    { name: 'Prompt Templates', href: `/project/${project}/settings/prompt-templates` },
  ].map((item) => ({ ...item, current: pathname === item.href }))

  return (
    <div className="lg:flex lg:gap-8">
      {/* Sidebar Navigation */}
      <aside className="hidden lg:block lg:w-48 lg:flex-none lg:border-r lg:border-zinc-950/10 dark:lg:border-white/10">
        <SettingsNav sections={[{ items }]} />
      </aside>

      {/* Main Content */}
      <main className="min-w-0 flex-1 p-6 lg:p-8">
        <Outlet />
      </main>
    </div>
  )
}
