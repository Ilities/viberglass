import { Theme } from '@radix-ui/themes'
import { fireEvent, render, screen } from '@testing-library/react'
import type { ComponentProps, ReactElement } from 'react'
import { GitHubInboundWebhookSection } from '@viberglass/integration-github/frontend'

function renderWithTheme(ui: ReactElement) {
  return render(<Theme>{ui}</Theme>)
}

function createInboundProps(
  overrides: Partial<ComponentProps<typeof GitHubInboundWebhookSection>> = {}
): ComponentProps<typeof GitHubInboundWebhookSection> {
  return {
    planNewIssues: true,
    botUsername: '',
    deliveries: [],
    githubPlanNewIssuesMode: 'matching_events',
    githubRequiredLabels: [],
    hasInboundChanges: false,
    inboundEvents: ['issues.opened'],
    inboundWebhooks: [],
    isLoadingDeliveries: false,
    isLoadingWebhook: false,
    isSavingWebhook: false,
    projects: [
      { id: 'project-1', name: 'Viberglass' },
      { id: 'project-2', name: 'Waxcarvers' },
    ],
    selectedInboundConfig: null,
    selectedInboundConfigId: null,
    selectedInboundProjectId: null,
    selectedInboundProviderProjectId: 'acme/repo',
    showSecret: false,
    onPlanNewIssuesChange: jest.fn(),
    onBotUsernameChange: jest.fn(),
    onGitHubPlanNewIssuesModeChange: jest.fn(),
    onGitHubRequiredLabelsChange: jest.fn(),
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

describe('GitHub webhook sections', () => {
  it('renders inbound routing, the plan setting limited to labelled issues, and the bot account', () => {
    renderWithTheme(
      <GitHubInboundWebhookSection
        {...createInboundProps({
          planNewIssues: true,
          githubPlanNewIssuesMode: 'label_gated',
          githubRequiredLabels: ['autofix'],
          inboundWebhooks: [
            {
              id: 'inbound-1',
              integrationId: 'test-integration-id',
              webhookUrl: '/api/webhooks/github',
              events: ['issues.opened'],
              planNewIssues: true,
              botUsername: null,
              active: true,
              hasSecret: true,
              webhookSecret: 'secret',
              providerProjectId: 'acme/repo',
              projectId: 'project-1',
              inboundEvents: [],
              labelMappings: {
                github: {
                  planNewIssuesMode: 'label_gated',
                  requiredLabels: ['autofix'],
                },
              },
              createdAt: '2026-02-10T00:00:00.000Z',
              updatedAt: '2026-02-10T00:00:00.000Z',
            },
          ],
          selectedInboundConfig: {
            id: 'inbound-1',
            integrationId: 'test-integration-id',
            webhookUrl: '/api/webhooks/github',
            events: ['issues.opened'],
            planNewIssues: true,
            botUsername: null,
            active: true,
            hasSecret: true,
            webhookSecret: 'secret',
            providerProjectId: 'acme/repo',
            projectId: 'project-1',
            inboundEvents: [],
            labelMappings: {
              github: {
                planNewIssuesMode: 'label_gated',
                requiredLabels: ['autofix'],
              },
            },
            createdAt: '2026-02-10T00:00:00.000Z',
            updatedAt: '2026-02-10T00:00:00.000Z',
          },
          selectedInboundConfigId: 'inbound-1',
        })}
      />
    )

    expect(screen.getByRole('heading', { name: 'GitHub Inbound Webhook' })).toBeInTheDocument()
    expect(screen.getByText('Inbound routing scope')).toBeInTheDocument()
    expect(screen.getByLabelText('Viberglass space')).toBeInTheDocument()
    expect(screen.getByLabelText('GitHub repository (`owner/repo`)')).toBeInTheDocument()
    expect(screen.getByLabelText(/Write the plan for new issues/)).toBeChecked()
    expect(screen.getByLabelText('Which new issues')).toHaveValue('label_gated')
    expect(screen.getByLabelText('Labels')).toBeInTheDocument()
    expect(screen.getByLabelText('Bot account')).toBeInTheDocument()
    expect(screen.queryByText(/auto-execute/i)).not.toBeInTheDocument()
  })

  it('parses the labels that limit which new issues get a plan', async () => {
    const onGitHubRequiredLabelsChange = jest.fn()

    renderWithTheme(
      <GitHubInboundWebhookSection
        {...createInboundProps({
          planNewIssues: true,
          githubPlanNewIssuesMode: 'label_gated',
          inboundWebhooks: [
            {
              id: 'inbound-1',
              integrationId: 'test-integration-id',
              webhookUrl: '/api/webhooks/github',
              events: ['issues.opened'],
              planNewIssues: true,
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
            webhookUrl: '/api/webhooks/github',
            events: ['issues.opened'],
            planNewIssues: true,
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
          onGitHubRequiredLabelsChange,
        })}
      />
    )

    const labelsInput = screen.getByLabelText('Labels')
    fireEvent.change(labelsInput, { target: { value: 'viberglass, Needs-Plan' } })

    expect(onGitHubRequiredLabelsChange).toHaveBeenLastCalledWith(['viberglass', 'needs-plan'])
  })
})
