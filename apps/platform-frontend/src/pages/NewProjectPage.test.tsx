import { Theme } from '@radix-ui/themes'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { getAvailableIntegrationTypes, getIntegrations } from '@/service/api/integration-api'
import { NewProjectPage } from './NewProjectPage'

jest.mock('@/service/api/integration-api', () => ({
  getAvailableIntegrationTypes: jest.fn(),
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
})

describe('NewProjectPage', () => {
  it('asks for the repository in the same words as the space settings, with the rest folded under Advanced', async () => {
    jest.mocked(getAvailableIntegrationTypes).mockResolvedValue([])
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
