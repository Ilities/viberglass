import {
  bringSpaceInAsApp,
  downloadLastAppData,
  ejectSpaceApp,
  getSpaceBackingOptions,
} from '@/service/api/space-backing-api'
import { Theme } from '@radix-ui/themes'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { Project, SpaceBackingOptions } from '@viberglass/types'
import { MemoryRouter } from 'react-router-dom'
import { toast } from 'sonner'
import { SpaceBackingSwitch } from './SpaceBackingSwitch'

const navigate = jest.fn()
jest.mock('react-router-dom', () => ({ ...jest.requireActual('react-router-dom'), useNavigate: () => navigate }))
jest.mock('sonner', () => ({ toast: { warning: jest.fn(), success: jest.fn(), error: jest.fn() } }))
jest.mock('@/service/api/space-backing-api', () => ({
  getSpaceBackingOptions: jest.fn(),
  bringSpaceInAsApp: jest.fn(),
  ejectSpaceApp: jest.fn(),
  downloadLastAppData: jest.fn(),
}))

const GIT_SPACE: Project = {
  backingKind: 'git',
  id: 'space-1',
  name: 'Laptops',
  slug: 'laptops',
  ticketSystem: 'custom',
  credentials: { type: 'token' },
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

const OPTIONS: SpaceBackingOptions = {
  appSpacesAvailable: true,
  nameFitsApp: true,
  appNameRule: 'Use letters.',
  ejected: null,
  keepDays: 30,
}

function renderSwitch(project: Project) {
  return render(
    <Theme>
      <MemoryRouter>
        <SpaceBackingSwitch project={project} />
      </MemoryRouter>
    </Theme>
  )
}

describe('SpaceBackingSwitch', () => {
  beforeEach(() => {
    jest.resetAllMocks()
    jest.mocked(getSpaceBackingOptions).mockResolvedValue(OPTIONS)
  })

  it('makes a git space an App space and opens the contract task', async () => {
    jest.mocked(bringSpaceInAsApp).mockResolvedValue({ slug: 'laptops', contractTaskId: 'task-1', warnings: [] })
    renderSwitch(GIT_SPACE)

    fireEvent.click(await screen.findByRole('button', { name: 'Make this an App space' }))
    fireEvent.click(screen.getByRole('button', { name: 'Make it an App space' }))

    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/spaces/laptops/tasks/task-1'))
    expect(bringSpaceInAsApp).toHaveBeenCalledWith('space-1', { startFrom: 'none' })
  })

  it('asks for a new name when the space name does not work as an address, and needs a file to upload', async () => {
    jest.mocked(getSpaceBackingOptions).mockResolvedValue({ ...OPTIONS, nameFitsApp: false })
    jest.mocked(bringSpaceInAsApp).mockResolvedValue({ slug: 'laptop-tracker', contractTaskId: null, warnings: [] })
    renderSwitch({ ...GIT_SPACE, name: 'preview-laptops', slug: 'preview-laptops' })

    fireEvent.click(await screen.findByRole('button', { name: 'Make this an App space' }))
    fireEvent.change(screen.getByDisplayValue('preview-laptops'), { target: { value: 'Laptop tracker' } })
    fireEvent.click(screen.getByRole('radio', { name: 'A SQLite file' }))
    const confirm = screen.getByRole('button', { name: 'Make it an App space' })
    expect(confirm).toBeDisabled()

    const file = new File(['SQLite format 3'], 'laptops.db')
    fireEvent.change(screen.getByLabelText('SQLite file'), { target: { files: [file] } })
    fireEvent.click(confirm)

    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/spaces/laptop-tracker/app'))
    expect(bringSpaceInAsApp).toHaveBeenCalledWith('space-1', { startFrom: 'upload', name: 'Laptop tracker', file })
  })

  it("offers the last copy of an ejected app's data, to download or start from", async () => {
    jest.mocked(getSpaceBackingOptions).mockResolvedValue({
      ...OPTIONS,
      ejected: { ejectedAt: '2026-11-05T12:00:00Z', bytes: 4096, keptUntil: '2026-12-05T12:00:00Z' },
    })
    renderSwitch(GIT_SPACE)

    fireEvent.click(await screen.findByRole('button', { name: "Download the app's last data" }))
    expect(downloadLastAppData).toHaveBeenCalledWith('space-1', 'laptops')
    expect(await screen.findByRole('button', { name: "Download the app's last data" })).toBeEnabled()

    fireEvent.click(screen.getByRole('button', { name: 'Make this an App space' }))
    expect(screen.getByRole('radio', { name: 'Its data from before' })).toBeChecked()
  })

  it('stops hosting the app of an App space', async () => {
    renderSwitch({ ...GIT_SPACE, backingKind: 'app' })

    fireEvent.click(await screen.findByRole('button', { name: 'Stop hosting the app' }))
    expect(screen.getByText(/A last copy of its data is kept for 30 days/)).toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('button', { name: 'Stop hosting the app' }).at(-1)!)

    await waitFor(() => expect(toast.success).toHaveBeenCalled())
    expect(ejectSpaceApp).toHaveBeenCalledWith('space-1')
  })

  it('shows nothing for Files spaces, or git spaces where apps can not be hosted', async () => {
    const files = renderSwitch({ ...GIT_SPACE, backingKind: 'files' })
    expect(getSpaceBackingOptions).not.toHaveBeenCalled()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    files.unmount()

    jest.mocked(getSpaceBackingOptions).mockResolvedValue({ ...OPTIONS, appSpacesAvailable: false })
    renderSwitch(GIT_SPACE)
    await waitFor(() => expect(getSpaceBackingOptions).toHaveBeenCalled())
    expect(screen.queryByRole('button', { name: 'Make this an App space' })).not.toBeInTheDocument()
  })
})
