import { Theme } from '@radix-ui/themes'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactElement } from 'react'
import {
  deleteIntegrationOutboundWebhook,
  getIntegrationOutboundWebhooks,
  saveIntegrationOutboundWebhook,
  testIntegrationOutboundWebhook,
} from '@/service/api/integration-api'
import { CustomOutboundWebhookSection } from './CustomOutboundWebhookSection'

jest.mock('@/service/api/integration-api', () => ({
  deleteIntegrationOutboundWebhook: jest.fn(),
  getIntegrationOutboundWebhooks: jest.fn(),
  saveIntegrationOutboundWebhook: jest.fn(),
  testIntegrationOutboundWebhook: jest.fn(),
}))

const mockedGetIntegrationOutboundWebhooks = getIntegrationOutboundWebhooks as jest.MockedFunction<
  typeof getIntegrationOutboundWebhooks
>
const mockedSaveIntegrationOutboundWebhook = saveIntegrationOutboundWebhook as jest.MockedFunction<
  typeof saveIntegrationOutboundWebhook
>
const mockedDeleteIntegrationOutboundWebhook = deleteIntegrationOutboundWebhook as jest.MockedFunction<
  typeof deleteIntegrationOutboundWebhook
>
const mockedTestIntegrationOutboundWebhook = testIntegrationOutboundWebhook as jest.MockedFunction<
  typeof testIntegrationOutboundWebhook
>

function renderWithTheme(ui: ReactElement) {
  return render(<Theme>{ui}</Theme>)
}

const CUSTOM_TARGET = {
  id: 'cfg-out-1',
  provider: 'custom',
  events: ['job_started', 'job_ended'],
  active: true,
  hasApiToken: false,
  providerProjectId: null,
  name: 'Primary sink',
  targetUrl: 'https://hooks.example.com/primary',
  method: 'POST' as const,
  headers: {
    'x-env': 'dev',
  },
  auth: {
    type: 'bearer' as const,
    hasToken: true,
  },
  hasSigningSecret: true,
  signatureAlgorithm: 'sha256' as const,
  retryPolicy: {
    maxAttempts: 2,
    backoffMs: 500,
    maxBackoffMs: 3000,
  },
  createdAt: '2026-02-10T00:00:00.000Z',
  updatedAt: '2026-02-10T00:00:00.000Z',
}

describe('CustomOutboundWebhookSection', () => {
  beforeEach(() => {
    jest.resetAllMocks()
  })

  it('validates required fields before save', async () => {
    const user = userEvent.setup()
    mockedGetIntegrationOutboundWebhooks.mockResolvedValue([])

    renderWithTheme(<CustomOutboundWebhookSection integrationEntityId="int-custom" />)

    await waitFor(() => {
      expect(mockedGetIntegrationOutboundWebhooks).toHaveBeenCalledWith('int-custom')
    })

    await user.click(screen.getByRole('button', { name: 'Create destination' }))

    expect(screen.getByText('Destination name is required')).toBeInTheDocument()
    expect(screen.getByText('Destination URL is required')).toBeInTheDocument()
    expect(mockedSaveIntegrationOutboundWebhook).not.toHaveBeenCalled()
  })

  it('creates a destination with valid input', async () => {
    const user = userEvent.setup()
    mockedGetIntegrationOutboundWebhooks.mockResolvedValue([])
    mockedSaveIntegrationOutboundWebhook.mockResolvedValue({
      ...CUSTOM_TARGET,
      id: 'cfg-out-created',
      name: 'Audit sink',
      targetUrl: 'https://hooks.example.com/audit',
    })

    renderWithTheme(<CustomOutboundWebhookSection integrationEntityId="int-custom" />)

    await waitFor(() => {
      expect(mockedGetIntegrationOutboundWebhooks).toHaveBeenCalledWith('int-custom')
    })

    await user.type(screen.getByLabelText('Destination name'), 'Audit sink')
    await user.type(screen.getByLabelText('Destination URL'), 'https://hooks.example.com/audit')
    await user.click(screen.getByRole('button', { name: 'Create destination' }))

    await waitFor(() => {
      expect(mockedSaveIntegrationOutboundWebhook).toHaveBeenCalledWith(
        'int-custom',
        expect.objectContaining({
          name: 'Audit sink',
          targetUrl: 'https://hooks.example.com/audit',
          method: 'POST',
          events: ['job_started', 'job_ended'],
        }),
        undefined
      )
    })

    expect(screen.getByText('Audit sink')).toBeInTheDocument()
  })

  it('deletes an existing destination', async () => {
    const user = userEvent.setup()
    mockedGetIntegrationOutboundWebhooks.mockResolvedValue([CUSTOM_TARGET])
    mockedDeleteIntegrationOutboundWebhook.mockResolvedValue()
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true)

    renderWithTheme(<CustomOutboundWebhookSection integrationEntityId="int-custom" />)

    await waitFor(() => {
      expect(screen.getByText('Primary sink')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: 'Delete destination' }))

    await waitFor(() => {
      expect(mockedDeleteIntegrationOutboundWebhook).toHaveBeenCalledWith('int-custom', 'cfg-out-1')
    })

    expect(screen.getByText('No destinations configured yet.')).toBeInTheDocument()
    confirmSpy.mockRestore()
  })

  it('runs test send for selected destination and shows summary', async () => {
    const user = userEvent.setup()
    mockedGetIntegrationOutboundWebhooks.mockResolvedValue([CUSTOM_TARGET])
    mockedTestIntegrationOutboundWebhook.mockResolvedValue({
      success: true,
      message: 'Delivered to destination',
      statusCode: 200,
    })

    renderWithTheme(<CustomOutboundWebhookSection integrationEntityId="int-custom" />)

    await waitFor(() => {
      expect(screen.getByText('Primary sink')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: 'Test send' }))

    await waitFor(() => {
      expect(mockedTestIntegrationOutboundWebhook).toHaveBeenCalledWith(
        'int-custom',
        'cfg-out-1',
        'job_ended'
      )
    })

    expect(screen.getByText('Last test send')).toBeInTheDocument()
    expect(screen.getByText('Delivered to destination')).toBeInTheDocument()
  })
})
