import type { WebhookConfigResolver } from "./WebhookConfigResolver";
import type { WebhookHandshake } from "./WebhookHandshake";
import type { WebhookReceivers } from "./webhookReceivers";
import type { WebhookService } from "./WebhookService";
import { normalizeHeaders } from "./WebhookService";
import type { WebhookProcessingOptions, WebhookProcessingResult } from "./webhookServiceTypes";

/**
 * Takes a delivery to the webhook it was sent to: answers a handshake, and
 * processes each event of a delivery that carries several on its own.
 */
export class WebhookDeliveryProcessor {
  constructor(
    private readonly receivers: Pick<WebhookReceivers, "get">,
    private readonly configResolver: Pick<WebhookConfigResolver, "resolveInboundConfig">,
    private readonly handshake: Pick<WebhookHandshake, "remember">,
    private readonly service: Pick<WebhookService, "processWebhook">,
  ) {}

  async process(
    headers: Record<string, string | string[] | undefined>,
    payload: unknown,
    rawBody: Buffer,
    tenantId: string | undefined,
    options: WebhookProcessingOptions,
  ): Promise<WebhookProcessingResult> {
    const receiver = this.receivers.get(options.providerName);
    const handshakeSecret = receiver?.handshakeSecretOf?.(normalizeHeaders(headers));
    if (handshakeSecret !== undefined) return this.answerHandshake(options, handshakeSecret);

    const events = receiver?.splitEvents ? receiver.splitEvents(payload) : [payload];
    if (events.length === 0) return { status: "ignored", reason: "The delivery carries no events" };

    const results: WebhookProcessingResult[] = [];
    for (const event of events) {
      results.push(await this.service.processWebhook(headers, event, rawBody, tenantId, options));
    }
    return results.find((result) => result.status === "processed") ?? results.find((result) => result.status === "failed") ?? results[0];
  }

  private async answerHandshake(options: WebhookProcessingOptions, secret: string): Promise<WebhookProcessingResult> {
    const config = await this.configResolver.resolveInboundConfig(options);
    if (!config) return { status: "not_found", reason: "No webhook with this address" };
    await this.handshake.remember(config, secret);
    return { status: "handshake", handshakeSecret: secret };
  }
}
