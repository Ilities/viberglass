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
    jiraProjectKey: 'OPS',
    selectedInboundConfig: null,
    selectedInboundConfigId: null,
    showSecret: false,
    onAutoExecuteChange: jest.fn(),
    onCopyWebhookSecret: jest.fn(),
    onCopyWebhookUrl: jest.fn(),
    onCreateInboundWebhook: jest.fn(),
    onDeleteInboundWebhook: jest.fn(),
    onGenerateSecret: jest.fn(),
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
    emitJobEnded: true,
    emitJobStarted: true,
    hasOutboundChanges: true,
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
    onDeleteOutboundWebhook: jest.fn(),
    onEmitJobEndedChange: jest.fn(),
    onEmitJobStartedChange: jest.fn(),
    onOutboundApiTokenChange: jest.fn(),
    onSaveOutboundWebhook: jest.fn(),
    ...overrides,
  }
}

describe('Jira webhook sections', () => {
  it('renders inbound Jira setup and project key warning when project key is missing', () => {
    renderWithTheme(
      <JiraInboundWebhookSection
        {...createInboundProps({
          jiraProjectKey: null,
        })}
      />
    )

    expect(screen.getByRole('heading', { name: 'Jira Inbound Webhook' })).toBeInTheDocument()
    expect(screen.getByText('Jira setup steps')).toBeInTheDocument()
    expect(
      screen.getByText('Missing project key in integration configuration')
    ).toBeInTheDocument()
    expect(screen.getByText(/Save a Jira Project Key/i)).toBeInTheDocument()
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
              provider: 'jira',
              webhookUrl: '/api/webhooks/jira',
              events: ['issue_created'],
              autoExecute: false,
              active: true,
              hasSecret: true,
              webhookSecret: 'secret',
              createdAt: '2026-02-10T00:00:00.000Z',
              updatedAt: '2026-02-10T00:00:00.000Z',
            },
          ],
          selectedInboundConfig: {
            id: 'inbound-1',
            provider: 'jira',
            webhookUrl: '/api/webhooks/jira',
            events: ['issue_created'],
            autoExecute: false,
            active: true,
            hasSecret: true,
            webhookSecret: 'secret',
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

  it('disables outbound save button when project mapping is missing', () => {
    renderWithTheme(
      <JiraOutboundWebhookSection
        {...createOutboundProps({
          projectMapping: null,
        })}
      />
    )

    expect(screen.getByText(/Save a Jira Project Key/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save outbound settings' })).toBeDisabled()
  })

  it('allows outbound save when mapping is present', async () => {
    const user = userEvent.setup()
    const onSaveOutboundWebhook = jest.fn()

    renderWithTheme(
      <JiraOutboundWebhookSection
        {...createOutboundProps({
          onSaveOutboundWebhook,
        })}
      />
    )

    const saveButton = screen.getByRole('button', { name: 'Save outbound settings' })
    expect(saveButton).toBeEnabled()
    await user.click(saveButton)
    expect(onSaveOutboundWebhook).toHaveBeenCalledTimes(1)
  })
})
