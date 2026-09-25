import { Link } from '@/components/link'

export interface SettingsNavItem {
  name: string
  href: string
  current: boolean
}

export interface SettingsNavSection {
  heading?: string
  intro?: string
  items: SettingsNavItem[]
}

/** The side menu of a settings area, optionally in headed sections. */
export function SettingsNav({ sections }: { sections: SettingsNavSection[] }) {
  return (
    <nav className="sticky top-0 grid gap-6 py-6 pr-6">
      {sections.map((section, index) => (
        <div key={section.heading ?? index} className="grid gap-2">
          {section.heading && (
            <h2 className="px-3 text-xs font-semibold tracking-wide text-zinc-500 uppercase dark:text-zinc-400">
              {section.heading}
            </h2>
          )}
          {section.intro && <p className="px-3 text-xs text-zinc-500 dark:text-zinc-400">{section.intro}</p>}
          <ul role="list" className="space-y-1">
            {section.items.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={item.current ? 'page' : undefined}
                  className={`group flex gap-x-3 border px-3 py-2 text-sm leading-6 font-semibold tracking-[0.01em] transition-colors ${
                    item.current
                      ? 'border-zinc-950 bg-zinc-950 text-white dark:border-white dark:bg-white dark:text-zinc-950'
                      : 'border-transparent text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50 hover:text-zinc-950 dark:text-zinc-400 dark:hover:border-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-white'
                  }`}
                >
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
