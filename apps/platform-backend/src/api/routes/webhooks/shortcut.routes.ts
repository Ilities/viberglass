/**
 * Shortcut webhook routes
 *
 * Handles incoming webhooks from Shortcut (formerly Clubhouse).
 */

import express, { Request, Response } from 'express';
import { isObjectRecord } from '@viberglass/types';
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

function truncateForLog(value: string, maxLength = 12000): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength)}...[truncated ${value.length - maxLength} chars]`;
}

function serializePayloadForLog(payload: unknown): string | undefined {
  try {
    return truncateForLog(JSON.stringify(payload));
  } catch {
    return undefined;
  }
}

function getPayloadField(payload: unknown, field: string): string | undefined {
  if (!isObjectRecord(payload)) {
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
  const rawConfigId = req.params.configId;
  const configId =
    typeof rawConfigId === 'string' && rawConfigId.trim().length > 0
      ? rawConfigId.trim()
      : undefined;

  return {
    deliveryId,
    requestId,
    configId,
    tenantId: req.tenantId,
    objectType,
    action,
    hasPayloadSignature: hasHeader(req.headers['payload-signature']),
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

  async function handleShortcutWebhook(req: Request, res: Response) {
    const rawConfigId = req.params.configId;
    const configId =
      typeof rawConfigId === 'string' && rawConfigId.trim().length > 0
        ? rawConfigId.trim()
        : undefined;

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
        {
          providerName: 'shortcut',
          ...(configId ? { configId } : {}),
        },
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

      if (
        result.status === 'ignored' &&
        typeof result.reason === 'string' &&
        result.reason.startsWith('Event parsing failed:')
      ) {
        logger.warn('Shortcut webhook parse failure payload snapshot', {
          ...requestContext,
          reason: result.reason,
          payload: req.body,
          payloadJson: serializePayloadForLog(req.body),
          rawBodyUtf8: truncateForLog(rawBody.toString('utf8')),
          rawBodyBytes: rawBody.length,
        });
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

  router.post(
    '/',
    handleShortcutWebhook,
  );

  router.post(
    '/:configId',
    handleShortcutWebhook,
  );

  return router;
}
