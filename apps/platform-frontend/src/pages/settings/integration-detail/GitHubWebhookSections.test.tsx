import { Theme } from '@radix-ui/themes'
import { fireEvent, render, screen } from '@testing-library/react'
import type { ComponentProps, ReactElement } from 'react'
import { GitHubInboundWebhookSection } from './GitHubInboundWebhookSection'
import { GitHubOutboundWebhookSection } from './GitHubOutboundWebhookSection'

function renderWithTheme(ui: ReactElement) {
  return render(<Theme>{ui}</Theme>)
}

function createInboundProps(
  overrides: Partial<ComponentProps<typeof GitHubInboundWebhookSection>> = {}
): ComponentProps<typeof GitHubInboundWebhookSection> {
  return {
    autoExecute: true,
    deliveries: [],
    githubAutoExecuteMode: 'matching_events',
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
    onAutoExecuteChange: jest.fn(),
    onGitHubAutoExecuteModeChange: jest.fn(),
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

function createOutboundProps(
  overrides: Partial<ComponentProps<typeof GitHubOutboundWebhookSection>> = {}
): ComponentProps<typeof GitHubOutboundWebhookSection> {
  return {
    isSavingWebhook: false,
    outboundApiToken: '',
    outboundWebhook: {
      id: 'outbound-1',
      provider: 'github',
      events: ['job_started', 'job_ended'],
      active: true,
      hasApiToken: true,
      providerProjectId: 'acme/repo',
      createdAt: '2026-02-10T00:00:00.000Z',
      updatedAt: '2026-02-10T00:00:00.000Z',
    },
    repositoryMapping: 'acme/repo',
    onOutboundApiTokenChange: jest.fn(),
    onSaveOutboundWebhook: jest.fn(),
    ...overrides,
  }
}

describe('GitHub webhook sections', () => {
  it('renders inbound routing and label-gated auto-execute controls', () => {
    renderWithTheme(
      <GitHubInboundWebhookSection
        {...createInboundProps({
          githubAutoExecuteMode: 'label_gated',
          githubRequiredLabels: ['autofix'],
          inboundWebhooks: [
            {
              id: 'inbound-1',
              integrationId: 'test-integration-id',
              provider: 'github',
              webhookUrl: '/api/webhooks/github',
              events: ['issues.opened'],
              autoExecute: true,
              active: true,
              hasSecret: true,
              webhookSecret: 'secret',
              providerProjectId: 'acme/repo',
              projectId: 'project-1',
              inboundEvents: [],
              labelMappings: {
                github: {
                  autoExecuteMode: 'label_gated',
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
            provider: 'github',
            webhookUrl: '/api/webhooks/github',
            events: ['issues.opened'],
            autoExecute: true,
            active: true,
            hasSecret: true,
            webhookSecret: 'secret',
            providerProjectId: 'acme/repo',
            projectId: 'project-1',
            inboundEvents: [],
            labelMappings: {
              github: {
                autoExecuteMode: 'label_gated',
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
    expect(screen.getByLabelText('Viberglass project')).toBeInTheDocument()
    expect(screen.getByLabelText('GitHub repository (`owner/repo`)')).toBeInTheDocument()
    expect(screen.getByLabelText('Auto-execute policy')).toBeInTheDocument()
    expect(screen.getByLabelText('Required issue labels')).toBeInTheDocument()
  })

  it('parses required labels for label-gated auto-execute', async () => {
    const onGitHubRequiredLabelsChange = jest.fn()

    renderWithTheme(
      <GitHubInboundWebhookSection
        {...createInboundProps({
          githubAutoExecuteMode: 'label_gated',
          inboundWebhooks: [
            {
              id: 'inbound-1',
              integrationId: 'test-integration-id',
              provider: 'github',
              webhookUrl: '/api/webhooks/github',
              events: ['issues.opened'],
              autoExecute: true,
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
            provider: 'github',
            webhookUrl: '/api/webhooks/github',
            events: ['issues.opened'],
            autoExecute: true,
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

    const requiredLabelsInput = screen.getByLabelText('Required issue labels')
    fireEvent.change(requiredLabelsInput, { target: { value: 'autofix, AI-FIX' } })

    expect(onGitHubRequiredLabelsChange).toHaveBeenLastCalledWith(['autofix', 'ai-fix'])
  })

  it('renders always-on outbound feedback copy without delete controls', () => {
    renderWithTheme(<GitHubOutboundWebhookSection {...createOutboundProps()} />)

    expect(screen.getByRole('heading', { name: 'GitHub Feedback' })).toBeInTheDocument()
    expect(screen.getByText('Always-on feedback events')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save feedback settings' })).toBeEnabled()
    expect(screen.queryByRole('button', { name: /remove outbound webhook/i })).toBeNull()
  })

  it('requires a token to enable outbound feedback when config does not exist', () => {
    renderWithTheme(
      <GitHubOutboundWebhookSection
        {...createOutboundProps({
          outboundWebhook: null,
          outboundApiToken: '',
        })}
      />
    )

    expect(screen.getByRole('button', { name: 'Enable feedback' })).toBeDisabled()
  })
})
