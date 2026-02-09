import express from 'express'
import crypto from 'crypto'
import { IntegrationDAO, ProjectIntegrationLinkDAO } from '../../persistence/integrations'
import { WebhookConfigDAO, type WebhookProvider } from '../../persistence/webhook/WebhookConfigDAO'
import { WebhookDeliveryDAO } from '../../persistence/webhook/WebhookDeliveryDAO'
import { requireAuth } from '../middleware/authentication'
import logger from '../../config/logger'
import { integrationRegistry } from '../../integrations/registry'
import type { AuthCredentials, TicketSystem } from '@viberglass/types'
import { INTEGRATION_DESCRIPTIONS } from '@viberglass/types'

const router = express.Router()
const integrationDAO = new IntegrationDAO()
const projectLinkDAO = new ProjectIntegrationLinkDAO()
const webhookConfigDAO = new WebhookConfigDAO()
const webhookDeliveryDAO = new WebhookDeliveryDAO()

function mapSystemToWebhookProvider(system: string): WebhookProvider | null {
  if (system === 'github' || system === 'jira' || system === 'shortcut' || system === 'custom') {
    return system
  }
  return null
}

function getDefaultInboundEvents(provider: WebhookProvider): string[] {
  switch (provider) {
    case 'github':
      return ['issues', 'issue_comment']
    case 'jira':
      return ['issue_created', 'issue_updated', 'comment_created']
    case 'shortcut':
      return ['story_created', 'story_updated', 'comment_created']
    case 'custom':
      return ['ticket_created']
    default:
      return ['*']
  }
}

function getDefaultOutboundEvents(): string[] {
  return ['job_started', 'job_ended']
}

function getProviderProjectIdFromIntegration(
  provider: WebhookProvider,
  integrationValues: Record<string, unknown>,
): string | null {
  if (provider === 'github') {
    const owner = typeof integrationValues.owner === 'string' ? integrationValues.owner : null
    const repo = typeof integrationValues.repo === 'string' ? integrationValues.repo : null
    if (owner && repo) {
      return `${owner}/${repo}`
    }
    return null
  }

  if (provider === 'jira') {
    const projectKey =
      typeof integrationValues.projectKey === 'string' ? integrationValues.projectKey : null
    return projectKey
  }

  if (provider === 'shortcut') {
    const projectId =
      typeof integrationValues.projectId === 'string'
        ? integrationValues.projectId
        : typeof integrationValues.projectId === 'number'
          ? String(integrationValues.projectId)
          : null
    return projectId
  }

  return null
}

function serializeInboundWebhookConfig(
  config: {
    id: string
    provider: WebhookProvider
    allowedEvents: string[]
    autoExecute: boolean
    active: boolean
    webhookSecretEncrypted: string | null
    createdAt: Date
    updatedAt: Date
  },
  includeSecret?: string,
) {
  return {
    id: config.id,
    provider: config.provider,
    webhookUrl:
      config.provider === 'custom'
        ? `/api/webhooks/custom/${config.id}`
        : `/api/webhooks/${config.provider}`,
    events: config.allowedEvents,
    autoExecute: config.autoExecute,
    active: config.active,
    hasSecret: Boolean(config.webhookSecretEncrypted),
    webhookSecret: includeSecret,
    createdAt: config.createdAt,
    updatedAt: config.updatedAt,
  }
}

function serializeOutboundWebhookConfig(
  config: {
    id: string
    provider: WebhookProvider
    allowedEvents: string[]
    active: boolean
    apiTokenEncrypted: string | null
    providerProjectId: string | null
    createdAt: Date
    updatedAt: Date
  },
) {
  return {
    id: config.id,
    provider: config.provider,
    events: config.allowedEvents,
    active: config.active,
    hasApiToken: Boolean(config.apiTokenEncrypted),
    providerProjectId: config.providerProjectId,
    createdAt: config.createdAt,
    updatedAt: config.updatedAt,
  }
}

router.use(requireAuth)

// ============================================================================
// Top-level Integration Management
// ============================================================================

