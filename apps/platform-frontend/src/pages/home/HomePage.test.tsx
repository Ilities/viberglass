import { Theme } from '@radix-ui/themes'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { HomeThread } from '@viberglass/types'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { HomePage } from './HomePage'

const mockRole = { current: 'member' }
jest.mock('@/context/auth-context', () => ({
  useAuth: () => ({ user: { id: 'me', name: 'Maria Product', role: mockRole.current }, status: 'authenticated' }),
}))
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
    situation: {
      state: 'discussing',
      label: 'Discussing',
      waitingOn: { kind: 'nobody' },
      since: '2026-10-01T10:00:00Z',
      yourMove: false,
    },
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

  it('greets you, puts the threads that need you first, then the rest, which the filters narrow', async () => {
    mockHome.mockResolvedValue({
      needsYou: [
        thread('1', {
          situation: {
            state: 'discussing',
            label: 'Discussing',
            waitingOn: { kind: 'people', people: [{ id: 'me', name: 'Maria' }] },
            since: 't',
            yourMove: true,
          },
          mentionsYou: true,
          lastMessage: { author: { id: 't', name: 'Tomi Laine' }, text: 'Have a look', at: 't' },
        }),
        thread('4', {
          situation: {
            state: 'question',
            label: 'Question for Maria',
            waitingOn: { kind: 'people', people: [{ id: 'me', name: 'Maria' }] },
            since: 't',
            yourMove: true,
          },
        }),
      ],
      threads: [
        thread('2', {
          unread: 2,
          situation: {
            state: 'artifact_ready',
            label: 'Plan v3 ready',
            waitingOn: { kind: 'people', people: [{ id: 'q', name: 'Quinn QA' }] },
            since: 't',
            yourMove: false,
          },
        }),
        thread('3', { roles: ['owner'] }),
      ],
    })
    renderHome()

    expect(await screen.findByRole('heading', { level: 1, name: /, Maria$/ })).toBeInTheDocument()
    expect(screen.getByText('2 conversations need your attention.')).toBeInTheDocument()

    const needsYou = screen.getByRole('region', { name: /Needs you/ })
    const mention = within(needsYou).getByRole('listitem', { name: 'Task 1' })
    expect(within(mention).getByText('Tomi mentioned you')).toBeInTheDocument()
    expect(within(mention).getByText('“Have a look”')).toBeInTheDocument()
    expect(within(mention).getByRole('link', { name: 'Task 1' })).toHaveAttribute(
      'href',
      '/spaces/web/tasks/WEB-1'
    )
    const question = within(needsYou).getByRole('listitem', { name: 'Task 4' })
    expect(within(question).getByText('Agent asked you')).toBeInTheDocument()
    expect(within(question).getByRole('link', { name: 'Answer' })).toBeInTheDocument()

    const yours = screen.getByRole('region', { name: 'Your conversations' })
    const unread = within(yours).getByRole('listitem', { name: 'Task 2' })
    expect(within(unread).getByLabelText('2 new messages')).toHaveTextContent('2 unread')
    expect(within(unread).getByText("Quinn's turn")).toBeInTheDocument()

    await userEvent.click(within(yours).getByRole('button', { name: 'I own' }))
    expect(within(yours).queryByText('Task 2')).not.toBeInTheDocument()
    expect(within(yours).getByText('Task 3')).toBeInTheDocument()
  })

  it('marks a mention done from Home, and it stops needing you', async () => {
    const mentioned = thread('1', {
      mentionsYou: true,
      situation: {
        state: 'discussing',
        label: 'Discussing',
        waitingOn: { kind: 'people', people: [{ id: 'me', name: 'Maria' }] },
        since: 't',
        yourMove: true,
      },
    })
    mockHome
      .mockResolvedValueOnce({ needsYou: [mentioned], threads: [] })
      .mockResolvedValue({ needsYou: [], threads: [{ ...mentioned, mentionsYou: false }] })
    mockDone.mockResolvedValue(undefined)
    renderHome()

    const needsYou = await screen.findByRole('region', { name: /Needs you/ })
    await userEvent.click(within(needsYou).getByRole('button', { name: 'Acknowledge mention' }))
    expect(mockDone).toHaveBeenCalledWith('1')
    expect(await screen.findByRole('region', { name: 'Your conversations' })).toHaveTextContent('Task 1')
    expect(screen.queryByRole('region', { name: /Needs you/ })).not.toBeInTheDocument()
  })

  it('asks for something when there are no threads yet', async () => {
    mockHome.mockResolvedValue({ needsYou: [], threads: [] })
    renderHome()

    expect(await screen.findByText('Nothing here yet')).toBeInTheDocument()
    expect(await screen.findByRole('link', { name: 'Ask for something' })).toHaveAttribute(
      'href',
      '/spaces/web/tasks/new'
    )
  })

  it('sends viewers to Overview', async () => {
    mockRole.current = 'viewer'
    renderHome()
    expect(await screen.findByText('Overview page')).toBeInTheDocument()
  })
})
