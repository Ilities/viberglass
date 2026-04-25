import { Theme } from '@radix-ui/themes'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentProps, ReactElement } from 'react'
import { JiraInboundWebhookSection } from './JiraInboundWebhookSection'
import { JiraOutboundWebhookSection } from './JiraOutboundWebhookSection'

function renderWithTheme(ui: ReactElement) {
  return render(<Theme>{ui}</Theme>)
}

function createInboundProps(
  overrides: Partial<ComponentProps<typeof JiraInboundWebhookSection>> = {}
): ComponentProps<typeof JiraInboundWebhookSection> {
  return {
    autoExecute: false,
    deliveries: [],
    hasInboundChanges: false,
    inboundEvents: ['issue_created'],
    inboundWebhooks: [],
    isLoadingDeliveries: false,
    isLoadingWebhook: false,
    isSavingWebhook: false,
    projects: [
      { id: 'project-1', name: 'Viberglass' },
      { id: 'project-2', name: 'Waxcarvers' },
    ],
    selectedInboundProjectId: null,
    selectedInboundProviderProjectId: 'OPS',
    selectedInboundConfig: null,
    selectedInboundConfigId: null,
    showSecret: false,
    onAutoExecuteChange: jest.fn(),
    onCopyWebhookSecret: jest.fn(),
    onCopyWebhookUrl: jest.fn(),
    onCreateInboundWebhook: jest.fn(),
    onDeleteInboundWebhook: jest.fn(),
    onGenerateSecret: jest.fn(),
    onInboundProjectChange: jest.fn(),
    onProviderProjectIdChange: jest.fn(),
    onRefreshDeliveries: jest.fn(),
    onRetryDelivery: jest.fn(),
    onSaveWebhook: jest.fn(),
    onSelectInboundWebhook: jest.fn(),
    onToggleInboundEvent: jest.fn(),
    onToggleSecretVisibility: jest.fn(),
    ...overrides,
  }
}

function createOutboundProps(
  overrides: Partial<ComponentProps<typeof JiraOutboundWebhookSection>> = {}
): ComponentProps<typeof JiraOutboundWebhookSection> {
  return {
    isSavingWebhook: false,
    outboundApiToken: '',
    outboundWebhook: {
      id: 'outbound-1',
      provider: 'jira',
      events: ['job_started', 'job_ended'],
      active: true,
      hasApiToken: true,
      providerProjectId: 'OPS',
      createdAt: '2026-02-10T00:00:00.000Z',
      updatedAt: '2026-02-10T00:00:00.000Z',
    },
    projectMapping: 'OPS',
    onOutboundApiTokenChange: jest.fn(),
    onSaveOutboundWebhook: jest.fn(),
    ...overrides,
  }
}

describe('Jira webhook sections', () => {
  it('renders inbound Jira setup and project scope controls', () => {
    renderWithTheme(
      <JiraInboundWebhookSection
        {...createInboundProps({
          inboundWebhooks: [
            {
              id: 'inbound-1',
              integrationId: 'test-integration-id',
              provider: 'jira',
              webhookUrl: '/api/webhooks/jira',
              events: ['issue_created'],
              autoExecute: false,
              active: true,
              hasSecret: true,
              webhookSecret: 'secret',
              providerProjectId: null,
              projectId: null,
              inboundEvents: [],
              labelMappings: null,
              createdAt: '2026-02-10T00:00:00.000Z',
              updatedAt: '2026-02-10T00:00:00.000Z',
            },
          ],
          selectedInboundConfig: {
            id: 'inbound-1',
            integrationId: 'test-integration-id',
            provider: 'jira',
            webhookUrl: '/api/webhooks/jira',
            events: ['issue_created'],
            autoExecute: false,
            active: true,
            hasSecret: true,
            webhookSecret: 'secret',
            providerProjectId: null,
            projectId: null,
            inboundEvents: [],
            labelMappings: null,
            createdAt: '2026-02-10T00:00:00.000Z',
            updatedAt: '2026-02-10T00:00:00.000Z',
          },
          selectedInboundConfigId: 'inbound-1',
        })}
      />
    )

    expect(screen.getByRole('heading', { name: 'Jira Inbound Webhook' })).toBeInTheDocument()
    expect(screen.getByText('Jira setup steps')).toBeInTheDocument()
    expect(screen.getByText('Inbound project scope')).toBeInTheDocument()
    expect(screen.getByLabelText('Viberglass project')).toBeInTheDocument()
    expect(screen.getByLabelText('Jira project key (optional)')).toBeInTheDocument()
  })

  it('toggles Jira inbound event options', async () => {
    const user = userEvent.setup()
    const onToggleInboundEvent = jest.fn()

    renderWithTheme(
      <JiraInboundWebhookSection
        {...createInboundProps({
          inboundWebhooks: [
            {
              id: 'inbound-1',
              integrationId: 'test-integration-id',
              provider: 'jira',
              webhookUrl: '/api/webhooks/jira',
              events: ['issue_created'],
              autoExecute: false,
              active: true,
              hasSecret: true,
              webhookSecret: 'secret',
              providerProjectId: null,
              projectId: null,
              inboundEvents: [],
              labelMappings: null,
              createdAt: '2026-02-10T00:00:00.000Z',
              updatedAt: '2026-02-10T00:00:00.000Z',
            },
          ],
          selectedInboundConfig: {
            id: 'inbound-1',
            integrationId: 'test-integration-id',
            provider: 'jira',
            webhookUrl: '/api/webhooks/jira',
            events: ['issue_created'],
            autoExecute: false,
            active: true,
            hasSecret: true,
            webhookSecret: 'secret',
            providerProjectId: null,
            projectId: null,
            inboundEvents: [],
            labelMappings: null,
            createdAt: '2026-02-10T00:00:00.000Z',
            updatedAt: '2026-02-10T00:00:00.000Z',
          },
          selectedInboundConfigId: 'inbound-1',
          onToggleInboundEvent,
        })}
      />
    )

    const commentToggle = screen.getByRole('checkbox', { name: /Comment created/ })
    await user.click(commentToggle)
    expect(onToggleInboundEvent).toHaveBeenCalledWith('comment_created', true)
  })

  it('renders outbound always-on feedback copy', () => {
    renderWithTheme(
      <JiraOutboundWebhookSection
        {...createOutboundProps({
          projectMapping: null,
        })}
      />
    )

    expect(screen.getByRole('heading', { name: 'Jira Feedback' })).toBeInTheDocument()
    expect(screen.getByText('Always-on feedback events')).toBeInTheDocument()
    expect(screen.getByText(/Save an inbound Jira project key/i)).toBeInTheDocument()
  })

  it('requires token to enable outbound feedback when no config exists', () => {
    renderWithTheme(
      <JiraOutboundWebhookSection
        {...createOutboundProps({
          outboundWebhook: null,
          outboundApiToken: '',
        })}
      />
    )

    expect(screen.getByRole('button', { name: 'Enable feedback' })).toBeDisabled()
  })

  it('allows outbound save when config exists', async () => {
    const user = userEvent.setup()
    const onSaveOutboundWebhook = jest.fn()

    renderWithTheme(
      <JiraOutboundWebhookSection
        {...createOutboundProps({
          onSaveOutboundWebhook,
        })}
      />
    )

    const saveButton = screen.getByRole('button', { name: 'Save feedback settings' })
    expect(saveButton).toBeEnabled()
    await user.click(saveButton)
    expect(onSaveOutboundWebhook).toHaveBeenCalledTimes(1)
  })
})
