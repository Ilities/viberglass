import { SettingsNav, type SettingsNavSection } from '@/components/settings-nav'
import { useAuth } from '@/context/auth-context'
import { isRunner } from '@/lib/roles'
import { Navigate, Outlet, useLocation } from 'react-router-dom'

function section(pathname: string, heading: string, items: Array<{ name: string; href: string }>, intro?: string) {
  return {
    heading,
    intro,
    items: items.map((item) => ({ ...item, current: pathname.startsWith(item.href) })),
  }
}

const ADVANCED = [
  { name: 'Agents & runners', href: '/settings/agents' },
  { name: 'Connections', href: '/settings/connections' },
  { name: 'Secrets', href: '/settings/secrets' },
  { name: 'Prompt templates', href: '/settings/prompt-templates' },
  { name: 'Run records', href: '/settings/run-records' },
  { name: 'Audit log', href: '/settings/audit-log' },
]

const ADMIN_ONLY = [...ADVANCED.map((item) => item.href), '/settings/members']

/**
 * Workspace settings. Everyone has their own (notifications, and API tokens
 * for those who run agents); admins also have the workspace's members and,
 * under Advanced, the plumbing setup chose defaults for.
 */
export function WorkspaceSettingsLayout() {
  const pathname = useLocation().pathname
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'

  // The server refuses these too; the page shouldn't open only to fail.
  if (!isAdmin && ADMIN_ONLY.some((href) => pathname.startsWith(href))) return <Navigate to="/settings" replace />

  const sections: SettingsNavSection[] = [
    section(pathname, 'You', [
      { name: 'Notifications', href: '/settings/notifications' },
      ...(isRunner(user?.role) ? [{ name: 'API tokens', href: '/settings/api-tokens' }] : []),
    ]),
    ...(isAdmin
      ? [
          section(pathname, 'Workspace', [{ name: 'Members', href: '/settings/members' }]),
          section(
            pathname,
            'Advanced',
            ADVANCED,
            'How agents run, where credentials live, and what each run recorded. Setup picked defaults; change them here.',
          ),
        ]
      : []),
  ]

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

/** `/settings`: admins open on Members, everyone else on Notifications. */
export function SettingsHome() {
  const { user } = useAuth()
  return <Navigate to={user?.role === 'admin' ? '/settings/members' : '/settings/notifications'} replace />
}
