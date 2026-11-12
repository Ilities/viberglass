import { Avatar } from '@/components/avatar'
import { Dropdown, DropdownButton, DropdownDivider, DropdownItem, DropdownLabel, DropdownMenu } from '@/components/dropdown'
import { NavbarItem, NavbarLabel } from '@/components/navbar'
import type { Project } from '@/service/api/project-api'
import { ChevronDownIcon, HomeIcon, PlusIcon } from '@radix-ui/react-icons'
import { useLocation } from 'react-router-dom'
import { NavIcon } from './nav-icon'
import { SpaceAvatar } from './space-avatar'

// Outside a space the top bar names the page the drawer's first links lead to.
const PAGE_LABELS: Record<string, string> = { '/': 'Home', '/overview': 'Overview', '/outputs': 'Outputs' }

// Radix menu rows are 32px; a finger needs more.
const ROW = 'pointer-coarse:!h-10'

/** The top bar's way between spaces. Only on mobile, where the sidebar is hidden behind a button. */
export function SpaceSwitcher({ current, spaces, canCreate }: { current?: string; spaces: Project[]; canCreate: boolean }) {
  const { pathname } = useLocation()
  const label = spaces.find((space) => space.slug === current)?.name ?? PAGE_LABELS[pathname] ?? 'Spaces'
  return (
    <Dropdown>
      <DropdownButton as={NavbarItem} className="min-w-0 flex-1 [&>button]:w-full [&>button]:max-w-full">
        <Avatar src="/teams/viberglass.svg" />
        <NavbarLabel className="min-w-0 flex-1" title={label}>{label}</NavbarLabel>
        <NavIcon>
          <ChevronDownIcon />
        </NavIcon>
      </DropdownButton>
      <DropdownMenu className="min-w-80">
        <DropdownItem href="/" className={ROW}>
          <NavIcon>
            <HomeIcon />
          </NavIcon>
          <DropdownLabel>Home</DropdownLabel>
        </DropdownItem>
        <DropdownDivider />
        {spaces.map((space) => (
          <DropdownItem key={space.id} href={`/spaces/${space.slug}`} className={ROW}>
            <SpaceAvatar space={space} slot="icon" />
            <DropdownLabel>{space.name}</DropdownLabel>
          </DropdownItem>
        ))}
        {canCreate && (
          <>
            <DropdownDivider />
            <DropdownItem href="/spaces/new" className={ROW}>
              <NavIcon>
                <PlusIcon />
              </NavIcon>
              <DropdownLabel>New space&hellip;</DropdownLabel>
            </DropdownItem>
          </>
        )}
      </DropdownMenu>
    </Dropdown>
  )
}
