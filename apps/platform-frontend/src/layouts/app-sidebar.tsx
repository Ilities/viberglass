import { Dropdown, DropdownButton } from '@/components/dropdown'
import { Link } from '@/components/link'
import {
  Sidebar,
  SidebarBody,
  SidebarCollapseToggle,
  SidebarFooter,
  SidebarHeader,
  SidebarHeading,
  SidebarItem,
  SidebarLabel,
  SidebarCollapsedContext,
  SidebarSection,
} from '@/components/sidebar'
import type { AuthUser } from '@/service/api/auth-api'
import type { Project } from '@/service/api/project-api'
import { ActivityLogIcon, ChevronUpIcon, ClockIcon, GearIcon, HomeIcon, LockClosedIcon, PlusIcon } from '@radix-ui/react-icons'
import { isRunner } from '@/lib/roles'
import clsx from 'clsx'
import { useContext } from 'react'
import { AccountMenu, UserAvatar } from './account-menu'
import { NavIcon } from './nav-icon'
import { SpaceAvatar } from './space-avatar'

interface AppSidebarProps {
  user: AuthUser
  pathname: string
  spaces: Project[]
  /** The space the page is in, expanded in place. */
  currentSpace?: string
  needsYou: number
  onSignOut: () => void
}

function NavBadge({ count }: { count?: number }) {
  const collapsed = useContext(SidebarCollapsedContext)
  if (!count) return null
  return (
    <span
      aria-label={`${count} need you`}
      title="Questions and mentions waiting for you"
      className={clsx(
        'rounded-full bg-[var(--accent-9)] px-1.5 text-[11px] font-semibold text-white',
        // Collapsed, the item is just its icon, so the count sits on its corner.
        collapsed ? 'absolute top-0.5 right-1.5 text-[10px]' : 'ml-auto'
      )}
    >
      {count > 99 ? '99+' : count}
    </span>
  )
}

function SpaceChildren({ slug, pathname, canSeeRuns }: { slug: string; pathname: string; canSeeRuns: boolean }) {
  const collapsed = useContext(SidebarCollapsedContext)
  const base = `/spaces/${slug}`
  const children = [
    ...(canSeeRuns
      ? [
          { href: `${base}/runs`, label: 'Runs', icon: <ActivityLogIcon /> },
          { href: `${base}/schedules`, label: 'Schedules', icon: <ClockIcon /> },
        ]
      : []),
    { href: `${base}/settings`, label: 'Space settings', icon: <GearIcon /> },
  ]
  return (
    // Sidebar items are inline spans that need a flex column to lay out as rows.
    <div className={clsx('flex flex-col gap-0.5', !collapsed && 'pl-5')}>
      {children.map((child) => (
        <SidebarItem key={child.href} href={child.href} current={pathname.startsWith(child.href)}>
          <NavIcon>{child.icon}</NavIcon>
          <SidebarLabel>{child.label}</SidebarLabel>
        </SidebarItem>
      ))}
    </div>
  )
}

/**
 * The same navigation everywhere: Home and Overview, the spaces (the one
 * you're in expands in place), Settings, and you.
 */
export function AppSidebar({ user, pathname, spaces, currentSpace, needsYou, onSignOut }: AppSidebarProps) {
  const runner = isRunner(user.role)
  const collapsed = useContext(SidebarCollapsedContext)
  return (
    <Sidebar>
      <SidebarHeader>
        <Link href="/">
          <div className="flex items-center gap-2.5">
            <img src="/logos/viberglass.svg" alt="Viberglass logo" className="size-7 shrink-0 sm:size-6" />
            <SidebarLabel className="text-sm font-semibold text-zinc-950 dark:text-white">Viberglass</SidebarLabel>
          </div>
        </Link>
      </SidebarHeader>
      <SidebarBody>
        <SidebarSection>
          {/* Viewers have no threads of their own; their way in is Overview. */}
          {user.role !== 'viewer' && (
            <SidebarItem href="/" current={pathname === '/'}>
              <NavIcon>
                <HomeIcon />
              </NavIcon>
              <SidebarLabel>Home</SidebarLabel>
              <NavBadge count={needsYou} />
            </SidebarItem>
          )}
          <SidebarItem href="/overview" current={pathname.startsWith('/overview')}>
            <NavIcon>
              <ActivityLogIcon />
            </NavIcon>
            <SidebarLabel>Overview</SidebarLabel>
          </SidebarItem>
        </SidebarSection>

        <SidebarSection aria-label="Spaces">
          <SidebarHeading>Spaces</SidebarHeading>
          {spaces.map((space) => {
            const base = `/spaces/${space.slug}`
            const expanded = space.slug === currentSpace
            return (
              <div key={space.id} className="flex flex-col gap-0.5">
                <SidebarItem href={base} current={pathname === base || pathname.startsWith(`${base}/tasks`)}>
                  <SpaceAvatar space={space} slot="avatar" />
                  <SidebarLabel>{space.name}</SidebarLabel>
                  {space.isPrivate && !collapsed && (
                    <NavIcon>
                      <LockClosedIcon aria-label="Private" />
                    </NavIcon>
                  )}
                </SidebarItem>
                {expanded && <SpaceChildren slug={space.slug} pathname={pathname} canSeeRuns={runner} />}
              </div>
            )
          })}
          {runner && (
            <SidebarItem href="/spaces/new" current={pathname === '/spaces/new'}>
              <NavIcon>
                <PlusIcon />
              </NavIcon>
              <SidebarLabel>New space</SidebarLabel>
            </SidebarItem>
          )}
        </SidebarSection>

        <SidebarSection>
          <SidebarItem href={user.role === 'admin' ? '/settings/members' : '/settings/notifications'} current={pathname.startsWith('/settings')}>
            <NavIcon>
              <GearIcon />
            </NavIcon>
            {/* Named by scope: inside a space, its own settings sit just above. Non-admins only have their own here. */}
            <SidebarLabel>{user.role === 'admin' ? 'Workspace settings' : 'Your settings'}</SidebarLabel>
          </SidebarItem>
        </SidebarSection>
      </SidebarBody>
      <SidebarFooter>
        <Dropdown>
          <DropdownButton
            as="button"
            type="button"
            aria-label="Account"
            className={clsx(
              'flex w-full items-center gap-3 py-2 text-left text-sm font-semibold text-zinc-950 hover:bg-zinc-950/5 dark:text-white dark:hover:bg-white/5',
              collapsed ? 'justify-center px-0' : 'px-2'
            )}
          >
            <UserAvatar user={user} size="1" />
            <SidebarLabel>{user.name}</SidebarLabel>
            {!collapsed && <ChevronUpIcon className="ml-auto size-4 text-zinc-500" />}
          </DropdownButton>
          <AccountMenu user={user} onSignOut={onSignOut} />
        </Dropdown>
      </SidebarFooter>
      <div className="max-lg:hidden">
        <SidebarCollapseToggle />
      </div>
    </Sidebar>
  )
}
