import type { InboundWebhookEvent, WebhookReceiver } from "@viberglass/integration-core";
import { WebhookEventEnricher } from "../../../webhooks/WebhookEventEnricher";
import type { WebhookConfig } from "../../../persistence/webhook/WebhookConfigDAO";

const EVENT: InboundWebhookEvent = { eventType: "task_added", deduplicationId: "d-1", timestamp: "2026-03-01T00:00:00.000Z", payload: { compact: true }, metadata: {} };
const CONFIG = { id: "cfg-1", integrationId: "int-1" } as unknown as WebhookConfig;
const READ = { kind: "ignored" as const, reason: "x" };

function receiverWith(enrich?: WebhookReceiver["enrich"]): WebhookReceiver {
  return {
    targetsOneSpace: false,
    signatureOf: () => undefined,
    verifySignature: () => true,
    parseEvent: jest.fn(),
    retryHeaders: () => ({}),
    read: () => READ,
    enrich,
  };
}

describe("WebhookEventEnricher", () => {
  it("passes an event through when its receiver doesn't enrich", async () => {
    const integrations = { getIntegration: jest.fn() };
    const enriched = await new WebhookEventEnricher(integrations, { resolve: jest.fn() }).enrich(EVENT, receiverWith(), CONFIG);

    expect(enriched).toBe(EVENT);
    expect(integrations.getIntegration).not.toHaveBeenCalled();
  });

  it("passes an event through when the webhook has no connection", async () => {
    const enriched = await new WebhookEventEnricher({ getIntegration: jest.fn() }, { resolve: jest.fn() }).enrich(
      EVENT,
      receiverWith(jest.fn()),
      { ...CONFIG, integrationId: null } as unknown as WebhookConfig,
    );
    expect(enriched).toBe(EVENT);
  });

  it("enriches with the connection's resolved credentials", async () => {
    const integration = { id: "int-1", system: "asana", config: {} };
    const enriched = { ...EVENT, payload: { compact: true, task: { name: "Fix" } } };
    const enrich = jest.fn().mockResolvedValue(enriched);
    const credentials = { type: "token" as const, token: "pat-1" };

    const result = await new WebhookEventEnricher(
      { getIntegration: jest.fn().mockResolvedValue(integration) },
      { resolve: jest.fn().mockResolvedValue(credentials) },
    ).enrich(EVENT, receiverWith(enrich), CONFIG);

    expect(enrich).toHaveBeenCalledWith(EVENT, credentials);
    expect(result).toBe(enriched);
  });
});
