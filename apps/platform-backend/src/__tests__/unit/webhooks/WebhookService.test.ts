import { WebhookService } from "../../../webhooks/WebhookService";
import type { ParsedWebhookEvent, WebhookProvider } from "../../../webhooks/provider";
import type { WebhookConfig } from "../../../persistence/webhook/WebhookConfigDAO";

type ProviderName = "github" | "jira" | "shortcut" | "custom";

function createConfig(provider: ProviderName): WebhookConfig {
  const timestamp = new Date("2026-02-09T00:00:00.000Z");
  return {
    id: `cfg-${provider}`,
    projectId: "project-1",
    provider,
    direction: "inbound",
    providerProjectId: `${provider}-project-1`,
    integrationId: "integration-1",
    secretLocation: "database",
    secretPath: null,
    webhookSecretEncrypted: `${provider}-secret`,
    apiTokenEncrypted: null,
    allowedEvents: ["*"],
    autoExecute: false,
    botUsername: null,
    labelMappings: {},
    active: true,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function createEvent(
  provider: ProviderName,
  metadata: ParsedWebhookEvent["metadata"] = {},
): ParsedWebhookEvent {
  return {
    provider,
    eventType: "event_updated",
    deduplicationId: `${provider}-delivery-1`,
    timestamp: "2026-02-09T00:00:00.000Z",
    payload: { provider, sample: true },
    metadata,
  };
}

function createProvider(
  providerName: ProviderName,
  event: ParsedWebhookEvent,
  signatureValid = true,
): {
  provider: WebhookProvider;
  parseEvent: jest.Mock;
  verifySignature: jest.Mock;
} {
  const parseEvent = jest.fn().mockReturnValue(event);
  const verifySignature = jest.fn().mockReturnValue(signatureValid);
  const provider = {
    name: providerName,
    parseEvent,
    verifySignature,
    getSupportedEvents: jest.fn().mockReturnValue([event.eventType]),
    validateConfig: jest.fn().mockReturnValue(true),
    postComment: jest.fn(),
    updateLabels: jest.fn(),
    postResult: jest.fn(),
  } as unknown as WebhookProvider;

  return { provider, parseEvent, verifySignature };
}

describe("WebhookService", () => {
  const rawBody = Buffer.from('{"sample":true}');

  function createHarness(params: {
    providerName: ProviderName;
    event: ParsedWebhookEvent;
    config?: WebhookConfig;
    signatureValid?: boolean;
  }) {
    const { providerName, event, signatureValid = true } = params;
    const config = params.config ?? createConfig(providerName);
    const providerFixture = createProvider(providerName, event, signatureValid);

    const registry = {
      getProviderForHeaders: jest.fn().mockReturnValue(providerFixture.provider),
      get: jest.fn().mockReturnValue(providerFixture.provider),
    };
    const configDAO = {
      getConfigById: jest.fn().mockResolvedValue(null),
      getByIntegrationId: jest.fn().mockResolvedValue(null),
      getActiveConfigByProviderProject: jest.fn().mockResolvedValue(config),
      listConfigsByProject: jest.fn().mockResolvedValue([]),
      listConfigsByProvider: jest.fn().mockResolvedValue([config]),
    };
    const deliveryDAO = {
      updateDeliveryStatus: jest.fn().mockResolvedValue(undefined),
      getDeliveryByDeliveryId: jest.fn().mockResolvedValue(null),
    };
    const deduplication = {
      shouldProcessDelivery: jest
        .fn()
        .mockResolvedValue({ shouldProcess: true, existingId: undefined }),
      recordDeliveryStart: jest.fn().mockResolvedValue({ id: "delivery-row-1" }),
      recordDeliverySuccessById: jest.fn().mockResolvedValue(undefined),
      recordDeliveryFailureById: jest.fn().mockResolvedValue(undefined),
      getFailedDeliveries: jest.fn().mockResolvedValue([]),
    };
    const secretService = {
      getSecret: jest.fn().mockResolvedValue(`${providerName}-secret`),
    };
    const ticketDAO = {
      createTicket: jest.fn().mockResolvedValue({ id: "ticket-1" }),
      updateTicket: jest.fn().mockResolvedValue(undefined),
    };
    const jobService = {
      submitJob: jest.fn().mockResolvedValue({ jobId: "job-1" }),
    };

    const service = new WebhookService(
      registry as any,
      configDAO as any,
      deliveryDAO as any,
      deduplication as any,
      secretService as any,
      ticketDAO as any,
      jobService as any,
      {
        defaultTenantId: "tenant-default",
      },
    );

    return {
      service,
      providerFixture,
      mocks: {
        registry,
        configDAO,
        deliveryDAO,
        deduplication,
        secretService,
        ticketDAO,
      },
    };
  }

  it("resolves config by provider and providerProjectId without github bias", async () => {
    const event = createEvent("shortcut", {
      repositoryId: "shortcut-project-1",
    });
    const { service, mocks } = createHarness({
      providerName: "shortcut",
      event,
      config: createConfig("shortcut"),
    });

    const result = await service.processWebhook(
      {
        "x-shortcut-delivery": "shortcut-delivery",
        "x-shortcut-signature": "sha256=valid-signature",
      },
      event.payload,
      rawBody,
      "tenant-1",
      { providerName: "shortcut" },
    );

    expect(result.status).toBe("processed");
    expect(mocks.configDAO.getActiveConfigByProviderProject).toHaveBeenCalledWith(
      "shortcut",
      "shortcut-project-1",
      "inbound",
    );
    expect(mocks.deduplication.shouldProcessDelivery).toHaveBeenCalledWith(
      "shortcut-delivery-1",
      "cfg-shortcut",
    );
    expect(mocks.configDAO.getActiveConfigByProviderProject).not.toHaveBeenCalledWith(
      "github",
      expect.anything(),
      "inbound",
    );
  });

  it("uses Jira signature headers consistently for verification", async () => {
    const event = createEvent("jira", { repositoryId: "jira-project-1" });
    const { service, providerFixture } = createHarness({
      providerName: "jira",
      event,
      config: createConfig("jira"),
    });

    const result = await service.processWebhook(
      {
        "x-atlassian-webhook-signature": "sha256=jira-signature",
      },
      event.payload,
      rawBody,
      undefined,
      { providerName: "jira" },
    );

    expect(result.status).toBe("processed");
    expect(providerFixture.verifySignature).toHaveBeenCalledWith(
      rawBody,
      "sha256=jira-signature",
      "jira-secret",
    );
  });

  it("returns duplicate when deduplication marks delivery as already handled", async () => {
    const event = createEvent("github", { repositoryId: "github-project-1" });
    const { service, mocks } = createHarness({
      providerName: "github",
      event,
      config: createConfig("github"),
    });
    mocks.deduplication.shouldProcessDelivery.mockResolvedValue({
      shouldProcess: false,
      existingId: "existing-delivery-row",
    });

    const result = await service.processWebhook(
      {
        "x-hub-signature-256": "sha256=github-signature",
      },
      event.payload,
      rawBody,
      undefined,
      { providerName: "github" },
    );

    expect(result).toEqual({
      status: "duplicate",
      reason: "Delivery already processed",
      existingId: "existing-delivery-row",
    });
    expect(mocks.deduplication.recordDeliveryStart).not.toHaveBeenCalled();
  });

  it("rejects invalid signatures and records failed deliveries", async () => {
    const event = createEvent("github", { repositoryId: "github-project-1" });
    const { service, mocks } = createHarness({
      providerName: "github",
      event,
      config: createConfig("github"),
      signatureValid: false,
    });

    const result = await service.processWebhook(
      {
        "x-hub-signature-256": "sha256=bad-signature",
      },
      event.payload,
      rawBody,
      undefined,
      { providerName: "github" },
    );

    expect(result).toEqual({
      status: "rejected",
      reason: "Invalid signature",
    });
    expect(mocks.deduplication.shouldProcessDelivery).not.toHaveBeenCalled();
    expect(mocks.deduplication.recordDeliveryStart).toHaveBeenCalledTimes(1);
    expect(mocks.deduplication.recordDeliveryFailureById).toHaveBeenCalledWith(
      "delivery-row-1",
      "Invalid signature",
    );
  });

  it("allows unsigned Jira deliveries when no secret is configured", async () => {
    const config = createConfig("jira");
    config.webhookSecretEncrypted = null;
    const event = createEvent("jira", { repositoryId: "jira-project-1" });
    const { service, providerFixture, mocks } = createHarness({
      providerName: "jira",
      event,
      config,
    });
    mocks.secretService.getSecret.mockRejectedValue(
      new Error("Webhook secret not found"),
    );

    const result = await service.processWebhook(
      {
        "x-atlassian-webhook-identifier": "jira-delivery-1",
      },
      event.payload,
      rawBody,
      undefined,
      { providerName: "jira" },
    );

    expect(result.status).toBe("processed");
    expect(providerFixture.verifySignature).not.toHaveBeenCalled();
  });
});
