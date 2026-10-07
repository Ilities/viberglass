import { Link } from '@/components/link'
import type { ReactNode } from 'react'

export interface SettingsNavItem {
  name: string
  href: string
  current: boolean
  icon?: ReactNode
}

export interface SettingsNavSection {
  heading?: string
  items: SettingsNavItem[]
}

/** The side menu of a settings area, optionally in headed sections. */
export function SettingsNav({ sections }: { sections: SettingsNavSection[] }) {
  return (
    <nav className="sticky top-0 grid gap-6 py-6 pr-6">
      {sections.map((section, index) => (
        <div key={section.heading ?? index} className="grid gap-2">
          {section.heading && (
            <h2 className="px-3 text-xs font-semibold tracking-wide text-zinc-500 uppercase dark:text-zinc-500">
              {section.heading}
            </h2>
          )}
          <ul role="list" className="space-y-1">
            {section.items.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={item.current ? 'page' : undefined}
                  className={`group flex items-center gap-x-3 border px-3 py-2 text-sm leading-6 font-semibold tracking-[0.01em] transition-colors ${
                    item.current
                      ? 'border-transparent bg-[var(--gray-4)] text-[var(--gray-12)]'
                      : 'border-transparent text-zinc-700 hover:border-zinc-950/12 hover:bg-zinc-950/5 hover:text-zinc-950 dark:text-zinc-200 dark:hover:border-white/20 dark:hover:bg-white/5 dark:hover:text-white'
                  }`}
                >
                  {item.icon && (
                    <span
                      aria-hidden
                      className={`flex size-4 shrink-0 items-center justify-center ${
                        item.current ? 'text-[var(--gray-12)]' : 'text-zinc-500 group-hover:text-zinc-950 dark:text-zinc-400 dark:group-hover:text-white'
                      }`}
                    >
                      {item.icon}
                    </span>
                  )}
                  {item.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  )
}
