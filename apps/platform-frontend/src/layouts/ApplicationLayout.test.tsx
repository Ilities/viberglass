import { Theme } from '@radix-ui/themes'
import { act, cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ApplicationLayout } from './ApplicationLayout'
import { useAuth } from '@/context/auth-context'
import { useTheme } from '@/context/theme-context'
import { getProjects } from '@/service/api/project-api'
import { getNeedsYouCount } from '@/service/api/home-api'
import type { AuthUser } from '@/service/api/auth-api'
import { apiFetch } from '@/service/api/client'

jest.mock('@/context/auth-context', () => ({
  useAuth: jest.fn(),
}))

jest.mock('@/context/theme-context', () => ({
  useTheme: jest.fn(),
}))

jest.mock('@/context/project-context', () => ({
  ProjectProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useProject: () => ({ project: null, isLoading: true, error: null }),
}))

jest.mock('@/service/api/project-api', () => ({
  getProjects: jest.fn(),
}))

jest.mock('@/service/api/home-api', () => ({
  getNeedsYouCount: jest.fn(),
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
  jest.mocked(getNeedsYouCount).mockResolvedValue(0)
  mockedUseAuth.mockReturnValue({
    user: USER,
    status: 'authenticated',
    login: jest.fn(),
    register: jest.fn(),
    logout: jest.fn().mockResolvedValue(undefined),
    adoptSession: jest.fn(),
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
            <Route path="/" element={<div>Home content</div>} />
            <Route path="/spaces/:project" element={<div>Space content</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </Theme>
  )
}

function asRole(role: AuthUser['role']) {
  mockedUseAuth.mockReturnValue({
    user: { ...USER, role },
    status: 'authenticated',
    login: jest.fn(),
    register: jest.fn(),
    logout: jest.fn().mockResolvedValue(undefined),
    adoptSession: jest.fn(),
  })
}

async function openDrawer() {
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'Open navigation' }))
  const drawer = screen.getByRole('dialog')
  // Spaces load asynchronously; wait for the list before asserting.
  await within(drawer).findByRole('link', { name: /Catalyst/i })
  return drawer
}

function linkNames(drawer: HTMLElement): string[] {
  return within(drawer)
    .getAllByRole('link')
    .map((link) => `${link.textContent?.trim()} ${link.getAttribute('href')}`)
}

describe('ApplicationLayout navigation', () => {
  it.each(['/api/spaces', '/api/setup/space', '/api/setup/demo'])('updates the mounted sidebar after a space is created through %s', async (path) => {
    renderLayout('/')
    const drawer = await openDrawer()
    const originalFetch = global.fetch
    global.fetch = jest.fn().mockResolvedValue({ ok: true })
    mockedGetProjects.mockResolvedValue([
      {
        id: 'new-space', name: 'New API space', slug: 'new-api-space', createdAt: '', updatedAt: '',
        ticketSystem: 'custom', credentials: { type: 'token' }, autoFixEnabled: false, autoFixTags: [], customFieldMappings: {},
        isPrivate: false, keyPrefix: 'NEW', defaultReviewerIds: [], questionReminderHours: 4,
      },
    ])
    try {
      await act(async () => {
        await apiFetch(path, { method: 'POST' })
      })
      expect(await within(drawer).findByRole('link', { name: /New API space/i })).toHaveAttribute('href', '/spaces/new-api-space')
      expect(within(drawer).queryByRole('link', { name: /Catalyst/i })).not.toBeInTheDocument()
    } finally {
      global.fetch = originalFetch
    }
  })

  it('shows Home, Overview, the spaces and, for admins, one Settings entry', async () => {
    renderLayout('/')
    const drawer = await openDrawer()

    for (const label of ['Home', 'Overview']) {
      expect(within(drawer).getByRole('link', { name: new RegExp(`^${label}$`, 'i') })).toBeInTheDocument()
    }
    expect(within(drawer).getByRole('link', { name: /^Settings$/i })).toHaveAttribute('href', '/settings')
    for (const label of ['Workspace settings', 'Your settings', 'Agent runners', 'Secrets', 'Integrations', 'Users', 'Prompt Templates', 'API Tokens', 'Dashboard', 'Tasks']) {
      expect(within(drawer).queryByRole('link', { name: new RegExp(`^${label}$`, 'i') })).not.toBeInTheDocument()
    }
    const viberglassLinks = within(drawer).getAllByRole('link', { name: /Viberglass/i })
    expect(viberglassLinks.some((link) => link.getAttribute('href') === '/spaces/viberglass')).toBe(true)
    expect(within(drawer).getByRole('link', { name: /New space/i })).toBeInTheDocument()
  })

  it('keeps the same sidebar inside a space, with that space expanded in place', async () => {
    renderLayout('/')
    const outside = linkNames(await openDrawer())
    cleanup()

    renderLayout('/spaces/viberglass')
    const drawer = await openDrawer()
    const inside = linkNames(drawer)

    expect(inside.filter((name) => !outside.includes(name))).toEqual([
      'Runs /spaces/viberglass/runs',
      'Schedules /spaces/viberglass/schedules',
      'Space settings /spaces/viberglass/settings',
    ])
    expect(outside.filter((name) => !inside.includes(name))).toEqual([])
  })

  it('gives viewers Overview and no Home, since they have no threads of their own', async () => {
    asRole('viewer')
    renderLayout('/')
    const drawer = await openDrawer()

    expect(within(drawer).getByRole('link', { name: /^Overview$/i })).toHaveAttribute('href', '/overview')
    expect(within(drawer).queryByRole('link', { name: /^Home$/i })).not.toBeInTheDocument()
  })

  it("shows guests and viewers no Runs, Schedules, New space or Settings, which they can't use", async () => {
    for (const role of ['guest', 'viewer'] as const) {
      asRole(role)
      renderLayout('/spaces/viberglass')
      const drawer = await openDrawer()

      for (const label of ['Runs', 'Schedules', 'New space', 'Settings']) {
        expect(within(drawer).queryByRole('link', { name: new RegExp(`^${label}$`, 'i') })).not.toBeInTheDocument()
      }
      // The space's settings stay: everyone may read how a space works.
      expect(linkNames(drawer)).toContain('Space settings /spaces/viberglass/settings')
      cleanup()
    }
  })
})
