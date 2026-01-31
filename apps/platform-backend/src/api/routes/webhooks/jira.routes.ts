/**
 * Jira webhook routes
 *
 * Handles incoming webhooks from Jira.
 */

import express, { Request, Response } from "express";
import { rawBodyStorageMiddleware } from "../../../webhooks/middleware/rawBody";
import { createSignatureMiddleware } from "../../../webhooks/middleware/signature";
import type { WebhookService } from "../../../webhooks/WebhookService";
import { SignatureValidator } from "../../../webhooks/validators";

const router = express.Router();

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
  router.post(
    "/",
    rawBodyStorageMiddleware(),
    createSignatureMiddleware({
      validator: {
        verify: (payload: Buffer, signature: string, secret: string) => {
          // Simple HMAC-SHA256 verification for Jira
          const crypto = require("crypto");
          const receivedSignature = signature.startsWith("sha256=")
            ? signature.slice(7)
            : signature;

          const hmac = crypto.createHmac("sha256", secret);
          hmac.update(payload);
          const expectedSignature = hmac.digest("hex");

          return receivedSignature === expectedSignature;
        },
        getHeaderName: () => "x-atlassian-webhook-signature",
      } as SignatureValidator,
      getSecret: async () => {
        return process.env.JIRA_WEBHOOK_SECRET || "";
      },
      // Allow requests without signatures for Jira Cloud (JWT verification can be added later)
      optional: !process.env.JIRA_WEBHOOK_SECRET,
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
          req.tenantId,
        );

        // Return appropriate response based on result status
        switch (result.status) {
          case "processed":
            return res.status(200).json({
              message: "Webhook processed successfully",
              ticketId: result.ticketId,
              jobId: result.jobId,
            });

          case "ignored":
            return res.status(200).json({
              message: "Webhook ignored",
              reason: result.reason,
            });

          case "rejected":
            return res.status(401).json({
              error: "Webhook rejected",
              reason: result.reason,
            });

          case "duplicate":
            return res.status(200).json({
              message: "Duplicate delivery",
              existingId: result.existingId,
            });

          case "failed":
            return res.status(500).json({
              error: "Webhook processing failed",
              reason: result.reason,
            });

          default:
            return res.status(500).json({
              error: "Unknown webhook status",
            });
        }
      } catch (error) {
        console.error("Error processing Jira webhook:", error);
        return res.status(500).json({
          error: "Failed to process webhook",
        });
      }
    },
  );

  return router;
}

export default router;
