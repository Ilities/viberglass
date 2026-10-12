import { Theme } from '@radix-ui/themes'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { getIntegrationManifests, getIntegrations } from '@/service/api/integration-api'
import { NewProjectPage } from './NewProjectPage'
import { createProject, upsertProjectScmConfig } from '@/service/api/project-api'

jest.mock('@/service/api/integration-api', () => ({
  getIntegrationManifests: jest.fn(),
  getIntegrations: jest.fn(),
  getIntegrationCredentials: jest.fn(async () => []),
  linkIntegrationToProject: jest.fn(),
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
  it('creates a Files space without repository setup and keeps trackers optional', async () => {
    jest.mocked(getIntegrationManifests).mockResolvedValue([])
    jest.mocked(getIntegrations).mockResolvedValue([])
    jest.mocked(createProject).mockResolvedValue({ id: 'files-1', name: 'Slides', slug: 'slides', backingKind: 'files', ticketSystem: 'native', credentials: { type: 'token' }, autoFixEnabled: false, autoFixTags: [], customFieldMappings: {}, isPrivate: false, keyPrefix: 'SLI', defaultReviewerIds: [], questionReminderHours: 4, createdAt: '', updatedAt: '' })
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
})
