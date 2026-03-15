import { Theme } from '@radix-ui/themes'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { HelmetProvider } from 'react-helmet-async'
import { useProject } from '@/context/project-context'
import {
  getAvailableIntegrationTypes,
  getIntegrationCredentials,
  getProjectIntegrations,
} from '@/service/api/integration-api'
import {
  deleteProjectScmConfig,
  getProjectScmConfig,
  updateProject,
  upsertProjectScmConfig,
} from '@/service/api/project-api'
import { ProjectSettingsPage } from './ProjectSettingsPage'
import type { Project } from '@/service/api/project-api'
import type { AvailableIntegrationType, ProjectIntegrationWithDetails } from '@/service/api/integration-api'
import type { ProjectScmConfig, IntegrationCredential } from '@viberglass/types'

jest.mock('@/context/project-context', () => ({
  useProject: jest.fn(),
}))

jest.mock('@/service/api/integration-api', () => ({
  getAvailableIntegrationTypes: jest.fn(),
  getIntegrationCredentials: jest.fn(),
  getProjectIntegrations: jest.fn(),
}))

jest.mock('@/service/api/project-api', () => ({
  deleteProjectScmConfig: jest.fn(),
  getProjectScmConfig: jest.fn(),
  updateProject: jest.fn(),
  upsertProjectScmConfig: jest.fn(),
}))

const mockedUseProject = useProject as jest.MockedFunction<typeof useProject>
const mockedGetAvailableIntegrationTypes = getAvailableIntegrationTypes as jest.MockedFunction<
  typeof getAvailableIntegrationTypes
>
const mockedGetIntegrationCredentials = getIntegrationCredentials as jest.MockedFunction<
  typeof getIntegrationCredentials
>
const mockedGetProjectIntegrations = getProjectIntegrations as jest.MockedFunction<
  typeof getProjectIntegrations
>
const mockedGetProjectScmConfig = getProjectScmConfig as jest.MockedFunction<
  typeof getProjectScmConfig
>
const mockedUpdateProject = updateProject as jest.MockedFunction<typeof updateProject>
const mockedUpsertProjectScmConfig = upsertProjectScmConfig as jest.MockedFunction<
  typeof upsertProjectScmConfig
>
const mockedDeleteProjectScmConfig = deleteProjectScmConfig as jest.MockedFunction<
  typeof deleteProjectScmConfig
>

beforeAll(() => {
  class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
  }

  ;(global as unknown as { ResizeObserver: typeof ResizeObserverMock }).ResizeObserver = ResizeObserverMock
})

const PROJECT = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Viberglass',
  slug: 'viberglass',
  ticketSystem: 'jira',
  credentials: { type: 'token', token: 'token-value' },
  autoFixEnabled: false,
  autoFixTags: [],
  customFieldMappings: {},
  repositoryUrl: 'https://github.com/acme/repo',
  repositoryUrls: ['https://github.com/acme/repo'],
  agentInstructions: null,
  createdAt: '2026-02-10T00:00:00.000Z',
  updatedAt: '2026-02-10T00:00:00.000Z',
} as const

const INITIAL_SCM_CONFIG = {
  projectId: PROJECT.id,
  integrationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  integrationSystem: 'github',
  sourceRepository: 'https://github.com/acme/source',
  baseBranch: 'main',
  pullRequestRepository: null,
  pullRequestBaseBranch: null,
  branchNameTemplate: null,
  integrationCredentialId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  createdAt: '2026-02-10T00:00:00.000Z',
  updatedAt: '2026-02-10T00:00:00.000Z',
} as const

function renderPage() {
  return render(
    <HelmetProvider>
      <Theme>
        <MemoryRouter initialEntries={['/project/viberglass/settings']}>
          <Routes>
            <Route path="/project/:project/settings" element={<ProjectSettingsPage />} />
          </Routes>
        </MemoryRouter>
      </Theme>
    </HelmetProvider>
  )
}

async function waitForInitialLoad(expectedCredentialIntegrationId: string = INITIAL_SCM_CONFIG.integrationId) {
  await waitFor(() => {
    expect(mockedGetAvailableIntegrationTypes).toHaveBeenCalled()
    expect(mockedGetProjectIntegrations).toHaveBeenCalledWith(PROJECT.id)
    expect(mockedGetProjectScmConfig).toHaveBeenCalledWith(PROJECT.id)
    expect(mockedGetIntegrationCredentials).toHaveBeenCalledWith(expectedCredentialIntegrationId)
  })
}

