import { SettingsNav, type SettingsNavSection } from '@/components/settings-nav'
import { useAuth } from '@/context/auth-context'
import { isRunner } from '@/lib/roles'
import {
  BarChartIcon,
  BellIcon,
  ComponentInstanceIcon,
  CounterClockwiseClockIcon,
  CubeIcon,
  FileTextIcon,
  IdCardIcon,
  LightningBoltIcon,
  Link2Icon,
  LockClosedIcon,
  PersonIcon,
  RocketIcon,
} from '@radix-ui/react-icons'
import type { ReactNode } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'

function section(pathname: string, heading: string, items: Array<{ name: string; href: string; icon: ReactNode }>) {
  return {
    heading,
    items: items.map((item) => ({ ...item, current: pathname.startsWith(item.href) })),
  }
}

const WORKSPACE = [
  { name: 'Members', href: '/settings/members', icon: <PersonIcon /> },
  { name: 'Agents', href: '/settings/agents', icon: <RocketIcon /> },
  { name: 'Connections', href: '/settings/connections', icon: <Link2Icon /> },
  { name: 'Secrets', href: '/settings/secrets', icon: <LockClosedIcon /> },
]

const ADVANCED = [
  { name: 'Model deployments', href: '/settings/model-deployments', icon: <CubeIcon /> },
  { name: 'MCP servers', href: '/settings/mcp-servers', icon: <ComponentInstanceIcon /> },
  { name: 'Skills', href: '/settings/skills', icon: <LightningBoltIcon /> },
  { name: 'Prompt templates', href: '/settings/prompt-templates', icon: <FileTextIcon /> },
  { name: 'Run records', href: '/settings/run-records', icon: <BarChartIcon /> },
  { name: 'Audit log', href: '/settings/audit-log', icon: <CounterClockwiseClockIcon /> },
]

const ADMIN_ONLY = [...WORKSPACE, ...ADVANCED].map((item) => item.href)

/**
 * Workspace settings. Everyone has their own (notifications, and API tokens
 * for those who run agents); admins also have the workspace's members, agents,
 * connections and secrets, and under Advanced the rest of the plumbing.
 */
export function WorkspaceSettingsLayout() {
  const pathname = useLocation().pathname
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'

  // The server refuses these too; the page shouldn't open only to fail.
  if (!isAdmin && ADMIN_ONLY.some((href) => pathname.startsWith(href))) return <Navigate to="/settings" replace />

  const sections: SettingsNavSection[] = [
    section(pathname, 'You', [
      { name: 'Notifications', href: '/settings/notifications', icon: <BellIcon /> },
      ...(isRunner(user?.role) ? [{ name: 'API tokens', href: '/settings/api-tokens', icon: <IdCardIcon /> }] : []),
    ]),
    ...(isAdmin
      ? [
          section(pathname, 'Workspace', WORKSPACE),
          section(pathname, 'Advanced', ADVANCED),
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
