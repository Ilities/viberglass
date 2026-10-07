import { Theme } from '@radix-ui/themes'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { spaceCapabilities, type Project } from '@viberglass/types'
import { useProject } from '@/context/project-context'
import { SpaceGeneralSettings } from '@/pages/project/settings/AboutSpacePage'
import { SettingsLayout } from './SettingsLayout'

jest.mock('@/context/project-context', () => ({ useProject: jest.fn() }))
jest.mock('@/pages/project/settings/SpaceGeneralPage', () => ({ SpaceGeneralPage: () => <div>Settings form</div> }))
jest.mock('@/service/api/project-api', () => ({
  getProjectScmConfig: jest.fn(async () => ({ sourceRepository: 'acme/shop', baseBranch: 'main' })),
}))
jest.mock('@/service/api/space-member-api', () => ({
  getSpaceMembers: jest.fn(async () => [{ userId: 'u-1', name: 'Maria', role: 'maintainer' }, { userId: 'u-2', name: 'Tomi', role: 'member' }]),
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
  isPrivate: true,
  keyPrefix: 'WEB',
  defaultReviewerIds: [],
  questionReminderHours: 4,
  createdAt: '',
  updatedAt: '',
}

function renderAt(path: string, canMaintain: boolean) {
  const viewerAccess = canMaintain ? spaceCapabilities('member', 'maintainer') : spaceCapabilities('member', 'member')
  jest.mocked(useProject).mockReturnValue({ project: { ...SPACE, viewerAccess }, isLoading: false, error: null })
  render(
    <Theme>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/spaces/:project/settings" element={<SettingsLayout />}>
            <Route path="general" element={<SpaceGeneralSettings />} />
            <Route path="members" element={<div>Members</div>} />
            <Route path="repository" element={<div>Connections form</div>} />
            <Route path="task-defaults" element={<div>Connections form</div>} />
            <Route path="connections" element={<div>Connections form</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </Theme>
  )
}

describe('space settings', () => {
  it('shows maintainers the forms and every tab', () => {
    renderAt('/spaces/web/settings/general', true)

    expect(screen.getByText('Settings form')).toBeInTheDocument()
    for (const name of ['General', 'Repository', 'Task defaults', 'Members', 'Connections', 'Agent instructions']) expect(screen.getByRole('link', { name })).toBeInTheDocument()
  })

  it('reads as a summary for everyone else, without plumbing', async () => {
    renderAt('/spaces/web/settings/general', false)

    expect(await screen.findByText('acme/shop · main')).toBeInTheDocument()
    expect(await screen.findByText('Maria')).toBeInTheDocument()
    expect(screen.getByText('Only its members')).toBeInTheDocument()
    expect(screen.queryByText('Settings form')).not.toBeInTheDocument()
    for (const name of ['Repository', 'Task defaults', 'Connections']) expect(screen.queryByRole('link', { name })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Agent instructions' })).not.toBeInTheDocument()
  })

  it.each(['repository', 'task-defaults', 'connections'])('sends non-maintainers from the maintainers-only %s tab back to the summary', async (tab) => {
    renderAt(`/spaces/web/settings/${tab}`, false)

    expect(await screen.findByRole('heading', { name: 'About this space' })).toBeInTheDocument()
    expect(screen.queryByText('Connections form')).not.toBeInTheDocument()
  })
})
