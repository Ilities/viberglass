import { DemoInstanceBanner } from '@/components/demo-instance-banner'
import { DemoWorkspaceBanner } from '@/components/demo-workspace-banner'
import { Dropdown, DropdownButton } from '@/components/dropdown'
import { Navbar, NavbarItem, NavbarSection } from '@/components/navbar'
import { StackedLayout } from '@/components/stacked-layout'
import { useAuth } from '@/context/auth-context'
import { ProjectProvider } from '@/context/project-context'
import { useNeedsYouCount } from '@/hooks/useNeedsYouCount'
import { useApiRefresh } from '@/hooks/useApiRefresh'
import { getProjects, type Project } from '@/service/api/project-api'
import { isRunner } from '@/lib/roles'
import { useEffect, useState } from 'react'
import { Navigate, useLocation, useNavigate, useParams } from 'react-router-dom'
import { Toaster } from 'sonner'
import { AccountMenu, UserAvatar } from './account-menu'
import { AppSidebar } from './app-sidebar'
import { SpaceOutlet } from './SpaceOutlet'
import { SpaceSwitcher } from './space-switcher'

export function ApplicationLayout() {
  const navigate = useNavigate()
  const { pathname, search } = useLocation()
  const { project: currentSpace } = useParams<{ project: string }>()
  const { user, status, logout } = useAuth()
  const [spaces, setSpaces] = useState<Project[]>([])
  const spacesRevision = useApiRefresh('/api/spaces', '/api/setup/space', '/api/setup/demo')
  const appUser = user?.role === 'app_user'
  const needsYou = useNeedsYouCount(status === 'authenticated' && !appUser, pathname)

  useEffect(() => {
    if (status === 'unauthenticated') {
      navigate(`/login?redirect=${encodeURIComponent(pathname + search)}`, { replace: true })
    }
  }, [navigate, status, pathname, search])

  useEffect(() => {
    if (status !== 'authenticated' || appUser) {
      setSpaces([])
      return
    }
    let cancelled = false
    getProjects()
      .then((projects) => !cancelled && setSpaces(projects))
      .catch(console.error)
    return () => {
      cancelled = true
    }
  }, [status, user?.id, appUser, spacesRevision])

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

  // App users see no spaces, tasks or settings, only the apps they're given.
  if (appUser) return <Navigate to="/apps" replace />

  const signOut = async () => {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <ProjectProvider>
      <StackedLayout
        navbar={
          <Navbar>
            <SpaceSwitcher current={currentSpace} spaces={spaces} canCreate={isRunner(user.role)} />
            <NavbarSection>
              <Dropdown>
                <DropdownButton as={NavbarItem} aria-label="Account">
                  <UserAvatar user={user} />
                </DropdownButton>
                <AccountMenu user={user} onSignOut={() => void signOut()} />
              </Dropdown>
            </NavbarSection>
          </Navbar>
        }
        sidebar={
          <AppSidebar
            user={user}
            pathname={pathname}
            spaces={spaces}
            currentSpace={currentSpace}
            needsYou={needsYou}
            onSignOut={() => void signOut()}
          />
        }
      >
        <DemoInstanceBanner className="mb-6" />
        <DemoWorkspaceBanner />
        <SpaceOutlet />
      </StackedLayout>
      <Toaster position="bottom-right" richColors closeButton toastOptions={{ duration: 5000 }} />
    </ProjectProvider>
  )
}
