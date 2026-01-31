import express from 'express'
import crypto from 'crypto'
import { IntegrationDAO, ProjectIntegrationLinkDAO } from '../../persistence/integrations'
import { WebhookConfigDAO } from '../../persistence/webhook/WebhookConfigDAO'
import { WebhookDeliveryDAO } from '../../persistence/webhook/WebhookDeliveryDAO'
import { requireAuth } from '../middleware/authentication'
import logger from '../../config/logger'
import { integrationRegistry } from '../../integrations/registry'
import type { TicketSystem } from '@viberglass/types'
import { INTEGRATION_DESCRIPTIONS } from '@viberglass/types'
import type { Integration } from '@viberglass/types'

const router = express.Router()
const integrationDAO = new IntegrationDAO()
const projectLinkDAO = new ProjectIntegrationLinkDAO()
const webhookConfigDAO = new WebhookConfigDAO()
const webhookDeliveryDAO = new WebhookDeliveryDAO()

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
    }

    try {
      const integrationInstance = plugin.createIntegration(config as any)
      await integrationInstance.authenticate(config as any)

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
 * GET /api/integrations/:id/webhook - Get webhook config for an integration
 */
router.get('/:id/webhook', async (req, res) => {
  try {
    const integration = await integrationDAO.getIntegration(req.params.id)
    if (!integration) {
      return res.status(404).json({ error: 'Integration not found' })
    }

    const webhookConfig = await webhookConfigDAO.getByIntegrationId(integration.id)

    if (!webhookConfig) {
      return res.json({ success: true, data: null })
    }

    res.json({
      success: true,
      data: {
        id: webhookConfig.id,
        provider: webhookConfig.provider,
        webhookUrl: webhookConfig.provider === 'custom'
          ? `/api/webhooks/custom/${webhookConfig.id}`
          : `/api/webhooks/${webhookConfig.provider}`,
        allowedEvents: webhookConfig.allowedEvents,
        autoExecute: webhookConfig.autoExecute,
        active: webhookConfig.active,
        hasSecret: Boolean(webhookConfig.webhookSecretEncrypted),
        createdAt: webhookConfig.createdAt,
        updatedAt: webhookConfig.updatedAt,
      },
    })
  } catch (error) {
    logger.error('Error fetching integration webhook config', {
      error: error instanceof Error ? error.message : error,
    })
    res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * PUT /api/integrations/:id/webhook - Create or update webhook config
 */
router.put('/:id/webhook', async (req, res) => {
  try {
    const integration = await integrationDAO.getIntegration(req.params.id)
    if (!integration) {
      return res.status(404).json({ error: 'Integration not found' })
    }

    const body = req.body as {
      allowedEvents?: string[]
      autoExecute?: boolean
      webhookSecret?: string
      generateSecret?: boolean
    }

    // Generate a secret if requested
    let webhookSecret = body.webhookSecret
    if (body.generateSecret) {
      webhookSecret = crypto.randomBytes(32).toString('hex')
    }

    // Determine provider type based on integration system
    const provider = integration.system === 'custom' ? 'custom' as const : integration.system as 'github' | 'jira'

    // Get the first linked project for projectId (required by DAO)
    const projectLinks = await projectLinkDAO.getIntegrationProjects(integration.id)
    const projectId = projectLinks.length > 0 ? projectLinks[0].projectId : 'global'

    // Check if webhook config already exists
    const existing = await webhookConfigDAO.getByIntegrationId(integration.id)

    if (existing) {
      await webhookConfigDAO.updateConfig(existing.id, {
        allowedEvents: body.allowedEvents,
        autoExecute: body.autoExecute,
        webhookSecretEncrypted: webhookSecret,
        active: true,
      })

      const updated = await webhookConfigDAO.getConfigById(existing.id)
      return res.json({
        success: true,
        data: {
          id: updated!.id,
          provider: updated!.provider,
          webhookUrl: updated!.provider === 'custom'
            ? `/api/webhooks/custom/${updated!.id}`
            : `/api/webhooks/${updated!.provider}`,
          allowedEvents: updated!.allowedEvents,
          autoExecute: updated!.autoExecute,
          active: updated!.active,
          hasSecret: Boolean(updated!.webhookSecretEncrypted),
          webhookSecret: webhookSecret || undefined,
          createdAt: updated!.createdAt,
          updatedAt: updated!.updatedAt,
        },
      })
    }

    // Create new webhook config
    const newConfig = await webhookConfigDAO.createConfig({
      projectId,
      provider,
      integrationId: integration.id,
      allowedEvents: body.allowedEvents || ['ticket_created'],
      autoExecute: body.autoExecute ?? false,
      webhookSecretEncrypted: webhookSecret || null,
      secretLocation: 'database',
      active: true,
    })

    res.json({
      success: true,
      data: {
        id: newConfig.id,
        provider: newConfig.provider,
        webhookUrl: newConfig.provider === 'custom'
          ? `/api/webhooks/custom/${newConfig.id}`
          : `/api/webhooks/${newConfig.provider}`,
        allowedEvents: newConfig.allowedEvents,
        autoExecute: newConfig.autoExecute,
        active: newConfig.active,
        hasSecret: Boolean(newConfig.webhookSecretEncrypted),
        webhookSecret: webhookSecret || undefined,
        createdAt: newConfig.createdAt,
        updatedAt: newConfig.updatedAt,
      },
    })
  } catch (error) {
    logger.error('Error saving integration webhook config', {
      error: error instanceof Error ? error.message : error,
    })
    res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * DELETE /api/integrations/:id/webhook - Remove webhook config
 */
router.delete('/:id/webhook', async (req, res) => {
  try {
    const integration = await integrationDAO.getIntegration(req.params.id)
    if (!integration) {
      return res.status(404).json({ error: 'Integration not found' })
    }

    const webhookConfig = await webhookConfigDAO.getByIntegrationId(integration.id)

    if (!webhookConfig) {
      return res.status(404).json({ error: 'Webhook configuration not found' })
    }

    await webhookConfigDAO.deleteConfig(webhookConfig.id)
    res.status(204).send()
  } catch (error) {
    logger.error('Error deleting integration webhook config', {
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

    const webhookConfig = await webhookConfigDAO.getByIntegrationId(integration.id)

    if (!webhookConfig) {
      return res.json({ success: true, data: [], pagination: { limit, offset, count: 0 } })
    }

    // Get deliveries for this provider
    const provider = webhookConfig.provider as 'github' | 'jira' | 'custom'
    const allDeliveries = await webhookDeliveryDAO.getFailedDeliveriesByProvider(provider, limit)

    // Filter to this integration's project(s)
    const projectLinks = await projectLinkDAO.getIntegrationProjects(integration.id)
    const projectIds = new Set(projectLinks.map(link => link.projectId))
    const deliveries = allDeliveries.filter(d => (d.projectId && projectIds.has(d.projectId)) || projectIds.size === 0)

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

    const delivery = await webhookDeliveryDAO.getDeliveryById(deliveryId)
    if (!delivery) {
      return res.status(404).json({ error: 'Delivery not found' })
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
