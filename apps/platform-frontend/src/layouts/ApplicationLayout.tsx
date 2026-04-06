import { Avatar } from '@/components/avatar'
import {
  Dropdown,
  DropdownButton,
  DropdownDivider,
  DropdownHeader,
  DropdownItem,
  DropdownLabel,
  DropdownMenu,
} from '@/components/dropdown'
import { Link } from '@/components/link'
import { Navbar, NavbarItem, NavbarLabel, NavbarSection, NavbarSpacer } from '@/components/navbar'
import {
  Sidebar,
  SidebarBody,
  SidebarCollapseToggle,
  SidebarFooter,
  SidebarHeader,
  SidebarHeading,
  SidebarItem,
  SidebarLabel,
  SidebarSection,
} from '@/components/sidebar'
import { StackedLayout } from '@/components/stacked-layout'
import { useAuth } from '@/context/auth-context'
import { ProjectProvider } from '@/context/project-context'
import { ProjectTheme } from '@/context/project-theme'
import { useTheme } from '@/context/theme-context'
import type { AuthUser } from '@/service/api/auth-api'
import { getProjects, Project } from '@/service/api/project-api'
import {
  ActivityLogIcon,
  ChevronDownIcon,
  ClipboardCopyIcon,
  ClockIcon,
  ExitIcon,
  FileTextIcon,
  GearIcon,
  HomeIcon,
  LayersIcon,
  LockClosedIcon,
  MoonIcon,
  PersonIcon,
  PlusIcon,
  RocketIcon,
  SunIcon,
} from '@radix-ui/react-icons'
import { useEffect, useState } from 'react'
import { Outlet, useLocation, useNavigate, useParams } from 'react-router-dom'
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

type NavLinkItem = {
  current: boolean
  href: string
  label: string
  icon: React.ReactNode
}

