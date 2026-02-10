import express from 'express'
import request from 'supertest'

const mockIntegrationDAO = {
  getIntegration: jest.fn(),
}
const mockProjectLinkDAO = {
  getIntegrationProjects: jest.fn(),
}
const mockWebhookConfigDAO = {
  listByIntegrationId: jest.fn(),
  getByIntegrationAndConfigId: jest.fn(),
  createConfig: jest.fn(),
  updateConfig: jest.fn(),
  getConfigById: jest.fn(),
  deleteConfig: jest.fn(),
}
const mockWebhookDeliveryDAO = {
  listDeliveriesByConfig: jest.fn(),
  getDeliveryByIdForConfig: jest.fn(),
  updateDeliveryStatus: jest.fn(),
}

jest.mock('../../../../api/middleware/authentication', () => ({
  requireAuth: (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
}))

jest.mock('../../../../persistence/integrations', () => ({
  IntegrationDAO: jest.fn(() => mockIntegrationDAO),
  ProjectIntegrationLinkDAO: jest.fn(() => mockProjectLinkDAO),
}))

jest.mock('../../../../persistence/webhook/WebhookConfigDAO', () => ({
  WebhookConfigDAO: jest.fn(() => mockWebhookConfigDAO),
}))

jest.mock('../../../../persistence/webhook/WebhookDeliveryDAO', () => ({
  WebhookDeliveryDAO: jest.fn(() => mockWebhookDeliveryDAO),
}))

import integrationsRouter from '../../../../api/routes/integrations'

describe('integration webhook routes (instance/config-scoped)', () => {
  let app: express.Express

  beforeEach(() => {
    jest.clearAllMocks()
    mockIntegrationDAO.getIntegration.mockReset()
    mockProjectLinkDAO.getIntegrationProjects.mockReset()
    mockWebhookConfigDAO.listByIntegrationId.mockReset()
    mockWebhookConfigDAO.getByIntegrationAndConfigId.mockReset()
    mockWebhookConfigDAO.createConfig.mockReset()
    mockWebhookConfigDAO.updateConfig.mockReset()
    mockWebhookConfigDAO.getConfigById.mockReset()
    mockWebhookConfigDAO.deleteConfig.mockReset()
    mockWebhookDeliveryDAO.listDeliveriesByConfig.mockReset()
    mockWebhookDeliveryDAO.getDeliveryByIdForConfig.mockReset()
    mockWebhookDeliveryDAO.updateDeliveryStatus.mockReset()

    app = express()
    app.use(express.json())
    app.use('/api/integrations', integrationsRouter)
  })

  it('lists deliveries scoped to an explicit inbound webhook config id', async () => {
    mockIntegrationDAO.getIntegration.mockResolvedValue({
      id: 'int-1',
      system: 'github',
    })
    mockWebhookConfigDAO.getByIntegrationAndConfigId.mockResolvedValue({
      id: 'cfg-1',
      direction: 'inbound',
    })
    mockWebhookDeliveryDAO.listDeliveriesByConfig.mockResolvedValue([
      {
        id: 'delivery-row-1',
        provider: 'github',
        webhookConfigId: 'cfg-1',
        deliveryId: 'delivery-1',
        eventType: 'issues',
        status: 'failed',
        errorMessage: 'Signature failed',
        ticketId: null,
        createdAt: new Date('2026-02-09T10:00:00.000Z'),
        processedAt: null,
      },
    ])

    const response = await request(app)
      .get('/api/integrations/int-1/webhooks/inbound/cfg-1/deliveries?limit=10&offset=2')
      .expect(200)

    expect(mockWebhookDeliveryDAO.listDeliveriesByConfig).toHaveBeenCalledWith('cfg-1', {
      limit: 10,
      offset: 2,
      sortOrder: 'desc',
    })
    expect(response.body.pagination).toEqual({ limit: 10, offset: 2, count: 1 })
    expect(response.body.data).toEqual([
      expect.objectContaining({
        id: 'delivery-row-1',
        webhookConfigId: 'cfg-1',
        deliveryId: 'delivery-1',
        eventType: 'issues',
      }),
    ])
  })

  it('retries delivery only within the targeted webhook config', async () => {
    mockIntegrationDAO.getIntegration.mockResolvedValue({
      id: 'int-1',
      system: 'github',
    })
    mockWebhookConfigDAO.getByIntegrationAndConfigId.mockResolvedValue({
      id: 'cfg-1',
      direction: 'inbound',
    })
    mockWebhookDeliveryDAO.getDeliveryByIdForConfig.mockResolvedValue({
      id: 'delivery-row-1',
      status: 'failed',
    })
    mockWebhookDeliveryDAO.updateDeliveryStatus.mockResolvedValue(undefined)

    const response = await request(app)
      .post('/api/integrations/int-1/webhooks/inbound/cfg-1/deliveries/delivery-row-1/retry')
      .expect(200)

    expect(mockWebhookDeliveryDAO.getDeliveryByIdForConfig).toHaveBeenCalledWith(
      'delivery-row-1',
      'cfg-1',
    )
    expect(mockWebhookDeliveryDAO.updateDeliveryStatus).toHaveBeenCalledWith(
      'delivery-row-1',
      'failed',
      'Marked for retry - please check provider webhook settings',
    )
    expect(response.body).toEqual(
      expect.objectContaining({
        success: true,
        message: 'Delivery retry initiated',
      }),
    )
  })

  it('rejects retry for successful delivery in targeted config', async () => {
    mockIntegrationDAO.getIntegration.mockResolvedValue({
      id: 'int-1',
      system: 'github',
    })
    mockWebhookConfigDAO.getByIntegrationAndConfigId.mockResolvedValue({
      id: 'cfg-1',
      direction: 'inbound',
    })
    mockWebhookDeliveryDAO.getDeliveryByIdForConfig.mockResolvedValue({
      id: 'delivery-row-1',
      status: 'succeeded',
    })

    const response = await request(app)
      .post('/api/integrations/int-1/webhooks/inbound/cfg-1/deliveries/delivery-row-1/retry')
      .expect(409)

    expect(response.body).toEqual({ error: 'Successful deliveries cannot be retried' })
    expect(mockWebhookDeliveryDAO.updateDeliveryStatus).not.toHaveBeenCalled()
  })

  it('lists outbound configs independently for multiple same-provider integration instances', async () => {
    mockIntegrationDAO.getIntegration.mockImplementation(async (integrationId: string) => {
      if (integrationId === 'int-1') {
        return { id: 'int-1', system: 'github', values: { owner: 'acme', repo: 'one' } }
      }
      if (integrationId === 'int-2') {
        return { id: 'int-2', system: 'github', values: { owner: 'acme', repo: 'two' } }
      }
      return null
    })
    mockWebhookConfigDAO.listByIntegrationId.mockImplementation(async (integrationId: string) => {
      if (integrationId === 'int-1') {
        return [
          {
            id: 'outbound-1',
            provider: 'github',
            allowedEvents: ['job_started'],
            active: true,
            apiTokenEncrypted: 'token-1',
            providerProjectId: 'acme/one',
            createdAt: new Date('2026-02-09T10:00:00.000Z'),
            updatedAt: new Date('2026-02-09T10:01:00.000Z'),
          },
        ]
      }

      return [
        {
          id: 'outbound-2',
          provider: 'github',
          allowedEvents: ['job_ended'],
          active: true,
          apiTokenEncrypted: 'token-2',
          providerProjectId: 'acme/two',
          createdAt: new Date('2026-02-09T10:00:00.000Z'),
          updatedAt: new Date('2026-02-09T10:01:00.000Z'),
        },
      ]
    })

    const first = await request(app).get('/api/integrations/int-1/webhooks/outbound').expect(200)
    const second = await request(app).get('/api/integrations/int-2/webhooks/outbound').expect(200)

    expect(first.body.data).toEqual([expect.objectContaining({ id: 'outbound-1' })])
    expect(second.body.data).toEqual([expect.objectContaining({ id: 'outbound-2' })])
  })

  it('enforces deterministic single outbound config creation per integration/provider', async () => {
    mockIntegrationDAO.getIntegration.mockResolvedValue({
      id: 'int-1',
      system: 'github',
      values: { owner: 'acme', repo: 'one' },
    })
    mockWebhookConfigDAO.listByIntegrationId.mockResolvedValue([
      {
        id: 'outbound-1',
        provider: 'github',
      },
    ])

    const response = await request(app)
      .post('/api/integrations/int-1/webhooks/outbound')
      .send({ events: ['job_started'] })
      .expect(409)

    expect(response.body).toEqual({
      error: 'Outbound webhook configuration already exists for this integration/provider',
    })
    expect(mockWebhookConfigDAO.createConfig).not.toHaveBeenCalled()
  })

  it('does not expose removed legacy compatibility delivery and outbound routes', async () => {
    await request(app).get('/api/integrations/int-1/deliveries').expect(404)
    await request(app).post('/api/integrations/int-1/deliveries/delivery-row-1/retry').expect(404)
    await request(app).put('/api/integrations/int-1/webhooks/outbound').expect(404)
    await request(app).delete('/api/integrations/int-1/webhooks/outbound').expect(404)
  })
})
