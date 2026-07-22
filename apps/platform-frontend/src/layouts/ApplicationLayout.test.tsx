import { Theme } from '@radix-ui/themes'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ApplicationLayout } from './ApplicationLayout'
import { useAuth } from '@/context/auth-context'
import { useTheme } from '@/context/theme-context'
import { getProjects } from '@/service/api/project-api'
import { getTickets } from '@/service/api/ticket-api'
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

jest.mock('@/service/api/ticket-api', () => ({
  getTickets: jest.fn(),
}))

jest.mock('sonner', () => ({
  Toaster: () => null,
}))

const mockedUseAuth = useAuth as jest.MockedFunction<typeof useAuth>
const mockedUseTheme = useTheme as jest.MockedFunction<typeof useTheme>
const mockedGetProjects = getProjects as jest.MockedFunction<typeof getProjects>
const mockedGetTickets = getTickets as jest.MockedFunction<typeof getTickets>

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
  mockedGetTickets.mockResolvedValue({
    tickets: [],
    pagination: { limit: 15, offset: 0, count: 0, total: 0 },
  })
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

describe('ApplicationLayout mobile navigation', () => {
  it('shows platform nav items and project list in the drawer on global routes', async () => {
    const user = userEvent.setup()
    renderLayout('/')

    await user.click(screen.getByRole('button', { name: 'Open navigation' }))

    const mobileDrawer = screen.getByRole('dialog')

    // Projects load asynchronously — wait for the list before asserting
    expect(await within(mobileDrawer).findByRole('link', { name: /Catalyst/i })).toBeInTheDocument()

    for (const label of [
      'Dashboard',
      'Clankers',
      'Secrets',
      'Integrations',
      'Pulse',
      'Users',
      'Prompt Templates',
      'API Tokens',
    ]) {
      expect(
        within(mobileDrawer).getByRole('link', { name: new RegExp(`^${label}$`, 'i') }),
      ).toBeInTheDocument()
    }

    // The logo link and the Viberglass project link share the accessible
    // name — assert the project one by its href
    const viberglassLinks = within(mobileDrawer).getAllByRole('link', { name: /Viberglass/i })
    expect(viberglassLinks.some((link) => link.getAttribute('href') === '/project/viberglass')).toBe(true)
    expect(within(mobileDrawer).getByRole('link', { name: /New Project/i })).toBeInTheDocument()
  })

  it('shows project nav items in the drawer on project routes', async () => {
    const user = userEvent.setup()
    renderLayout('/project/viberglass')

    await user.click(screen.getByRole('button', { name: 'Open navigation' }))

    const mobileDrawer = screen.getByRole('dialog')

    for (const label of ['Home', 'Dashboard', 'Tickets', 'Claws', 'Jobs', 'Settings']) {
      expect(
        within(mobileDrawer).getByRole('link', { name: new RegExp(`^${label}$`, 'i') }),
      ).toBeInTheDocument()
    }
  })
})
