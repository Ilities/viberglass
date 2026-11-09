import { Theme } from '@radix-ui/themes'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { getIntegrationManifests, getIntegrations, linkIntegrationToProject } from '@/service/api/integration-api'
import { NewProjectPage } from './NewProjectPage'
import { createProject, upsertProjectScmConfig } from '@/service/api/project-api'
import { getAppHome } from '@/service/api/app-home-api'

jest.mock('@/service/api/integration-api', () => ({
  getIntegrationManifests: jest.fn(),
  getIntegrations: jest.fn(),
  getIntegrationCredentials: jest.fn(async () => []),
  linkIntegrationToProject: jest.fn(),
}))
jest.mock('@/service/api/app-home-api', () => ({
  getAppHome: jest.fn(async () => ({ home: null, availability: { available: false, missing: ['app_home'] } })),
}))
jest.mock('@/service/api/project-api', () => ({
  createProject: jest.fn(),
  updateProject: jest.fn(),
  upsertProjectScmConfig: jest.fn(),
}))

beforeAll(() => {
  class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  Object.assign(global, { ResizeObserver: ResizeObserverMock })
  Element.prototype.scrollIntoView = jest.fn()
})

describe('NewProjectPage', () => {
  beforeEach(() => jest.clearAllMocks())

  it('creates a Files space without repository setup and keeps trackers optional', async () => {
    jest.mocked(getIntegrationManifests).mockResolvedValue([])
    jest.mocked(getIntegrations).mockResolvedValue([])
    jest.mocked(createProject).mockResolvedValue({ id: 'files-1', name: 'Slides', slug: 'slides', backingKind: 'files', ticketSystem: 'native', autoFixEnabled: false, autoFixTags: [], customFieldMappings: {}, isPrivate: false, keyPrefix: 'SLI', defaultReviewerIds: [], questionReminderHours: 4, createdAt: '', updatedAt: '' })
    render(<Theme><MemoryRouter><NewProjectPage /></MemoryRouter></Theme>)
    fireEvent.click(screen.getByRole('combobox', { name: 'Space backing' }))
    fireEvent.click(await screen.findByRole('option', { name: 'Files' }))
    expect(screen.queryByText('Repository address')).not.toBeInTheDocument()
    expect(await screen.findByText('Tasks live in Viberglass')).toBeInTheDocument()
    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), { target: { value: 'Slides' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create space' }))
    await waitFor(() => expect(createProject).toHaveBeenCalledWith({ name: 'Slides', backingKind: 'files' }))
    expect(upsertProjectScmConfig).not.toHaveBeenCalled()
  });
  it('creates an App space in one step when the workspace offers them', async () => {
    jest.mocked(getIntegrationManifests).mockResolvedValue([])
    jest.mocked(getIntegrations).mockResolvedValue([])
    jest.mocked(getAppHome).mockResolvedValueOnce({
      home: { integrationId: 'github-1', credentialId: null, owner: 'acme' },
      availability: { available: true, missing: [] },
    })
    jest.mocked(createProject).mockResolvedValue({ id: 'app-1', name: 'Laptops', slug: 'laptops', backingKind: 'app', ticketSystem: 'native', autoFixEnabled: false, autoFixTags: [], customFieldMappings: {}, isPrivate: false, keyPrefix: 'LAP', defaultReviewerIds: [], questionReminderHours: 4, createdAt: '', updatedAt: '' })
    render(<Theme><MemoryRouter><NewProjectPage /></MemoryRouter></Theme>)
    fireEvent.click(screen.getByRole('combobox', { name: 'Space backing' }))
    fireEvent.click(await screen.findByRole('option', { name: 'App' }))
    expect(screen.queryByText('Repository address')).not.toBeInTheDocument()
    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), { target: { value: 'Laptops' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create space' }))
    await waitFor(() => expect(createProject).toHaveBeenCalledWith({ name: 'Laptops', backingKind: 'app' }))
    expect(upsertProjectScmConfig).not.toHaveBeenCalled()
  })
  it("doesn't offer App spaces until the workspace is set up for them", async () => {
    jest.mocked(getIntegrationManifests).mockResolvedValue([])
    jest.mocked(getIntegrations).mockResolvedValue([])
    render(<Theme><MemoryRouter><NewProjectPage /></MemoryRouter></Theme>)
    await waitFor(() => expect(getAppHome).toHaveBeenCalled())
    fireEvent.click(screen.getByRole('combobox', { name: 'Space backing' }))
    expect(await screen.findByRole('option', { name: 'Files' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'App' })).not.toBeInTheDocument()
  })
  it('asks for the repository in the same words as the space settings, with the rest folded under Advanced', async () => {
    jest.mocked(getIntegrationManifests).mockResolvedValue([])
    jest.mocked(getIntegrations).mockResolvedValue([])
    render(
      <Theme>
        <MemoryRouter>
          <NewProjectPage />
        </MemoryRouter>
      </Theme>
    )

    expect(screen.getByRole('heading', { name: 'Create space' })).toBeInTheDocument()
    for (const label of ['Name', 'Code host', 'Repository address', 'Default branch', 'Access token']) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
    expect(await screen.findByText('Tasks live in Viberglass')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Link a tracker' })).toHaveAttribute('href', '/settings/connections')
    expect(screen.getByText('Advanced').closest('details')).not.toHaveAttribute('open')
    expect(screen.getByRole('button', { name: 'Create space' })).toBeInTheDocument()
  })
  it('links the code host only once when the repository step is retried', async () => {
    jest.mocked(getIntegrationManifests).mockResolvedValue([
      { id: 'github', label: 'GitHub', category: 'scm', description: '', configFields: [], status: 'ready' },
    ])
    jest.mocked(getIntegrations).mockResolvedValue([
      { id: 'gh-1', name: 'GitHub', system: 'github', config: {}, isActive: true, createdAt: '', updatedAt: '' },
    ])
    jest.mocked(createProject).mockResolvedValue({ id: 'web-1', name: 'Web', slug: 'web', backingKind: 'git', ticketSystem: 'native', autoFixEnabled: false, autoFixTags: [], customFieldMappings: {}, isPrivate: false, keyPrefix: 'WEB', defaultReviewerIds: [], questionReminderHours: 4, createdAt: '', updatedAt: '' })
    jest.mocked(upsertProjectScmConfig).mockRejectedValueOnce(new Error("This token can't push to acme/web."))
    render(<Theme><MemoryRouter><NewProjectPage /></MemoryRouter></Theme>)

    expect(await screen.findByText('Tasks live in Viberglass')).toBeInTheDocument()
    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), { target: { value: 'Web' } })
    fireEvent.click(screen.getByRole('combobox', { name: 'Code host' }))
    fireEvent.click(await screen.findByRole('option', { name: 'GitHub' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Repository address' }), { target: { value: 'https://github.com/acme/web' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create space' }))
    expect(await screen.findByText("This token can't push to acme/web.")).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Finish setup' }))

    await waitFor(() => expect(upsertProjectScmConfig).toHaveBeenCalledTimes(2))
    expect(createProject).toHaveBeenCalledTimes(1)
    expect(linkIntegrationToProject).toHaveBeenCalledTimes(1)
  })
})
