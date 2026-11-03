import { Theme } from '@radix-ui/themes'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { getAppHome, saveAppHome } from '@/service/api/app-home-api'
import { getIntegrationManifests, getIntegrations } from '@/service/api/integration-api'
import { getRepositoryOwners } from '@/service/api/repository-api'
import { AppHomePage } from './AppHomePage'

jest.mock('@/service/api/app-home-api', () => ({ getAppHome: jest.fn(), saveAppHome: jest.fn(), removeAppHome: jest.fn() }))
jest.mock('@/service/api/integration-api', () => ({
  getIntegrationManifests: jest.fn(),
  getIntegrations: jest.fn(),
  getIntegrationCredentials: jest.fn(async () => []),
}))
jest.mock('@/service/api/repository-api', () => ({ getRepositoryOwners: jest.fn() }))

beforeAll(() => {
  class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  Object.assign(global, { ResizeObserver: ResizeObserverMock })
  Element.prototype.scrollIntoView = jest.fn()
})

beforeEach(() => {
  jest.mocked(getIntegrationManifests).mockResolvedValue([
    { id: 'github', label: 'GitHub', category: 'scm', description: '', configFields: [], status: 'ready', createsRepositories: true },
  ])
  jest.mocked(getIntegrations).mockResolvedValue([
    { id: 'github-1', name: 'Company GitHub', system: 'github', config: {}, isActive: true, createdAt: '', updatedAt: '' },
  ])
  jest.mocked(getRepositoryOwners).mockResolvedValue([{ name: 'jane', kind: 'user' }, { name: 'acme', kind: 'organization' }])
})

function renderPage() {
  render(<Theme><MemoryRouter><AppHomePage /></MemoryRouter></Theme>)
}

it('says what the workspace still needs before App spaces are offered', async () => {
  jest.mocked(getAppHome).mockResolvedValue({ home: null, availability: { available: false, missing: ['apps_domain', 'app_home'] } })
  renderPage()
  expect(await screen.findByText(/App spaces aren’t offered yet/)).toBeInTheDocument()
  expect(screen.getByText(/Set APPS_DOMAIN/)).toBeInTheDocument()
  expect(screen.getByText('An App home, chosen below.')).toBeInTheDocument()
  expect(screen.queryByText(/Set S3_BUCKET/)).not.toBeInTheDocument()
})

it('saves the App home with the owner the token can create repositories under', async () => {
  const home = { integrationId: 'github-1', credentialId: null, owner: 'acme' }
  jest.mocked(getAppHome).mockResolvedValue({ home, availability: { available: true, missing: [] } })
  jest.mocked(saveAppHome).mockResolvedValue({ home, availability: { available: true, missing: [] } })
  renderPage()
  expect(await screen.findByText('App spaces are offered when people create a space.')).toBeInTheDocument()
  await waitFor(() => expect(getRepositoryOwners).toHaveBeenCalledWith('github-1', null))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled())
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(saveAppHome).toHaveBeenCalledWith(home))
  expect(screen.getByRole('button', { name: 'Remove App home' })).toBeInTheDocument()
})
