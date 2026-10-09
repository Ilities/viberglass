import { Theme } from '@radix-ui/themes'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { Integration, IntegrationManifest, Project } from '@viberglass/types'
import { useProject } from '@/context/project-context'
import {
  getIntegrationManifests,
  getIntegrations,
  getProjectIntegrations,
  linkIntegrationToProject,
  type ProjectIntegrationWithDetails,
} from '@/service/api/integration-api'
import { ProjectIntegrationsPage } from './ProjectIntegrationsPage'

jest.mock('@/context/project-context', () => ({ useProject: jest.fn() }))
jest.mock('@/service/api/integration-api', () => ({
  getIntegrationManifests: jest.fn(),
  getIntegrations: jest.fn(),
  getProjectIntegrations: jest.fn(),
  linkIntegrationToProject: jest.fn(),
  unlinkIntegrationFromProject: jest.fn(),
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

function connection(id: string, name: string, system: Integration['system']): Integration {
  return { id, name, system, config: {}, isActive: true, createdAt: '', updatedAt: '' }
}

function type(id: IntegrationManifest['id'], label: string, category: IntegrationManifest['category']): IntegrationManifest {
  return { id, label, category, description: '', authTypes: [], configFields: [], supports: { issues: true }, status: 'ready' }
}

describe('ProjectIntegrationsPage', () => {
  it('splits linked from available connections, and links one', async () => {
    const github = connection('c-1', 'Acme GitHub', 'github')
    const shortcut = connection('c-2', 'Shortcut', 'shortcut')
    const link: ProjectIntegrationWithDetails = {
      id: 'link-1',
      projectId: SPACE.id,
      integrationId: github.id,
      isPrimary: true,
      createdAt: '',
      integration: { id: github.id, name: github.name, system: github.system, isActive: true },
    }
    jest.mocked(useProject).mockReturnValue({ project: SPACE, isLoading: false, error: null })
    jest.mocked(getIntegrations).mockResolvedValue([github, shortcut])
    jest.mocked(getProjectIntegrations).mockResolvedValue([link])
    jest.mocked(getIntegrationManifests).mockResolvedValue([
      type('github', 'GitHub', 'scm'),
      type('shortcut', 'Shortcut', 'ticketing'),
    ])
    jest.mocked(linkIntegrationToProject).mockResolvedValue({ ...link, id: 'link-2', integrationId: shortcut.id })

    render(
      <Theme>
        <MemoryRouter>
          <ProjectIntegrationsPage />
        </MemoryRouter>
      </Theme>
    )

    const linked = (await screen.findByRole('heading', { name: 'Linked' })).closest('section')
    const available = screen.getByRole('heading', { name: 'Available connections' }).closest('section')
    if (!linked || !available) throw new Error('Missing sections')
    expect(within(linked).getByText('GitHub · Code host')).toBeInTheDocument()
    expect(within(linked).getByRole('button', { name: 'Unlink' })).toBeInTheDocument()
    expect(within(available).getByText('Shortcut · Issue tracker')).toBeInTheDocument()

    fireEvent.click(within(available).getByRole('button', { name: 'Link' }))
    await waitFor(() => expect(linkIntegrationToProject).toHaveBeenCalledWith(SPACE.id, shortcut.id))
  })
})
