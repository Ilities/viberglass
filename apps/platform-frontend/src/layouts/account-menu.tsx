import { Avatar } from '@/components/avatar'
import { DropdownDivider, DropdownHeader, DropdownItem, DropdownLabel, DropdownMenu } from '@/components/dropdown'
import { useTheme } from '@/context/theme-context'
import type { AuthUser } from '@/service/api/auth-api'
import { BellIcon, ExitIcon, IdCardIcon, MoonIcon, SunIcon } from '@radix-ui/react-icons'
import { isRunner } from '@/lib/roles'
import { NavIcon } from './nav-icon'

function initials(name?: string, email?: string) {
  const source = (name || '').trim() || (email || '').split('@')[0] || ''
  const parts = source.split(/\s+/).filter(Boolean)
  if (parts.length === 0) return ''
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
}

export function UserAvatar({ user, slot, size, className = '' }: { user: AuthUser; slot?: string; size?: '1' | '2' | '3'; className?: string }) {
  return (
    <Avatar
      square
      size={size}
      slot={slot}
      src={user.avatarUrl ?? undefined}
      initials={initials(user.name, user.email)}
      className={`bg-brand-gradient text-brand-charcoal ${className}`}
    />
  )
}

/** Me: how I'm told about things, my API tokens (for MCP), the theme, and signing out. */
export function AccountMenu({ user, onSignOut }: { user: AuthUser; onSignOut: () => void }) {
  const { theme, toggleTheme } = useTheme()

  return (
    <DropdownMenu className="min-w-64">
      <DropdownHeader>
        <div className="flex items-center gap-3">
          <UserAvatar user={user} size="2" />
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-zinc-950 dark:text-white">{user.name}</div>
            <div className="truncate text-xs text-zinc-500 dark:text-zinc-400">{user.email}</div>
          </div>
        </div>
      </DropdownHeader>
      <DropdownDivider />
      <DropdownItem href="/settings/notifications">
        <NavIcon>
          <BellIcon />
        </NavIcon>
        <DropdownLabel>Notifications</DropdownLabel>
      </DropdownItem>
      {isRunner(user.role) && (
        <DropdownItem href="/settings/api-tokens">
          <NavIcon>
            <IdCardIcon />
          </NavIcon>
          <DropdownLabel>API tokens</DropdownLabel>
        </DropdownItem>
      )}
      <DropdownDivider />
      <DropdownItem
        onClick={(e) => {
          e.preventDefault()
          toggleTheme()
        }}
      >
        <NavIcon>{theme === 'dark' ? <SunIcon /> : <MoonIcon />}</NavIcon>
        <DropdownLabel>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</DropdownLabel>
      </DropdownItem>
      <DropdownDivider />
      <DropdownItem
        onClick={(event) => {
          event.preventDefault()
          onSignOut()
        }}
      >
        <NavIcon>
          <ExitIcon />
        </NavIcon>
        <DropdownLabel>Sign out</DropdownLabel>
      </DropdownItem>
    </DropdownMenu>
  )
}
