/**
 * Custom webhook routes
 *
 * Handles incoming webhooks from custom integrations.
 */

import express, { Request, Response } from 'express';
import crypto from 'crypto';
import { WebhookConfigDAO } from '../../../persistence/webhook/WebhookConfigDAO';
import { WebhookDeliveryDAO } from '../../../persistence/webhook/WebhookDeliveryDAO';
import { TicketDAO } from '../../../persistence/ticketing/TicketDAO';
import { CustomWebhookProvider } from '../../../webhooks/providers/custom-provider';

const router = express.Router();

/**
 * POST /api/webhooks/custom/:configId
 *
 * Inbound webhook endpoint for custom integrations.
 * Verifies HMAC-SHA256 signature and creates a ticket from the payload.
 *
 * Expected payload:
 * {
 *   "title": "string (required)",
 *   "description": "string (required)",
 *   "severity": "low | medium | high | critical (optional, default: medium)",
 *   "category": "string (optional, default: 'bug')",
 *   "externalId": "string (optional, for deduplication)",
 *   "url": "string (optional, link back to source)"
 * }
 *
 * Headers:
 * - X-Webhook-Signature-256: sha256=<hex_digest> (HMAC-SHA256 of body)
 */
export function createCustomRoutes() {
  router.post(
    '/:configId',
    express.json(),
    async (req: Request, res: Response) => {
      try {
        const { configId } = req.params;
        const configDAO = new WebhookConfigDAO();
        const deliveryDAO = new WebhookDeliveryDAO();
        const ticketDAO = new TicketDAO();

        // Look up the webhook config
        const config = await configDAO.getConfigById(configId);
        if (!config || !config.active || config.provider !== 'custom') {
          return res.status(404).json({ error: 'Webhook configuration not found' });
        }

        // Verify signature if a secret is configured
        if (config.webhookSecretEncrypted) {
          const signature = req.headers['x-webhook-signature-256'] as string;
          if (!signature) {
            return res.status(401).json({ error: 'Missing X-Webhook-Signature-256 header' });
          }

          const provider = new CustomWebhookProvider({
            type: 'custom',
            secretLocation: 'database',
            algorithm: 'sha256',
            allowedEvents: ['ticket_created'],
            webhookSecret: config.webhookSecretEncrypted,
          });

          const bodyBuffer = Buffer.from(JSON.stringify(req.body));
          const isValid = provider.verifySignature(bodyBuffer, signature, config.webhookSecretEncrypted);
          if (!isValid) {
            return res.status(401).json({ error: 'Invalid webhook signature' });
          }
        }

        // Parse and validate the payload
        const body = req.body as Record<string, unknown>;
        if (!body.title || typeof body.title !== 'string') {
          return res.status(400).json({ error: 'Missing required field: title' });
        }
        if (!body.description || typeof body.description !== 'string') {
          return res.status(400).json({ error: 'Missing required field: description' });
        }

        const severity = (body.severity as string) || 'medium';
        if (!['low', 'medium', 'high', 'critical'].includes(severity)) {
          return res.status(400).json({ error: 'Invalid severity. Must be: low, medium, high, or critical' });
        }

        const deliveryId =
          (req.headers['x-webhook-delivery-id'] as string) ||
          crypto.randomUUID();

        // Check for duplicate delivery
        const exists = await deliveryDAO.checkDeliveryExists(deliveryId);
        if (exists) {
          return res.status(200).json({ message: 'Duplicate delivery', deliveryId });
        }

        // Record the delivery attempt
        const delivery = await deliveryDAO.recordDeliveryAttempt({
          provider: 'custom',
          deliveryId,
          eventType: 'ticket_created',
          payload: body as Record<string, unknown>,
        });

        // Create the ticket
        const projectId = config.projectId;
        if (!projectId) {
          await deliveryDAO.updateDeliveryStatus(delivery.id, 'failed', 'No project linked to webhook config');
          return res.status(400).json({ error: 'No project linked to this webhook configuration' });
        }

        const ticket = await ticketDAO.createTicket({
          projectId,
          title: body.title as string,
          description: body.description as string,
          severity: severity as 'low' | 'medium' | 'high' | 'critical',
          category: (body.category as string) || 'bug',
          metadata: {
            timestamp: new Date().toISOString(),
            timezone: 'UTC',
          },
          annotations: [],
          ticketSystem: 'custom',
          autoFixRequested: config.autoExecute || false,
        });

        // Set external ticket fields if provided
        if (body.externalId || body.url) {
          await ticketDAO.updateTicket(ticket.id, {
            externalTicketId: (body.externalId as string) || undefined,
            externalTicketUrl: (body.url as string) || undefined,
          });
        }

        // Update delivery with ticket info
        await deliveryDAO.updateDeliveryStatus(delivery.id, 'succeeded');
        await deliveryDAO.linkDeliveryToTicketById(delivery.id, ticket.id, projectId);

        return res.status(200).json({
          message: 'Webhook processed successfully',
          ticketId: ticket.id,
          deliveryId,
        });
      } catch (error) {
        console.error('Error processing custom webhook:', error);
        return res.status(500).json({
          error: 'Failed to process webhook',
        });
      }
    }
  );

  return router;
}

export default router;
