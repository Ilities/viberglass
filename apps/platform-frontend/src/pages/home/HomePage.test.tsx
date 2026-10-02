import { Theme } from '@radix-ui/themes'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { HomeThread } from '@viberglass/types'
import { HomePage } from './HomePage'

const mockRole = { current: 'member' }
jest.mock('@/context/auth-context', () => ({ useAuth: () => ({ user: { id: 'me', role: mockRole.current }, status: 'authenticated' }) }))
jest.mock('@/pages/setup/useSetupRedirect', () => ({ useSetupRedirect: () => undefined }))
const mockHome = jest.fn()
jest.mock('@/service/api/home-api', () => ({ getHome: () => mockHome() }))
const mockDone = jest.fn()
jest.mock('@/service/api/discussion-api', () => ({ markMentionsDone: (...args: unknown[]) => mockDone(...args) }))
jest.mock('sonner', () => ({ toast: { error: jest.fn() } }))
jest.mock('@/data', () => ({ getProjectsList: () => Promise.resolve([{ id: 'p', name: 'Web shop', slug: 'web' }]) }))

function thread(id: string, overrides: Partial<HomeThread> = {}): HomeThread {
  return {
    task: { id, key: `WEB-${id}`, title: `Task ${id}`, spaceSlug: 'web', spaceName: 'Web shop' },
    situation: { state: 'discussing', label: 'Discussing', waitingOn: { kind: 'nobody' }, since: '2026-10-01T10:00:00Z', yourMove: false },
    roles: ['watcher'],
    unread: 0,
    mentionsYou: false,
    lastMessage: null,
    latestActivityAt: '2026-10-01T10:00:00Z',
    ...overrides,
  }
}

function renderHome() {
  return render(
    <Theme>
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/overview" element={<div>Overview page</div>} />
        </Routes>
      </MemoryRouter>
    </Theme>
  )
}

describe('HomePage', () => {
  beforeEach(() => {
    mockRole.current = 'member'
  })

  it('puts the threads that need you first, then the rest, which the filters narrow', async () => {
    mockHome.mockResolvedValue({
      needsYou: [
        thread('1', {
          situation: { state: 'artifact_ready', label: 'Plan v2 ready', waitingOn: { kind: 'people', people: [{ id: 'me', name: 'Maria' }] }, since: 't', yourMove: true },
          lastMessage: { author: { id: 't', name: 'Tomi' }, text: 'Have a look', at: 't' },
        }),
      ],
      threads: [thread('2', { unread: 2 }), thread('3', { roles: ['owner'] })],
    })
    renderHome()

    const needsYou = await screen.findByRole('region', { name: 'Needs you' })
    expect(within(needsYou).getByText('Task 1')).toBeInTheDocument()
    expect(within(needsYou).getByText('Plan v2 ready · Maria')).toBeInTheDocument()
    expect(within(needsYou).getByText('Tomi: Have a look')).toBeInTheDocument()

    const yours = screen.getByRole('region', { name: 'Your tasks' })
    expect(within(yours).getByText('Task 2')).toBeInTheDocument()
    expect(within(yours).getByLabelText('2 unread')).toBeInTheDocument()

    await userEvent.click(within(yours).getByRole('button', { name: 'Mine' }))
    expect(within(yours).queryByText('Task 2')).not.toBeInTheDocument()
    expect(within(yours).getByText('Task 3')).toBeInTheDocument()
  })

  it('marks a mention done from Home, and it stops needing you', async () => {
    const mentioned = thread('1', {
      mentionsYou: true,
      situation: { state: 'discussing', label: 'Discussing', waitingOn: { kind: 'people', people: [{ id: 'me', name: 'Maria' }] }, since: 't', yourMove: true },
    })
    mockHome.mockResolvedValueOnce({ needsYou: [mentioned], threads: [] }).mockResolvedValue({ needsYou: [], threads: [{ ...mentioned, mentionsYou: false }] })
    mockDone.mockResolvedValue(undefined)
    renderHome()

    const needsYou = await screen.findByRole('region', { name: 'Needs you' })
    await userEvent.click(within(needsYou).getByRole('button', { name: 'Mark done' }))
    expect(mockDone).toHaveBeenCalledWith('1')
    expect(await screen.findByRole('region', { name: 'Your tasks' })).toHaveTextContent('Task 1')
    expect(screen.queryByRole('region', { name: 'Needs you' })).not.toBeInTheDocument()
  })

  it('asks for something when there are no threads yet', async () => {
    mockHome.mockResolvedValue({ needsYou: [], threads: [] })
    renderHome()

    expect(await screen.findByText('Nothing here yet')).toBeInTheDocument()
    expect(await screen.findByRole('link', { name: 'Ask for something' })).toHaveAttribute('href', '/spaces/web/tasks/new')
  })

  it('sends viewers to Overview', async () => {
    mockRole.current = 'viewer'
    renderHome()
    expect(await screen.findByText('Overview page')).toBeInTheDocument()
  })
})
