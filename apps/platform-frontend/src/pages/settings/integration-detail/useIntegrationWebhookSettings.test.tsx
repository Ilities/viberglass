import { act, renderHook, waitFor } from '@testing-library/react'
import {
  deleteIntegrationInboundWebhook,
  getIntegrationInboundWebhooks,
  updateIntegrationInboundWebhook,
  type IntegrationInboundWebhookConfig,
} from '@/service/api/integration-api'
import { useIntegrationWebhookSettings } from './useIntegrationWebhookSettings'

jest.mock('@/service/api/integration-api', () => ({
  getIntegrationInboundWebhooks: jest.fn(),
  getIntegrationDeliveries: jest.fn(() => Promise.resolve([])),
  createIntegrationInboundWebhook: jest.fn(),
  updateIntegrationInboundWebhook: jest.fn(),
  deleteIntegrationInboundWebhook: jest.fn(),
  retryIntegrationDelivery: jest.fn(),
}))

const CONFIG: IntegrationInboundWebhookConfig = {
  id: 'hook-1',
  integrationId: 'conn-1',
  provider: 'jira',
  webhookUrl: 'http://localhost:8888/api/webhooks/jira/hook-1',
  webhookSecret: 'secret-1',
  hasSecret: true,
  projectId: null,
  active: true,
  planNewIssues: false,
  botUsername: null,
  inboundEvents: ['issue_created'],
  events: ['issue_created'],
  createdAt: '2026-09-30T10:00:00.000Z',
  updatedAt: '2026-09-30T10:00:00.000Z',
}

function renderSettings() {
  return renderHook(() => useIntegrationWebhookSettings({ integrationEntityId: 'conn-1' }))
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(getIntegrationInboundWebhooks).mockResolvedValue([CONFIG])
  jest.mocked(updateIntegrationInboundWebhook).mockResolvedValue(CONFIG)
  jest.mocked(deleteIntegrationInboundWebhook).mockResolvedValue(undefined as unknown as void)
})

describe('useIntegrationWebhookSettings', () => {
  it('asks before regenerating the secret, because the old one stops working', async () => {
    const { result } = renderSettings()
    await waitFor(() => expect(result.current.selectedInboundConfig).toBe(CONFIG))

    act(() => result.current.requestGenerateSecret())
    expect(result.current.isRegenerateDialogOpen).toBe(true)
    expect(updateIntegrationInboundWebhook).not.toHaveBeenCalled()

    act(() => result.current.cancelGenerateSecret())
    expect(result.current.isRegenerateDialogOpen).toBe(false)
    expect(updateIntegrationInboundWebhook).not.toHaveBeenCalled()
  })

  it('regenerates the secret once confirmed', async () => {
    const { result } = renderSettings()
    await waitFor(() => expect(result.current.selectedInboundConfig).toBe(CONFIG))

    act(() => result.current.requestGenerateSecret())
    await act(async () => {
      await result.current.confirmGenerateSecret()
    })

    expect(updateIntegrationInboundWebhook).toHaveBeenCalledWith('conn-1', 'hook-1', expect.objectContaining({ generateSecret: true }))
    expect(result.current.isRegenerateDialogOpen).toBe(false)
  })

  it('asks before removing the webhook', async () => {
    const { result } = renderSettings()
    await waitFor(() => expect(result.current.selectedInboundConfig).toBe(CONFIG))

    act(() => result.current.requestDeleteInboundWebhook())
    expect(result.current.isDeleteDialogOpen).toBe(true)
    expect(deleteIntegrationInboundWebhook).not.toHaveBeenCalled()

    await act(async () => {
      await result.current.handleDeleteInboundWebhook()
    })

    expect(deleteIntegrationInboundWebhook).toHaveBeenCalledWith('conn-1', 'hook-1')
    expect(result.current.isDeleteDialogOpen).toBe(false)
  })
})
