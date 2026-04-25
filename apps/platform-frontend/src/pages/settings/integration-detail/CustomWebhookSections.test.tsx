import { Theme } from '@radix-ui/themes'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentProps, ReactElement } from 'react'
import { CustomInboundWebhookSection } from './CustomInboundWebhookSection'

function renderWithTheme(ui: ReactElement) {
  return render(<Theme>{ui}</Theme>)
}

function createInboundProps(
  overrides: Partial<ComponentProps<typeof CustomInboundWebhookSection>> = {}
): ComponentProps<typeof CustomInboundWebhookSection> {
  return {
    autoExecute: false,
    deliveries: [],
    hasInboundChanges: false,
    inboundActive: true,
    inboundWebhooks: [],
    isLoadingDeliveries: false,
    isLoadingWebhook: false,
    isSavingWebhook: false,
    projects: null,
    selectedInboundConfig: null,
    selectedInboundConfigId: null,
    selectedProjectId: null,
    showSecret: false,
    onAutoExecuteChange: jest.fn(),
    onCopyWebhookSecret: jest.fn(),
    onCopyWebhookUrl: jest.fn(),
    onCreateInboundWebhook: jest.fn(),
    onDeleteInboundWebhook: jest.fn(),
    onGenerateSecret: jest.fn(),
    onInboundActiveChange: jest.fn(),
    onProjectChange: jest.fn(),
    onRefreshDeliveries: jest.fn(),
    onRetryDelivery: jest.fn(),
    onSaveWebhook: jest.fn(),
    onSelectInboundWebhook: jest.fn(),
    onToggleSecretVisibility: jest.fn(),
    ...overrides,
  }
}

describe('Custom webhook sections', () => {
  it('renders setup guidance and create action when no inbound configs exist', () => {
    renderWithTheme(<CustomInboundWebhookSection {...createInboundProps()} />)

    expect(screen.getByRole('heading', { name: 'Custom Inbound Webhooks' })).toBeInTheDocument()
    expect(screen.getByText('Custom setup steps')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Create custom inbound endpoint' })).toBeInTheDocument()
  })

  it('renders list/detail state and allows selecting a different endpoint', async () => {
    const user = userEvent.setup()
    const onSelectInboundWebhook = jest.fn()

    renderWithTheme(
      <CustomInboundWebhookSection
        {...createInboundProps({
          inboundWebhooks: [
            {
              id: 'cfg-custom-1',
              integrationId: 'test-integration-id',
              provider: 'custom',
              webhookUrl: '/api/webhooks/custom/cfg-custom-1',
              events: ['ticket_created'],
              autoExecute: false,
              active: true,
              hasSecret: true,
              webhookSecret: 'secret-1',
              providerProjectId: null,
              projectId: null,
              inboundEvents: [],
              labelMappings: null,
              createdAt: '2026-02-10T00:00:00.000Z',
              updatedAt: '2026-02-10T00:00:00.000Z',
            },
            {
              id: 'cfg-custom-2',
              integrationId: 'test-integration-id',
              provider: 'custom',
              webhookUrl: '/api/webhooks/custom/cfg-custom-2',
              events: ['ticket_created'],
              autoExecute: false,
              active: false,
              hasSecret: true,
              webhookSecret: 'secret-2',
              providerProjectId: null,
              projectId: null,
              inboundEvents: [],
              labelMappings: null,
              createdAt: '2026-02-10T00:00:00.000Z',
              updatedAt: '2026-02-10T00:00:00.000Z',
            },
          ],
          selectedInboundConfigId: 'cfg-custom-1',
          selectedInboundConfig: {
            id: 'cfg-custom-1',
            integrationId: 'test-integration-id',
            provider: 'custom',
            webhookUrl: '/api/webhooks/custom/cfg-custom-1',
            events: ['ticket_created'],
            autoExecute: false,
            active: true,
            hasSecret: true,
            webhookSecret: 'secret-1',
            providerProjectId: null,
            projectId: null,
            inboundEvents: [],
            labelMappings: null,
            createdAt: '2026-02-10T00:00:00.000Z',
            updatedAt: '2026-02-10T00:00:00.000Z',
          },
          onSelectInboundWebhook,
        })}
      />
    )

    expect(screen.getByText('Expected payload format')).toBeInTheDocument()
    expect(screen.getByText('X-Webhook-Signature-256: sha256=<hmac_hex>')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Endpoint 2/i }))
    expect(onSelectInboundWebhook).toHaveBeenCalledWith('cfg-custom-2')
  })

  it('supports active toggle and delivery refresh/retry actions', async () => {
    const user = userEvent.setup()
    const onInboundActiveChange = jest.fn()
    const onRefreshDeliveries = jest.fn()
    const onRetryDelivery = jest.fn()

    renderWithTheme(
      <CustomInboundWebhookSection
        {...createInboundProps({
          deliveries: [
            {
              id: 'delivery-1',
              provider: 'custom',
              webhookConfigId: 'cfg-custom-1',
              deliveryId: 'custom-delivery-1',
              eventType: 'ticket_created',
              status: 'failed',
              retryable: true,
              errorMessage: 'Signature mismatch',
              ticketId: null,
              projectId: null,
              createdAt: '2026-02-10T00:00:00.000Z',
              processedAt: '2026-02-10T00:00:01.000Z',
            },
          ],
          inboundWebhooks: [
            {
              id: 'cfg-custom-1',
              integrationId: 'test-integration-id',
              provider: 'custom',
              webhookUrl: '/api/webhooks/custom/cfg-custom-1',
              events: ['ticket_created'],
              autoExecute: false,
              active: true,
              hasSecret: true,
              webhookSecret: 'secret-1',
              providerProjectId: null,
              projectId: null,
              inboundEvents: [],
              labelMappings: null,
              createdAt: '2026-02-10T00:00:00.000Z',
              updatedAt: '2026-02-10T00:00:00.000Z',
            },
          ],
          selectedInboundConfigId: 'cfg-custom-1',
          selectedInboundConfig: {
            id: 'cfg-custom-1',
            integrationId: 'test-integration-id',
            provider: 'custom',
            webhookUrl: '/api/webhooks/custom/cfg-custom-1',
            events: ['ticket_created'],
            autoExecute: false,
            active: true,
            hasSecret: true,
            webhookSecret: 'secret-1',
            providerProjectId: null,
            projectId: null,
            inboundEvents: [],
            labelMappings: null,
            createdAt: '2026-02-10T00:00:00.000Z',
            updatedAt: '2026-02-10T00:00:00.000Z',
          },
          onInboundActiveChange,
          onRefreshDeliveries,
          onRetryDelivery,
        })}
      />
    )

    await user.click(screen.getByRole('checkbox', { name: 'Enable this inbound endpoint' }))
    expect(onInboundActiveChange).toHaveBeenCalledWith(false)

    await user.click(screen.getByRole('button', { name: 'Refresh' }))
    expect(onRefreshDeliveries).toHaveBeenCalledTimes(1)

    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(onRetryDelivery).toHaveBeenCalledWith('delivery-1')
  })
})
