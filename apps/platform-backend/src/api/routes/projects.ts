import crypto from 'crypto';
import express from 'express';
import { ProjectDAO } from '../../persistence/project/ProjectDAO';
import { IntegrationConfigDAO } from '../../persistence/integrations/IntegrationConfigDAO';
import { WebhookConfigDAO } from '../../persistence/webhook/WebhookConfigDAO';
import { WebhookDeliveryDAO } from '../../persistence/webhook/WebhookDeliveryDAO';
import {
  validateCreateProject,
  validateIntegrationConfig,
  validateUpdateProject,
  validateUuidParam
} from '../middleware/validation';
import { requireAuth } from '../middleware/authentication';
import logger from '../../config/logger';
import { integrationRegistry } from '../../integrations/registry';
import type { IntegrationFieldDefinition as PluginFieldDefinition } from '../../integrations/plugin';
import type {
  AuthCredentials,
  ConfigureIntegrationRequest,
  IntegrationConfig,
  IntegrationSummary,
  TestIntegrationResponse,
  TicketSystem,
} from '@viberglass/types';
import { INTEGRATION_DESCRIPTIONS } from '@viberglass/types';

const router = express.Router();
const projectService = new ProjectDAO();
const integrationConfigDAO = new IntegrationConfigDAO();

router.use(requireAuth);

const buildIntegrationSummary = (
  plugin: ReturnType<typeof integrationRegistry.get>,
  config: IntegrationConfig | null
): IntegrationSummary => {
  if (!plugin) {
    throw new Error('Integration plugin not found');
  }

  const status = plugin.status ?? 'ready';
  const configStatus =
    status === 'stub' ? 'stub' : config ? 'configured' : 'not_configured';

  return {
    id: plugin.id,
    label: plugin.label,
    category: plugin.category,
    description: INTEGRATION_DESCRIPTIONS[plugin.id] || plugin.label,
    authTypes: plugin.authTypes,
    configFields: plugin.configFields,
    supports: plugin.supports,
    status,
    configStatus,
    configuredAt: config?.createdAt,
  };
};

