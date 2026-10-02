/**
 * GitHub webhook provider implementation
 *
 * Handles inbound webhook events from GitHub.
 *
 * @see https://docs.github.com/en/webhooks/webhook-events-and-payloads
 */

import crypto from "crypto";
import { isObjectRecord } from "@viberglass/types";
import { BaseWebhookProvider } from "./BaseWebhookProvider";
import type {
  ParsedWebhookEvent,
  WebhookProviderConfig,
} from "../WebhookProvider";

/**
 * GitHub webhook payload types
 */


/**
 * GitHub webhook provider
 *
 * Implements WebhookProvider for GitHub webhooks with support for:
 * - Signature verification using HMAC-SHA256
 * - Event parsing for issues and issue_comment events
 */
export class GitHubWebhookProvider extends BaseWebhookProvider {
  readonly name = "github";

  constructor(config: WebhookProviderConfig) {
    super(config);
  }

  /**
   * Parse GitHub webhook event into standardized format
   *
   * @param payload - Raw webhook payload
   * @param headers - Request headers
   * @returns Parsed webhook event
   */
  parseEvent(
    payload: unknown,
    headers: Record<string, string>,
  ): ParsedWebhookEvent {
    const eventType = headers["x-github-event"] as string;
    const deliveryId = headers["x-github-delivery"] as string;

    if (!eventType) {
      throw new Error("Missing x-github-event header");
    }

    if (!deliveryId) {
      throw new Error("Missing x-github-delivery header");
    }

    if (!isObjectRecord(payload)) {
      throw new Error("GitHub payload must be a JSON object");
    }
    const payloadObj = payload;
    this.validatePayloadForSupportedEvent(eventType, payloadObj);

    // Build metadata
    const metadata = this.buildMetadata(payloadObj);
    const action =
      typeof payloadObj.action === "string" ? payloadObj.action : undefined;

    // Override with GitHub-specific metadata
    if (payloadObj.repository) {
      const repo = payloadObj.repository as { full_name?: string };
      metadata.repositoryId = repo.full_name;
    }

    if (payloadObj.issue) {
      const issue = payloadObj.issue as { number?: number };
      metadata.issueKey = issue.number?.toString();
    }

    if (payloadObj.comment) {
      const comment = payloadObj.comment as { id?: number };
      metadata.commentId = comment.id?.toString();
    }

    if (action) {
      metadata.action = action;
    }

    if (payloadObj.sender) {
      const sender = payloadObj.sender as { login?: string };
      metadata.sender = sender.login;
    }

    return {
      provider: "github",
      eventType: this.toScopedEventType(eventType, action),
      deduplicationId: deliveryId,
      timestamp: this.extractTimestamp(payloadObj),
      payload,
      metadata,
    };
  }

  private toScopedEventType(eventType: string, action?: string): string {
    if (!action) {
      return eventType;
    }
    return `${eventType}.${action}`;
  }

  private validatePayloadForSupportedEvent(
    eventType: string,
    payload: Record<string, unknown>,
  ): void {
    const repository = payload.repository as { full_name?: string } | undefined;
    if (
      (eventType === "issues" || eventType === "issue_comment") &&
      !repository?.full_name
    ) {
      throw new Error("Missing required field 'repository.full_name'");
    }

    if (eventType === "issues") {
      const issue = payload.issue as { number?: number } | undefined;
      if (typeof issue?.number !== "number") {
        throw new Error("Missing required field 'issue.number'");
      }
    }

    if (eventType === "issue_comment") {
      const issue = payload.issue as { number?: number } | undefined;
      const comment = payload.comment as { id?: number } | undefined;
      if (typeof issue?.number !== "number") {
        throw new Error("Missing required field 'issue.number'");
      }
      if (typeof comment?.id !== "number") {
        throw new Error("Missing required field 'comment.id'");
      }
    }
  }

  /**
   * Verify GitHub webhook signature
   *
   * GitHub uses HMAC-SHA256 with signature in x-hub-signature-256 header.
   * Format: sha256=<hex_digest>
   *
   * @param payload - Raw request body
   * @param signature - Signature from header
   * @param secret - Webhook secret
   * @returns True if signature is valid
   */
  verifySignature(payload: Buffer, signature: string, secret: string): boolean {
    // Strip prefix if present
    const receivedSignature = signature.startsWith("sha256=")
      ? signature.slice(7)
      : signature;

    // Validate hex format
    if (!/^[0-9a-fA-F]{64}$/.test(receivedSignature)) {
      return false;
    }

    // Compute expected signature
    const hmac = crypto.createHmac("sha256", secret);
    hmac.update(payload);
    const expectedSignature = hmac.digest("hex");

    // Use timing-safe comparison
    const receivedBuf = Buffer.from(receivedSignature, "hex");
    const expectedBuf = Buffer.from(expectedSignature, "hex");

    if (receivedBuf.length !== expectedBuf.length) {
      return false;
    }

    return crypto.timingSafeEqual(receivedBuf, expectedBuf);
  }

  /**
   * Get supported event types
   *
   * @returns Array of event types this provider handles
   */
  getSupportedEvents(): string[] {
    return ["issues.opened", "issue_comment.created"];
  }
}
