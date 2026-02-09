/**
 * GitHub webhook routes
 *
 * Handles incoming webhooks from GitHub.
 */

import express, { Request, Response } from 'express';
import { rawBodyStorageMiddleware } from '../../../webhooks/middleware/rawBody';
import { createSignatureMiddleware } from '../../../webhooks/middleware/signature';
import { SignatureValidatorFactory } from '../../../webhooks/validators';
import type { WebhookService } from '../../../webhooks/WebhookService';
import { getRequestRawBody, respondWithWebhookResult } from './routeHelpers';

/**
 * POST /api/webhooks/github
 *
 * GitHub webhook endpoint for receiving events from GitHub.
 * Handles issues and issue_comment events.
 *
 * Middleware chain:
 * 1. Raw body parser (captures bytes for signature verification)
 * 2. Signature verification (validates HMAC-SHA256 signature)
 * 3. Webhook processing (via WebhookService)
 */
export function createGitHubRoutes(getWebhookService: () => WebhookService) {
  const router = express.Router();

  router.post(
    '/',
    rawBodyStorageMiddleware(),
    createSignatureMiddleware({
      validator: SignatureValidatorFactory.forGitHub(),
      getSecret: async () => {
        // Default secret for now - per-request secret lookup in handler
        return process.env.GITHUB_WEBHOOK_SECRET || '';
      },
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
        console.error('Error processing GitHub webhook:', error);
        return res.status(500).json({
          error: 'Failed to process webhook',
        });
      }
    }
  );

  return router;
}
