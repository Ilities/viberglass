import { Theme } from '@radix-ui/themes'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentProps, ReactElement } from 'react'
import { ShortcutInboundWebhookSection } from './ShortcutInboundWebhookSection'
import { ShortcutOutboundWebhookSection } from './ShortcutOutboundWebhookSection'

function renderWithTheme(ui: ReactElement) {
  return render(<Theme>{ui}</Theme>)
}

function createInboundProps(
  overrides: Partial<ComponentProps<typeof ShortcutInboundWebhookSection>> = {}
): ComponentProps<typeof ShortcutInboundWebhookSection> {
  return {
    autoExecute: false,
    deliveries: [],
    hasInboundChanges: false,
    inboundEvents: ['story_created'],
    inboundWebhooks: [],
    isLoadingDeliveries: false,
    isLoadingWebhook: false,
    isSavingWebhook: false,
    selectedInboundConfig: null,
    selectedInboundConfigId: null,
    shortcutProjectId: '22',
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
  overrides: Partial<ComponentProps<typeof ShortcutOutboundWebhookSection>> = {}
): ComponentProps<typeof ShortcutOutboundWebhookSection> {
  return {
    emitJobEnded: true,
    emitJobStarted: true,
    hasOutboundChanges: true,
    isSavingWebhook: false,
    outboundApiToken: '',
    outboundWebhook: {
      id: 'outbound-1',
      provider: 'shortcut',
      events: ['job_started', 'job_ended'],
      active: true,
      hasApiToken: true,
      providerProjectId: '22',
      createdAt: '2026-02-10T00:00:00.000Z',
      updatedAt: '2026-02-10T00:00:00.000Z',
    },
    projectMapping: '22',
    onDeleteOutboundWebhook: jest.fn(),
    onEmitJobEndedChange: jest.fn(),
    onEmitJobStartedChange: jest.fn(),
    onOutboundApiTokenChange: jest.fn(),
    onSaveOutboundWebhook: jest.fn(),
    ...overrides,
  }
}

describe('Shortcut webhook sections', () => {
  it('renders inbound Shortcut setup and project hint when project id is missing', () => {
    renderWithTheme(
      <ShortcutInboundWebhookSection
        {...createInboundProps({
          shortcutProjectId: null,
        })}
      />
    )

    expect(screen.getByRole('heading', { name: 'Shortcut Inbound Webhook' })).toBeInTheDocument()
    expect(screen.getByText('Shortcut setup steps')).toBeInTheDocument()
    expect(screen.getByText('No project filter configured')).toBeInTheDocument()
    expect(screen.getByText(/Save a Shortcut Project ID/i)).toBeInTheDocument()
  })

  it('toggles Shortcut inbound comment event option', async () => {
    const user = userEvent.setup()
    const onToggleInboundEvent = jest.fn()

    renderWithTheme(
      <ShortcutInboundWebhookSection
        {...createInboundProps({
          inboundWebhooks: [
            {
              id: 'inbound-1',
              provider: 'shortcut',
              webhookUrl: '/api/webhooks/shortcut',
              events: ['story_created'],
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
            provider: 'shortcut',
            webhookUrl: '/api/webhooks/shortcut',
            events: ['story_created'],
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

  it('supports delivery refresh and retry actions', async () => {
    const user = userEvent.setup()
    const onRefreshDeliveries = jest.fn()
    const onRetryDelivery = jest.fn()

    renderWithTheme(
      <ShortcutInboundWebhookSection
        {...createInboundProps({
          deliveries: [
            {
              id: 'delivery-1',
              provider: 'shortcut',
              webhookConfigId: 'inbound-1',
              deliveryId: 'shortcut-delivery-1',
              eventType: 'story_created',
              status: 'failed',
              retryable: true,
              errorMessage: 'Signature mismatch',
              ticketId: null,
              createdAt: '2026-02-10T00:00:00.000Z',
              processedAt: '2026-02-10T00:00:01.000Z',
            },
          ],
          onRefreshDeliveries,
          onRetryDelivery,
        })}
      />
    )

    await user.click(screen.getByRole('button', { name: 'Refresh' }))
    expect(onRefreshDeliveries).toHaveBeenCalledTimes(1)

    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(onRetryDelivery).toHaveBeenCalledWith('delivery-1')
  })

  it('allows outbound save when token controls are available', async () => {
    const user = userEvent.setup()
    const onSaveOutboundWebhook = jest.fn()

    renderWithTheme(
      <ShortcutOutboundWebhookSection
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
