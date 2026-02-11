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

  it('lists multiple custom inbound webhook configs for the same integration', async () => {
    mockIntegrationDAO.getIntegration.mockResolvedValue({
      id: 'int-custom',
      system: 'custom',
      values: {},
    })
    mockWebhookConfigDAO.listByIntegrationId.mockResolvedValue([
      {
        id: 'cfg-custom-2',
        provider: 'custom',
        allowedEvents: ['ticket_created'],
        autoExecute: true,
        active: false,
        webhookSecretEncrypted: 'secret-2',
        createdAt: new Date('2026-02-09T10:00:00.000Z'),
        updatedAt: new Date('2026-02-09T10:01:00.000Z'),
      },
      {
        id: 'cfg-custom-1',
        provider: 'custom',
        allowedEvents: ['ticket_created'],
        autoExecute: false,
        active: true,
        webhookSecretEncrypted: 'secret-1',
        createdAt: new Date('2026-02-09T09:00:00.000Z'),
        updatedAt: new Date('2026-02-09T09:01:00.000Z'),
      },
      {
        id: 'cfg-github-noise',
        provider: 'github',
        allowedEvents: ['issues.opened'],
        autoExecute: false,
        active: true,
        webhookSecretEncrypted: 'secret-gh',
        createdAt: new Date('2026-02-09T08:00:00.000Z'),
        updatedAt: new Date('2026-02-09T08:01:00.000Z'),
      },
    ])

    const response = await request(app)
      .get('/api/integrations/int-custom/webhooks/inbound')
      .expect(200)

    expect(mockWebhookConfigDAO.listByIntegrationId).toHaveBeenCalledWith('int-custom', {
      direction: 'inbound',
      activeOnly: false,
    })
    expect(response.body.data).toEqual([
      expect.objectContaining({
        id: 'cfg-custom-2',
        provider: 'custom',
        webhookUrl: '/api/webhooks/custom/cfg-custom-2',
        active: false,
      }),
      expect.objectContaining({
        id: 'cfg-custom-1',
        provider: 'custom',
        webhookUrl: '/api/webhooks/custom/cfg-custom-1',
        active: true,
      }),
    ])
  })

  it('creates multiple custom inbound webhook configs without single-config restriction', async () => {
    mockIntegrationDAO.getIntegration.mockResolvedValue({
      id: 'int-custom',
      system: 'custom',
      values: {},
    })
    mockProjectLinkDAO.getIntegrationProjects.mockResolvedValue([])
    mockWebhookConfigDAO.createConfig
      .mockResolvedValueOnce({
        id: 'cfg-custom-1',
        provider: 'custom',
        allowedEvents: ['ticket_created'],
        autoExecute: false,
        active: true,
        webhookSecretEncrypted: 'secret-1',
        createdAt: new Date('2026-02-09T10:00:00.000Z'),
        updatedAt: new Date('2026-02-09T10:01:00.000Z'),
      })
      .mockResolvedValueOnce({
        id: 'cfg-custom-2',
        provider: 'custom',
        allowedEvents: ['ticket_created'],
        autoExecute: true,
        active: true,
        webhookSecretEncrypted: 'secret-2',
        createdAt: new Date('2026-02-09T11:00:00.000Z'),
        updatedAt: new Date('2026-02-09T11:01:00.000Z'),
      })

    const first = await request(app)
      .post('/api/integrations/int-custom/webhooks/inbound')
      .send({
        allowedEvents: ['ticket_created'],
        webhookSecret: 'secret-1',
      })
      .expect(201)

    const second = await request(app)
      .post('/api/integrations/int-custom/webhooks/inbound')
      .send({
        allowedEvents: ['ticket_created'],
        autoExecute: true,
        webhookSecret: 'secret-2',
      })
      .expect(201)

    expect(mockWebhookConfigDAO.createConfig).toHaveBeenCalledTimes(2)
    expect(mockWebhookConfigDAO.createConfig).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        provider: 'custom',
        direction: 'inbound',
        integrationId: 'int-custom',
        allowedEvents: ['ticket_created'],
      }),
    )
    expect(mockWebhookConfigDAO.createConfig).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        provider: 'custom',
        direction: 'inbound',
        integrationId: 'int-custom',
        allowedEvents: ['ticket_created'],
      }),
    )

    expect(first.body.data).toEqual(
      expect.objectContaining({
        id: 'cfg-custom-1',
        webhookUrl: '/api/webhooks/custom/cfg-custom-1',
      }),
    )
    expect(second.body.data).toEqual(
      expect.objectContaining({
        id: 'cfg-custom-2',
        webhookUrl: '/api/webhooks/custom/cfg-custom-2',
      }),
    )
  })

  it('updates custom inbound webhook active state for targeted config', async () => {
    mockIntegrationDAO.getIntegration.mockResolvedValue({
      id: 'int-custom',
      system: 'custom',
      values: {},
    })
    mockWebhookConfigDAO.getByIntegrationAndConfigId.mockResolvedValue({
      id: 'cfg-custom-1',
      provider: 'custom',
      direction: 'inbound',
      active: true,
    })
    mockWebhookConfigDAO.updateConfig.mockResolvedValue(undefined)
    mockWebhookConfigDAO.getConfigById.mockResolvedValue({
      id: 'cfg-custom-1',
      provider: 'custom',
      allowedEvents: ['ticket_created'],
      autoExecute: false,
      active: false,
      webhookSecretEncrypted: 'secret-1',
      createdAt: new Date('2026-02-09T10:00:00.000Z'),
      updatedAt: new Date('2026-02-10T09:00:00.000Z'),
    })

    const response = await request(app)
      .put('/api/integrations/int-custom/webhooks/inbound/cfg-custom-1')
      .send({ active: false })
      .expect(200)

    expect(mockWebhookConfigDAO.updateConfig).toHaveBeenCalledWith(
      'cfg-custom-1',
      expect.objectContaining({
        active: false,
      }),
    )
    expect(response.body.data).toEqual(
      expect.objectContaining({
        id: 'cfg-custom-1',
        active: false,
        webhookUrl: '/api/webhooks/custom/cfg-custom-1',
      }),
    )
  })

  it('lists custom delivery history scoped to the selected custom inbound config', async () => {
    mockIntegrationDAO.getIntegration.mockResolvedValue({
      id: 'int-custom',
      system: 'custom',
      values: {},
    })
    mockWebhookConfigDAO.getByIntegrationAndConfigId.mockResolvedValue({
      id: 'cfg-custom-1',
      provider: 'custom',
      direction: 'inbound',
      active: true,
    })
    mockWebhookDeliveryDAO.listDeliveriesByConfig.mockResolvedValue([
      {
        id: 'delivery-custom-1',
        provider: 'custom',
        webhookConfigId: 'cfg-custom-1',
        deliveryId: 'delivery-id-1',
        eventType: 'ticket_created',
        status: 'failed',
        errorMessage: 'Invalid payload',
        ticketId: null,
        createdAt: new Date('2026-02-10T09:00:00.000Z'),
        processedAt: new Date('2026-02-10T09:00:01.000Z'),
      },
    ])

    const response = await request(app)
      .get('/api/integrations/int-custom/webhooks/inbound/cfg-custom-1/deliveries')
      .expect(200)

    expect(mockWebhookDeliveryDAO.listDeliveriesByConfig).toHaveBeenCalledWith('cfg-custom-1', {
      limit: 50,
      offset: 0,
      sortOrder: 'desc',
    })
    expect(response.body.data).toEqual([
      expect.objectContaining({
        id: 'delivery-custom-1',
        webhookConfigId: 'cfg-custom-1',
        eventType: 'ticket_created',
      }),
    ])
  })

  it('deletes the selected custom inbound webhook config', async () => {
    mockIntegrationDAO.getIntegration.mockResolvedValue({
      id: 'int-custom',
      system: 'custom',
      values: {},
    })
    mockWebhookConfigDAO.getByIntegrationAndConfigId.mockResolvedValue({
      id: 'cfg-custom-1',
      provider: 'custom',
      direction: 'inbound',
      active: true,
    })
    mockWebhookConfigDAO.deleteConfig.mockResolvedValue(true)

    await request(app)
      .delete('/api/integrations/int-custom/webhooks/inbound/cfg-custom-1')
      .expect(204)

    expect(mockWebhookConfigDAO.deleteConfig).toHaveBeenCalledWith('cfg-custom-1')
  })

  it('does not expose removed legacy compatibility delivery and outbound routes', async () => {
    await request(app).get('/api/integrations/int-1/deliveries').expect(404)
    await request(app).post('/api/integrations/int-1/deliveries/delivery-row-1/retry').expect(404)
    await request(app).put('/api/integrations/int-1/webhooks/outbound').expect(404)
    await request(app).delete('/api/integrations/int-1/webhooks/outbound').expect(404)
  })
})
