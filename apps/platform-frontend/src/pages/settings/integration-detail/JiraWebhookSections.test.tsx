import { Theme } from '@radix-ui/themes'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentProps, ReactElement } from 'react'
import { JiraInboundWebhookSection } from '@viberglass/integration-jira/frontend'

function renderWithTheme(ui: ReactElement) {
  return render(<Theme>{ui}</Theme>)
}

function createInboundProps(
  overrides: Partial<ComponentProps<typeof JiraInboundWebhookSection>> = {}
): ComponentProps<typeof JiraInboundWebhookSection> {
  return {
    planNewIssues: false,
    botUsername: '',
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
    onPlanNewIssuesChange: jest.fn(),
    onBotUsernameChange: jest.fn(),
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

describe('Jira webhook sections', () => {
  it('renders inbound Jira setup and space scope controls', () => {
    renderWithTheme(
      <JiraInboundWebhookSection
        {...createInboundProps({
          inboundWebhooks: [
            {
              id: 'inbound-1',
              integrationId: 'test-integration-id',
              webhookUrl: '/api/webhooks/jira',
              events: ['issue_created'],
              planNewIssues: false,
              botUsername: null,
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
            webhookUrl: '/api/webhooks/jira',
            events: ['issue_created'],
            planNewIssues: false,
            botUsername: null,
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
    expect(screen.getByText('Inbound space scope')).toBeInTheDocument()
    expect(screen.getByLabelText('Viberglass space')).toBeInTheDocument()
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
              webhookUrl: '/api/webhooks/jira',
              events: ['issue_created'],
              planNewIssues: false,
              botUsername: null,
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
            webhookUrl: '/api/webhooks/jira',
            events: ['issue_created'],
            planNewIssues: false,
            botUsername: null,
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

  it('sets whether new issues get a plan and which account a comment mentions to ask the agent', async () => {
    const user = userEvent.setup()
    const onPlanNewIssuesChange = jest.fn()
    const onBotUsernameChange = jest.fn()
    const config = {
      id: 'inbound-1',
      integrationId: 'test-integration-id',
      webhookUrl: '/api/webhooks/jira',
      events: ['issue_created'],
      planNewIssues: false,
      botUsername: null,
      active: true,
      hasSecret: true,
      webhookSecret: 'secret',
      providerProjectId: null,
      projectId: null,
      inboundEvents: [],
      labelMappings: null,
      createdAt: '2026-02-10T00:00:00.000Z',
      updatedAt: '2026-02-10T00:00:00.000Z',
    }

    renderWithTheme(
      <JiraInboundWebhookSection
        {...createInboundProps({
          inboundWebhooks: [config],
          selectedInboundConfig: config,
          selectedInboundConfigId: 'inbound-1',
          onPlanNewIssuesChange,
          onBotUsernameChange,
        })}
      />
    )

    expect(screen.getByText(/Comments on the issue appear in the task's thread/)).toBeInTheDocument()
    await user.click(screen.getByLabelText(/Write the plan for new issues/))
    expect(onPlanNewIssuesChange).toHaveBeenCalledWith(true)
    await user.type(screen.getByLabelText('Bot account'), 'v')
    expect(onBotUsernameChange).toHaveBeenCalledWith('v')
    expect(screen.queryByText(/auto-execute/i)).not.toBeInTheDocument()
  })
})
