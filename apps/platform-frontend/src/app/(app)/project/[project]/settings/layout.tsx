'use client'

import Link from 'next/link'
import { useParams, usePathname } from 'next/navigation'

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const params = useParams()
  const project = params.project as string

  const settingsNavigation = [
    { name: 'Widget', href: `/project/${project}/settings/widget` },
    { name: 'AI Agent', href: `/project/${project}/settings/ai` },
    { name: 'Ticketing', href: `/project/${project}/settings/ticketing` },
    { name: 'Webhooks', href: `/project/${project}/settings/webhooks` },
  ]

  return (
    <div className="lg:flex lg:gap-8">
      {/* Sidebar Navigation */}
      <aside className="hidden lg:block lg:w-48 lg:flex-none lg:border-r lg:border-zinc-950/10 dark:lg:border-white/10">
        <nav className="sticky top-16 py-6 pr-6">
          <ul role="list" className="space-y-1">
            {settingsNavigation.map((item) => {
              const isActive = pathname === item.href
              return (
                <li key={item.name}>
                  <Link
                    href={item.href}
                    className={`group flex gap-x-3 rounded-md px-3 py-2 text-sm leading-6 font-semibold transition-colors ${
                      isActive
                        ? 'bg-zinc-950 text-white dark:bg-white dark:text-zinc-950'
                        : 'text-zinc-700 hover:bg-zinc-50 hover:text-zinc-950 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-white'
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
      <main className="flex-1">{children}</main>
    </div>
  )
}
