/**
 * Webhook management routes
 *
 * Handles webhook operational status endpoints.
 */

import express, { Request, Response } from 'express';
import {
  WebhookConfigDAO,
  type WebhookProvider,
} from '../../../persistence/webhook/WebhookConfigDAO';
import { WebhookDeliveryDAO } from '../../../persistence/webhook/WebhookDeliveryDAO';
import type { WebhookService } from '../../../webhooks/WebhookService';

const SHORTCUT_PROVIDER: WebhookProvider = 'shortcut';

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

  return router;
}
