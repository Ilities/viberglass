import { Theme } from '@radix-ui/themes'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { Integration, IntegrationManifest } from '@viberglass/types'
import { IntegrationFrontendRegistry, type IntegrationFrontendPlugin } from '@viberglass/integration-core/frontend'
import { getIntegration, getIntegrationManifests, getChatStatus } from '@/service/api/integration-api'
import { IntegrationDetailPage } from './IntegrationDetailPage'

jest.mock('@/service/api/integration-api', () => ({
  createIntegration: jest.fn(),
  getConnectionIssueRules: jest.fn().mockResolvedValue([]),
  getIntegration: jest.fn(),
  getIntegrationManifests: jest.fn(),
  getChatStatus: jest.fn(),
  testIntegration: jest.fn(),
  updateIntegration: jest.fn(),
}))
jest.mock('@/service/api/project-api', () => ({ getProjects: jest.fn().mockResolvedValue([]) }))
jest.mock('./integration-detail/useIntegrationWebhookSettings', () => ({ useIntegrationWebhookSettings: () => ({}) }))
jest.mock('./integration-detail/ConnectionNameSection', () => ({ ConnectionNameSection: () => null }))
jest.mock('./integration-detail/RemoveIntegrationSection', () => ({ RemoveIntegrationSection: () => null }))
jest.mock('./integration-detail/CreateIntegrationPrompt', () => ({ CreateIntegrationPrompt: () => <p>create prompt</p> }))
jest.mock('./integration-detail/TrackerWebhookSection', () => ({ TrackerWebhookSection: () => <p>tracker webhook</p> }))
jest.mock('./integration-detail/CustomInboundWebhookSection', () => ({
  CustomInboundWebhookSection: () => <p>json webhook</p>,
}))
jest.mock('./integration-detail/IntegrationCredentialSection', () => ({
  IntegrationCredentialSection: ({ credentialUse }: { credentialUse: string }) => <p>token: {credentialUse}</p>,
}))
jest.mock('@/components/integration-config-form', () => ({ IntegrationConfigForm: () => <p>config form</p> }))

function manifest(id: string, overrides: Partial<IntegrationManifest> = {}): IntegrationManifest {
  return {
    id,
    label: id,
    description: '',
    category: 'ticketing',
    status: 'ready',
    authTypes: [],
    configFields: [],
    supports: { issues: true },
    ...overrides,
  }
}

const TRACKER = manifest('tracker', {
  configFields: [{ key: 'siteUrl', label: 'Site URL', type: 'string' }],
  credentialUse: 'Comments on linked issues.',
  webhookProvider: 'tracker',
})
const JSON_WEBHOOK = manifest('json-webhook', { category: 'inbound', webhookProvider: 'json-webhook' })
const INSTALLED_APP = manifest('installed-app', { category: 'chat' })

const mockRegistry = new IntegrationFrontendRegistry()
const plugin = (m: IntegrationManifest, extra: Partial<IntegrationFrontendPlugin> = {}): IntegrationFrontendPlugin => ({
  ...m,
  Icon: () => null,
  ...extra,
})
mockRegistry
  .register(
    plugin(TRACKER, {
      trackerWebhook: {
        tracker: 'Tracker',
        item: 'issue',
        items: 'issues',
        setupSteps: [],
        events: [],
        botUsernameHint: '',
        botUsernamePlaceholder: '',
      },
    })
  )
  .register(plugin(JSON_WEBHOOK))
  .register(plugin(INSTALLED_APP, { AuthSetupSection: () => <p>install the app</p> }))

jest.mock('@/integrations/registerFrontendIntegrationPlugins', () => ({
  get integrationFrontendRegistry() {
    return mockRegistry
  },
}))

function connection(system: string): Integration {
  return { id: `conn-${system}`, name: system, system, config: {}, isActive: true, createdAt: '', updatedAt: '' }
}

function renderAt(path: string) {
  render(
    <Theme>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/settings/connections/:integrationEntityId" element={<IntegrationDetailPage />} />
          <Route path="/settings/connections/new/:integrationSystem" element={<IntegrationDetailPage />} />
        </Routes>
      </MemoryRouter>
    </Theme>
  )
}

describe('IntegrationDetailPage', () => {
  beforeEach(() => {
    jest.mocked(getIntegrationManifests).mockResolvedValue([TRACKER, JSON_WEBHOOK, INSTALLED_APP])
    jest.mocked(getChatStatus).mockResolvedValue({ configured: true })
  })

  it('asks for a name before a new connection is set up', async () => {
    renderAt('/settings/connections/new/tracker')
    expect(await screen.findByText('create prompt')).toBeInTheDocument()
    expect(screen.queryByText('config form')).not.toBeInTheDocument()
  })

  it("shows a tracker connection's settings, tracker webhook and token from its manifest", async () => {
    jest.mocked(getIntegration).mockResolvedValue(connection('tracker'))
    renderAt('/settings/connections/conn-tracker')
    expect(await screen.findByText('config form')).toBeInTheDocument()
    expect(screen.getByText('tracker webhook')).toBeInTheDocument()
    expect(screen.getByText('token: Comments on linked issues.')).toBeInTheDocument()
  })

  it('shows the JSON webhook for a connection that receives webhooks but is no tracker, with no settings or token', async () => {
    jest.mocked(getIntegration).mockResolvedValue(connection('json-webhook'))
    renderAt('/settings/connections/conn-json-webhook')
    expect(await screen.findByText('json webhook')).toBeInTheDocument()
    expect(screen.queryByText('config form')).not.toBeInTheDocument()
    expect(screen.queryByText(/^token:/)).not.toBeInTheDocument()
  })

  it('shows the install section instead of a name prompt for a connection made by installing an app', async () => {
    renderAt('/settings/connections/new/installed-app')
    expect(await screen.findByText('install the app')).toBeInTheDocument()
    expect(screen.queryByText('create prompt')).not.toBeInTheDocument()
    expect(await screen.findByText('Connected')).toBeInTheDocument()
    expect(getChatStatus).toHaveBeenCalledWith('installed-app')
  })
})
