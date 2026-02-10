/**
 * Webhook management routes
 *
 * Handles webhook configuration, status, and delivery management.
 */

import express, { Request, Response } from 'express';
import {
  WebhookConfigDAO,
  type WebhookProvider,
} from '../../../persistence/webhook/WebhookConfigDAO';
import { WebhookDeliveryDAO } from '../../../persistence/webhook/WebhookDeliveryDAO';
import type { WebhookService } from '../../../webhooks/WebhookService';
import { respondWithWebhookResult } from './routeHelpers';

const SHORTCUT_PROVIDER: WebhookProvider = 'shortcut';

/**
 * Serialize webhook config for API response
 */
const serializeWebhookConfig = (config: {
  id: string;
  projectId: string | null;
  provider: string;
  providerProjectId: string | null;
  secretLocation: string;
  secretPath: string | null;
  webhookSecretEncrypted: string | null;
  apiTokenEncrypted: string | null;
  allowedEvents: string[];
  autoExecute: boolean;
  botUsername: string | null;
  labelMappings: Record<string, unknown>;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}) => ({
  id: config.id,
  projectId: config.projectId,
  provider: config.provider,
  providerProjectId: config.providerProjectId,
  secretLocation: config.secretLocation,
  secretPath: config.secretPath,
  webhookSecretEncrypted: config.webhookSecretEncrypted,
  apiTokenEncrypted: config.apiTokenEncrypted,
  allowedEvents: config.allowedEvents,
  autoExecute: config.autoExecute,
  botUsername: config.botUsername,
  labelMappings: config.labelMappings,
  active: config.active,
  createdAt: config.createdAt,
  updatedAt: config.updatedAt,
});

/**
 * Create management routes
 */
