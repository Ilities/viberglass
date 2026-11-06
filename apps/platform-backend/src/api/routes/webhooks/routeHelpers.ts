import type { Request, Response } from 'express';
import type { WebhookProcessingResult } from '../../../webhooks/WebhookService';
import type { ExtendedRequest } from '../../../webhooks/ExtendedRequest';

export interface WebhookResultResponseOptions {
  duplicateMessage?: string;
  includeExistingId?: boolean;
  failedError?: string;
  failedStatusCode?: number;
  unknownError?: string;
}

/**
 * Send standardized HTTP responses for webhook processing results.
 */
export function respondWithWebhookResult(
  res: Response,
  result: WebhookProcessingResult,
  options: WebhookResultResponseOptions = {},
): Response {
  const {
    duplicateMessage = 'Duplicate delivery',
    includeExistingId = true,
    failedError = 'Webhook processing failed',
    failedStatusCode = 500,
    unknownError = 'Unknown webhook status',
  } = options;

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
        message: duplicateMessage,
        ...(includeExistingId ? { existingId: result.existingId } : {}),
      });
    case 'invalid':
      return res.status(400).json({
        error: 'Invalid webhook payload',
        reason: result.reason,
      });
    case 'not_found':
      return res.status(404).json({
        error: 'Webhook configuration not found',
      });
    case 'handshake':
      // The sender opened the webhook and waits for its secret echoed back.
      res.setHeader('X-Hook-Secret', result.secret ?? '');
      return res.status(200).json({
        message: 'Webhook handshake complete',
      });
    case 'failed':
      return res.status(failedStatusCode).json({
        error: failedError,
        reason: result.reason,
      });
    default:
      return res.status(500).json({
        error: unknownError,
      });
  }
}

export function getRequestRawBody(req: Request): Buffer {
  const rawBody = (req as ExtendedRequest).rawBody;
  if (!rawBody || rawBody.length === 0) {
    throw new Error('Missing raw body for webhook request');
  }

  return rawBody;
}

/**
 * The raw body, or an empty buffer when there is none. A webhook handshake can
 * arrive with no body, and the service still has to see its headers.
 */
export function getWebhookRawBody(req: Request): Buffer {
  return (req as ExtendedRequest).rawBody ?? Buffer.alloc(0);
}
