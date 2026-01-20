'use client'

import { Toaster } from 'sonner'
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
import { useTheme } from '@/context/theme-context'
import { getProjects, Project } from '@/service/api/project-api'
import {
  ArrowRightStartOnRectangleIcon,
  ChevronDownIcon,
  Cog8ToothIcon,
  LightBulbIcon,
  MoonIcon,
  PlusIcon,
  ShieldCheckIcon,
  SunIcon,
  UserCircleIcon,
} from '@heroicons/react/16/solid'
import { BugAntIcon, Cog6ToothIcon, ExclamationTriangleIcon, HomeIcon } from '@heroicons/react/20/solid'
import { useParams, usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'

function ProjectDropdownMenu({ projectSlug }: { projectSlug: string }) {
  const pathname = usePathname()
  const [projects, setProjects] = useState<Project[]>([])

  useEffect(() => {
    getProjects().then(setProjects).catch(console.error)
  }, [])

  return (
    <DropdownMenu className="min-w-80 lg:min-w-64" anchor="bottom start">
      <DropdownItem href={`/`}>
        <HomeIcon />
        <DropdownLabel>Home</DropdownLabel>
      </DropdownItem>

      {pathname !== '/' ? (
        <DropdownItem href={`/project/${projectSlug}/settings`}>
          <Cog8ToothIcon />
          <DropdownLabel>Project Settings</DropdownLabel>
        </DropdownItem>
      ) : null}
      <DropdownDivider />
      {projects.map((p) => (
        <DropdownItem key={p.id} href={`/project/${p.slug}`}>
          {p.slug === 'viberator' ? (
            <Avatar slot="icon" src="/teams/viberator.svg" />
          ) : (
            <Avatar slot="icon" initials={p.name.substring(0, 2).toUpperCase()} className="bg-purple-500 text-white" />
          )}
          <DropdownLabel>{p.name}</DropdownLabel>
        </DropdownItem>
      ))}
      <DropdownDivider />
      <DropdownItem href="/new">
        <PlusIcon />
        <DropdownLabel>New Project&hellip;</DropdownLabel>
      </DropdownItem>
    </DropdownMenu>
  )
}

function AccountDropdownMenu({ anchor }: { anchor: 'top start' | 'bottom end' }) {
  const { theme, toggleTheme } = useTheme()

  return (
    <DropdownMenu className="min-w-64" anchor={anchor}>
      <DropdownItem href="#">
        <UserCircleIcon />
        <DropdownLabel>My account</DropdownLabel>
      </DropdownItem>
      <DropdownDivider />
      <DropdownItem
        onClick={(e) => {
          e.preventDefault()
          toggleTheme()
        }}
      >
        {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
        <DropdownLabel>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</DropdownLabel>
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
  const { project: projectSlug } = useParams<{ project: string }>()

  const basePath = `/project/${projectSlug}`

  return (
    <>
      <StackedLayout
        navbar={
          <Navbar>
            <Dropdown>
              <DropdownButton as={NavbarItem} className="max-lg:hidden">
                <Avatar src="/teams/viberator.svg" />
                <NavbarLabel>{projectSlug}</NavbarLabel>
                <ChevronDownIcon />
              </DropdownButton>
              <ProjectDropdownMenu projectSlug={projectSlug} />
            </Dropdown>
            {pathname.startsWith('/project/') ? (
              <NavbarSection className="hidden lg:flex">
                <NavbarItem href={basePath} current={pathname === basePath}>
                  Dashboard
                </NavbarItem>
                <NavbarItem href={`${basePath}/tickets`} current={pathname.startsWith(`${basePath}/tickets`)}>
                  Tickets
                </NavbarItem>
                <NavbarItem href={`${basePath}/enhance`} current={pathname.startsWith(`${basePath}/enhance`)}>
                  Enhance & Fix
                </NavbarItem>
              </NavbarSection>
            ) : null}
            {!pathname.startsWith('/project/') ? (
              <NavbarSection className="hidden lg:flex">
                <NavbarItem href="/" current={pathname === basePath}>
                  Dashboard
                </NavbarItem>
                <NavbarItem href="/clankers" current={pathname.startsWith(`/clankers`)}>
                  Clankers
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
                  <SidebarLabel>{projectSlug}</SidebarLabel>
                  <ChevronDownIcon />
                </DropdownButton>
                <ProjectDropdownMenu projectSlug={projectSlug} />
              </Dropdown>
            </SidebarHeader>

            <SidebarBody>
              <SidebarSection>
                <SidebarItem href={basePath} current={pathname === basePath}>
                  <HomeIcon />
                  <SidebarLabel>Dashboard</SidebarLabel>
                </SidebarItem>
                <SidebarItem href={`${basePath}/tickets`} current={pathname.startsWith(`${basePath}/tickets`)}>
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
      <Toaster
        position="bottom-right"
        richColors
        closeButton
        toastOptions={{
          duration: 5000,
        }}
      />
    </>
  )
}