function ProjectDropdownMenu({ projectSlug, projects }: { projectSlug?: string; projects: Project[] }) {
  const pathname = useLocation().pathname

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
            className="bg-brand-gradient size-8 text-brand-charcoal"
          />
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-zinc-950 dark:text-white">{user.name}</div>
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
  const { theme, toggleTheme } = useTheme()
  const [projects, setProjects] = useState<Project[]>([])

  useEffect(() => {
    if (status === 'unauthenticated') {
      navigate(`/login?redirect=${encodeURIComponent(pathname)}`, { replace: true })
    }
  }, [navigate, status, pathname])

  useEffect(() => {
    getProjects().then(setProjects).catch(console.error)
  }, [])

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
  const isProjectRoute = pathname.startsWith('/project/')

  const platformNavItems: NavLinkItem[] = [
    { href: '/', label: 'Dashboard', current: !isProjectRoute && pathname === '/', icon: <HomeIcon /> },
    { href: '/clankers', label: 'Clankers', current: pathname.startsWith('/clankers'), icon: <RocketIcon /> },
    { href: '/secrets', label: 'Secrets', current: pathname.startsWith('/secrets'), icon: <LockClosedIcon /> },
    {
      href: '/settings/integrations',
      label: 'Integrations',
      current: pathname.startsWith('/settings/integrations'),
      icon: <LayersIcon />,
    },
    ...(isAdmin
      ? [
          {
            href: '/settings/users',
            label: 'Users',
            current: pathname.startsWith('/settings/users'),
            icon: <PersonIcon />,
          },
        ]
      : []),
    ...(isAdmin
      ? [
          {
            href: '/settings/prompt-templates',
            label: 'Prompt Templates',
            current: pathname.startsWith('/settings/prompt-templates'),
            icon: <FileTextIcon />,
          },
        ]
      : []),
  ]

  const projectNavItems: NavLinkItem[] = [
    { href: basePath, label: 'Dashboard', current: pathname === basePath, icon: <HomeIcon /> },
    {
      href: `${basePath}/tickets`,
      label: 'Tickets',
      current: pathname.startsWith(`${basePath}/tickets`),
      icon: <ClipboardCopyIcon />,
    },
    {
      href: `${basePath}/claws`,
      label: 'Claws',
      current: pathname.startsWith(`${basePath}/claws`),
      icon: <ClockIcon />,
    },
    {
      href: `${basePath}/jobs`,
      label: 'Jobs',
      current: pathname.startsWith(`${basePath}/jobs`),
      icon: <ActivityLogIcon />,
    },
    {
      href: `${basePath}/settings`,
      label: 'Settings',
      current: pathname.startsWith(`${basePath}/settings`),
      icon: <GearIcon />,
    },
  ]

  const navItems = isProjectRoute ? projectNavItems : platformNavItems

  const handleSignOut = async () => {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <ProjectProvider>
      <ProjectTheme>
        <StackedLayout
          navbar={
            <Navbar>
              <Dropdown>
                <DropdownButton as={NavbarItem} className="max-lg:hidden">
                  <Avatar src="/teams/viberglass.svg" />
                  <NavbarLabel>{projectSlug ?? 'Projects'}</NavbarLabel>
                  <Icon>
                    <ChevronDownIcon />
                  </Icon>
                </DropdownButton>
                <ProjectDropdownMenu projectSlug={projectSlug} projects={projects} />
              </Dropdown>
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
                <Link href="/">
                  <div className="flex items-center gap-2.5">
                    <img src="/logos/viberglass.svg" alt="Viberglass logo" className="size-7 shrink-0 sm:size-6" />
                    <SidebarLabel className="text-sm font-semibold text-zinc-950 dark:text-white">
                      Viberglass
                    </SidebarLabel>
                  </div>
                </Link>
              </SidebarHeader>
              <SidebarBody>
                {isProjectRoute && (
                  <SidebarSection>
                    <SidebarItem href="/" title="Home">
                      <Icon>
                        <HomeIcon />
                      </Icon>
                      <SidebarLabel>Home</SidebarLabel>
                    </SidebarItem>
                  </SidebarSection>
                )}
                <SidebarSection>
                  <SidebarHeading>{isProjectRoute ? 'Project' : 'Platform'}</SidebarHeading>
                  {navItems.map((item) => (
                    <SidebarItem key={item.href} href={item.href} current={item.current}>
                      <Icon>{item.icon}</Icon>
                      <SidebarLabel>{item.label}</SidebarLabel>
                    </SidebarItem>
                  ))}
                </SidebarSection>
                <SidebarSection>
                  <SidebarHeading>Projects</SidebarHeading>
                  {projects.map((project) => (
                    <SidebarItem
                      key={project.id}
                      href={`/project/${project.slug}`}
                      current={
                        pathname === `/project/${project.slug}` || pathname.startsWith(`/project/${project.slug}/`)
                      }
                    >
                      {project.slug === 'viberglass' ? (
                        <Avatar slot="avatar" src="/teams/viberglass.svg" />
                      ) : (
                        <Avatar
                          slot="avatar"
                          initials={project.name.substring(0, 2).toUpperCase()}
                          className="bg-brand-gradient text-brand-charcoal"
                        />
                      )}
                      <SidebarLabel>{project.name}</SidebarLabel>
                    </SidebarItem>
                  ))}
                  <SidebarItem href="/new">
                    <Icon>
                      <PlusIcon />
                    </Icon>
                    <SidebarLabel>New Project</SidebarLabel>
                  </SidebarItem>
                </SidebarSection>
              </SidebarBody>
              <SidebarFooter>
                <SidebarSection>
                  <SidebarItem href="/settings/users">
                    <Avatar
                      square
                      slot="avatar"
                      src={user.avatarUrl ?? undefined}
                      initials={getInitials(user.name, user.email)}
                      className="bg-brand-gradient text-brand-charcoal"
                    />
                    <SidebarLabel>{user.name}</SidebarLabel>
                  </SidebarItem>
                </SidebarSection>
                <SidebarSection>
                  <SidebarItem
                    onClick={(event) => {
                      event.preventDefault()
                      toggleTheme()
                    }}
                  >
                    <Icon>{theme === 'dark' ? <SunIcon /> : <MoonIcon />}</Icon>
                    <SidebarLabel>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</SidebarLabel>
                  </SidebarItem>
                  <SidebarItem
                    onClick={(event) => {
                      event.preventDefault()
                      void handleSignOut()
                    }}
                  >
                    <Icon>
                      <ExitIcon />
                    </Icon>
                    <SidebarLabel>Sign out</SidebarLabel>
                  </SidebarItem>
                </SidebarSection>
              </SidebarFooter>
              <div className="max-lg:hidden">
                <SidebarCollapseToggle />
              </div>
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
      </ProjectTheme>
    </ProjectProvider>
  )
}
