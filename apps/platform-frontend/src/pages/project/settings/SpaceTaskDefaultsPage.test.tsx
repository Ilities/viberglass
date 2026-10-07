import { getClankers } from '@/service/api/clanker-api'
import { getProjectBySlug, updateProject } from '@/service/api/project-api'
import { getPeopleDirectory } from '@/service/api/user-api'
import { Theme } from '@radix-ui/themes'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { spaceCapabilities, type Clanker, type Project } from '@viberglass/types'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { SpaceTaskDefaultsPage } from './SpaceTaskDefaultsPage'

jest.mock('@/service/api/clanker-api', () => ({ getClankers: jest.fn() }))
jest.mock('@/service/api/project-api', () => ({ getProjectBySlug: jest.fn(), updateProject: jest.fn() }))
jest.mock('@/service/api/user-api', () => ({ getPeopleDirectory: jest.fn() }))

beforeAll(() => {
  class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  Object.assign(global, { ResizeObserver: ResizeObserverMock })
  Element.prototype.scrollIntoView = jest.fn()
})

const CODEX_AGENT_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'

const SPACE: Project = {
  id: 'space-1',
  name: 'Web shop',
  slug: 'web',
  ticketSystem: 'custom',
  credentials: { type: 'token' },
  autoFixEnabled: false,
  autoFixTags: [],
  customFieldMappings: {},
  isPrivate: false,
  keyPrefix: 'WEB',
  defaultReviewerIds: [],
  questionReminderHours: 4,
  defaultAgentId: null,
  createdAt: '',
  updatedAt: '',
  viewerAccess: spaceCapabilities('member', 'maintainer'),
}

function agent(id: string, name: string, slug: string): Clanker {
  return {
    id,
    name,
    slug,
    configFiles: [],
    secretBindings: [],
    mcpServerIds: [],
    skillIds: [],
    status: 'active',
    createdAt: '',
    updatedAt: '',
  }
}

function renderPage() {
  return render(
    <Theme>
      <MemoryRouter initialEntries={['/spaces/web/settings/task-defaults']}>
        <Routes>
          <Route path="/spaces/:project/settings/task-defaults" element={<SpaceTaskDefaultsPage />} />
        </Routes>
      </MemoryRouter>
    </Theme>
  )
}

describe('SpaceTaskDefaultsPage', () => {
  beforeEach(() => {
    jest.resetAllMocks()
    jest.mocked(getProjectBySlug).mockResolvedValue(SPACE)
    jest.mocked(getPeopleDirectory).mockResolvedValue([])
    jest
      .mocked(getClankers)
      .mockResolvedValue([
        agent('default-1', 'Default agent', 'default-agent'),
        agent(CODEX_AGENT_ID, 'Codex for the API', 'codex'),
      ])
  })

  it('shows which agent applies when the space names none', async () => {
    renderPage()

    expect((await screen.findAllByText('Workspace default (Default agent)')).length).toBeGreaterThan(0)
  })

  it("saves the space's default agent as soon as it is picked, and the workspace default as none", async () => {
    jest.mocked(updateProject).mockResolvedValue({ ...SPACE, defaultAgentId: CODEX_AGENT_ID })
    renderPage()
    const select = await screen.findByRole('combobox', { name: 'Default agent' })
    await waitFor(() => expect(select).toBeEnabled())

    fireEvent.click(select)
    fireEvent.click(await screen.findByRole('option', { name: 'Codex for the API' }))
    await waitFor(() => expect(updateProject).toHaveBeenCalledWith(SPACE.id, { defaultAgentId: CODEX_AGENT_ID }))

    jest.mocked(updateProject).mockResolvedValue({ ...SPACE, defaultAgentId: null })
    await waitFor(() => expect(select).toBeEnabled())
    fireEvent.click(select)
    fireEvent.click(await screen.findByRole('option', { name: 'Workspace default (Default agent)' }))
    await waitFor(() => expect(updateProject).toHaveBeenLastCalledWith(SPACE.id, { defaultAgentId: null }))
  })
})
