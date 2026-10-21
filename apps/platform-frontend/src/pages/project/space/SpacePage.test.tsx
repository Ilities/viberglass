import { Theme } from '@radix-ui/themes'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { spaceCapabilities, type Project, type WorkspaceRole } from '@viberglass/types'
import { useProject } from '@/context/project-context'
import { getTickets, type TicketListParams } from '@/service/api/ticket-api'
import { SpacePage } from './SpacePage'
import { testTask } from './test-task'

jest.mock('@/context/project-context', () => ({ useProject: jest.fn() }))
jest.mock('@/service/api/ticket-api', () => ({ getTickets: jest.fn(), archiveTickets: jest.fn(), unarchiveTickets: jest.fn() }))
jest.mock('@/service/api/project-api', () => ({ getProjectReadiness: jest.fn(() => new Promise(() => undefined)) }))

const ACTIVE = [
  testTask('1', { state: 'agent_working', label: 'Agent writing the plan', waitingOn: { kind: 'agent' } }),
  testTask('2', { state: 'artifact_ready', label: 'Plan v1 ready', yourMove: true }),
]
const DONE = [testTask('3', { state: 'done', label: 'Done' }, { status: 'resolved' })]

function space(role: WorkspaceRole, membership: 'maintainer' | 'member' | null = null): Project {
  return {
    backingKind: "git",
    id: 'space-1',
    name: 'Web shop',
    slug: 'web',
    ticketSystem: 'custom',
    autoFixTags: [],
    autoFixEnabled: false,
    credentials: { type: 'token' },
    customFieldMappings: {},
    isPrivate: false,
    keyPrefix: 'WEB',
    defaultReviewerIds: [],
    questionReminderHours: 4,
    viewerAccess: spaceCapabilities(role, membership),
    createdAt: '',
    updatedAt: '',
  }
}

function renderAs(role: WorkspaceRole, membership: 'maintainer' | 'member' | null = null, search = '') {
  jest.mocked(useProject).mockReturnValue({ project: space(role, membership), isLoading: false, error: null })
  render(
    <Theme>
      <MemoryRouter initialEntries={[`/spaces/web${search}`]}>
        <Routes>
          <Route path="/spaces/:project" element={<SpacePage />} />
        </Routes>
      </MemoryRouter>
    </Theme>
  )
}

beforeEach(() => {
  jest.mocked(getTickets).mockImplementation(async (params: TicketListParams = {}) => {
    const tickets = params.statuses?.includes('resolved') ? DONE : ACTIVE
    return { tickets, pagination: { limit: 100, offset: 0, count: tickets.length, total: tickets.length } }
  })
})

describe('SpacePage', () => {
  it("groups the space's tasks by what happens next, the viewer's move first and Done folded", async () => {
    renderAs('member', 'member')

    const groups = await screen.findAllByRole('region')
    expect(groups.map((group) => group.getAttribute('aria-label') ?? group.querySelector('h2')?.textContent)).toEqual([
      'Needs you',
      'Agent working',
      'Done',
    ])
    expect(within(groups[0]).getByText('Task 2')).toBeInTheDocument()
    expect(within(groups[2]).queryByText('Task 3')).not.toBeInTheDocument()
    expect(screen.queryByText(/Dashboard|Open Issues|Awaiting review/)).not.toBeInTheDocument()
  })

  it('lets members create tasks, but only maintainers select tasks to archive', async () => {
    renderAs('member', 'member')
    await screen.findByText('Task 2')
    expect(screen.getByRole('link', { name: 'Create task' })).toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })

  it('gives maintainers checkboxes to archive with', async () => {
    renderAs('member', 'maintainer')
    await screen.findByText('Task 2')
    expect(screen.getAllByRole('checkbox')).toHaveLength(2)
  })

  it('selects every task in the table at once', async () => {
    renderAs('member', 'maintainer', '?view=table')
    await screen.findByText('Task 2')

    fireEvent.click(screen.getByRole('checkbox', { name: 'Select all Agent working tasks' }))

    expect(await screen.findByText('1 selected')).toBeInTheDocument()
  })

  it("shows guests and viewers no action they can't take", async () => {
    for (const role of ['guest', 'viewer'] as const) {
      renderAs(role, role === 'guest' ? 'member' : null)
      await screen.findByText('Task 2')
      expect(screen.queryByRole('link', { name: 'Create task' })).not.toBeInTheDocument()
      expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
      document.body.innerHTML = ''
    }
  })

  it('says a new space has no tasks yet, and offers the first one', async () => {
    jest.mocked(getTickets).mockResolvedValue({ tickets: [], pagination: { limit: 100, offset: 0, count: 0, total: 0 } })
    renderAs('member', 'member')

    expect(await screen.findByText('No tasks in this space yet')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Create a task' })).toHaveAttribute('href', '/spaces/web/tasks/new')
  })

  it('says the filters hid the tasks, and offers to clear them', async () => {
    renderAs('member', 'member')
    await screen.findByText('Task 2')

    jest.mocked(getTickets).mockResolvedValue({ tickets: [], pagination: { limit: 100, offset: 0, count: 0, total: 0 } })
    renderAs('member', 'member', '?search=nothing')

    expect(await screen.findByText('No tasks match your filters')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Clear the filters' })).toBeInTheDocument()
  })
})
