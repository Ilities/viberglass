/**
 * POST /api/webhooks/:provider/:configId
 *
 * Receives every integration's webhook deliveries. The provider names the
 * integration that signs, parses and reads them; the config id is the webhook.
 */

import express, { Request, Response } from 'express';
import type { WebhookService } from '../../../webhooks/WebhookService';
import { createChildLogger } from '../../../config/logger';
import { getRequestRawBody, respondWithWebhookResult } from './routeHelpers';

const logger = createChildLogger({ service: 'InboundWebhookRoute' });

type InboundWebhookService = Pick<WebhookService, 'processWebhook'> & Partial<Pick<WebhookService, 'handshake'>>

export function createInboundRoutes(getWebhookService: () => InboundWebhookService) {
  const router = express.Router();

  router.post('/:provider/:configId', async (req: Request, res: Response) => {
    const { provider, configId } = req.params;
    const context = { provider, configId, tenantId: req.tenantId };
    try {
      const service = getWebhookService();
      const handshake = service.handshake?.(provider, req.headers);
      if (handshake) {
        logger.info('Webhook handshake answered', context);
        return res.status(200).set(handshake).send();
      }
      const result = await service.processWebhook(
        req.headers,
        req.body,
        getRequestRawBody(req),
        req.tenantId,
        { providerName: provider, configId },
      );
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