const mapConfigRecord = (
  projectId: string,
  integrationId: TicketSystem,
  record: { config: { authType: string; values: Record<string, unknown> }; createdAt: Date; updatedAt: Date }
): IntegrationConfig => {
  return {
    projectId,
    integrationId,
    authType: record.config.authType as IntegrationConfig['authType'],
    values: record.config.values ?? {},
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
};

const isMissingRequiredField = (
  field: PluginFieldDefinition,
  value: unknown
): boolean => {
  if (value === null || value === undefined) return true;

  switch (field.type) {
    case 'boolean':
      return typeof value !== 'boolean';
    case 'number':
      return typeof value !== 'number' || Number.isNaN(value);
    case 'multiselect':
      return !Array.isArray(value) || value.length === 0;
    case 'string':
    case 'select':
    case 'secret':
    default:
      return String(value).trim().length === 0;
  }
};

// GET /api/projects - List all projects
router.get('/', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;

    const projects = await projectService.listProjects(limit, offset);

    res.json({
      success: true,
      data: projects,
      pagination: { limit, offset, count: projects.length }
    });
  } catch (error) {
    logger.error('Error fetching projects', { error: error instanceof Error ? error.message : error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/projects/by-name/:name - Get a project by name
router.get('/by-name/:name', async (req, res) => {
  try {
    const project = await projectService.findByName(req.params.name);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    res.json({ success: true, data: project });
  } catch (error) {
    logger.error('Error fetching project', { error: error instanceof Error ? error.message : error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/projects - Create a new project
router.post('/', validateCreateProject, async (req, res) => {
  try {
    const project = await projectService.createProject(req.body);
    res.status(201).json({ success: true, data: project });
  } catch (error) {
    logger.error('Error creating project', { error: error instanceof Error ? error.message : error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/projects/:id - Get a specific project
router.get('/:id', validateUuidParam('id'), async (req, res) => {
  try {
    const project = await projectService.getProject(req.params.id);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    res.json({ success: true, data: project });
  } catch (error) {
    logger.error('Error fetching project', { error: error instanceof Error ? error.message : error });
    res.status(500).json({ error: 'Internal server error' });
  }
});


// PUT /api/projects/:id - Update a project
router.put('/:id', validateUuidParam('id'), validateUpdateProject, async (req, res) => {
  try {
    const project = await projectService.getProject(req.params.id);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const updatedProject = await projectService.updateProject(req.params.id, req.body);
    res.json({ success: true, data: updatedProject });
  } catch (error) {
    logger.error('Error updating project', { error: error instanceof Error ? error.message : error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/projects/:id - Delete a project
router.delete('/:id', validateUuidParam('id'), async (req, res) => {
  try {
    const project = await projectService.getProject(req.params.id);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    await projectService.deleteProject(req.params.id);
    res.status(204).send();
  } catch (error) {
    logger.error('Error deleting project', { error: error instanceof Error ? error.message : error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Integration configuration endpoints
router.get('/:projectId/integrations', async (req, res) => {
  try {
    const projectId = req.params.projectId;
    const configs = await integrationConfigDAO.listConfigs(projectId);
    const configMap = new Map(
      configs.map((record) => [
        record.system,
        mapConfigRecord(projectId, record.system, record),
      ])
    );

    const integrations = integrationRegistry.list().map((plugin) =>
      buildIntegrationSummary(plugin, configMap.get(plugin.id) ?? null)
    );

    res.json({ success: true, data: integrations });
  } catch (error) {
    logger.error('Error fetching integrations', {
      error: error instanceof Error ? error.message : error,
    });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:projectId/integrations/:integrationId', async (req, res) => {
  try {
    const { projectId, integrationId } = req.params;
    const plugin = integrationRegistry.get(integrationId as TicketSystem);

    if (!plugin) {
      return res.status(404).json({ error: 'Integration not found' });
    }

    const record = await integrationConfigDAO.getConfig(
      projectId,
      integrationId as TicketSystem
    );

    if (!record) {
      return res.status(404).json({ error: 'Integration configuration not found' });
    }

    res.json({
      success: true,
      data: mapConfigRecord(projectId, integrationId as TicketSystem, record),
    });
  } catch (error) {
    logger.error('Error fetching integration config', {
      error: error instanceof Error ? error.message : error,
    });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put(
  '/:projectId/integrations/:integrationId',
  validateIntegrationConfig,
  async (req, res) => {
    try {
      const { projectId, integrationId } = req.params;
      const plugin = integrationRegistry.get(integrationId as TicketSystem);

      if (!plugin) {
        return res.status(404).json({ error: 'Integration not found' });
      }

      if (plugin.status === 'stub') {
        return res.status(400).json({ error: 'Integration is not available yet' });
      }

      const body = req.body as ConfigureIntegrationRequest;
      const values = body.values || {};

      const missing = plugin.configFields
        .filter((field) => field.required)
        .filter((field) => isMissingRequiredField(field, values[field.key]))
        .map((field) => field.key);

      if (missing.length > 0) {
        return res.status(400).json({
          error: 'Missing required fields',
          details: missing.map((field) => ({
            field,
            message: 'This field is required',
          })),
        });
      }

      const record = await integrationConfigDAO.upsertConfig(
        projectId,
        integrationId as TicketSystem,
        { authType: body.authType, values }
      );

      res.json({
        success: true,
        data: mapConfigRecord(projectId, integrationId as TicketSystem, record),
      });
    } catch (error) {
      logger.error('Error saving integration config', {
        error: error instanceof Error ? error.message : error,
      });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

router.post(
  '/:projectId/integrations/:integrationId/test',
  validateIntegrationConfig,
  async (req, res) => {
    try {
      const { integrationId } = req.params;
      const plugin = integrationRegistry.get(integrationId as TicketSystem);

      if (!plugin) {
        return res.status(404).json({ error: 'Integration not found' });
      }

      if (plugin.status === 'stub') {
        return res.status(400).json({ error: 'Integration is not available yet' });
      }

      const body = req.body as ConfigureIntegrationRequest;
      const config = {
        type: body.authType,
        ...body.values,
      } as AuthCredentials & Record<string, unknown>;

      try {
        const integration = plugin.createIntegration(config);
        await integration.authenticate(config);

        const response: TestIntegrationResponse = {
          success: true,
          message: 'Connection successful',
        };

        return res.json({ success: true, data: response });
      } catch (error) {
        const response: TestIntegrationResponse = {
          success: false,
          message:
            error instanceof Error ? error.message : 'Failed to authenticate integration',
        };

        return res.json({ success: true, data: response });
      }
    } catch (error) {
      logger.error('Error testing integration config', {
        error: error instanceof Error ? error.message : error,
      });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

router.delete('/:projectId/integrations/:integrationId', async (req, res) => {
  try {
    const { projectId, integrationId } = req.params;
    const plugin = integrationRegistry.get(integrationId as TicketSystem);

    if (!plugin) {
      return res.status(404).json({ error: 'Integration not found' });
    }

    const deleted = await integrationConfigDAO.deleteConfig(
      projectId,
      integrationId as TicketSystem
    );

    if (!deleted) {
      return res.status(404).json({ error: 'Integration configuration not found' });
    }

    res.status(204).send();
  } catch (error) {
    logger.error('Error deleting integration config', {
      error: error instanceof Error ? error.message : error,
    });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================================
// Webhook configuration endpoints nested under integrations
// ============================================================================

const webhookConfigDAO = new WebhookConfigDAO();
const webhookDeliveryDAO = new WebhookDeliveryDAO();

/**
 * GET /api/projects/:projectId/integrations/:integrationId/webhook
 * Get webhook config for an integration
 */
router.get('/:projectId/integrations/:integrationId/webhook', async (req, res) => {
  try {
    const { projectId, integrationId } = req.params;
    const plugin = integrationRegistry.get(integrationId as TicketSystem);

    if (!plugin) {
      return res.status(404).json({ error: 'Integration not found' });
    }

    // Find integration record to get its ID
    const integrationRecord = await integrationConfigDAO.getConfig(
      projectId,
      integrationId as TicketSystem
    );

    if (!integrationRecord) {
      return res.json({ success: true, data: null });
    }

    const webhookConfig = await webhookConfigDAO.getByIntegrationId(
      integrationRecord.id,
      'inbound'
    );

    if (!webhookConfig) {
      return res.json({ success: true, data: null });
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
    });
  } catch (error) {
    logger.error('Error fetching integration webhook config', {
      error: error instanceof Error ? error.message : error,
    });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PUT /api/projects/:projectId/integrations/:integrationId/webhook
 * Create or update webhook config for an integration
 */
router.put('/:projectId/integrations/:integrationId/webhook', async (req, res) => {
  try {
    const { projectId, integrationId } = req.params;
    const plugin = integrationRegistry.get(integrationId as TicketSystem);

    if (!plugin) {
      return res.status(404).json({ error: 'Integration not found' });
    }

    // Find integration record
    const integrationRecord = await integrationConfigDAO.getConfig(
      projectId,
      integrationId as TicketSystem
    );

    if (!integrationRecord) {
      return res.status(404).json({ error: 'Integration not configured yet. Configure the integration first.' });
    }

    const body = req.body as {
      allowedEvents?: string[];
      autoExecute?: boolean;
      webhookSecret?: string;
      generateSecret?: boolean;
    };

    // Generate a secret if requested
    let webhookSecret = body.webhookSecret;
    if (body.generateSecret) {
      webhookSecret = crypto.randomBytes(32).toString('hex');
    }

    // Determine provider type based on integration
    const provider = integrationId === 'custom' ? 'custom' as const : integrationId as 'github' | 'jira';

    // Check if webhook config already exists
    const existing = await webhookConfigDAO.getByIntegrationId(integrationRecord.id, 'inbound');

    if (existing) {
      await webhookConfigDAO.updateConfig(existing.id, {
        allowedEvents: body.allowedEvents,
        autoExecute: body.autoExecute,
        webhookSecretEncrypted: webhookSecret,
        active: true,
      });

      const updated = await webhookConfigDAO.getConfigById(existing.id);
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
      });
    }

    // Create new webhook config
    const newConfig = await webhookConfigDAO.createConfig({
      projectId,
      provider,
      integrationId: integrationRecord.id,
      allowedEvents: body.allowedEvents || ['ticket_created'],
      autoExecute: body.autoExecute ?? false,
      webhookSecretEncrypted: webhookSecret || null,
      secretLocation: 'database',
      active: true,
    });

    res.status(201).json({
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
    });
  } catch (error) {
    logger.error('Error saving integration webhook config', {
      error: error instanceof Error ? error.message : error,
    });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/projects/:projectId/integrations/:integrationId/webhook
 * Remove webhook config for an integration
 */
router.delete('/:projectId/integrations/:integrationId/webhook', async (req, res) => {
  try {
    const { projectId, integrationId } = req.params;

    const integrationRecord = await integrationConfigDAO.getConfig(
      projectId,
      integrationId as TicketSystem
    );

    if (!integrationRecord) {
      return res.status(404).json({ error: 'Integration not found' });
    }

    const webhookConfig = await webhookConfigDAO.getByIntegrationId(integrationRecord.id, 'inbound');

    if (!webhookConfig) {
      return res.status(404).json({ error: 'Webhook configuration not found' });
    }

    await webhookConfigDAO.deleteConfig(webhookConfig.id);
    res.status(204).send();
  } catch (error) {
    logger.error('Error deleting integration webhook config', {
      error: error instanceof Error ? error.message : error,
    });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/projects/:projectId/integrations/:integrationId/deliveries
 * Get delivery history for an integration's webhook
 */
router.get('/:projectId/integrations/:integrationId/deliveries', async (req, res) => {
  try {
    const { projectId, integrationId } = req.params;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;

    const integrationRecord = await integrationConfigDAO.getConfig(
      projectId,
      integrationId as TicketSystem
    );

    if (!integrationRecord) {
      return res.json({ success: true, data: [], pagination: { limit, offset, count: 0 } });
    }

    const inboundConfigs = await webhookConfigDAO.listByIntegrationId(integrationRecord.id, {
      direction: 'inbound',
      activeOnly: false,
    });

    if (inboundConfigs.length === 0) {
      return res.json({ success: true, data: [], pagination: { limit, offset, count: 0 } });
    }

    const fetchLimit = limit + offset;
    const deliverySets = await Promise.all(
      inboundConfigs.map((config) =>
        webhookDeliveryDAO.listDeliveriesByConfig(config.id, {
          limit: fetchLimit,
          offset: 0,
          sortOrder: 'desc',
        })
      )
    );

    const deliveries = deliverySets
      .flat()
      .filter(d => d.projectId === projectId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(offset, offset + limit);

    res.json({
      success: true,
      data: deliveries.map(d => ({
        id: d.id,
        deliveryId: d.deliveryId,
        eventType: d.eventType,
        status: d.status,
        errorMessage: d.errorMessage,
        ticketId: d.ticketId,
        createdAt: d.createdAt,
        processedAt: d.processedAt,
      })),
      pagination: { limit, offset, count: deliveries.length },
    });
  } catch (error) {
    logger.error('Error fetching integration deliveries', {
      error: error instanceof Error ? error.message : error,
    });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/projects/:projectId/integrations/:integrationId/deliveries/:deliveryId/retry
 * Retry a failed delivery
 */
router.post('/:projectId/integrations/:integrationId/deliveries/:deliveryId/retry', async (req, res) => {
  try {
    const { projectId, integrationId, deliveryId } = req.params;

    const integrationRecord = await integrationConfigDAO.getConfig(
      projectId,
      integrationId as TicketSystem
    );

    if (!integrationRecord) {
      return res.status(404).json({ error: 'Integration not found' });
    }

    const inboundConfigs = await webhookConfigDAO.listByIntegrationId(integrationRecord.id, {
      direction: 'inbound',
      activeOnly: false,
    });
    if (inboundConfigs.length === 0) {
      return res.status(404).json({ error: 'Webhook configuration not found' });
    }

    const delivery = await webhookDeliveryDAO.getDeliveryById(deliveryId);
    if (!delivery) {
      return res.status(404).json({ error: 'Delivery not found' });
    }

    const inboundConfigIds = new Set(inboundConfigs.map((config) => config.id));
    if (!delivery.webhookConfigId || !inboundConfigIds.has(delivery.webhookConfigId)) {
      return res.status(404).json({ error: 'Delivery not found for this integration' });
    }

    if (delivery.status === 'succeeded') {
      return res.status(400).json({ error: 'Delivery already succeeded' });
    }

    // Reset status for retry
    await webhookDeliveryDAO.updateDeliveryStatus(deliveryId, 'failed', 'Manually retried');

    res.json({
      success: true,
      message: 'Delivery marked for retry',
    });
  } catch (error) {
    logger.error('Error retrying delivery', {
      error: error instanceof Error ? error.message : error,
    });
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
