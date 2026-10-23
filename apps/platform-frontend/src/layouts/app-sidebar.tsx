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
import { ActivityLogIcon, ChevronUpIcon, GearIcon, HomeIcon, LockClosedIcon, PlusIcon } from '@radix-ui/react-icons'
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
  /** The space the page is in. */
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

/**
 * The same navigation everywhere: Home and Overview, the spaces, Settings,
 * and you. A space's own pages are tabs in its header, not rows here.
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
            return (
              <SidebarItem key={space.id} href={`/spaces/${space.slug}`} current={space.slug === currentSpace}>
                <SpaceAvatar space={space} slot="avatar" />
                <SidebarLabel>{space.name}</SidebarLabel>
                {space.isPrivate && !collapsed && (
                  <NavIcon>
                    <LockClosedIcon aria-label="Private" />
                  </NavIcon>
                )}
              </SidebarItem>
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

        {user.role === 'admin' && (
          <SidebarSection>
            <SidebarItem href="/settings" current={pathname.startsWith('/settings')}>
              <NavIcon>
                <GearIcon />
              </NavIcon>
              <SidebarLabel>Settings</SidebarLabel>
            </SidebarItem>
          </SidebarSection>
        )}
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
