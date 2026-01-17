'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'

const settingsNavigation = [
  { name: 'Widget', href: '/settings/widget' },
  { name: 'AI Agent', href: '/settings/ai' },
  { name: 'Ticketing', href: '/settings/ticketing' },
  { name: 'Webhooks', href: '/settings/webhooks' },
]

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()

  return (
    <div className="lg:flex lg:gap-8">
      {/* Sidebar Navigation */}
      <aside className="lg:fixed lg:inset-y-0 lg:left-0 lg:z-10 lg:flex lg:w-48 lg:flex-col lg:border-r lg:border-zinc-950/10 lg:pt-20 dark:lg:border-white/10">
        <nav className="flex-1 px-6 pb-4 pt-6">
          <ul role="list" className="space-y-1">
            {settingsNavigation.map((item) => {
              const isActive = pathname === item.href
              return (
                <li key={item.name}>
                  <Link
                    href={item.href}
                    className={`
                      group flex gap-x-3 rounded-md px-3 py-2 text-sm font-semibold leading-6 transition-colors
                      ${
                        isActive
                          ? 'bg-zinc-950 text-white dark:bg-white dark:text-zinc-950'
                          : 'text-zinc-700 hover:bg-zinc-50 hover:text-zinc-950 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-white'
                      }
                    `}
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
