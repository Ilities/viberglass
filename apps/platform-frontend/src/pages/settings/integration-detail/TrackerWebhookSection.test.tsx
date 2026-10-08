import { Theme } from '@radix-ui/themes'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { ConnectionSpaceRule, IntegrationInboundWebhookConfig } from '@/service/api/integration-api'
import { TrackerWebhookSection } from './TrackerWebhookSection'
import type { useIntegrationWebhookSettings } from './useIntegrationWebhookSettings'

type Webhook = ReturnType<typeof useIntegrationWebhookSettings>

const TRACKER = {
  tracker: 'Jira',
  item: 'issue',
  items: 'issues',
  setupSteps: ['In Jira, open Settings, System, Webhooks.'],
  events: [{ value: 'issue_created', label: 'Issue created', description: 'Creates a task.' }],
  botUsernameHint: 'The bot.',
  botUsernamePlaceholder: 'e.g. bot',
}

const CONFIG: IntegrationInboundWebhookConfig = {
  id: 'hook-1',
  integrationId: 'conn-1',
  provider: 'jira',
  webhookUrl: 'http://localhost:8888/api/webhooks/jira/hook-1',
  webhookSecret: null,
  hasSecret: true,
  projectId: null,
  active: true,
  planNewIssues: false,
  botUsername: null,
  inboundEvents: ['issue_created'],
  events: ['issue_created'],
  createdAt: '',
  updatedAt: '',
}

function webhook(overrides: Partial<Webhook> = {}): Webhook {
  return {
    planNewIssues: false,
    botUsername: '',
    deliveries: [],
    hasInboundChanges: false,
    inboundActive: true,
    inboundEvents: ['issue_created'],
    inboundWebhooks: [CONFIG],
    isLoadingDeliveries: false,
    isLoadingWebhook: false,
    isSavingWebhook: false,
    selectedInboundConfig: CONFIG,
    selectedInboundConfigId: CONFIG.id,
    selectedInboundProjectId: null,
    showSecret: false,
    setPlanNewIssues: jest.fn(),
    setBotUsername: jest.fn(),
    setInboundActive: jest.fn(),
    setSelectedInboundProjectId: jest.fn(),
    setShowSecret: jest.fn(),
    handleCopyWebhookSecret: jest.fn(),
    handleCopyWebhookUrl: jest.fn(),
    handleCreateInboundWebhook: jest.fn(),
    handleDeleteInboundWebhook: jest.fn(),
    handleGenerateSecret: jest.fn(),
    handleRefreshDeliveries: jest.fn(),
    handleRetryDelivery: jest.fn(),
    handleSaveInboundWebhook: jest.fn(),
    handleSelectInboundWebhook: jest.fn(),
    handleToggleInboundEvent: jest.fn(),
    ...overrides,
  }
}

const RULES: ConnectionSpaceRule[] = [
  { id: 'r-1', projectId: 'web', integrationId: 'conn-1', label: 'frontend', planNewIssues: true, projectName: 'Web shop', projectSlug: 'web' },
  { id: 'r-2', projectId: 'web', integrationId: 'conn-1', label: 'ui', planNewIssues: true, projectName: 'Web shop', projectSlug: 'web' },
]

function renderSection(state: Webhook, rules: ConnectionSpaceRule[] = []) {
  render(
    <Theme>
      <MemoryRouter>
        <TrackerWebhookSection tracker={TRACKER} routesByRepository={false} webhook={state} spaceRules={rules} projects={[]} />
      </MemoryRouter>
    </Theme>
  )
}

describe('TrackerWebhookSection', () => {
  it('offers to set up the webhook when the connection has none', () => {
    const state = webhook({ inboundWebhooks: [], selectedInboundConfig: null, selectedInboundConfigId: null })
    renderSection(state)

    fireEvent.click(screen.getByRole('button', { name: 'Set up the webhook' }))
    expect(state.handleCreateInboundWebhook).toHaveBeenCalled()
  })

  it('shows where the tracker sends its events, and the spaces taking its issues', () => {
    renderSection(webhook(), RULES)

    expect(screen.getByLabelText('Webhook URL')).toHaveValue(CONFIG.webhookUrl)
    expect(screen.getByText('In Jira, open Settings, System, Webhooks.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Web shop' })).toHaveAttribute('href', '/spaces/web/settings/issues')
    expect(screen.getByText(/labelled frontend, ui · writes the plan/)).toBeInTheDocument()
  })
})
