import { Theme } from '@radix-ui/themes'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { spaceCapabilities, type Project, type SpaceMember } from '@viberglass/types'
import { getProjectBySlug } from '@/service/api/project-api'
import { getSpaceMembers, removeSpaceMember } from '@/service/api/space-member-api'
import { getPeopleDirectory } from '@/service/api/user-api'
import { SpaceMembersPage } from './SpaceMembersPage'

jest.mock('@/service/api/project-api', () => ({ getProjectBySlug: jest.fn() }))
jest.mock('@/service/api/space-member-api', () => ({
  getSpaceMembers: jest.fn(),
  removeSpaceMember: jest.fn(),
  setSpaceMember: jest.fn(),
}))
jest.mock('@/service/api/user-api', () => ({ getPeopleDirectory: jest.fn() }))

const MEMBER: SpaceMember = {
  userId: 'user-2',
  name: 'Maria',
  email: 'maria@example.com',
  workspaceRole: 'member',
  role: 'member',
  addedAt: '2026-09-30T10:00:00.000Z',
}

function project(): Project {
  return {
    backingKind: 'git',
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
    viewerAccess: spaceCapabilities('admin', 'maintainer'),
    createdAt: '',
    updatedAt: '',
  }
}

function renderPage() {
  render(
    <Theme>
      <MemoryRouter initialEntries={['/spaces/web/settings/members']}>
        <Routes>
          <Route path="/spaces/:project/settings/members" element={<SpaceMembersPage />} />
        </Routes>
      </MemoryRouter>
    </Theme>
  )
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(getProjectBySlug).mockResolvedValue(project())
  jest.mocked(getSpaceMembers).mockResolvedValue([MEMBER])
  jest.mocked(getPeopleDirectory).mockResolvedValue([])
  jest.mocked(removeSpaceMember).mockResolvedValue([])
})

describe('SpaceMembersPage', () => {
  it('asks before removing someone', async () => {
    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: 'Remove' }))

    const dialog = await screen.findByRole('alertdialog')
    expect(dialog).toHaveTextContent('Maria')
    expect(removeSpaceMember).not.toHaveBeenCalled()

    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove' }))

    await waitFor(() => expect(removeSpaceMember).toHaveBeenCalledWith('space-1', 'user-2'))
  })

  it('keeps the member when the removal is cancelled', async () => {
    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: 'Remove' }))

    const dialog = await screen.findByRole('alertdialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))

    expect(removeSpaceMember).not.toHaveBeenCalled()
  })
})
