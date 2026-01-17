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
import { Navbar, NavbarItem, NavbarLabel, NavbarSection, NavbarSpacer } from '@/components/navbar'
import { Sidebar, SidebarBody, SidebarHeader, SidebarItem, SidebarLabel, SidebarSection } from '@/components/sidebar'
import { StackedLayout } from '@/components/stacked-layout'
import { ProjectProvider } from '@/context/project-context'
import {
  ArrowRightStartOnRectangleIcon,
  ChevronDownIcon,
  Cog8ToothIcon,
  LightBulbIcon,
  PlusIcon,
  ShieldCheckIcon,
  UserCircleIcon,
} from '@heroicons/react/16/solid'
import { BugAntIcon, Cog6ToothIcon, ExclamationTriangleIcon, HomeIcon } from '@heroicons/react/20/solid'
import { useParams, usePathname } from 'next/navigation'

function ProjectDropdownMenu({ project }: { project: string }) {
  const pathname = usePathname()
  return (
    <DropdownMenu className="min-w-80 lg:min-w-64" anchor="bottom start">
      <DropdownItem href={`/`}>
        <HomeIcon />
        <DropdownLabel>Home</DropdownLabel>
      </DropdownItem>

      {pathname !== '/' ? (
        <DropdownItem href={`/project/${project}/settings`}>
          <Cog8ToothIcon />
          <DropdownLabel>Project Settings</DropdownLabel>
        </DropdownItem>
      ) : null}
      <DropdownDivider />
      <DropdownItem href="/project/vibug">
        <Avatar slot="icon" src="/teams/viberator.svg" />
        <DropdownLabel>Vibug</DropdownLabel>
      </DropdownItem>
      <DropdownItem href="/project/viberator">
        <Avatar slot="icon" initials="VB" className="bg-purple-500 text-white" />
        <DropdownLabel>Viberator</DropdownLabel>
      </DropdownItem>
      <DropdownDivider />
      <DropdownItem href="/new">
        <PlusIcon />
        <DropdownLabel>New Project&hellip;</DropdownLabel>
      </DropdownItem>
    </DropdownMenu>
  )
}

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
  return (
    <ProjectProvider>
      <ApplicationLayoutContent>{children}</ApplicationLayoutContent>
    </ProjectProvider>
  )
}

function ApplicationLayoutContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { project } = useParams<{ project: string }>()

  const basePath = `/project/${project}`

  return (
    <>
      <StackedLayout
        navbar={
          <Navbar>
            <Dropdown>
              <DropdownButton as={NavbarItem} className="max-lg:hidden">
                <Avatar src="/teams/viberator.svg" />
                <NavbarLabel>{project}</NavbarLabel>
                <ChevronDownIcon />
              </DropdownButton>
              <ProjectDropdownMenu project={project} />
            </Dropdown>
            {pathname.startsWith('/project/') ? (
              <NavbarSection className="hidden lg:flex">
                <NavbarItem href={basePath} current={pathname === basePath}>
                  Dashboard
                </NavbarItem>
                <NavbarItem href={`${basePath}/bug-reports`} current={pathname.startsWith(`${basePath}/bug-reports`)}>
                  Bug Reports
                </NavbarItem>
                <NavbarItem href={`${basePath}/enhance`} current={pathname.startsWith(`${basePath}/enhance`)}>
                  Enhance & Fix
                </NavbarItem>
              </NavbarSection>
            ) : null}
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
                  <Avatar src="/teams/viberator.svg" />
                  <SidebarLabel>{project}</SidebarLabel>
                  <ChevronDownIcon />
                </DropdownButton>
                <ProjectDropdownMenu project={project} />
              </Dropdown>
            </SidebarHeader>

            <SidebarBody>
              <SidebarSection>
                <SidebarItem href={basePath} current={pathname === basePath}>
                  <HomeIcon />
                  <SidebarLabel>Dashboard</SidebarLabel>
                </SidebarItem>
                <SidebarItem href={`${basePath}/bug-reports`} current={pathname.startsWith(`${basePath}/bug-reports`)}>
                  <BugAntIcon />
                  <SidebarLabel>Bug Reports</SidebarLabel>
                </SidebarItem>
                <SidebarItem href={`${basePath}/enhance`} current={pathname.startsWith(`${basePath}/enhance`)}>
                  <ExclamationTriangleIcon />
                  <SidebarLabel>Enhance & Fix</SidebarLabel>
                </SidebarItem>
                <SidebarItem href={`${basePath}/settings`} current={pathname.startsWith(`${basePath}/settings`)}>
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
