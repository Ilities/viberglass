/**
 * Custom webhook provider for receiving tickets from external systems.
 *
 * Accepts a fixed JSON payload format and creates tickets.
 * Uses HMAC-SHA256 signature verification via X-Webhook-Signature-256 header.
 */

import crypto from 'crypto';
import type { AxiosInstance } from 'axios';
import { BaseWebhookProvider } from './BaseWebhookProvider';
import type {
  ParsedWebhookEvent,
  WebhookProviderConfig,
  WebhookResult,
} from '../WebhookProvider';

export class CustomWebhookProvider extends BaseWebhookProvider {
  readonly name = 'custom';

  constructor(config: WebhookProviderConfig) {
    super(config);
  }

  /**
   * Parse custom webhook payload into standardized format.
   *
   * Expected payload:
   * {
   *   "title": "string (required)",
   *   "description": "string (required)",
   *   "severity": "low | medium | high | critical (optional)",
   *   "category": "string (optional)",
   *   "externalId": "string (optional)",
   *   "url": "string (optional)"
   * }
   */
  parseEvent(
    payload: unknown,
    headers: Record<string, string>
  ): ParsedWebhookEvent {
    const data = payload as Record<string, unknown>;
    const deliveryId =
      (headers['x-webhook-delivery-id'] as string) ||
      crypto.randomUUID();

    if (!data.title || typeof data.title !== 'string') {
      throw new Error('Missing required field: title');
    }

    if (!data.description || typeof data.description !== 'string') {
      throw new Error('Missing required field: description');
    }

    const severity = data.severity as string | undefined;
    if (severity && !['low', 'medium', 'high', 'critical'].includes(severity)) {
      throw new Error('Invalid severity value. Must be: low, medium, high, or critical');
    }

    return {
      provider: 'custom',
      eventType: 'ticket_created',
      deduplicationId: deliveryId,
      timestamp: new Date().toISOString(),
      payload,
      metadata: {
        issueKey: (data.externalId as string) || undefined,
        action: 'created',
      },
    };
  }

  /**
   * Verify HMAC-SHA256 signature.
   *
   * Expects header: X-Webhook-Signature-256: sha256=<hex_digest>
   */
  verifySignature(payload: Buffer, signature: string, secret: string): boolean {
    const receivedSignature = signature.startsWith('sha256=')
      ? signature.slice(7)
      : signature;

    if (!/^[0-9a-fA-F]{64}$/.test(receivedSignature)) {
      return false;
    }

    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(payload);
    const expectedSignature = hmac.digest('hex');

    const receivedBuf = Buffer.from(receivedSignature, 'hex');
    const expectedBuf = Buffer.from(expectedSignature, 'hex');

    if (receivedBuf.length !== expectedBuf.length) {
      return false;
    }

    return crypto.timingSafeEqual(receivedBuf, expectedBuf);
  }

  getSupportedEvents(): string[] {
    return ['ticket_created'];
  }

  validateConfig(config: WebhookProviderConfig): boolean {
    return Boolean(config.webhookSecret);
  }

  // Inbound-only provider: outbound methods are not supported
  async postComment(_issueNumber: string, _body: string): Promise<void> {
    throw new Error('Custom webhook provider does not support outbound operations');
  }

  async updateLabels(
    _issueNumber: string,
    _add: string[],
    _remove: string[]
  ): Promise<void> {
    throw new Error('Custom webhook provider does not support outbound operations');
  }

  async postResult(_issueNumber: string, _result: WebhookResult): Promise<void> {
    throw new Error('Custom webhook provider does not support outbound operations');
  }

  protected createHttpClient(): AxiosInstance {
    throw new Error('Custom webhook provider does not support outbound API calls');
  }
}
