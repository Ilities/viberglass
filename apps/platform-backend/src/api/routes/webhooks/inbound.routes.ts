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
import { configuredIntegrationPlugins } from '../../../integrations/configuredIntegrationPlugins';

const logger = createChildLogger({ service: 'InboundWebhookRoute' });

export function createInboundRoutes(getWebhookService: () => Pick<WebhookService, 'processWebhook'>) {
  const router = express.Router();

  router.post('/:provider/:configId', async (req: Request, res: Response) => {
    const { provider, configId } = req.params;
    const context = { provider, configId, tenantId: req.tenantId };
    try {
      const receiver = configuredIntegrationPlugins.find((plugin) => plugin.id === provider)?.webhook;
      const handshake = receiver?.handshakeHeaders?.(normalizeHeaders(req.headers));
      if (handshake) return res.set(handshake).status(200).end();
      const result = await getWebhookService().processWebhook(
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

function normalizeHeaders(headers: Request['headers']): Record<string, string> {
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (typeof value === 'string') normalized[key.toLowerCase()] = value;
    else if (Array.isArray(value)) normalized[key.toLowerCase()] = value[0] ?? '';
  }
  return normalized;
}
