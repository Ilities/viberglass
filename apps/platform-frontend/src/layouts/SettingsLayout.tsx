import { Link } from '@/components/link'
import { useParams, useLocation, Outlet } from 'react-router-dom'

export function SettingsLayout() {
  const pathname = useLocation().pathname
  const params = useParams()
  const project = params.project as string

  const settingsNavigation = [
    { name: 'Project', href: `/project/${project}/settings/project` },
    { name: 'Integrations', href: `/project/${project}/settings/integrations` },
  ]

  return (
    <div className="lg:flex lg:gap-8">
      {/* Sidebar Navigation */}
      <aside className="hidden lg:block lg:w-48 lg:flex-none lg:border-r lg:border-zinc-950/10 dark:lg:border-white/10">
        <nav className="sticky top-0 py-6 pr-6">
          <ul role="list" className="space-y-1">
            {settingsNavigation.map((item) => {
              const isActive = pathname === item.href
              return (
                <li key={item.name}>
                  <Link
                    href={item.href}
                    className={`group flex gap-x-3 border px-3 py-2 text-sm leading-6 font-semibold tracking-[0.01em] transition-colors ${
                      isActive
                        ? 'border-zinc-950 bg-zinc-950 text-white dark:border-white dark:bg-white dark:text-zinc-950'
                        : 'border-transparent text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50 hover:text-zinc-950 dark:text-zinc-400 dark:hover:border-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-white'
                    } `}
                  >
                    {item.name}
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>
      </aside>

      {/* Main Content */}
      <main className="flex-1"><Outlet /></main>
    </div>
  )
}
