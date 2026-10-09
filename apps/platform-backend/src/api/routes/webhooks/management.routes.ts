/**
 * Webhook management routes
 *
 * Handles webhook operational status endpoints.
 */

import express, { Request, Response } from 'express';
import { WebhookConfigDAO } from '../../../persistence/webhook/WebhookConfigDAO';
import { WebhookDeliveryDAO } from '../../../persistence/webhook/WebhookDeliveryDAO';
import type { WebhookService } from '../../../webhooks/WebhookService';
import { integrationRegistry } from '../../../integrations/registerIntegrationPlugins';
import { webhookReceiversFrom } from '../../../webhooks/webhookReceivers';

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

      const configs = await configDAO.listActiveConfigs(10);
      const providers: Record<string, { configured: boolean; stats: unknown }> = {};
      for (const provider of webhookReceiversFrom(integrationRegistry).providers()) {
        providers[provider] = {
          configured: configs.some((c) => c.provider === provider),
          stats: await deliveryDAO.getDeliveryStatsByProvider(provider),
        };
      }

      res.json({
        status: 'operational',
        providers,
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