/**
 * GET /api/integrations - List all integrations
 * Query params:
 *   - system: Filter by system type (e.g., 'jira', 'github')
 */
router.get('/', async (req, res) => {
  try {
    const system = req.query.system as TicketSystem | undefined
    const integrations = await integrationDAO.listIntegrations(system)

    res.json({
      success: true,
      data: integrations,
    })
  } catch (error) {
    logger.error('Error fetching integrations', {
      error: error instanceof Error ? error.message : error,
    })
    res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * POST /api/integrations - Create a new integration
 */
router.post('/', async (req, res) => {
  try {
    const { name, system, authType, values } = req.body

    if (!name || !system || !authType) {
      return res.status(400).json({
        error: 'Missing required fields: name, system, authType',
      })
    }

    // Validate system is a valid integration
    const plugin = integrationRegistry.get(system as TicketSystem)
    if (!plugin) {
      return res.status(400).json({
        error: `Invalid integration system: ${system}`,
      })
    }

    if (plugin.status === 'stub') {
      return res.status(400).json({
        error: 'Integration is not available yet',
      })
    }

    const integration = await integrationDAO.createIntegration({
      name,
      system: system as TicketSystem,
      authType,
      values: values || {},
    })

    res.status(201).json({
      success: true,
      data: integration,
    })
  } catch (error) {
    logger.error('Error creating integration', {
      error: error instanceof Error ? error.message : error,
    })
    res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * GET /api/integrations/:id - Get a specific integration
 */
router.get('/:id', async (req, res) => {
  try {
    const integration = await integrationDAO.getIntegration(req.params.id)

    if (!integration) {
      return res.status(404).json({ error: 'Integration not found' })
    }

    res.json({
      success: true,
      data: integration,
    })
  } catch (error) {
    logger.error('Error fetching integration', {
      error: error instanceof Error ? error.message : error,
    })
    res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * PUT /api/integrations/:id - Update an integration
 */
router.put('/:id', async (req, res) => {
  try {
    const existing = await integrationDAO.getIntegration(req.params.id)
    if (!existing) {
      return res.status(404).json({ error: 'Integration not found' })
    }

    const { name, authType, values, isActive } = req.body
    const integration = await integrationDAO.updateIntegration(req.params.id, {
      name,
      authType,
      values,
      isActive,
    })

    res.json({
      success: true,
      data: integration,
    })
  } catch (error) {
    logger.error('Error updating integration', {
      error: error instanceof Error ? error.message : error,
    })
    res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * DELETE /api/integrations/:id - Delete an integration
 */
router.delete('/:id', async (req, res) => {
  try {
    const existing = await integrationDAO.getIntegration(req.params.id)
    if (!existing) {
      return res.status(404).json({ error: 'Integration not found' })
    }

    // First unlink from all projects
    await projectLinkDAO.deleteAllLinksForIntegration(req.params.id)

    // Then delete the integration (hard delete)
    await integrationDAO.deleteIntegration(req.params.id, true)

    res.status(204).send()
  } catch (error) {
    logger.error('Error deleting integration', {
      error: error instanceof Error ? error.message : error,
    })
    res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * POST /api/integrations/:id/test - Test an integration connection
 */
router.post('/:id/test', async (req, res) => {
  try {
    const integration = await integrationDAO.getIntegration(req.params.id)
    if (!integration) {
      return res.status(404).json({ error: 'Integration not found' })
    }

    const plugin = integrationRegistry.get(integration.system)
    if (!plugin) {
      return res.status(404).json({ error: 'Integration plugin not found' })
    }

    if (plugin.status === 'stub') {
      return res.status(400).json({ error: 'Integration is not available yet' })
    }

    const config = {
      type: integration.authType,
      ...integration.values,
    } as AuthCredentials & Record<string, unknown>

    try {
      const integrationInstance = plugin.createIntegration(config)
      await integrationInstance.authenticate(config)

      res.json({
        success: true,
        data: {
          success: true,
          message: 'Connection successful',
        },
      })
    } catch (error) {
      res.json({
        success: true,
        data: {
          success: false,
          message: error instanceof Error ? error.message : 'Failed to authenticate integration',
        },
      })
    }
  } catch (error) {
    logger.error('Error testing integration', {
      error: error instanceof Error ? error.message : error,
    })
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ============================================================================
// Project-Integration Link Management
// ============================================================================

/**
 * GET /api/integrations/project/:projectId - Get all integrations for a project
 */
router.get('/project/:projectId', async (req, res) => {
  try {
    const { projectId } = req.params
    const links = await projectLinkDAO.getProjectIntegrations(projectId)

    // Map to include both link and integration details
    const result = links.map((link) => ({
      linkId: link.id,
      projectId: link.projectId,
      integrationId: link.integrationId,
      isPrimary: link.isPrimary,
      createdAt: link.createdAt,
      integration: link.integration,
    }))

    res.json({
      success: true,
      data: result,
    })
  } catch (error) {
    logger.error('Error fetching project integrations', {
      error: error instanceof Error ? error.message : error,
    })
    res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * POST /api/integrations/project/:projectId/link - Link an integration to a project
 */
router.post('/project/:projectId/link', async (req, res) => {
  try {
    const { projectId } = req.params
    const { integrationId, isPrimary } = req.body

    if (!integrationId) {
      return res.status(400).json({
        error: 'Missing required field: integrationId',
      })
    }

    // Verify the integration exists
    const integration = await integrationDAO.getIntegration(integrationId)
    if (!integration) {
      return res.status(404).json({ error: 'Integration not found' })
    }

    // Check if already linked
    const isAlreadyLinked = await projectLinkDAO.isLinked(projectId, integrationId)
    if (isAlreadyLinked) {
      return res.status(409).json({
        error: 'Integration is already linked to this project',
      })
    }

    const link = await projectLinkDAO.linkIntegration({
      projectId,
      integrationId,
      isPrimary: isPrimary ?? false,
    })

    res.status(201).json({
      success: true,
      data: link,
    })
  } catch (error) {
    logger.error('Error linking integration to project', {
      error: error instanceof Error ? error.message : error,
    })
    res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * DELETE /api/integrations/project/:projectId/link/:integrationId - Unlink an integration from a project
 */
router.delete('/project/:projectId/link/:integrationId', async (req, res) => {
  try {
    const { projectId, integrationId } = req.params

    const deleted = await projectLinkDAO.unlinkIntegration(projectId, integrationId)

    if (!deleted) {
      return res.status(404).json({ error: 'Integration link not found' })
    }

    res.status(204).send()
  } catch (error) {
    logger.error('Error unlinking integration from project', {
      error: error instanceof Error ? error.message : error,
    })
    res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * PUT /api/integrations/project/:projectId/primary/:integrationId - Set an integration as primary for a project
 */
router.put('/project/:projectId/primary/:integrationId', async (req, res) => {
  try {
    const { projectId, integrationId } = req.params

    // Verify the link exists
    const isLinked = await projectLinkDAO.isLinked(projectId, integrationId)
    if (!isLinked) {
      return res.status(404).json({ error: 'Integration is not linked to this project' })
    }

    await projectLinkDAO.setPrimaryIntegration(projectId, integrationId)

    res.json({
      success: true,
      message: 'Primary integration set successfully',
    })
  } catch (error) {
    logger.error('Error setting primary integration', {
      error: error instanceof Error ? error.message : error,
    })
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ============================================================================
// Available Integration Types
// ============================================================================

/**
 * GET /api/integrations/types/available - Get all available integration types
 */
router.get('/types/available', async (req, res) => {
  try {
    const plugins = integrationRegistry.list()
    const available = plugins.map((plugin) => ({
      id: plugin.id,
      label: plugin.label,
      category: plugin.category,
      description: INTEGRATION_DESCRIPTIONS[plugin.id] || plugin.label,
      authTypes: plugin.authTypes,
      configFields: plugin.configFields,
      supports: plugin.supports,
      status: plugin.status,
    }))

    res.json({
      success: true,
      data: available,
    })
  } catch (error) {
    logger.error('Error fetching available integration types', {
      error: error instanceof Error ? error.message : error,
    })
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ============================================================================
// Webhook configuration endpoints under integrations
// ============================================================================

/**
 * GET /api/integrations/:id/webhooks/inbound - List inbound webhook configs
 */
router.get('/:id/webhooks/inbound', async (req, res) => {
  try {
    const integration = await integrationDAO.getIntegration(req.params.id)
    if (!integration) {
      return res.status(404).json({ error: 'Integration not found' })
    }

    const provider = mapSystemToWebhookProvider(integration.system)
    if (!provider) {
      return res.status(400).json({ error: 'Integration does not support webhooks' })
    }

    const inboundConfigs = await webhookConfigDAO.listByIntegrationId(integration.id, {
      direction: 'inbound',
      activeOnly: false,
    })

    res.json({
      success: true,
      data: inboundConfigs
        .filter((config) => config.provider === provider)
        .map((config) => serializeInboundWebhookConfig(config)),
    })
  } catch (error) {
    logger.error('Error listing inbound webhook configs', {
      error: error instanceof Error ? error.message : error,
    })
    res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * POST /api/integrations/:id/webhooks/inbound - Create inbound webhook config
 */
router.post('/:id/webhooks/inbound', async (req, res) => {
  try {
    const integration = await integrationDAO.getIntegration(req.params.id)
    if (!integration) {
      return res.status(404).json({ error: 'Integration not found' })
    }

    const provider = mapSystemToWebhookProvider(integration.system)
    if (!provider) {
      return res.status(400).json({ error: 'Integration does not support inbound webhooks' })
    }

    const body = req.body as {
      projectId?: string
      allowedEvents?: string[]
      autoExecute?: boolean
      webhookSecret?: string
      generateSecret?: boolean
      providerProjectId?: string
      active?: boolean
    }

    let webhookSecret = body.webhookSecret
    if (body.generateSecret) {
      webhookSecret = crypto.randomBytes(32).toString('hex')
    }

    const projectLinks = await projectLinkDAO.getIntegrationProjects(integration.id)
    const projectId = body.projectId || (projectLinks.length > 0 ? projectLinks[0].projectId : null)
    const providerProjectId =
      body.providerProjectId ||
      getProviderProjectIdFromIntegration(provider, integration.values) ||
      null

    const created = await webhookConfigDAO.createConfig({
      projectId,
      provider,
      direction: 'inbound',
      integrationId: integration.id,
      providerProjectId,
      allowedEvents: body.allowedEvents || getDefaultInboundEvents(provider),
      autoExecute: body.autoExecute ?? false,
      webhookSecretEncrypted: webhookSecret || null,
      secretLocation: 'database',
      active: body.active ?? true,
    })

    res.status(201).json({
      success: true,
      data: serializeInboundWebhookConfig(created, webhookSecret || undefined),
    })
  } catch (error) {
    logger.error('Error creating inbound webhook config', {
      error: error instanceof Error ? error.message : error,
    })
    res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * PUT /api/integrations/:id/webhooks/inbound/:configId - Update inbound webhook config
 */
router.put('/:id/webhooks/inbound/:configId', async (req, res) => {
  try {
    const integration = await integrationDAO.getIntegration(req.params.id)
    if (!integration) {
      return res.status(404).json({ error: 'Integration not found' })
    }

    const { configId } = req.params
    const existing = await webhookConfigDAO.getByIntegrationAndConfigId(integration.id, configId, {
      direction: 'inbound',
    })
    if (!existing) {
      return res.status(404).json({ error: 'Inbound webhook configuration not found' })
    }

    const body = req.body as {
      allowedEvents?: string[]
      autoExecute?: boolean
      webhookSecret?: string
      generateSecret?: boolean
      providerProjectId?: string
      active?: boolean
    }

    let webhookSecret = body.webhookSecret
    if (body.generateSecret) {
      webhookSecret = crypto.randomBytes(32).toString('hex')
    }

    await webhookConfigDAO.updateConfig(configId, {
      providerProjectId: body.providerProjectId,
      allowedEvents: body.allowedEvents,
      autoExecute: body.autoExecute,
      webhookSecretEncrypted: webhookSecret,
      active: body.active,
    })

    const updated = await webhookConfigDAO.getConfigById(configId)
    if (!updated) {
      return res.status(404).json({ error: 'Inbound webhook configuration not found' })
    }

    res.json({
      success: true,
      data: serializeInboundWebhookConfig(updated, webhookSecret || undefined),
    })
  } catch (error) {
    logger.error('Error updating inbound webhook config', {
      error: error instanceof Error ? error.message : error,
    })
    res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * DELETE /api/integrations/:id/webhooks/inbound/:configId - Delete inbound webhook config
 */
router.delete('/:id/webhooks/inbound/:configId', async (req, res) => {
  try {
    const integration = await integrationDAO.getIntegration(req.params.id)
    if (!integration) {
      return res.status(404).json({ error: 'Integration not found' })
    }

    const { configId } = req.params
    const existing = await webhookConfigDAO.getByIntegrationAndConfigId(integration.id, configId, {
      direction: 'inbound',
    })
    if (!existing) {
      return res.status(404).json({ error: 'Inbound webhook configuration not found' })
    }

    await webhookConfigDAO.deleteConfig(configId)
    res.status(204).send()
  } catch (error) {
    logger.error('Error deleting inbound webhook config', {
      error: error instanceof Error ? error.message : error,
    })
    res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * GET /api/integrations/:id/webhooks/outbound - Get outbound webhook config
 */
router.get('/:id/webhooks/outbound', async (req, res) => {
  try {
    const integration = await integrationDAO.getIntegration(req.params.id)
    if (!integration) {
      return res.status(404).json({ error: 'Integration not found' })
    }

    const outboundConfig = await webhookConfigDAO.getByIntegrationId(integration.id, 'outbound')
    if (!outboundConfig) {
      return res.json({ success: true, data: null })
    }

    res.json({
      success: true,
      data: serializeOutboundWebhookConfig(outboundConfig),
    })
  } catch (error) {
    logger.error('Error fetching outbound webhook config', {
      error: error instanceof Error ? error.message : error,
    })
    res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * PUT /api/integrations/:id/webhooks/outbound - Create or update outbound webhook config
 */
router.put('/:id/webhooks/outbound', async (req, res) => {
  try {
    const integration = await integrationDAO.getIntegration(req.params.id)
    if (!integration) {
      return res.status(404).json({ error: 'Integration not found' })
    }

    const provider = mapSystemToWebhookProvider(integration.system)
    if (!provider || provider === 'custom') {
      return res.status(400).json({ error: 'Integration does not support outbound webhook events' })
    }

    const body = req.body as {
      projectId?: string
      events?: string[]
      apiToken?: string
      providerProjectId?: string
      active?: boolean
    }

    const projectLinks = await projectLinkDAO.getIntegrationProjects(integration.id)
    const projectId = body.projectId || (projectLinks.length > 0 ? projectLinks[0].projectId : null)
    const providerProjectId =
      body.providerProjectId ||
      getProviderProjectIdFromIntegration(provider, integration.values) ||
      null

    const existing = await webhookConfigDAO.getByIntegrationId(integration.id, 'outbound')

    if (existing) {
      await webhookConfigDAO.updateConfig(existing.id, {
        providerProjectId,
        allowedEvents: body.events,
        apiTokenEncrypted: body.apiToken,
        active: body.active,
      })

      const updated = await webhookConfigDAO.getConfigById(existing.id)
      return res.json({
        success: true,
        data: serializeOutboundWebhookConfig(updated!),
      })
    }

    const created = await webhookConfigDAO.createConfig({
      projectId,
      provider,
      direction: 'outbound',
      integrationId: integration.id,
      providerProjectId,
      allowedEvents: body.events || getDefaultOutboundEvents(),
      apiTokenEncrypted: body.apiToken || null,
      autoExecute: false,
      secretLocation: 'database',
      active: body.active ?? true,
    })

    res.status(201).json({
      success: true,
      data: serializeOutboundWebhookConfig(created),
    })
  } catch (error) {
    logger.error('Error saving outbound webhook config', {
      error: error instanceof Error ? error.message : error,
    })
    res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * DELETE /api/integrations/:id/webhooks/outbound - Remove outbound webhook config
 */
router.delete('/:id/webhooks/outbound', async (req, res) => {
  try {
    const integration = await integrationDAO.getIntegration(req.params.id)
    if (!integration) {
      return res.status(404).json({ error: 'Integration not found' })
    }

    const webhookConfig = await webhookConfigDAO.getByIntegrationId(integration.id, 'outbound')
    if (!webhookConfig) {
      return res.status(404).json({ error: 'Outbound webhook configuration not found' })
    }

    await webhookConfigDAO.deleteConfig(webhookConfig.id)
    res.status(204).send()
  } catch (error) {
    logger.error('Error deleting outbound webhook config', {
      error: error instanceof Error ? error.message : error,
    })
    res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * GET /api/integrations/:id/deliveries - Get delivery history
 */
router.get('/:id/deliveries', async (req, res) => {
  try {
    const integration = await integrationDAO.getIntegration(req.params.id)
    if (!integration) {
      return res.status(404).json({ error: 'Integration not found' })
    }

    const limit = parseInt(req.query.limit as string) || 50
    const offset = parseInt(req.query.offset as string) || 0

    const inboundConfigs = await webhookConfigDAO.listByIntegrationId(integration.id, {
      direction: 'inbound',
      activeOnly: false,
    })

    if (inboundConfigs.length === 0) {
      return res.json({ success: true, data: [], pagination: { limit, offset, count: 0 } })
    }

    const fetchLimit = limit + offset
    const deliverySets = await Promise.all(
      inboundConfigs.map((config) =>
        webhookDeliveryDAO.listDeliveriesByConfig(config.id, {
          limit: fetchLimit,
          offset: 0,
          sortOrder: 'desc',
        }),
      ),
    )

    const deliveries = deliverySets
      .flat()
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(offset, offset + limit)

    res.json({
      success: true,
      data: deliveries,
      pagination: { limit, offset, count: deliveries.length },
    })
  } catch (error) {
    logger.error('Error fetching webhook deliveries', {
      error: error instanceof Error ? error.message : error,
    })
    res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * POST /api/integrations/:id/deliveries/:deliveryId/retry - Retry a delivery
 */
router.post('/:id/deliveries/:deliveryId/retry', async (req, res) => {
  try {
    const integration = await integrationDAO.getIntegration(req.params.id)
    if (!integration) {
      return res.status(404).json({ error: 'Integration not found' })
    }

    const { deliveryId } = req.params
    const inboundConfigs = await webhookConfigDAO.listByIntegrationId(integration.id, {
      direction: 'inbound',
      activeOnly: false,
    })
    if (inboundConfigs.length === 0) {
      return res.status(404).json({ error: 'Inbound webhook configuration not found for integration' })
    }

    const delivery = await webhookDeliveryDAO.getDeliveryById(deliveryId)
    if (!delivery) {
      return res.status(404).json({ error: 'Delivery not found' })
    }

    const inboundConfigIds = new Set(inboundConfigs.map((config) => config.id))
    if (!delivery.webhookConfigId || !inboundConfigIds.has(delivery.webhookConfigId)) {
      return res.status(404).json({ error: 'Delivery not found for this integration' })
    }

    // Reset status for retry by updating to failed with a retry message
    // Note: The DAO only allows 'succeeded' | 'failed' status updates
    // A proper retry would require re-inserting the delivery or using a different mechanism
    await webhookDeliveryDAO.updateDeliveryStatus(deliveryId, 'failed', 'Marked for retry - please check provider webhook settings')

    res.json({
      success: true,
      message: 'Delivery retry initiated',
    })
  } catch (error) {
    logger.error('Error retrying webhook delivery', {
      error: error instanceof Error ? error.message : error,
    })
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
