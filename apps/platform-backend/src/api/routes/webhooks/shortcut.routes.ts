/**
 * Shortcut webhook routes
 *
 * Handles incoming webhooks from Shortcut (formerly Clubhouse).
 */

import express, { Request, Response } from "express";
import { rawBodyStorageMiddleware } from "../../../webhooks/middleware/rawBody";
import { createSignatureMiddleware } from "../../../webhooks/middleware/signature";
import type { WebhookService } from "../../../webhooks/WebhookService";
import { SignatureValidator } from "../../../webhooks/validators";

const router = express.Router();

/**
 * POST /api/webhooks/shortcut
 *
 * Shortcut webhook endpoint for receiving events from Shortcut.
 * Handles story events (created, updated, deleted) and comment events.
 *
 * Middleware chain:
 * 1. Raw body parser (captures bytes for signature verification)
 * 2. Signature verification (validates HMAC-SHA256 signature)
 * 3. Webhook processing (via WebhookService)
 */
export function createShortcutRoutes(getWebhookService: () => WebhookService) {
  router.post(
    "/",
    rawBodyStorageMiddleware(),
    createSignatureMiddleware({
      validator: {
        verify: (payload: Buffer, signature: string, secret: string) => {
          const crypto = require("crypto");
          const receivedSignature = signature.startsWith("sha256=")
            ? signature.slice(7)
            : signature;

          const hmac = crypto.createHmac("sha256", secret);
          hmac.update(payload);
          const expectedSignature = hmac.digest("hex");

          return receivedSignature === expectedSignature;
        },
        getHeaderName: () => "x-shortcut-signature",
      } as SignatureValidator,
      getSecret: async () => {
        return process.env.SHORTCUT_WEBHOOK_SECRET || "";
      },
      // Allow requests without signatures if not configured
      optional: !process.env.SHORTCUT_WEBHOOK_SECRET,
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
        console.error("Error processing Shortcut webhook:", error);
        return res.status(500).json({
          error: "Failed to process webhook",
        });
      }
    },
  );

  return router;
}

export default router;
