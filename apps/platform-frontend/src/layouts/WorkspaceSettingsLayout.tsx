import { SettingsNav, type SettingsNavSection } from '@/components/settings-nav'
import { useAuth } from '@/context/auth-context'
import { Navigate, Outlet, useLocation } from 'react-router-dom'

function section(pathname: string, heading: string, items: Array<{ name: string; href: string }>, intro?: string) {
  return {
    heading,
    intro,
    items: items.map((item) => ({ ...item, current: pathname.startsWith(item.href) })),
  }
}

/**
 * Workspace settings. What a product leader needs sits under General; the
 * plumbing setup chose defaults for (runners, connections, secrets, prompt
 * templates) sits under Advanced, for admins only (ADR 0003).
 */
export function WorkspaceSettingsLayout() {
  const pathname = useLocation().pathname
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'

  const sections: SettingsNavSection[] = isAdmin
    ? [
        section(pathname, 'General', [
          { name: 'Members', href: '/settings/users' },
          { name: 'API tokens', href: '/settings/api-tokens' },
        ]),
        section(
          pathname,
          'Advanced',
          [
            { name: 'Agents & runners', href: '/clankers' },
            { name: 'Connections', href: '/settings/integrations' },
            { name: 'Secrets', href: '/secrets' },
            { name: 'Prompt templates', href: '/settings/prompt-templates' },
          ],
          'How agents run and where credentials live. Setup picked defaults; change them here.',
        ),
      ]
    : [section(pathname, 'General', [{ name: 'API tokens', href: '/settings/api-tokens' }])]

  return (
    <div className="lg:flex lg:gap-8">
      <aside className="lg:w-56 lg:flex-none lg:border-r lg:border-zinc-950/10 dark:lg:border-white/10">
        <SettingsNav sections={sections} />
      </aside>
      <div className="min-w-0 flex-1">
        <Outlet />
      </div>
    </div>
  )
}

/** `/settings`: the first page this person can use. */
export function SettingsHome() {
  const { user } = useAuth()
  return <Navigate to={user?.role === 'admin' ? '/settings/users' : '/settings/api-tokens'} replace />
}
