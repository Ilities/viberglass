import { Theme } from '@radix-ui/themes'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { Project } from '@viberglass/types'
import { useProject } from '@/context/project-context'
import { updateProject } from '@/service/api/project-api'
import { SpaceGeneralPage } from './SpaceGeneralPage'

jest.mock('@/context/project-context', () => ({ useProject: jest.fn() }))
jest.mock('@/context/auth-context', () => ({ useAuth: () => ({ user: { id: 'user-1', role: 'admin' } }) }))
jest.mock('@/service/api/project-api', () => ({
  updateProject: jest.fn(),
  archiveProject: jest.fn(),
  deleteProject: jest.fn(),
  getProjectDeletionSummary: jest.fn(),
}))

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

function renderPage() {
  jest.mocked(useProject).mockReturnValue({ project: SPACE, isLoading: false, error: null })
  return render(
    <Theme>
      <MemoryRouter>
        <SpaceGeneralPage />
      </MemoryRouter>
    </Theme>
  )
}

describe('SpaceGeneralPage', () => {
  beforeEach(() => jest.resetAllMocks())

  it('saves the name and whether the space is private together', async () => {
    jest.mocked(updateProject).mockResolvedValue({ ...SPACE, name: 'Storefront', isPrivate: true })
    renderPage()

    fireEvent.change(screen.getByRole('textbox'), { target: { value: '  Storefront ' } })
    fireEvent.click(screen.getByRole('switch', { name: 'Private space' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(updateProject).toHaveBeenCalledWith(SPACE.id, { name: 'Storefront', isPrivate: true }))
    expect(await screen.findByText('Saved.')).toBeInTheDocument()
  })

  it('offers archiving, and deleting to admins, in sentence case', () => {
    renderPage()

    expect(screen.getByRole('button', { name: 'Archive space' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Danger zone' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete space' })).toBeInTheDocument()
  })
})
