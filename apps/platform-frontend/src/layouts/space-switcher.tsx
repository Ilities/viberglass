import { Avatar } from '@/components/avatar'
import { Dropdown, DropdownButton, DropdownDivider, DropdownItem, DropdownLabel, DropdownMenu } from '@/components/dropdown'
import { NavbarItem, NavbarLabel } from '@/components/navbar'
import type { Project } from '@/service/api/project-api'
import { ChevronDownIcon, HomeIcon, PlusIcon } from '@radix-ui/react-icons'
import { NavIcon } from './nav-icon'
import { SpaceAvatar } from './space-avatar'

/** The top bar's way between spaces. Only on mobile, where the sidebar is hidden behind a button. */
export function SpaceSwitcher({ current, spaces, canCreate }: { current?: string; spaces: Project[]; canCreate: boolean }) {
  const currentName = spaces.find((space) => space.slug === current)?.name
  return (
    <Dropdown>
      <DropdownButton as={NavbarItem}>
        <Avatar src="/teams/viberglass.svg" />
        <NavbarLabel>{currentName ?? 'Spaces'}</NavbarLabel>
        <NavIcon>
          <ChevronDownIcon />
        </NavIcon>
      </DropdownButton>
      <DropdownMenu className="min-w-80">
        <DropdownItem href="/">
          <NavIcon>
            <HomeIcon />
          </NavIcon>
          <DropdownLabel>Home</DropdownLabel>
        </DropdownItem>
        <DropdownDivider />
        {spaces.map((space) => (
          <DropdownItem key={space.id} href={`/spaces/${space.slug}`}>
            <SpaceAvatar space={space} slot="icon" />
            <DropdownLabel>{space.name}</DropdownLabel>
          </DropdownItem>
        ))}
        {canCreate && (
          <>
            <DropdownDivider />
            <DropdownItem href="/spaces/new">
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
