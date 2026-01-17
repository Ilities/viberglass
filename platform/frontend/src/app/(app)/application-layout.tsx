'use client'

import { Avatar } from '@/components/avatar'
import {
  Dropdown,
  DropdownButton,
  DropdownDivider,
  DropdownItem,
  DropdownLabel,
  DropdownMenu,
} from '@/components/dropdown'
import { Navbar, NavbarItem, NavbarSection, NavbarSpacer } from '@/components/navbar'
import { Sidebar, SidebarBody, SidebarHeader, SidebarItem, SidebarLabel, SidebarSection } from '@/components/sidebar'
import { StackedLayout } from '@/components/stacked-layout'
import {
  ArrowRightStartOnRectangleIcon,
  ChevronDownIcon,
  Cog8ToothIcon,
  LightBulbIcon,
  PlusIcon,
  ShieldCheckIcon,
  UserCircleIcon,
} from '@heroicons/react/16/solid'
import {
  BugAntIcon,
  Cog6ToothIcon,
  CpuChipIcon,
  CubeIcon,
  ExclamationTriangleIcon,
  GlobeAltIcon,
  HomeIcon,
  TicketIcon,
} from '@heroicons/react/20/solid'
import { usePathname } from 'next/navigation'

function AccountDropdownMenu({ anchor }: { anchor: 'top start' | 'bottom end' }) {
  return (
    <DropdownMenu className="min-w-64" anchor={anchor}>
      <DropdownItem href="#">
        <UserCircleIcon />
        <DropdownLabel>My account</DropdownLabel>
      </DropdownItem>
      <DropdownDivider />
      <DropdownItem href="#">
        <ShieldCheckIcon />
        <DropdownLabel>Privacy policy</DropdownLabel>
      </DropdownItem>
      <DropdownItem href="#">
        <LightBulbIcon />
        <DropdownLabel>Share feedback</DropdownLabel>
      </DropdownItem>
      <DropdownDivider />
      <DropdownItem href="/login">
        <ArrowRightStartOnRectangleIcon />
        <DropdownLabel>Sign out</DropdownLabel>
      </DropdownItem>
    </DropdownMenu>
  )
}

export function ApplicationLayout({ children }: { children: React.ReactNode }) {
  let pathname = usePathname()

  const isSettingsPage = pathname.startsWith('/settings')

  // Settings navigation items
  const settingsNavigation = [
    { name: 'Widget', href: '/settings/widget', icon: CubeIcon },
    { name: 'Ticketing', href: '/settings/ticketing', icon: TicketIcon },
    { name: 'Webhooks', href: '/settings/webhooks', icon: GlobeAltIcon },
    { name: 'AI Agent', href: '/settings/ai', icon: CpuChipIcon },
  ]

  return (
    <>
      {/* Desktop Settings Submenu */}
      {isSettingsPage && (
        <div className="hidden lg:fixed lg:top-16 lg:left-0 lg:z-30 lg:h-screen lg:w-48 lg:border-r lg:border-zinc-200 lg:bg-white lg:dark:border-zinc-700 lg:dark:bg-zinc-900">
          <div className="border-b border-zinc-200 p-4 dark:border-zinc-700">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-white">Settings</h2>
          </div>
          <nav className="p-2">
            {settingsNavigation.map((item) => (
              <a
                key={item.name}
                href={item.href}
                className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
                  pathname === item.href
                    ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300'
                    : 'text-zinc-700 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-800'
                }`}
              >
                <item.icon className="h-4 w-4" />
                {item.name}
              </a>
            ))}
          </nav>
        </div>
      )}

      <StackedLayout
        navbar={
          <Navbar>
            <NavbarSection className="hidden lg:flex">
              <NavbarItem href="/" current={pathname === '/'}>
                Dashboard
              </NavbarItem>
              <NavbarItem href="/bug-reports" current={pathname.startsWith('/bug-reports')}>
                Bug Reports
              </NavbarItem>
              <NavbarItem href="/enhance" current={pathname.startsWith('/enhance')}>
                Enhance & Fix
              </NavbarItem>
              <NavbarItem href="/settings/widget" current={pathname.startsWith('/settings')}>
                Settings
              </NavbarItem>
            </NavbarSection>
            <NavbarSpacer />
            <NavbarSection>
              <Dropdown>
                <DropdownButton as={NavbarItem}>
                  <Avatar src="/users/erica.jpg" square />
                </DropdownButton>
                <AccountDropdownMenu anchor="bottom end" />
              </Dropdown>
            </NavbarSection>
          </Navbar>
        }
        sidebar={
          <Sidebar>
            <SidebarHeader>
              <Dropdown>
                <DropdownButton as={SidebarItem}>
                  <Avatar src="/teams/catalyst.svg" />
                  <SidebarLabel>Catalyst</SidebarLabel>
                  <ChevronDownIcon />
                </DropdownButton>
                <DropdownMenu className="min-w-80 lg:min-w-64" anchor="bottom start">
                  <DropdownItem href="/settings/widget">
                    <Cog8ToothIcon />
                    <DropdownLabel>Settings</DropdownLabel>
                  </DropdownItem>
                  <DropdownDivider />
                  <DropdownItem href="#">
                    <Avatar slot="icon" src="/teams/catalyst.svg" />
                    <DropdownLabel>Catalyst</DropdownLabel>
                  </DropdownItem>
                  <DropdownItem href="#">
                    <Avatar slot="icon" initials="BE" className="bg-purple-500 text-white" />
                    <DropdownLabel>Big Events</DropdownLabel>
                  </DropdownItem>
                  <DropdownDivider />
                  <DropdownItem href="#">
                    <PlusIcon />
                    <DropdownLabel>New team&hellip;</DropdownLabel>
                  </DropdownItem>
                </DropdownMenu>
              </Dropdown>
            </SidebarHeader>

            <SidebarBody>
              <SidebarSection>
                <SidebarItem href="/" current={pathname === '/'}>
                  <HomeIcon />
                  <SidebarLabel>Dashboard</SidebarLabel>
                </SidebarItem>
                <SidebarItem href="/bug-reports" current={pathname.startsWith('/bug-reports')}>
                  <BugAntIcon />
                  <SidebarLabel>Bug Reports</SidebarLabel>
                </SidebarItem>
                <SidebarItem href="/enhance" current={pathname.startsWith('/enhance')}>
                  <ExclamationTriangleIcon />
                  <SidebarLabel>Enhance & Fix</SidebarLabel>
                </SidebarItem>
                <SidebarItem href="/settings/widget" current={pathname.startsWith('/settings')}>
                  <Cog6ToothIcon />
                  <SidebarLabel>Settings</SidebarLabel>
                </SidebarItem>
              </SidebarSection>
            </SidebarBody>
          </Sidebar>
        }
      >
        {children}
      </StackedLayout>
    </>
  )
}
