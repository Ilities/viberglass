import type { WebhookReceiver } from "@viberglass/integration-core";
import { WebhookDeliveryProcessor } from "../../../webhooks/WebhookDeliveryProcessor";
import type { WebhookConfig } from "../../../persistence/webhook/WebhookConfigDAO";

const PROVIDER = "asana";
const CONFIG = { id: "cfg-1", provider: PROVIDER, secretLocation: "database", webhookSecretEncrypted: null } as unknown as WebhookConfig;
const RAW = Buffer.from("{}");

function receiverWith(extra: Partial<WebhookReceiver> = {}): WebhookReceiver {
  return {
    targetsOneSpace: false,
    signatureOf: () => undefined,
    verifySignature: () => true,
    parseEvent: jest.fn(),
    retryHeaders: () => ({}),
    read: jest.fn(),
    ...extra,
  };
}

function harness(receiver: WebhookReceiver | undefined, processed: { status: "processed" | "ignored" | "failed" } [] = []) {
  const receivers = { get: (provider: string) => (provider === PROVIDER ? receiver : undefined) };
  const configResolver = { resolveInboundConfig: jest.fn().mockResolvedValue(CONFIG) };
  const handshake = { remember: jest.fn().mockResolvedValue(undefined) };
  const service = { processWebhook: jest.fn(async (...args: unknown[]) => { void args; return processed.shift() ?? { status: "processed" as const }; }) };
  const processor = new WebhookDeliveryProcessor(receivers, configResolver, handshake, service);
  return { processor, configResolver, handshake, service };
}

const OPTIONS = { providerName: PROVIDER, configId: "cfg-1" };

describe("WebhookDeliveryProcessor", () => {
  it("answers a handshake by echoing its secret and keeping it on the webhook", async () => {
    const receiver = receiverWith({ handshakeSecretOf: (headers) => headers["x-hook-secret"] });
    const { processor, handshake, service } = harness(receiver);

    const result = await processor.process({ "X-Hook-Secret": "secret-1" }, {}, RAW, undefined, OPTIONS);

    expect(result).toEqual({ status: "handshake", handshakeSecret: "secret-1" });
    expect(handshake.remember).toHaveBeenCalledWith(CONFIG, "secret-1");
    expect(service.processWebhook).not.toHaveBeenCalled();
  });

  it("answers not found to a handshake for a webhook that doesn't exist", async () => {
    const receiver = receiverWith({ handshakeSecretOf: () => "secret-1" });
    const { processor, configResolver, handshake } = harness(receiver);
    configResolver.resolveInboundConfig.mockResolvedValueOnce(null);

    expect(await processor.process({}, {}, RAW, undefined, OPTIONS)).toEqual({ status: "not_found", reason: "No webhook with this address" });
    expect(handshake.remember).not.toHaveBeenCalled();
  });

  it("processes each event of a batched delivery on its own and reports the one that was processed", async () => {
    const receiver = receiverWith({ splitEvents: (payload) => (payload as { events: unknown[] }).events });
    const { processor, service } = harness(receiver, [{ status: "ignored" }, { status: "processed" }]);

    const result = await processor.process({}, { events: ["a", "b"] }, RAW, "tenant-1", OPTIONS);

    expect(service.processWebhook.mock.calls.map((call) => call[1])).toEqual(["a", "b"]);
    expect(service.processWebhook).toHaveBeenCalledWith({}, "a", RAW, "tenant-1", OPTIONS);
    expect(result).toEqual({ status: "processed" });
  });

  it("ignores a heartbeat that carries no events", async () => {
    const receiver = receiverWith({ splitEvents: () => [] });
    const { processor, service } = harness(receiver);

    expect(await processor.process({}, { events: [] }, RAW, undefined, OPTIONS)).toEqual({ status: "ignored", reason: "The delivery carries no events" });
    expect(service.processWebhook).not.toHaveBeenCalled();
  });

  it("hands a single-event delivery to the service unchanged, and so reports not found for an unknown provider", async () => {
    const { processor, service } = harness(undefined);
    await processor.process({}, { one: true }, RAW, undefined, { providerName: "unknown", configId: "cfg-1" });

    expect(service.processWebhook).toHaveBeenCalledWith({}, { one: true }, RAW, undefined, { providerName: "unknown", configId: "cfg-1" });
  });

  it("returns the failure when no event of a batch was processed", async () => {
    const receiver = receiverWith({ splitEvents: (payload) => (payload as { events: unknown[] }).events });
    const { processor } = harness(receiver, [{ status: "ignored" }, { status: "failed" }]);

    expect(await processor.process({}, { events: ["a", "b"] }, RAW, undefined, OPTIONS)).toEqual({ status: "failed" });
  });
});

