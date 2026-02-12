/**
 * GitHub webhook routes
 *
 * Handles incoming webhooks from GitHub.
 */

import express, { Request, Response } from 'express';
import type { WebhookService } from '../../../webhooks/WebhookService';
import { getRequestRawBody, respondWithWebhookResult } from './routeHelpers';

/**
 * POST /api/webhooks/github
 *
 * GitHub webhook endpoint for receiving events from GitHub.
 * Handles issues and issue_comment events.
 *
 * Processing:
 * 1. Raw body is captured by app-level JSON parser verify hook
 * 2. WebhookService performs provider-aware signature verification
 * 3. WebhookService processes the event
 */
export function createGitHubRoutes(getWebhookService: () => WebhookService) {
  const router = express.Router();

  router.post(
    '/',
    async (req: Request, res: Response) => {
      try {
        const service = getWebhookService();

        const rawBody = getRequestRawBody(req);

        const result = await service.processWebhook(
          req.headers,
          req.body,
          rawBody,
          req.tenantId,
          { providerName: 'github' },
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