export function createManagementRoutes(getWebhookService: () => WebhookService) {
  const router = express.Router();

  /**
   * GET /api/webhooks/status
   *
   * Get webhook processing status and statistics
   */
  router.get('/status', async (req: Request, res: Response) => {
    try {
      const service = getWebhookService();
      const configDAO = new WebhookConfigDAO();
      const deliveryDAO = new WebhookDeliveryDAO();

      // Get failed deliveries count
      const failedDeliveries = await service.getFailedDeliveries(100);

      // Get delivery stats by provider
      const githubStats = await deliveryDAO.getDeliveryStatsByProvider('github');
      const jiraStats = await deliveryDAO.getDeliveryStatsByProvider('jira');
      const shortcutStats =
        await deliveryDAO.getDeliveryStatsByProvider(SHORTCUT_PROVIDER);

      // Get active configurations
      const configs = await configDAO.listActiveConfigs(10);

      res.json({
        status: 'operational',
        providers: {
          github: {
            configured: configs.some((c) => c.provider === 'github'),
            stats: githubStats,
          },
          jira: {
            configured: configs.some((c) => c.provider === 'jira'),
            stats: jiraStats,
          },
          shortcut: {
            configured: configs.some((c) => c.provider === SHORTCUT_PROVIDER),
            stats: shortcutStats,
          },
          custom: {
            configured: configs.some((c) => c.provider === 'custom'),
            stats: null,
          },
        },
        failedDeliveries: {
          count: failedDeliveries.length,
          recent: failedDeliveries.slice(0, 10).map((d) => ({
            id: d.id,
            deliveryId: d.deliveryId,
            eventType: d.eventType,
            errorMessage: d.errorMessage,
            createdAt: d.createdAt,
          })),
        },
      });
    } catch (error) {
      console.error('Error getting webhook status:', error);
      res.status(500).json({
        error: 'Failed to get webhook status',
      });
    }
  });

  /**
   * GET /api/webhooks/configs
   *
   * List all webhook configurations
   */
  router.get('/configs', async (req: Request, res: Response) => {
    try {
      const configDAO = new WebhookConfigDAO();
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;
      const projectId = req.query.projectId as string | undefined;

      const configs = projectId
        ? await configDAO.listConfigsByProject(projectId, limit, offset)
        : await configDAO.listActiveConfigs(limit, offset);

      res.json({
        configs: configs.map(serializeWebhookConfig),
        count: configs.length,
      });
    } catch (error) {
      console.error('Error listing webhook configs:', error);
      res.status(500).json({
        error: 'Failed to list webhook configurations',
      });
    }
  });

  /**
   * POST /api/webhooks/configs
   *
   * Create a new webhook configuration
   */
  router.post('/configs', async (req: Request, res: Response) => {
    try {
      const configDAO = new WebhookConfigDAO();

      const config = await configDAO.createConfig({
        provider: req.body.provider,
        providerProjectId: req.body.providerProjectId,
        projectId: req.body.projectId || req.tenantId || null,
        secretLocation: req.body.secretLocation || 'database',
        secretPath: req.body.secretPath || null,
        webhookSecretEncrypted: req.body.webhookSecret,
        apiTokenEncrypted: req.body.apiToken,
        allowedEvents:
          req.body.allowedEvents || ['issues.opened', 'issue_comment.created'],
        autoExecute: req.body.autoExecute || false,
        botUsername: req.body.botUsername || null,
        labelMappings: req.body.labelMappings || {},
        active: req.body.active !== false,
      });

      res.status(201).json(serializeWebhookConfig(config));
    } catch (error) {
      console.error('Error creating webhook config:', error);
      res.status(500).json({
        error: 'Failed to create webhook configuration',
      });
    }
  });

  /**
   * PUT /api/webhooks/configs/:id
   *
   * Update an existing webhook configuration
   */
  router.put('/configs/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const configDAO = new WebhookConfigDAO();

      const existing = await configDAO.getConfigById(id);
      if (!existing) {
        return res.status(404).json({ error: 'Webhook configuration not found' });
      }

      await configDAO.updateConfig(id, {
        projectId: req.body.projectId,
        provider: req.body.provider,
        providerProjectId: req.body.providerProjectId,
        secretLocation: req.body.secretLocation,
        secretPath: req.body.secretPath,
        webhookSecretEncrypted: req.body.webhookSecret,
        apiTokenEncrypted: req.body.apiToken,
        allowedEvents: req.body.allowedEvents,
        autoExecute: req.body.autoExecute,
        botUsername: req.body.botUsername,
        labelMappings: req.body.labelMappings,
        active: req.body.active,
      });

      const updated = await configDAO.getConfigById(id);
      if (!updated) {
        return res.status(404).json({ error: 'Webhook configuration not found' });
      }

      res.json(serializeWebhookConfig(updated));
    } catch (error) {
      console.error('Error updating webhook config:', error);
      res.status(500).json({
        error: 'Failed to update webhook configuration',
      });
    }
  });

  /**
   * DELETE /api/webhooks/configs/:id
   *
   * Delete a webhook configuration
   */
  router.delete('/configs/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const configDAO = new WebhookConfigDAO();

      const deleted = await configDAO.deleteConfig(id);

      if (!deleted) {
        return res.status(404).json({
          error: 'Webhook configuration not found',
        });
      }

      res.json({
        message: 'Webhook configuration deleted',
        id,
      });
    } catch (error) {
      console.error('Error deleting webhook config:', error);
      res.status(500).json({
        error: 'Failed to delete webhook configuration',
      });
    }
  });

  /**
   * GET /api/webhooks/deliveries
   *
   * List webhook deliveries
   */
  router.get('/deliveries', async (req: Request, res: Response) => {
    try {
      const deliveryDAO = new WebhookDeliveryDAO();
      const limit = parseInt(req.query.limit as string) || 50;
      const status = req.query.status as string | undefined;

      // Get pending deliveries (includes failed ones)
      const deliveries = await deliveryDAO.getPendingDeliveries(limit);
      
      // Filter by status if requested
      const filteredDeliveries = status === 'failed' 
        ? deliveries.filter(d => d.status === 'failed')
        : deliveries;

      res.json({
        deliveries: filteredDeliveries.map((d: typeof filteredDeliveries[0]) => ({
          id: d.id,
          deliveryId: d.deliveryId,
          provider: d.provider,
          eventType: d.eventType,
          status: d.status,
          errorMessage: d.errorMessage,
          ticketId: d.ticketId,
          createdAt: d.createdAt,
          processedAt: d.processedAt,
        })),
        count: deliveries.length,
      });
    } catch (error) {
      console.error('Error listing webhook deliveries:', error);
      res.status(500).json({
        error: 'Failed to list webhook deliveries',
      });
    }
  });

  /**
   * POST /api/webhooks/deliveries/:deliveryId/retry
   *
   * Retry a failed webhook delivery
   */
  router.post('/deliveries/:deliveryId/retry', async (req: Request, res: Response) => {
    try {
      const { deliveryId } = req.params;
      const service = getWebhookService();

      const result = await service.retryDelivery(deliveryId);
      return respondWithWebhookResult(res, result, {
        duplicateMessage: 'Delivery already succeeded',
        includeExistingId: false,
        failedError: 'Retry failed',
        failedStatusCode: 400,
        unknownError: 'Unknown retry status',
      });
    } catch (error) {
      console.error('Error retrying webhook delivery:', error);
      res.status(500).json({
        error: 'Failed to retry webhook',
      });
    }
  });

  /**
   * POST /api/webhooks/trigger-autofix
   *
   * @deprecated Use webhook-based auto-triggering instead
   */
  router.post('/trigger-autofix', async (req: Request, res: Response) => {
    res.status(200).json({
      message: 'Auto-fix triggered',
      note: 'This endpoint is deprecated. Use webhooks with bot mentions instead.',
    });
  });

  return router;
}
