import { Theme } from '@radix-ui/themes'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { Project } from '@viberglass/types'
import { useProject } from '@/context/project-context'
import { ClawsPage } from './ClawsPage'

jest.mock('@/context/project-context', () => ({ useProject: jest.fn() }))
jest.mock('@/service/api/claw-api', () => ({
  getClawSchedules: jest.fn(async () => []),
  getClawTaskTemplates: jest.fn(async () => []),
}))
jest.mock('@/service/api/clanker-api', () => ({ getClankers: jest.fn(async () => []) }))
jest.mock('@/service/api/secret-api', () => ({ listAllSecrets: jest.fn(async () => []) }))

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
  createdAt: '',
  updatedAt: '',
}

describe('ClawsPage', () => {
  it('with no task templates, offers to create one, which opens the template form', async () => {
    jest.mocked(useProject).mockReturnValue({ project: SPACE, isLoading: false, error: null })
    render(
      <Theme>
        <MemoryRouter initialEntries={['/spaces/web/schedules']}>
          <Routes>
            <Route path="/spaces/:project/schedules" element={<ClawsPage />} />
          </Routes>
        </MemoryRouter>
      </Theme>
    )

    expect(await screen.findByText('No task templates yet')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /New schedule/ })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Create a template/ }))

    expect(await screen.findByText('New task template')).toBeInTheDocument()
  })
})
