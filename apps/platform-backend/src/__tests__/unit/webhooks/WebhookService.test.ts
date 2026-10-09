import {
  InvalidWebhookPayloadError,
  type InboundWebhookAction,
  type InboundWebhookEvent,
  type WebhookReceiver,
} from "@viberglass/integration-core";
import type { InboundIssue } from "@viberglass/types";
import { WebhookService } from "../../../webhooks/WebhookService";
import { WebhookConfigResolver } from "../../../webhooks/WebhookConfigResolver";
import { InboundWebhookDeliveryLifecycle } from "../../../webhooks/InboundWebhookDeliveryLifecycle";
import { WebhookRetryService } from "../../../webhooks/WebhookRetryService";
import { InboundEventHandler } from "../../../webhooks/InboundEventHandler";
import { WebhookTaskCreator } from "../../../webhooks/WebhookTaskCreator";
import type { WebhookConfig } from "../../../persistence/webhook/WebhookConfigDAO";
import type { WebhookDeliveryAttempt } from "../../../persistence/webhook/WebhookDeliveryDAO";

const PROVIDER = "tracker";

function createConfig(overrides: Partial<WebhookConfig> = {}): WebhookConfig {
  const timestamp = new Date("2026-02-09T00:00:00.000Z");
  return {
    id: "cfg-1",
    projectId: "project-1",
    provider: PROVIDER,
    integrationId: "integration-1",
    secretLocation: "database",
    secretPath: null,
    webhookSecretEncrypted: "secret",
    allowedEvents: ["*"],
    planNewIssues: false,
    botUsername: "viberglass-bot",
    active: true,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}

const EVENT: InboundWebhookEvent = {
  eventType: "issue.opened",
  deduplicationId: "delivery-1",
  timestamp: "2026-02-09T00:00:00.000Z",
  payload: { sample: true },
  metadata: { issueKey: "T-1" },
};

const ISSUE: InboundIssue = {
  key: "T-1",
  url: "https://tracker.example/T-1",
  apiBaseUrl: null,
  title: "Login fails",
  description: "After a reset",
  author: null,
  severity: "high",
  labels: [],
  repository: null,
  metadata: {},
};

const TRACKER = { provider: PROVIDER, integrationId: "integration-1", webhookConfigId: "cfg-1" };

function createHarness(params: { config?: WebhookConfig | null; action?: InboundWebhookAction } = {}) {
  const config = params.config === undefined ? createConfig() : params.config;
  const receiver = {
    targetsOneSpace: false,
    signatureOf: jest.fn((headers: Record<string, string>) => headers["x-signature"]),
    verifySignature: jest.fn().mockReturnValue(true),
    parseEvent: jest.fn().mockReturnValue(EVENT),
    retryHeaders: jest.fn().mockReturnValue({ "x-delivery": "delivery-1" }),
    read: jest.fn().mockReturnValue(params.action ?? { kind: "issue", issue: ISSUE }),
  } satisfies WebhookReceiver;
  const receivers = { get: (provider: string) => (provider === PROVIDER ? receiver : undefined), providers: () => [PROVIDER] };

  const configDAO = { getConfigById: jest.fn().mockResolvedValue(config) };
  const deliveryDAO = {
    updateDeliveryStatus: jest.fn().mockResolvedValue(undefined),
    getDeliveryById: jest.fn().mockResolvedValue(null),
    getDeliveryByIdForConfig: jest.fn().mockResolvedValue(null),
    getDeliveryByDeliveryId: jest.fn().mockResolvedValue(null),
  };
  const deduplication = {
    shouldProcessDelivery: jest.fn().mockResolvedValue({ shouldProcess: true, existingId: undefined }),
    recordDeliveryStart: jest.fn().mockResolvedValue({ id: "delivery-row-1" }),
    recordDeliverySuccessById: jest.fn().mockResolvedValue(undefined),
    recordDeliveryFailureById: jest.fn().mockResolvedValue(undefined),
    getFailedDeliveries: jest.fn().mockResolvedValue([]),
  };
  const secretService = { getSecret: jest.fn().mockResolvedValue("secret") };
  const tickets = {
    createTicket: jest.fn().mockResolvedValue({ id: "ticket-new" }),
    updateTicket: jest.fn().mockResolvedValue(undefined),
  };
  const planner = { request: jest.fn().mockResolvedValue("job-1") };
  const issues = {
    issue: jest.fn().mockResolvedValue({ ticketId: "ticket-1", projectId: "project-1" }),
    commented: jest.fn().mockResolvedValue({ ticketId: "ticket-1" }),
  };

  const handler = new InboundEventHandler(issues, new WebhookTaskCreator(tickets, planner));
  const configResolver = new WebhookConfigResolver(configDAO);
  const lifecycle = new InboundWebhookDeliveryLifecycle(deduplication, deliveryDAO);
  const serviceConfig = { defaultTenantId: "tenant-default" };
  const retryService = new WebhookRetryService(receivers, configResolver, lifecycle, handler, deliveryDAO, serviceConfig);
  const service = new WebhookService(
    receivers,
    deduplication,
    secretService,
    handler,
    configResolver,
    lifecycle,
    retryService,
    serviceConfig,
  );

  return { service, receiver, configDAO, deliveryDAO, deduplication, secretService, tickets, planner, issues };
}

const rawBody = Buffer.from('{"sample":true}');
const SIGNED = { "x-signature": "sha256=signature" };

function deliver(
  harness: ReturnType<typeof createHarness>,
  options: { provider?: string; configId?: string; headers?: Record<string, string> } = {},
) {
  return harness.service.processWebhook(options.headers ?? SIGNED, EVENT.payload, rawBody, undefined, {
    providerName: options.provider ?? PROVIDER,
    configId: "configId" in options ? options.configId : "cfg-1",
  });
}

describe("WebhookService", () => {
  it("resolves the webhook from the id in its address and de-duplicates by the delivery id", async () => {
    const harness = createHarness();
    const result = await deliver(harness);

    expect(result).toEqual({ status: "processed", ticketId: "ticket-1", jobId: undefined });
    expect(harness.configDAO.getConfigById).toHaveBeenCalledWith("cfg-1");
    expect(harness.deduplication.shouldProcessDelivery).toHaveBeenCalledWith("delivery-1", "cfg-1");
    expect(harness.receiver.read).toHaveBeenCalledWith(EVENT, { botUsername: "viberglass-bot" });
  });

  it.each([
    ["names another provider's webhook", { config: createConfig({ provider: "other" }) }, {}],
    ["carries no webhook id", {}, { configId: undefined }],
    ["names a webhook that doesn't exist", { config: null }, {}],
    ["names a provider no integration receives", {}, { provider: "unknown" }],
  ])("answers not found to an address that %s", async (_case, harnessOptions, deliveryOptions) => {
    const harness = createHarness(harnessOptions);
    const result = await deliver(harness, deliveryOptions);

    expect(result).toEqual({ status: "not_found", reason: "No webhook with this address" });
    expect(harness.receiver.verifySignature).not.toHaveBeenCalled();
    expect(harness.deduplication.recordDeliveryStart).not.toHaveBeenCalled();
    expect(harness.issues.issue).not.toHaveBeenCalled();
  });

  it("answers invalid to a payload the sender has to fix, and ignores one that merely can't be parsed", async () => {
    const harness = createHarness();
    harness.receiver.parseEvent.mockImplementationOnce(() => {
      throw new InvalidWebhookPayloadError("Missing required field: title");
    });
    expect(await deliver(harness)).toEqual({ status: "invalid", reason: "Missing required field: title" });

    harness.receiver.parseEvent.mockImplementationOnce(() => {
      throw new Error("Missing header");
    });
    expect(await deliver(harness)).toEqual({ status: "ignored", reason: "Event parsing failed: Missing header" });
    expect(harness.deduplication.recordDeliveryStart).not.toHaveBeenCalled();
  });

  it("passes an issue to the connection's issues and records the task it reached", async () => {
    const harness = createHarness();
    await deliver(harness);

    expect(harness.issues.issue).toHaveBeenCalledWith(TRACKER, ISSUE);
    expect(harness.deduplication.recordDeliverySuccessById).toHaveBeenCalledWith("delivery-row-1", "ticket-1", "project-1");
  });

  it("passes a comment to the linked tasks", async () => {
    const comment = { issueKey: "T-1", author: { name: "Bob", email: null }, body: "fix it", mentionsBot: true };
    const harness = createHarness({ action: { kind: "comment", comment } });
    const result = await deliver(harness);

    expect(result.status).toBe("processed");
    expect(harness.issues.commented).toHaveBeenCalledWith(TRACKER, comment);
  });

  it("records an ignored issue as ignored, with the reason", async () => {
    const harness = createHarness();
    harness.issues.issue.mockResolvedValue({ ignoredReason: "No space takes the issue" });
    const result = await deliver(harness);

    expect(result).toEqual({ status: "ignored", reason: "No space takes the issue" });
    expect(harness.deliveryDAO.updateDeliveryStatus).toHaveBeenCalledWith("delivery-row-1", "ignored", "No space takes the issue");
    expect(harness.deduplication.recordDeliveryFailureById).not.toHaveBeenCalled();
  });

  it("records what the integration read as ignored when it ignores the event", async () => {
    const harness = createHarness({ action: { kind: "ignored", reason: "Written by the bot account" } });
    const result = await deliver(harness);

    expect(result).toEqual({ status: "ignored", reason: "Written by the bot account" });
    expect(harness.issues.issue).not.toHaveBeenCalled();
  });

  it("ignores an issue for a webhook that isn't part of a connection", async () => {
    const harness = createHarness({ config: createConfig({ integrationId: null }) });
    const result = await deliver(harness);

    expect(result).toEqual({ status: "ignored", reason: "The webhook isn't part of a connection" });
    expect(harness.issues.issue).not.toHaveBeenCalled();
  });

  it("creates the task a webhook asks for in its space, and asks for its plan when the webhook is set to", async () => {
    const task = { title: "Checkout broken", description: "500 on pay", severity: "critical" as const, category: "bug", url: "https://x" };
    const harness = createHarness({
      config: createConfig({ provider: PROVIDER, planNewIssues: true }),
      action: { kind: "task", task },
    });
    const result = await deliver(harness);

    expect(result).toEqual({ status: "processed", ticketId: "ticket-new", jobId: "job-1" });
    expect(harness.tickets.createTicket).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: "project-1", title: "Checkout broken", severity: "critical", ticketSystem: PROVIDER }),
    );
    expect(harness.tickets.updateTicket).toHaveBeenCalledWith("ticket-new", { externalTicketId: undefined, externalTicketUrl: "https://x" });
    expect(harness.planner.request).toHaveBeenCalledWith("ticket-new");
  });

  it("verifies the signature the integration finds in the headers against the webhook's secret", async () => {
    const harness = createHarness();
    await deliver(harness, { headers: { "x-signature": "sha256=abc", "x-other": "1" } });

    expect(harness.receiver.signatureOf).toHaveBeenCalledWith({ "x-signature": "sha256=abc", "x-other": "1" });
    expect(harness.receiver.verifySignature).toHaveBeenCalledWith(rawBody, "sha256=abc", "secret");
  });

  it("returns duplicate for a delivery already handled", async () => {
    const harness = createHarness();
    harness.deduplication.shouldProcessDelivery.mockResolvedValue({ shouldProcess: false, existingId: "row-0" });
    const result = await deliver(harness);

    expect(result).toEqual({ status: "duplicate", reason: "Delivery already processed", existingId: "row-0" });
    expect(harness.deduplication.recordDeliveryStart).not.toHaveBeenCalled();
  });

  it("rejects an invalid signature and records the failed delivery", async () => {
    const harness = createHarness();
    harness.receiver.verifySignature.mockReturnValue(false);
    const result = await deliver(harness);

    expect(result).toEqual({ status: "rejected", reason: "Invalid signature" });
    expect(harness.deduplication.recordDeliveryStart).toHaveBeenCalledTimes(1);
    expect(harness.deduplication.recordDeliveryFailureById).toHaveBeenCalledWith("delivery-row-1", "Rejected: Invalid signature");
    expect(harness.issues.issue).not.toHaveBeenCalled();
  });

  it("rejects a delivery when the webhook has no secret, and an unsigned one", async () => {
    const harness = createHarness();
    harness.secretService.getSecret.mockRejectedValueOnce(new Error("no secret"));
    expect(await deliver(harness)).toEqual({ status: "rejected", reason: "Webhook secret is not configured" });

    expect(await deliver(harness, { headers: {} })).toEqual({ status: "rejected", reason: "Missing signature header" });
    expect(harness.receiver.verifySignature).not.toHaveBeenCalled();
  });

  it("ignores events the webhook isn't set to receive, with the event in the reason", async () => {
    const harness = createHarness({ config: createConfig({ allowedEvents: ["comment.created"] }) });
    const result = await deliver(harness);

    expect(result.status).toBe("ignored");
    expect(result.reason).toContain("issue.opened");
    expect(harness.receiver.verifySignature).not.toHaveBeenCalled();
    expect(harness.deliveryDAO.updateDeliveryStatus).toHaveBeenCalledWith("delivery-row-1", "ignored", expect.stringContaining("isn't set to receive"));
  });

  describe("retryDelivery", () => {
    function createDelivery(overrides: Partial<WebhookDeliveryAttempt> = {}): WebhookDeliveryAttempt {
      return {
        id: "delivery-row-1",
        provider: PROVIDER,
        webhookConfigId: "cfg-1",
        deliveryId: "delivery-1",
        eventType: "issue.opened",
        payload: { sample: true },
        status: "failed",
        errorMessage: "boom",
        ticketId: null,
        projectId: null,
        createdAt: new Date("2026-02-09T00:00:00.000Z"),
        processedAt: null,
        ...overrides,
      };
    }

    it("replays a failed delivery through its integration, with the headers it needs to parse it again", async () => {
      const harness = createHarness();
      harness.deliveryDAO.getDeliveryById.mockResolvedValue(createDelivery());
      const result = await harness.service.retryDelivery("delivery-1", { deliveryAttemptId: "delivery-row-1" });

      expect(result).toEqual({ status: "processed", ticketId: "ticket-1", jobId: undefined });
      expect(harness.receiver.retryHeaders).toHaveBeenCalledWith({ deliveryId: "delivery-1", eventType: "issue.opened" });
      expect(harness.receiver.parseEvent).toHaveBeenCalledWith({ sample: true }, { "x-delivery": "delivery-1" });
      expect(harness.issues.issue).toHaveBeenCalledWith(TRACKER, ISSUE);
    });

    it("records a retried delivery that is ignored as ignored, with the reason", async () => {
      const harness = createHarness();
      harness.deliveryDAO.getDeliveryById.mockResolvedValue(createDelivery());
      harness.issues.issue.mockResolvedValue({ ignoredReason: "No space takes the issue" });
      const result = await harness.service.retryDelivery("delivery-1", { deliveryAttemptId: "delivery-row-1" });

      expect(result).toEqual({ status: "ignored", reason: "No space takes the issue" });
      expect(harness.deliveryDAO.updateDeliveryStatus).toHaveBeenCalledWith("delivery-row-1", "ignored", "No space takes the issue");
    });

    it("fails a delivery that wasn't sent to a webhook", async () => {
      const harness = createHarness();
      harness.deliveryDAO.getDeliveryById.mockResolvedValue(createDelivery({ webhookConfigId: null }));
      const result = await harness.service.retryDelivery("delivery-1", { deliveryAttemptId: "delivery-row-1" });

      expect(result).toEqual({ status: "failed", reason: "Webhook configuration not found" });
      expect(harness.configDAO.getConfigById).not.toHaveBeenCalled();
    });

    it("doesn't replay a delivery that already succeeded", async () => {
      const harness = createHarness();
      harness.deliveryDAO.getDeliveryById.mockResolvedValue(createDelivery({ status: "succeeded" }));
      const result = await harness.service.retryDelivery("delivery-1", { deliveryAttemptId: "delivery-row-1" });

      expect(result).toEqual({ status: "duplicate", reason: "Delivery already succeeded", existingId: "delivery-row-1" });
      expect(harness.issues.issue).not.toHaveBeenCalled();
    });
  });
});
