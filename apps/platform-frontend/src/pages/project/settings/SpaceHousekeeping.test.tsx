import { deleteProject, getProjectDeletionSummary } from '@/service/api/project-api'
import { Theme } from '@radix-ui/themes'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { Project } from '@viberglass/types'
import { MemoryRouter } from 'react-router-dom'
import { toast } from 'sonner'
import { SpaceHousekeeping } from './SpaceHousekeeping'

jest.mock('./SpaceBackingSwitch', () => ({ SpaceBackingSwitch: () => null }))

jest.mock('@/context/auth-context', () => ({ useAuth: () => ({ user: { id: 'user-1', role: 'admin' } }) }))
jest.mock('sonner', () => ({ toast: { warning: jest.fn() } }))
jest.mock('@/service/api/project-api', () => ({
  archiveProject: jest.fn(),
  deleteProject: jest.fn(),
  getProjectDeletionSummary: jest.fn(),
}))

const APP_SPACE: Project = {
  backingKind: 'app',
  id: 'space-1',
  name: 'laptops',
  slug: 'laptops',
  ticketSystem: 'custom',
  autoFixEnabled: false,
  autoFixTags: [],
  customFieldMappings: {},
  isPrivate: false,
  keyPrefix: 'LT',
  defaultReviewerIds: [],
  questionReminderHours: 4,
  createdAt: '',
  updatedAt: '',
}

function renderHousekeeping(project: Project) {
  return render(
    <Theme>
      <MemoryRouter>
        <SpaceHousekeeping project={project} />
      </MemoryRouter>
    </Theme>
  )
}

describe('SpaceHousekeeping', () => {
  beforeEach(() => jest.resetAllMocks())

  it('says archiving an App space turns its app off', () => {
    renderHousekeeping(APP_SPACE)

    expect(screen.getByText(/Its app is turned off for good/)).toBeInTheDocument()
  })

  it("lists the app's releases, backups and repository, and passes on what deleting couldn't do", async () => {
    jest.mocked(getProjectDeletionSummary).mockResolvedValue({
      tickets: 2,
      runs: 5,
      sessions: 1,
      schedules: 0,
      app: { releases: 4, backups: 3, repository: 'acme/laptops' },
    })
    jest.mocked(deleteProject).mockResolvedValue({ warnings: ["The repository acme/laptops wasn't archived."] })
    renderHousekeeping(APP_SPACE)

    fireEvent.click(screen.getByRole('button', { name: 'Delete space' }))
    expect(
      await screen.findByText(/The app goes too, with 4 releases, its data and 3 data backups/)
    ).toBeInTheDocument()
    expect(screen.getByText('acme/laptops')).toBeInTheDocument()

    fireEvent.change(screen.getByPlaceholderText('laptops'), { target: { value: 'laptops' } })
    fireEvent.click(screen.getAllByRole('button', { name: 'Delete space' }).at(-1)!)

    await waitFor(() =>
      expect(toast.warning).toHaveBeenCalledWith("The repository acme/laptops wasn't archived.", { duration: Infinity })
    )
  })

  it("doesn't mention an app for other spaces", async () => {
    jest
      .mocked(getProjectDeletionSummary)
      .mockResolvedValue({ tickets: 2, runs: 5, sessions: 1, schedules: 0, app: null })
    renderHousekeeping({ ...APP_SPACE, backingKind: 'git' })

    expect(screen.queryByText(/Its app is turned off/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Delete space' }))
    expect(await screen.findByText(/Also deleted: 2 tasks/)).toBeInTheDocument()
    expect(screen.queryByText(/The app goes too/)).not.toBeInTheDocument()
  })
})
