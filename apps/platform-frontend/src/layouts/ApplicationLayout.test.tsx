import { Theme } from '@radix-ui/themes'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ApplicationLayout } from './ApplicationLayout'
import { useAuth } from '@/context/auth-context'
import { useTheme } from '@/context/theme-context'
import { getProjects } from '@/service/api/project-api'
import type { AuthUser } from '@/service/api/auth-api'

jest.mock('@/context/auth-context', () => ({
  useAuth: jest.fn(),
}))

jest.mock('@/context/theme-context', () => ({
  useTheme: jest.fn(),
}))

jest.mock('@/context/project-context', () => ({
  ProjectProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

jest.mock('@/context/project-theme', () => ({
  ProjectTheme: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

jest.mock('@/service/api/project-api', () => ({
  getProjects: jest.fn(),
}))

jest.mock('sonner', () => ({
  Toaster: () => null,
}))

const mockedUseAuth = useAuth as jest.MockedFunction<typeof useAuth>
const mockedUseTheme = useTheme as jest.MockedFunction<typeof useTheme>
const mockedGetProjects = getProjects as jest.MockedFunction<typeof getProjects>

const USER: AuthUser = {
  id: 'user-1',
  email: 'jussi@hallila.com',
  name: 'Jussi Hallila',
  avatarUrl: null,
  role: 'admin',
}

beforeAll(() => {
  class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
  }

  ;(global as unknown as { ResizeObserver: typeof ResizeObserverMock }).ResizeObserver = ResizeObserverMock
})

beforeEach(() => {
  jest.resetAllMocks()
  mockedUseAuth.mockReturnValue({
    user: USER,
    status: 'authenticated',
    login: jest.fn(),
    register: jest.fn(),
    logout: jest.fn().mockResolvedValue(undefined),
  })
  mockedUseTheme.mockReturnValue({
    theme: 'light',
    toggleTheme: jest.fn(),
    accentColor: 'amber',
  })
  mockedGetProjects.mockResolvedValue([
    {
      id: 'project-1',
      name: 'Viberglass',
      slug: 'viberglass',
    },
    {
      id: 'project-2',
      name: 'Catalyst',
      slug: 'catalyst',
    },
  ] as Awaited<ReturnType<typeof getProjects>>)
})

function renderLayout(initialPath: string) {
  return render(
    <Theme>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route element={<ApplicationLayout />}>
            <Route path="/" element={<div>Dashboard content</div>} />
            <Route path="/project/:project" element={<div>Project content</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </Theme>
  )
}

function getLinkLabels(scope: HTMLElement) {
  return within(scope)
    .getAllByRole('link')
    .map((link) => link.textContent?.trim() ?? '')
}

describe('ApplicationLayout mobile navigation', () => {
  it('shows desktop nav items and project list in a single drawer layer on global routes', async () => {
    const user = userEvent.setup()
    const { container } = renderLayout('/')
    const desktopNav = container.querySelector('header nav')

    expect(desktopNav).not.toBeNull()

    const desktopLabels = getLinkLabels(desktopNav as HTMLElement)
    expect(desktopLabels).toEqual(['Dashboard', 'Clankers', 'Secrets', 'Integrations', 'Users'])

    await user.click(screen.getByRole('button', { name: 'Open navigation' }))

    const mobileDrawer = screen.getByRole('dialog')

    desktopLabels.forEach((label) => {
      expect(within(mobileDrawer).getByRole('link', { name: new RegExp(label, 'i') })).toBeInTheDocument()
    })

    expect(within(mobileDrawer).getByRole('link', { name: /Viberglass/i })).toBeInTheDocument()
    expect(within(mobileDrawer).getByRole('link', { name: /Catalyst/i })).toBeInTheDocument()
    expect(within(mobileDrawer).getByRole('link', { name: /New Project/i })).toBeInTheDocument()
  })

  it('shows desktop nav items and project list in a single drawer layer on project routes', async () => {
    const user = userEvent.setup()
    const { container } = renderLayout('/project/viberglass')
    const desktopNav = container.querySelector('header nav')

    expect(desktopNav).not.toBeNull()

    const desktopLabels = getLinkLabels(desktopNav as HTMLElement)
    expect(desktopLabels).toEqual(['Dashboard', 'Tickets', 'Jobs'])

    await user.click(screen.getByRole('button', { name: 'Open navigation' }))

    const mobileDrawer = screen.getByRole('dialog')

    desktopLabels.forEach((label) => {
      expect(within(mobileDrawer).getByRole('link', { name: new RegExp(label, 'i') })).toBeInTheDocument()
    })

    expect(within(mobileDrawer).getByRole('link', { name: /Back to Home/i })).toBeInTheDocument()
    expect(within(mobileDrawer).getByRole('link', { name: /Viberglass/i })).toBeInTheDocument()
    expect(within(mobileDrawer).getByRole('link', { name: /Catalyst/i })).toBeInTheDocument()
    expect(within(mobileDrawer).getByRole('link', { name: /New Project/i })).toBeInTheDocument()
  })
})
