/**
 * Shortcut webhook routes
 *
 * Handles incoming webhooks from Shortcut (formerly Clubhouse).
 */

import express, { Request, Response } from 'express';
import type { WebhookService } from '../../../webhooks/WebhookService';
import { createChildLogger } from '../../../config/logger';
import {
  getRequestRawBody,
  respondWithWebhookResult,
} from './routeHelpers';

const logger = createChildLogger({ service: 'ShortcutWebhookRoute' });

function getFirstHeaderValue(
  value: string | string[] | undefined,
): string | undefined {
  if (typeof value === 'string') {
    return value;
  }
  if (Array.isArray(value) && value.length > 0) {
    return value[0];
  }
  return undefined;
}

function hasHeader(value: string | string[] | undefined): boolean {
  return Boolean(getFirstHeaderValue(value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getPayloadField(payload: unknown, field: string): string | undefined {
  if (!isRecord(payload)) {
    return undefined;
  }

  const value = payload[field];
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim();
  return normalized || undefined;
}

function buildRequestLogContext(req: Request) {
  const deliveryId = getFirstHeaderValue(req.headers['x-shortcut-delivery']);
  const requestId = getFirstHeaderValue(req.headers['x-request-id']);
  const objectType = getPayloadField(req.body, 'object_type');
  const action = getPayloadField(req.body, 'action');

  return {
    deliveryId,
    requestId,
    tenantId: req.tenantId,
    objectType,
    action,
    hasPayloadSignature: hasHeader(req.headers['payload-signature']),
    hasShortcutSignature: hasHeader(req.headers['x-shortcut-signature']),
    userAgent: getFirstHeaderValue(req.headers['user-agent']),
  };
}

/**
 * POST /api/webhooks/shortcut
 *
 * Shortcut webhook endpoint for receiving events from Shortcut.
 * Handles story events (created, updated, deleted) and comment events.
 *
 * Processing:
 * 1. Raw body is captured by app-level JSON parser verify hook
 * 2. WebhookService performs provider-aware signature verification
 * 3. WebhookService processes the event
 */
export function createShortcutRoutes(getWebhookService: () => WebhookService) {
  const router = express.Router();

  router.post(
    '/',
    async (req: Request, res: Response) => {
      const requestContext = buildRequestLogContext(req);
      try {
        logger.info('Shortcut webhook request received', requestContext);

        const service = getWebhookService();

        const rawBody = getRequestRawBody(req);
        logger.debug('Shortcut webhook raw body resolved', {
          ...requestContext,
          rawBodyBytes: rawBody.length,
        });

        const result = await service.processWebhook(
          req.headers,
          req.body,
          rawBody,
          req.tenantId,
          { providerName: 'shortcut' },
        );

        const resultContext = {
          ...requestContext,
          status: result.status,
          reason: result.reason,
          existingId: result.existingId,
          ticketId: result.ticketId,
          jobId: result.jobId,
        };

        if (result.status === 'rejected' || result.status === 'failed') {
          logger.warn('Shortcut webhook processed with non-success status', resultContext);
        } else {
          logger.info('Shortcut webhook processed', resultContext);
        }

        return respondWithWebhookResult(res, result);
      } catch (error) {
        logger.error('Shortcut webhook route failed', {
          ...requestContext,
          error: error instanceof Error ? error.message : String(error),
        });
        return res.status(500).json({
          error: 'Failed to process webhook',
        });
      }
    }
  );

  return router;
}
