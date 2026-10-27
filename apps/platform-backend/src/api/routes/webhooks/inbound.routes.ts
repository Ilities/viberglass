/**
 * POST /api/webhooks/:provider/:configId
 *
 * Receives every integration's webhook deliveries. The provider names the
 * integration that signs, parses and reads them; the config id is the webhook.
 */

import express, { Request, Response } from 'express';
import type { WebhookDeliveryProcessor } from '../../../webhooks/WebhookDeliveryProcessor';
import { createChildLogger } from '../../../config/logger';
import type { ExtendedRequest } from '../../../webhooks/ExtendedRequest';
import { respondWithWebhookResult } from './routeHelpers';

const logger = createChildLogger({ service: 'InboundWebhookRoute' });

export function createInboundRoutes(getDeliveryProcessor: () => Pick<WebhookDeliveryProcessor, 'process'>) {
  const router = express.Router();

  router.post('/:provider/:configId', async (req: Request, res: Response) => {
    const { provider, configId } = req.params;
    const context = { provider, configId, tenantId: req.tenantId };
    try {
      const result = await getDeliveryProcessor().process(
        req.headers,
        req.body,
        // A handshake has no body, and a delivery without one fails its signature check.
        (req as ExtendedRequest).rawBody ?? Buffer.alloc(0),
        req.tenantId,
        { providerName: provider, configId },
      );
      if (result.status === 'handshake') {
        return res.status(200).set('X-Hook-Secret', result.handshakeSecret ?? '').end();
      }
      const outcome = { ...context, status: result.status, reason: result.reason, ticketId: result.ticketId };
      if (result.status === 'rejected' || result.status === 'failed' || result.status === 'invalid') {
        logger.warn('Webhook delivery not processed', outcome);
      } else {
        logger.info('Webhook delivery handled', outcome);
      }
      return respondWithWebhookResult(res, result);
    } catch (error) {
      logger.error('Webhook route failed', { ...context, error: error instanceof Error ? error.message : String(error) });
      return res.status(500).json({ error: 'Failed to process webhook' });
    }
  });

  return router;
}
