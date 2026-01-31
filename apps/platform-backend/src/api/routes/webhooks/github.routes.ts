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

const router = express.Router();

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

        // Cast rawBody from request
        const rawBody = (req as any).rawBody as Buffer;

        const result = await service.processWebhook(
          req.headers as Record<string, string>,
          req.body,
          rawBody,
          req.tenantId
        );

        // Return appropriate response based on result status
        switch (result.status) {
          case 'processed':
            return res.status(200).json({
              message: 'Webhook processed successfully',
              ticketId: result.ticketId,
              jobId: result.jobId,
            });

          case 'ignored':
            return res.status(200).json({
              message: 'Webhook ignored',
              reason: result.reason,
            });

          case 'rejected':
            return res.status(401).json({
              error: 'Webhook rejected',
              reason: result.reason,
            });

          case 'duplicate':
            return res.status(200).json({
              message: 'Duplicate delivery',
              existingId: result.existingId,
            });

          case 'failed':
            return res.status(500).json({
              error: 'Webhook processing failed',
              reason: result.reason,
            });

          default:
            return res.status(500).json({
              error: 'Unknown webhook status',
            });
        }
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

export default router;
