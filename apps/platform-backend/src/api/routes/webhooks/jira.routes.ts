/**
 * Jira webhook routes
 *
 * Handles incoming webhooks from Jira.
 */

import express, { Request, Response } from 'express';
import { rawBodyStorageMiddleware } from '../../../webhooks/middleware/rawBody';
import { createSignatureMiddleware } from '../../../webhooks/middleware/signature';
import type { WebhookService } from '../../../webhooks/WebhookService';
import {
  createSha256SignatureValidator,
  getRequestRawBody,
  respondWithWebhookResult,
} from './routeHelpers';

/**
 * POST /api/webhooks/jira
 *
 * Jira webhook endpoint for receiving events from Jira.
 * Handles issue events (created, updated, deleted) and comment events.
 *
 * Middleware chain:
 * 1. Raw body parser (captures bytes for signature verification)
 * 2. Signature verification (validates HMAC-SHA256 signature if configured)
 * 3. Webhook processing (via WebhookService)
 */
export function createJiraRoutes(getWebhookService: () => WebhookService) {
  const router = express.Router();

  router.post(
    '/',
    rawBodyStorageMiddleware(),
    createSignatureMiddleware({
      validator: createSha256SignatureValidator('x-atlassian-webhook-signature'),
      getSecret: async () => {
        return process.env.JIRA_WEBHOOK_SECRET || '';
      },
      // Allow requests without signatures for Jira Cloud (JWT verification can be added later)
      optional: !process.env.JIRA_WEBHOOK_SECRET,
    }),
    async (req: Request, res: Response) => {
      try {
        const service = getWebhookService();

        const rawBody = getRequestRawBody(req);

        const result = await service.processWebhook(
          req.headers as Record<string, string>,
          req.body,
          rawBody,
          req.tenantId
        );

        return respondWithWebhookResult(res, result);
      } catch (error) {
        console.error('Error processing Jira webhook:', error);
        return res.status(500).json({
          error: 'Failed to process webhook',
        });
      }
    }
  );

  return router;
}
