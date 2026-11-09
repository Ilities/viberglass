import { Theme } from '@radix-ui/themes'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import type { ClawScheduleSummary, ClawTaskTemplateSummary, Project } from '@viberglass/types'
import { getClawSchedules, getClawTaskTemplates } from '@/service/api/claw-api'
import { useProject } from '@/context/project-context'
import { ClawsPage } from './ClawsPage'

jest.mock('@/context/project-context', () => ({ useProject: jest.fn() }))
const mockRole = { current: 'member' }
jest.mock('@/context/auth-context', () => ({ useAuth: () => ({ user: { id: 'me', role: mockRole.current } }) }))
jest.mock('@/service/api/claw-api', () => ({
  getClawSchedules: jest.fn(async () => []),
  getClawTaskTemplates: jest.fn(async () => []),
}))
jest.mock('@/service/api/agent-directory-api', () => ({ getAgentDirectory: jest.fn(async () => []) }))
jest.mock('@/service/api/secret-api', () => ({ listAllSecrets: jest.fn(async () => []) }))

const SPACE: Project = {
  backingKind: "git",
  id: 'space-1',
  name: 'Web shop',
  slug: 'web',
  ticketSystem: 'custom',
  autoFixEnabled: false,
  autoFixTags: [],
  customFieldMappings: {},
  isPrivate: false,
  keyPrefix: 'WEB',
  defaultReviewerIds: [],
  questionReminderHours: 4,
  createdAt: '',
  updatedAt: '',
}

const TEMPLATE: ClawTaskTemplateSummary = {
  id: 't-1', projectId: 'space-1', name: 'Weekly tidy', description: null, clankerId: 'a-1', secretBindings: [], createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z',
}
const SCHEDULE: ClawScheduleSummary = {
  id: 's-1', projectId: 'space-1', action: 'run_template', taskTemplateId: 't-1', name: 'Mondays', description: null,
  scheduleType: 'interval', intervalExpression: '1w', cronExpression: null, timezone: 'UTC', isActive: true,
  lastRunAt: null, nextRunAt: null, runCount: 2, failureCount: 0, createdAt: '', updatedAt: '',
}

describe('ClawsPage', () => {
  beforeEach(() => {
    mockRole.current = 'member'
  })

  function Location() {
    const location = useLocation()
    return <span data-testid="location">{`${location.pathname}${location.search}`}</span>
  }

  function renderPage(entry: string) {
    jest.mocked(useProject).mockReturnValue({ project: SPACE, isLoading: false, error: null })
    return render(
      <Theme>
        <MemoryRouter initialEntries={[entry]}>
          <Location />
          <Routes>
            <Route path="/spaces/:project/schedules" element={<ClawsPage />} />
          </Routes>
        </MemoryRouter>
      </Theme>
    )
  }

  it('with no task templates, offers to create one, which opens the template form', async () => {
    renderPage('/spaces/web/schedules')

    expect(await screen.findByText('No task templates yet')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /New schedule/ })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Create a template/ }))

    expect(await screen.findByText('New task template')).toBeInTheDocument()
  })

  it('keeps the view in the URL, so it can be linked to', async () => {
    renderPage('/spaces/web/schedules')

    fireEvent.click(await screen.findByRole('button', { name: 'Task templates' }))

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('clawTab=templates'))
  })

  it('opens the view the URL asks for', async () => {
    renderPage('/spaces/web/schedules?clawTab=templates')

    expect(await screen.findByText('A template is the task a schedule runs.')).toBeInTheDocument()
  })

  it('shows viewers the schedules and templates without the buttons to change them', async () => {
    mockRole.current = 'viewer'
    jest.mocked(getClawSchedules).mockResolvedValueOnce([SCHEDULE])
    jest.mocked(getClawTaskTemplates).mockResolvedValueOnce([TEMPLATE])
    renderPage('/spaces/web/schedules')

    expect(await screen.findByText('Mondays')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /New schedule|Edit|Pause|Delete/ })).not.toBeInTheDocument()

    jest.mocked(getClawTaskTemplates).mockResolvedValueOnce([TEMPLATE])
    fireEvent.click(screen.getByRole('button', { name: 'Task templates' }))

    expect(await screen.findByText('Weekly tidy')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /New template|Edit|Delete/ })).not.toBeInTheDocument()
  })
})
