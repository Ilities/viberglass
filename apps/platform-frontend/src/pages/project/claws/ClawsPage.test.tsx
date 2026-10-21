import { Theme } from '@radix-ui/themes'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import type { Project } from '@viberglass/types'
import { useProject } from '@/context/project-context'
import { ClawsPage } from './ClawsPage'

jest.mock('@/context/project-context', () => ({ useProject: jest.fn() }))
jest.mock('@/context/auth-context', () => ({ useAuth: () => ({ user: { id: 'me', role: 'member' } }) }))
jest.mock('@/service/api/claw-api', () => ({
  getClawSchedules: jest.fn(async () => []),
  getClawTaskTemplates: jest.fn(async () => []),
}))
jest.mock('@/service/api/clanker-api', () => ({ getClankers: jest.fn(async () => []) }))
jest.mock('@/service/api/secret-api', () => ({ listAllSecrets: jest.fn(async () => []) }))

const SPACE: Project = {
  backingKind: "git",
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
  createdAt: '',
  updatedAt: '',
}

describe('ClawsPage', () => {
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
})
