import { Avatar } from '@/components/avatar'
import {
  Dropdown,
  DropdownButton,
  DropdownDivider,
  DropdownItem,
  DropdownLabel,
  DropdownMenu,
  DropdownHeader,
} from '@/components/dropdown'
import { Navbar, NavbarItem, NavbarLabel, NavbarSection, NavbarSpacer } from '@/components/navbar'
import { Sidebar, SidebarBody, SidebarHeader, SidebarItem, SidebarLabel, SidebarSection } from '@/components/sidebar'
import { StackedLayout } from '@/components/stacked-layout'
import { ProjectProvider } from '@/context/project-context'
import { useAuth } from '@/context/auth-context'
import { useTheme } from '@/context/theme-context'
import { getProjects, Project } from '@/service/api/project-api'
import type { AuthUser } from '@/service/api/auth-api'
import {
  ChevronDownIcon,
  CrumpledPaperIcon,
  ExitIcon,
  GearIcon,
  HomeIcon,
  MoonIcon,
  PlusIcon,
  SunIcon,
  ClockIcon,
} from '@radix-ui/react-icons'
import { useParams, useLocation, useNavigate, Outlet } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { Toaster } from 'sonner'

// Wrap Radix icons with data-slot attribute for proper styling
function Icon({ children }: { children: React.ReactNode }) {
  return <span data-slot="icon">{children}</span>
}

function getInitials(name?: string, email?: string) {
  const source = (name || '').trim() || (email || '').split('@')[0] || ''
  const parts = source.split(/\s+/).filter(Boolean)
  if (parts.length === 0) return ''
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
}

function ProjectDropdownMenu({ projectSlug }: { projectSlug?: string }) {
  const pathname = useLocation().pathname
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

      {pathname.startsWith('/project/') && projectSlug ? (
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
            <Avatar
              slot="icon"
              initials={p.name.substring(0, 2).toUpperCase()}
              className="bg-brand-gradient text-brand-charcoal"
            />
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

function AccountDropdownMenu({ user, onSignOut }: { user: AuthUser; onSignOut: () => void }) {
  const { theme, toggleTheme } = useTheme()

  return (
    <DropdownMenu className="min-w-64">
      <DropdownHeader>
        <div className="flex items-center gap-3">
          <Avatar
            square
            src={user.avatarUrl ?? undefined}
            initials={getInitials(user.name, user.email)}
            className="size-8 bg-brand-gradient text-brand-charcoal"
          />
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-zinc-950 dark:text-white">
              {user.name}
            </div>
            <div className="truncate text-xs text-zinc-500 dark:text-zinc-400">{user.email}</div>
          </div>
        </div>
      </DropdownHeader>
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
      <DropdownItem
        onClick={(event) => {
          event.preventDefault()
          onSignOut()
        }}
      >
        <Icon>
          <ExitIcon />
        </Icon>
        <DropdownLabel>Sign out</DropdownLabel>
      </DropdownItem>
    </DropdownMenu>
  )
}

export function ApplicationLayout() {
  return <ApplicationLayoutContent />
}

function ApplicationLayoutContent() {
  const navigate = useNavigate()
  const pathname = useLocation().pathname
  const { project: projectSlug } = useParams<{ project: string }>()
  const { user, status, logout } = useAuth()

  useEffect(() => {
    if (status === 'unauthenticated') {
      navigate('/login', { replace: true })
    }
  }, [navigate, status])

  if (status === 'loading') {
    return (
      <div className="flex min-h-dvh items-center justify-center text-sm text-zinc-500 dark:text-zinc-400">
        Checking your session...
      </div>
    )
  }

  if (status !== 'authenticated' || !user) {
    return null
  }

  const basePath = `/project/${projectSlug}`
  const isAdmin = user.role === 'admin'
  const handleSignOut = async () => {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <ProjectProvider>
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
                <NavbarItem href={`${basePath}/jobs`} current={pathname.startsWith(`${basePath}/jobs`)}>
                  Jobs
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
                {isAdmin ? (
                  <NavbarItem href="/settings/users" current={pathname.startsWith(`/settings/users`)}>
                    Users
                  </NavbarItem>
                ) : null}
              </NavbarSection>
            ) : null}
            <NavbarSpacer />
            <NavbarSection>
              <Dropdown>
                <DropdownButton as={NavbarItem}>
                  <Avatar
                    square
                    src={user.avatarUrl ?? undefined}
                    initials={getInitials(user.name, user.email)}
                    className="bg-brand-gradient text-brand-charcoal"
                  />
                </DropdownButton>
                <AccountDropdownMenu user={user} onSignOut={handleSignOut} />
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
                <SidebarItem href={`${basePath}/jobs`} current={pathname.startsWith(`${basePath}/jobs`)}>
                  <Icon>
                    <ClockIcon />
                  </Icon>
                  <SidebarLabel>Jobs</SidebarLabel>
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
        <Outlet />
      </StackedLayout>
      <Toaster
        position="bottom-right"
        richColors
        closeButton
        toastOptions={{
          duration: 5000,
        }}
      />
    </ProjectProvider>
  )
}