describe('ProjectSettingsPage', () => {
  beforeEach(() => {
    jest.resetAllMocks()

    mockedUseProject.mockReturnValue({
      project: PROJECT as unknown as Project,
      isLoading: false,
      error: null,
    })

    mockedGetAvailableIntegrationTypes.mockResolvedValue([
      {
        id: 'jira',
        label: 'Jira',
        category: 'ticketing',
        description: 'Jira integration',
        authTypes: ['token'],
        configFields: [],
        supports: { issues: true },
        status: 'ready',
      } as AvailableIntegrationType,
      {
        id: 'github',
        label: 'GitHub',
        category: 'scm',
        description: 'GitHub integration',
        authTypes: ['token'],
        configFields: [],
        supports: { issues: true, pullRequests: true },
        status: 'ready',
      } as AvailableIntegrationType,
    ])

    mockedGetProjectIntegrations.mockResolvedValue([
      {
        id: 'link-ticketing',
        projectId: PROJECT.id,
        integrationId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        isPrimary: true,
        createdAt: '2026-02-10T00:00:00.000Z',
        integration: {
          id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          name: 'Jira Team',
          system: 'jira',
          isActive: true,
        },
      },
      {
        id: 'link-scm',
        projectId: PROJECT.id,
        integrationId: INITIAL_SCM_CONFIG.integrationId,
        isPrimary: false,
        createdAt: '2026-02-10T00:00:00.000Z',
        integration: {
          id: INITIAL_SCM_CONFIG.integrationId,
          name: 'GitHub Org',
          system: 'github',
          isActive: true,
        },
      },
    ] as ProjectIntegrationWithDetails[])

    mockedGetProjectScmConfig.mockResolvedValue(INITIAL_SCM_CONFIG as unknown as ProjectScmConfig)
    mockedGetIntegrationCredentials.mockResolvedValue([
      {
        id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        name: 'GITHUB_TOKEN',
        integrationId: INITIAL_SCM_CONFIG.integrationId,
        credentialType: 'token',
        secretId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        secretLocation: 'env',
        isDefault: false,
        description: null,
        expiresAt: null,
        lastUsedAt: null,
        createdAt: '2026-02-10T00:00:00.000Z',
        updatedAt: '2026-02-10T00:00:00.000Z',
      },
    ] as IntegrationCredential[])

    mockedUpdateProject.mockResolvedValue(PROJECT as unknown as Project)
    mockedUpsertProjectScmConfig.mockResolvedValue(INITIAL_SCM_CONFIG as unknown as ProjectScmConfig)
    mockedDeleteProjectScmConfig.mockResolvedValue()
  })

  it('loads linked ticketing and SCM integrations into the settings form', async () => {
    const { container } = renderPage()
    await waitForInitialLoad()
    await waitFor(() => {
      const ticketingIntegrationSelect = container.querySelector(
        'select[name="ticket_integration"]'
      ) as HTMLSelectElement | null
      const scmIntegrationSelect = container.querySelector(
        'select[name="scm_integration"]'
      ) as HTMLSelectElement | null
      const integrationCredentialSelect = container.querySelector(
        'select[name="integration_credential_id"]'
      ) as HTMLSelectElement | null

      expect(ticketingIntegrationSelect).not.toBeNull()
      expect(scmIntegrationSelect).not.toBeNull()
      expect(integrationCredentialSelect).not.toBeNull()
      expect(ticketingIntegrationSelect?.value).toBe('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')
      expect(scmIntegrationSelect?.value).toBe(INITIAL_SCM_CONFIG.integrationId)
      expect(integrationCredentialSelect?.value).toBe(
        'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
      )
    })
    expect(screen.getAllByText('Jira Team (jira)').length).toBeGreaterThan(0)
    expect(screen.getAllByText('GitHub Org (github)').length).toBeGreaterThan(0)

    const sourceRepositoryInput = container.querySelector(
      'input[name="source_repository"]'
    ) as HTMLInputElement
    const baseBranchInput = container.querySelector('input[name="base_branch"]') as HTMLInputElement
    const integrationCredentialOption = container.querySelector(
      'select[name="integration_credential_id"] option[value="cccccccc-cccc-4ccc-8ccc-cccccccccccc"]'
    )

    expect(sourceRepositoryInput.value).toBe(INITIAL_SCM_CONFIG.sourceRepository)
    expect(baseBranchInput.value).toBe(INITIAL_SCM_CONFIG.baseBranch)
    expect(integrationCredentialOption).not.toBeNull()
    expect(screen.getByText(/Available placeholders:/i)).toBeInTheDocument()
  })

  it('saves ticketing and SCM configuration when form is submitted', async () => {
    const user = userEvent.setup()
    const { container } = renderPage()
    await waitForInitialLoad()
    await waitFor(() => {
      expect(screen.getAllByText('GitHub Org (github)').length).toBeGreaterThan(0)
    })

    const sourceRepositoryInput = container.querySelector(
      'input[name="source_repository"]'
    ) as HTMLInputElement
    const baseBranchInput = container.querySelector('input[name="base_branch"]') as HTMLInputElement
    const prRepositoryInput = container.querySelector('input[name="pr_repository"]') as HTMLInputElement
    const branchTemplateInput = container.querySelector(
      'input[name="branch_name_template"]'
    ) as HTMLInputElement
    const integrationCredentialSelect = container.querySelector(
      'select[name="integration_credential_id"]'
    ) as HTMLSelectElement | null
    const ticketingIntegrationSelect = container.querySelector(
      'select[name="ticket_integration"]'
    ) as HTMLSelectElement | null
    const scmIntegrationSelect = container.querySelector(
      'select[name="scm_integration"]'
    ) as HTMLSelectElement | null

    expect(integrationCredentialSelect).not.toBeNull()
    expect(ticketingIntegrationSelect).not.toBeNull()
    expect(scmIntegrationSelect).not.toBeNull()

    fireEvent.change(ticketingIntegrationSelect as HTMLSelectElement, {
      target: { value: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' },
    })
    fireEvent.change(scmIntegrationSelect as HTMLSelectElement, {
      target: { value: INITIAL_SCM_CONFIG.integrationId },
    })

    fireEvent.change(sourceRepositoryInput, {
      target: { value: '  https://github.com/acme/new-source  ' },
    })
    fireEvent.change(baseBranchInput, {
      target: { value: '  develop  ' },
    })
    fireEvent.change(prRepositoryInput, {
      target: { value: 'https://github.com/acme/upstream' },
    })
    fireEvent.change(branchTemplateInput, {
      target: { value: 'viberator/{{ticketId}}-{{timestamp}}' },
    })
    fireEvent.change(integrationCredentialSelect as HTMLSelectElement, {
      target: { value: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' },
    })

    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => {
      expect(mockedUpdateProject).toHaveBeenCalledWith(
        PROJECT.id,
        expect.objectContaining({
          name: PROJECT.name,
          ticketSystem: 'jira',
        })
      )
      expect(mockedUpsertProjectScmConfig).toHaveBeenCalledWith(PROJECT.id, {
        integrationId: INITIAL_SCM_CONFIG.integrationId,
        sourceRepository: 'https://github.com/acme/new-source',
        baseBranch: 'develop',
        pullRequestRepository: 'https://github.com/acme/upstream',
        pullRequestBaseBranch: null,
        branchNameTemplate: 'viberator/{{ticketId}}-{{timestamp}}',
        integrationCredentialId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      })
    })

    expect(screen.getByText('Project settings saved.')).toBeInTheDocument()
  })

  it('deletes SCM config when SCM integration is cleared and form is submitted', async () => {
    const user = userEvent.setup()
    const { container } = renderPage()
    await waitForInitialLoad()
    await waitFor(() => {
      expect(screen.getAllByText('GitHub Org (github)').length).toBeGreaterThan(0)
    })

    const scmIntegrationSelect = container.querySelector(
      'select[name="scm_integration"]'
    ) as HTMLSelectElement | null
    expect(scmIntegrationSelect).not.toBeNull()
    fireEvent.change(scmIntegrationSelect as HTMLSelectElement, {
      target: { value: '__none__' },
    })

    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => {
      expect(mockedDeleteProjectScmConfig).toHaveBeenCalledWith(PROJECT.id)
    })
    expect(mockedUpsertProjectScmConfig).not.toHaveBeenCalled()
  })

  it('shows validation error when SCM integration is selected without a source repository', async () => {
    const user = userEvent.setup()
    const { container } = renderPage()
    await waitForInitialLoad()
    await waitFor(() => {
      expect(screen.getAllByText('GitHub Org (github)').length).toBeGreaterThan(0)
    })

    const sourceRepositoryInput = container.querySelector(
      'input[name="source_repository"]'
    ) as HTMLInputElement
    const scmIntegrationSelect = container.querySelector(
      'select[name="scm_integration"]'
    ) as HTMLSelectElement | null
    expect(scmIntegrationSelect).not.toBeNull()
    fireEvent.change(scmIntegrationSelect as HTMLSelectElement, {
      target: { value: INITIAL_SCM_CONFIG.integrationId },
    })
    await waitFor(() => {
      expect(sourceRepositoryInput).not.toBeDisabled()
    })
    fireEvent.change(sourceRepositoryInput, { target: { value: '' } })
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => {
      expect(
        screen.getByText('Source repository is required when SCM integration is selected')
      ).toBeInTheDocument()
    })
    expect(mockedUpsertProjectScmConfig).not.toHaveBeenCalled()
  })

  it('falls back to primary SCM integration selection when SCM config is missing', async () => {
    mockedUseProject.mockReturnValue({
      project: {
        ...PROJECT,
        primaryScmIntegrationId: INITIAL_SCM_CONFIG.integrationId,
      } as unknown as Project,
      isLoading: false,
      error: null,
    })
    mockedGetProjectScmConfig.mockResolvedValue(null)
    mockedGetIntegrationCredentials.mockResolvedValue([])

    const { container } = renderPage()
    await waitForInitialLoad(INITIAL_SCM_CONFIG.integrationId)

    await waitFor(() => {
      const scmIntegrationSelect = container.querySelector(
        'select[name="scm_integration"]'
      ) as HTMLSelectElement | null
      expect(scmIntegrationSelect).not.toBeNull()
      expect(scmIntegrationSelect?.value).toBe(INITIAL_SCM_CONFIG.integrationId)
    })
  })
})
