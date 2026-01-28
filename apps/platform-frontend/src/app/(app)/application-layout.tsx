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
import { useTheme } from '@/context/theme-context'
import { getProjects, Project } from '@/service/api/project-api'
import {
  AvatarIcon,
  ChevronDownIcon,
  CrumpledPaperIcon,
  ExitIcon,
  GearIcon,
  HomeIcon,
  LightningBoltIcon,
  LockClosedIcon,
  MoonIcon,
  PlusIcon,
  SunIcon,
} from '@radix-ui/react-icons'
import { useParams, usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Toaster } from 'sonner'

// Wrap Radix icons with data-slot attribute for proper styling
function Icon({ children }: { children: React.ReactNode }) {
  return <span data-slot="icon">{children}</span>
}

function ProjectDropdownMenu({ projectSlug }: { projectSlug: string }) {
  const pathname = usePathname()
  const [projects, setProjects] = useState<Project[]>([])

  useEffect(() => {
    getProjects().then(setProjects).catch(console.error)
  }, [])

  return (
    <DropdownMenu className="min-w-80 lg:min-w-64">
      <DropdownItem href={`/`}>
        <Icon>
          <HomeIcon />
        </Icon>
        <DropdownLabel>Home</DropdownLabel>
      </DropdownItem>

      {pathname.startsWith('/project/') ? (
        <DropdownItem href={`/project/${projectSlug}/settings`}>
          <Icon>
            <GearIcon />
          </Icon>
          <DropdownLabel>Project Settings</DropdownLabel>
        </DropdownItem>
      ) : null}
      <DropdownDivider />
      {projects.map((p) => (
        <DropdownItem key={p.id} href={`/project/${p.slug}`}>
          {p.slug === 'viberglass' ? (
            <Avatar slot="icon" src="/teams/viberglass.svg" />
          ) : (
            <Avatar slot="icon" initials={p.name.substring(0, 2).toUpperCase()} className="bg-purple-500 text-white" />
          )}
          <DropdownLabel>{p.name}</DropdownLabel>
        </DropdownItem>
      ))}
      <DropdownDivider />
      <DropdownItem href="/new">
        <Icon>
          <PlusIcon />
        </Icon>
        <DropdownLabel>New Project&hellip;</DropdownLabel>
      </DropdownItem>
    </DropdownMenu>
  )
}

function AccountDropdownMenu() {
  const { theme, toggleTheme } = useTheme()

  return (
    <DropdownMenu className="min-w-64">
      <DropdownItem href="#">
        <Icon>
          <AvatarIcon />
        </Icon>
        <DropdownLabel>My account</DropdownLabel>
      </DropdownItem>
      <DropdownDivider />
      <DropdownItem
        onClick={(e) => {
          e.preventDefault()
          toggleTheme()
        }}
      >
        <Icon>{theme === 'dark' ? <SunIcon /> : <MoonIcon />}</Icon>
        <DropdownLabel>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</DropdownLabel>
      </DropdownItem>
      <DropdownDivider />
      <DropdownItem href="#">
        <Icon>
          <LockClosedIcon />
        </Icon>
        <DropdownLabel>Privacy policy</DropdownLabel>
      </DropdownItem>
      <DropdownItem href="#">
        <Icon>
          <LightningBoltIcon />
        </Icon>
        <DropdownLabel>Share feedback</DropdownLabel>
      </DropdownItem>
      <DropdownDivider />
      <DropdownItem href="/login">
        <Icon>
          <ExitIcon />
        </Icon>
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
                <Avatar src="/teams/viberglass.svg" />
                <NavbarLabel>{projectSlug}</NavbarLabel>
                <Icon>
                  <ChevronDownIcon />
                </Icon>
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
                <NavbarItem href="/secrets" current={pathname.startsWith(`/secrets`)}>
                  Secrets
                </NavbarItem>
                <NavbarItem href="/settings/integrations" current={pathname.startsWith(`/settings/integrations`)}>
                  Integrations
                </NavbarItem>
              </NavbarSection>
            ) : null}
            <NavbarSpacer />
            <NavbarSection>
              <Dropdown>
                <DropdownButton as={NavbarItem}>
                  <Avatar src="/users/erica.jpg" square />
                </DropdownButton>
                <AccountDropdownMenu />
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
                  <Icon>
                    <ChevronDownIcon />
                  </Icon>
                </DropdownButton>
                <ProjectDropdownMenu projectSlug={projectSlug} />
              </Dropdown>
            </SidebarHeader>

            <SidebarBody>
              <SidebarSection>
                <SidebarItem href={basePath} current={pathname === basePath}>
                  <Icon>
                    <HomeIcon />
                  </Icon>
                  <SidebarLabel>Dashboard</SidebarLabel>
                </SidebarItem>
                <SidebarItem href={`${basePath}/tickets`} current={pathname.startsWith(`${basePath}/tickets`)}>
                  <Icon>
                    <CrumpledPaperIcon />
                  </Icon>
                  <SidebarLabel>Bug Reports</SidebarLabel>
                </SidebarItem>
                <SidebarItem href={`${basePath}/enhance`} current={pathname.startsWith(`${basePath}/enhance`)}>
                  <Icon>
                    <LightningBoltIcon />
                  </Icon>
                  <SidebarLabel>Enhance & Fix</SidebarLabel>
                </SidebarItem>
                <SidebarItem href={`${basePath}/settings`} current={pathname.startsWith(`${basePath}/settings`)}>
                  <Icon>
                    <GearIcon />
                  </Icon>
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
