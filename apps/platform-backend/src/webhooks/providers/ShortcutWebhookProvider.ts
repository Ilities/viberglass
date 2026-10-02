import crypto from "crypto";
import { BaseWebhookProvider } from "./BaseWebhookProvider";
import type {
  ParsedWebhookEvent,
  WebhookProviderConfig,
} from "../WebhookProvider";
import type { ShortcutWebhookProviderDependencies } from "./shortcut/shortcutDependencies";

export { createShortcutWebhookProviderDependencies } from "./shortcut/createShortcutWebhookProviderDependencies";
export type { ShortcutWebhookProviderDependencies } from "./shortcut/shortcutDependencies";

const SUPPORTED_EVENTS = [
  "story_created",
  "story_updated",
  "story_deleted",
  "comment_created",
  "comment_updated",
  "comment_deleted",
];

function verifyShortcutSignature(
  payload: Buffer,
  signature: string,
  secret: string,
): boolean {
  const receivedSignature = signature.startsWith("sha256=")
    ? signature.slice(7)
    : signature;

  if (!/^[0-9a-fA-F]{64}$/.test(receivedSignature)) {
    return false;
  }

  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(payload);
  const expectedSignature = hmac.digest("hex");
  const receivedBuffer = Buffer.from(receivedSignature, "hex");
  const expectedBuffer = Buffer.from(expectedSignature, "hex");

  if (receivedBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(receivedBuffer, expectedBuffer);
}

export class ShortcutWebhookProvider extends BaseWebhookProvider {
  readonly name = "shortcut";

  constructor(
    config: WebhookProviderConfig,
    private readonly dependencies: ShortcutWebhookProviderDependencies,
  ) {
    super(config);
  }

  parseEvent(
    payload: unknown,
    headers: Record<string, string>,
  ): ParsedWebhookEvent {
    const parsed = this.dependencies.payloadParser.parse(payload, headers);

    return {
      provider: "shortcut",
      eventType: parsed.eventType,
      deduplicationId: parsed.deduplicationId,
      timestamp: parsed.timestamp,
      payload: parsed.payload,
      metadata: parsed.metadata,
    };
  }

  verifySignature(payload: Buffer, signature: string, secret: string): boolean {
    return verifyShortcutSignature(payload, signature, secret);
  }

  getSupportedEvents(): string[] {
    return SUPPORTED_EVENTS;
  }
}
