import { WebhookService } from "../../../webhooks/WebhookService";
import { createDefaultInboundEventProcessorResolver } from "../../../webhooks/InboundEventProcessorResolver";
import { WebhookConfigResolver } from "../../../webhooks/WebhookConfigResolver";
import { createDefaultProviderWebhookPolicyResolver } from "../../../webhooks/ProviderWebhookPolicyResolver";
import { InboundWebhookDeliveryLifecycle } from "../../../webhooks/InboundWebhookDeliveryLifecycle";
import { WebhookRetryService } from "../../../webhooks/WebhookRetryService";
import type { ParsedWebhookEvent, WebhookProvider } from "../../../webhooks/WebhookProvider";
import type { WebhookConfig } from "../../../persistence/webhook/WebhookConfigDAO";
import type { WebhookDeliveryAttempt } from "../../../persistence/webhook/WebhookDeliveryDAO";

type ProviderName = "github" | "jira" | "shortcut" | "custom";

function createConfig(provider: ProviderName): WebhookConfig {
  const timestamp = new Date("2026-02-09T00:00:00.000Z");
  return {
    id: `cfg-${provider}`,
    projectId: "project-1",
    provider,
    integrationId: "integration-1",
    secretLocation: "database",
    secretPath: null,
    webhookSecretEncrypted: `${provider}-secret`,
    allowedEvents: ["*"],
    planNewIssues: false,
    botUsername: null,
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

function createGitHubIssuesEvent(action: string): ParsedWebhookEvent {
  return {
    provider: "github",
    eventType: `issues.${action}`,
    deduplicationId: "github-delivery-1",
    timestamp: "2026-02-09T00:00:00.000Z",
    payload: {
      action,
      issue: {
        number: 123,
        title: "Fix login bug",
        body: "Login fails after reset",
        html_url: "https://github.com/acme/repo/issues/123",
        user: { login: "reporter" },
        state: "open",
        labels: [{ name: "high" }],
      },
      repository: {
        full_name: "github-project-1",
        owner: { login: "acme" },
        name: "repo",
      },
      sender: {
        login: "reporter",
      },
    },
    metadata: {
      repositoryId: "github-project-1",
      action,
      issueKey: "123",
      sender: "reporter",
    },
  };
}

function createGitHubIssueCommentEvent(action: string): ParsedWebhookEvent {
  return {
    provider: "github",
    eventType: `issue_comment.${action}`,
    deduplicationId: "github-delivery-comment-1",
    timestamp: "2026-02-09T00:00:00.000Z",
    payload: {
      action,
      issue: {
        number: 123,
        title: "Fix login bug",
        body: "Login fails after reset",
        html_url: "https://github.com/acme/repo/issues/123",
      },
      comment: {
        id: 77,
        body: "@viberator fix this please",
        user: { login: "alice" },
        created_at: "2026-02-09T00:00:00.000Z",
        updated_at: "2026-02-09T00:00:00.000Z",
      },
      repository: {
        full_name: "github-project-1",
      },
      sender: {
        login: "alice",
      },
    },
    metadata: {
      repositoryId: "github-project-1",
      action,
      issueKey: "123",
      commentId: "77",
      sender: "alice",
    },
  };
}

function createJiraIssueCreatedEvent(): ParsedWebhookEvent {
  return {
    provider: "jira",
    eventType: "issue_created",
    deduplicationId: "jira-delivery-issue-1",
    timestamp: "2026-02-09T00:00:00.000Z",
    payload: {
      webhookEvent: "jira:issue_created",
      issue: {
        key: "OPS-42",
        fields: {
          summary: "Login outage",
          description: "Production login endpoint returns 500",
          priority: { name: "High" },
          issuetype: { name: "Bug" },
          project: { key: "OPS", id: "10001" },
        },
      },
      user: {
        displayName: "Alice Reporter",
      },
    },
    metadata: {
      repositoryId: "OPS",
      projectId: "10001",
      issueKey: "OPS-42",
      sender: "Alice Reporter",
    },
  };
}

function createJiraCommentCreatedEvent(): ParsedWebhookEvent {
  return {
    provider: "jira",
    eventType: "comment_created",
    deduplicationId: "jira-delivery-comment-1",
    timestamp: "2026-02-09T00:00:00.000Z",
    payload: {
      webhookEvent: "comment_created",
      issue: {
        key: "OPS-42",
        fields: {
          summary: "Login outage",
        },
      },
      comment: {
        id: "9001",
        body: "@viberator fix this now",
        author: {
          displayName: "Bob Commenter",
        },
      },
    },
    metadata: {
      repositoryId: "OPS",
      issueKey: "OPS-42",
      commentId: "9001",
      sender: "Bob Commenter",
    },
  };
}

function createUnsupportedJiraIssueUpdateEvent(): ParsedWebhookEvent {
  return {
    provider: "jira",
    eventType: "issue_updated",
    deduplicationId: "jira-delivery-unsupported-1",
    timestamp: "2026-02-09T00:00:00.000Z",
    payload: {
      webhookEvent: "jira:issue_updated",
      issue_event_type_name: "issue_assigned",
      issue: {
        key: "OPS-99",
        fields: {
          summary: "Assignment change",
        },
      },
    },
    metadata: {
      repositoryId: "OPS",
      issueKey: "OPS-99",
      action: "issue_assigned",
      sender: "workflow-bot",
    },
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
      getConfigById: jest.fn().mockResolvedValue(config),
    };
    const deliveryDAO = {
      updateDeliveryStatus: jest.fn().mockResolvedValue(undefined),
      getDeliveryById: jest.fn().mockResolvedValue(null),
      getDeliveryByIdForConfig: jest.fn().mockResolvedValue(null),
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
    const planner = {
      request: jest.fn().mockResolvedValue("job-1"),
    };
    const issues = {
      issue: jest.fn().mockResolvedValue({ ticketId: "ticket-1" }),
      commented: jest.fn().mockResolvedValue({ ticketId: "ticket-1" }),
    };

    // Create the processor resolver with the mocked dependencies
    const processorResolver = createDefaultInboundEventProcessorResolver(
      ticketDAO as any,
      planner,
      issues,
    );
    const configResolver = new WebhookConfigResolver(configDAO as any);
    const providerPolicyResolver = createDefaultProviderWebhookPolicyResolver();
    const deliveryLifecycle = new InboundWebhookDeliveryLifecycle(
      deduplication as any,
      deliveryDAO as any,
    );
    const serviceConfig = {
      defaultTenantId: "tenant-default",
    };
    const retryService = new WebhookRetryService(
      registry as any,
      configResolver,
      deliveryLifecycle,
      providerPolicyResolver,
      processorResolver,
      deliveryDAO as any,
      serviceConfig,
    );

    const service = new WebhookService(
      registry as any,
      deduplication as any,
      secretService as any,
      processorResolver,
      configResolver,
      providerPolicyResolver,
      deliveryLifecycle,
      retryService,
      serviceConfig,
    );

    return {
      service,
      providerFixture,
      config,
      mocks: {
        registry,
        configDAO,
        deliveryDAO,
        deduplication,
        secretService,
        ticketDAO,
        planner,
        issues,
      },
    };
  }

  function trackerContextFor(provider: "github" | "jira" | "shortcut") {
    return {
      provider,
      integrationId: "integration-1",
      webhookConfigId: `cfg-${provider}`,
    };
  }

  function createShortcutStoryEvent(
    eventType: "story_created" | "story_updated",
    data: Record<string, unknown>,
  ): ParsedWebhookEvent {
    return {
      provider: "shortcut",
      eventType,
      deduplicationId: `shortcut-delivery-${eventType}-1`,
      timestamp: "2026-02-09T00:00:00.000Z",
      payload: {
        object_type: "story",
        action: eventType === "story_created" ? "create" : "update",
        data,
      },
      metadata: {
        issueKey: String(data.id),
      },
    };
  }

  it("resolves the config from the id in the webhook's address", async () => {
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
        "payload-signature": "sha256=valid-signature",
      },
      event.payload,
      rawBody,
      "tenant-1",
      { providerName: "shortcut", configId: "cfg-shortcut" },
    );

    // The generic event isn't one the Shortcut processor reads.
    expect(result).toEqual({
      status: "ignored",
      reason: "Unsupported Shortcut event 'event_updated'",
    });
    expect(mocks.configDAO.getConfigById).toHaveBeenCalledWith("cfg-shortcut");
    expect(mocks.deduplication.shouldProcessDelivery).toHaveBeenCalledWith(
      "shortcut-delivery-1",
      "cfg-shortcut",
    );
  });

  it("refuses a delivery whose address names another provider's webhook", async () => {
    const event = createGitHubIssuesEvent("opened");
    const { service, mocks, providerFixture } = createHarness({
      providerName: "github",
      event,
      config: createConfig("jira"),
    });

    const result = await service.processWebhook(
      {
        "x-hub-signature-256": "sha256=github-signature",
      },
      event.payload,
      rawBody,
      undefined,
      { providerName: "github", configId: "cfg-jira" },
    );

    expect(result).toEqual({
      status: "ignored",
      reason: "No webhook with this address",
    });
    expect(mocks.configDAO.getConfigById).toHaveBeenCalledWith("cfg-jira");
    expect(providerFixture.verifySignature).not.toHaveBeenCalled();
    expect(mocks.deduplication.shouldProcessDelivery).not.toHaveBeenCalled();
    expect(mocks.deduplication.recordDeliveryStart).not.toHaveBeenCalled();
    expect(mocks.issues.issue).not.toHaveBeenCalled();
  });

  it("refuses a delivery whose address carries no webhook id", async () => {
    const event = createGitHubIssuesEvent("opened");
    const { service, mocks } = createHarness({
      providerName: "github",
      event,
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
      status: "ignored",
      reason: "No webhook with this address",
    });
    expect(mocks.configDAO.getConfigById).not.toHaveBeenCalled();
    expect(mocks.deduplication.recordDeliveryStart).not.toHaveBeenCalled();
  });

  it("refuses a delivery to a webhook id that doesn't exist", async () => {
    const event = createGitHubIssuesEvent("opened");
    const { service, mocks } = createHarness({
      providerName: "github",
      event,
    });
    mocks.configDAO.getConfigById.mockResolvedValue(null);

    const result = await service.processWebhook(
      {
        "x-hub-signature-256": "sha256=github-signature",
      },
      event.payload,
      rawBody,
      undefined,
      { providerName: "github", configId: "cfg-missing" },
    );

    expect(result).toEqual({
      status: "ignored",
      reason: "No webhook with this address",
    });
    expect(mocks.deduplication.recordDeliveryStart).not.toHaveBeenCalled();
  });

  it("passes a new Shortcut story to the connection's issues", async () => {
    const config = createConfig("shortcut");
    config.allowedEvents = ["story_created"];

    const event = createShortcutStoryEvent("story_created", {
      id: 777,
      name: "Shortcut story",
      description: "Story body",
      story_type: "feature",
      app_url: "https://app.shortcut.com/acme/story/777",
    });

    const { service, mocks } = createHarness({
      providerName: "shortcut",
      event,
      config,
    });
    mocks.issues.issue.mockResolvedValue({ ticketId: "ticket-1", projectId: "project-1" });

    const result = await service.processWebhook(
      {
        "x-shortcut-delivery": "shortcut-delivery-project-1",
        "payload-signature": "sha256=valid-signature",
      },
      event.payload,
      rawBody,
      undefined,
      { providerName: "shortcut", configId: "cfg-shortcut" },
    );

    expect(result).toEqual({
      status: "processed",
      ticketId: "ticket-1",
      jobId: undefined,
    });
    expect(mocks.issues.issue).toHaveBeenCalledWith(
      trackerContextFor("shortcut"),
      expect.objectContaining({
        key: "777",
        url: "https://app.shortcut.com/acme/story/777",
        title: "Shortcut story",
        description: "Story body",
        severity: "medium",
      }),
    );
    expect(mocks.deduplication.recordDeliverySuccessById).toHaveBeenCalledWith(
      "delivery-row-1",
      "ticket-1",
      "project-1",
    );
  });

  it("passes a Shortcut story update to the connection's issues", async () => {
    const config = createConfig("shortcut");
    config.allowedEvents = ["story_updated"];

    const event = createShortcutStoryEvent("story_updated", {
      id: 777,
      name: "Shortcut story updated",
      description: "Updated body from Shortcut",
      story_type: "bug",
      app_url: "https://app.shortcut.com/acme/story/777",
    });

    const { service, mocks } = createHarness({
      providerName: "shortcut",
      event,
      config,
    });
    mocks.issues.issue.mockResolvedValue({ ticketId: "ticket-shortcut-777" });

    const result = await service.processWebhook(
      {
        "x-shortcut-delivery": "shortcut-delivery-updated-1",
        "payload-signature": "sha256=valid-signature",
      },
      event.payload,
      rawBody,
      undefined,
      { providerName: "shortcut", configId: "cfg-shortcut" },
    );

    expect(result).toEqual({
      status: "processed",
      ticketId: "ticket-shortcut-777",
      jobId: undefined,
    });
    expect(mocks.issues.issue).toHaveBeenCalledWith(
      trackerContextFor("shortcut"),
      expect.objectContaining({
        key: "777",
        title: "Shortcut story updated",
        description: "Updated body from Shortcut",
        severity: "high",
      }),
    );
  });

  it("records an ignored Shortcut story update as ignored, with the reason", async () => {
    const config = createConfig("shortcut");
    config.allowedEvents = ["story_updated"];

    const event = createShortcutStoryEvent("story_updated", {
      id: 999,
      description: "Updated body from Shortcut",
    });

    const { service, mocks } = createHarness({
      providerName: "shortcut",
      event,
      config,
    });
    mocks.issues.issue.mockResolvedValue({ ignoredReason: "No space takes the issue" });

    const result = await service.processWebhook(
      {
        "x-shortcut-delivery": "shortcut-delivery-updated-missing-1",
        "payload-signature": "sha256=valid-signature",
      },
      event.payload,
      rawBody,
      undefined,
      { providerName: "shortcut", configId: "cfg-shortcut" },
    );

    expect(result).toEqual({
      status: "ignored",
      reason: "No space takes the issue",
    });
    // A story update without its name leaves the title as it is.
    expect(mocks.issues.issue).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ key: "999", title: undefined, description: "Updated body from Shortcut" }),
    );
    expect(mocks.deliveryDAO.updateDeliveryStatus).toHaveBeenCalledWith(
      "delivery-row-1",
      "ignored",
      "No space takes the issue",
    );
    expect(mocks.deduplication.recordDeliverySuccessById).not.toHaveBeenCalled();
    expect(mocks.deduplication.recordDeliveryFailureById).not.toHaveBeenCalled();
  });

  it("ignores a tracker event for a webhook that isn't part of a connection", async () => {
    const config = createConfig("shortcut");
    config.allowedEvents = ["story_created"];
    config.integrationId = null;

    const event = createShortcutStoryEvent("story_created", {
      id: 777,
      name: "Shortcut story",
    });

    const { service, mocks } = createHarness({
      providerName: "shortcut",
      event,
      config,
    });

    const result = await service.processWebhook(
      {
        "payload-signature": "sha256=valid-signature",
      },
      event.payload,
      rawBody,
      undefined,
      { providerName: "shortcut", configId: "cfg-shortcut" },
    );

    expect(result).toEqual({
      status: "ignored",
      reason: "The webhook isn't part of a connection",
    });
    expect(mocks.issues.issue).not.toHaveBeenCalled();
    expect(mocks.deliveryDAO.updateDeliveryStatus).toHaveBeenCalledWith(
      "delivery-row-1",
      "ignored",
      "The webhook isn't part of a connection",
    );
  });

  it("uses Jira signature headers consistently for verification", async () => {
    const event: ParsedWebhookEvent = {
      provider: "jira",
      eventType: "comment_created",
      deduplicationId: "jira-delivery-signature-1",
      timestamp: "2026-02-09T00:00:00.000Z",
      payload: {
        issue: {
          key: "jira-project-1-1",
          fields: {
            summary: "Signature validation test",
          },
        },
        comment: {
          id: "1",
          body: "no bot command",
          author: {
            displayName: "Tester",
          },
        },
      },
      metadata: {
        repositoryId: "jira-project-1",
        issueKey: "jira-project-1-1",
      },
    };
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
      { providerName: "jira", configId: "cfg-jira" },
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
      { providerName: "github", configId: "cfg-github" },
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
      { providerName: "github", configId: "cfg-github" },
    );

    expect(result).toEqual({
      status: "rejected",
      reason: "Invalid signature",
    });
    expect(mocks.deduplication.shouldProcessDelivery).toHaveBeenCalledWith(
      "github-delivery-1",
      "cfg-github",
    );
    expect(mocks.deduplication.recordDeliveryStart).toHaveBeenCalledTimes(1);
    expect(mocks.deduplication.recordDeliveryFailureById).toHaveBeenCalledWith(
      "delivery-row-1",
      "Rejected: Invalid signature",
    );
  });

  it("rejects unsigned Jira deliveries when no secret is configured", async () => {
    const config = createConfig("jira");
    config.webhookSecretEncrypted = null;
    const event: ParsedWebhookEvent = {
      provider: "jira",
      eventType: "comment_created",
      deduplicationId: "jira-delivery-unsigned-1",
      timestamp: "2026-02-09T00:00:00.000Z",
      payload: {
        issue: {
          key: "jira-project-1-2",
          fields: {
            summary: "Unsigned Jira test",
          },
        },
        comment: {
          id: "2",
          body: "no bot command",
          author: {
            displayName: "Tester",
          },
        },
      },
      metadata: {
        repositoryId: "jira-project-1",
        issueKey: "jira-project-1-2",
      },
    };
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
      { providerName: "jira", configId: "cfg-jira" },
    );

    expect(result).toEqual({
      status: "rejected",
      reason: "Webhook secret is not configured",
    });
    expect(providerFixture.verifySignature).not.toHaveBeenCalled();
    expect(mocks.issues.commented).not.toHaveBeenCalled();
  });

  it("rejects signed deliveries for providers with no configured secret", async () => {
    const config = createConfig("shortcut");
    config.webhookSecretEncrypted = null;
    const event = createEvent("shortcut", { repositoryId: "shortcut-project-1" });
    const { service, providerFixture, mocks } = createHarness({
      providerName: "shortcut",
      event,
      config,
    });
    mocks.secretService.getSecret.mockResolvedValue("");

    const result = await service.processWebhook(
      {
        "payload-signature": "sha256=some-signature",
      },
      event.payload,
      rawBody,
      undefined,
      { providerName: "shortcut", configId: "cfg-shortcut" },
    );

    expect(result).toEqual({
      status: "rejected",
      reason: "Webhook secret is not configured",
    });
    expect(providerFixture.verifySignature).not.toHaveBeenCalled();
  });

  it("passes a new Jira issue to the connection's issues", async () => {
    const config = createConfig("jira");
    config.allowedEvents = ["issue_created"];

    const event = createJiraIssueCreatedEvent();
    const { service, mocks } = createHarness({
      providerName: "jira",
      event,
      config,
    });

    const result = await service.processWebhook(
      {
        "x-atlassian-webhook-signature": "sha256=jira-signature",
      },
      event.payload,
      rawBody,
      "tenant-from-header",
      { providerName: "jira", configId: "cfg-jira" },
    );

    expect(result.status).toBe("processed");
    expect(mocks.issues.issue).toHaveBeenCalledWith(
      trackerContextFor("jira"),
      expect.objectContaining({
        key: "OPS-42",
        title: "Login outage",
        description: "Production login endpoint returns 500",
        author: { name: "Alice Reporter", email: null },
        severity: "high",
      }),
    );
  });

  it("passes a Jira comment that mentions the bot to the linked task as an ask", async () => {
    const config = createConfig("jira");
    config.allowedEvents = ["comment_created"];
    config.botUsername = "viberator";

    const event = createJiraCommentCreatedEvent();
    const { service, mocks } = createHarness({
      providerName: "jira",
      event,
      config,
    });
    mocks.issues.commented.mockResolvedValue({ ticketId: "ticket-1", jobId: "job-1" });

    const result = await service.processWebhook(
      {
        "x-atlassian-webhook-signature": "sha256=jira-signature",
      },
      event.payload,
      rawBody,
      undefined,
      { providerName: "jira", configId: "cfg-jira" },
    );

    expect(result).toEqual({
      status: "processed",
      ticketId: "ticket-1",
      jobId: "job-1",
    });
    expect(mocks.issues.commented).toHaveBeenCalledWith(trackerContextFor("jira"), {
      issueKey: "OPS-42",
      author: { name: "Bob Commenter", email: null },
      body: "fix this now",
      mentionsBot: true,
    });
    expect(mocks.ticketDAO.createTicket).not.toHaveBeenCalled();
  });

  it("passes a Jira issue update to the connection's issues", async () => {
    const config = createConfig("jira");
    config.allowedEvents = ["*"];

    const event = createUnsupportedJiraIssueUpdateEvent();
    const { service, mocks } = createHarness({
      providerName: "jira",
      event,
      config,
    });

    const result = await service.processWebhook(
      {
        "x-atlassian-webhook-signature": "sha256=jira-signature",
      },
      event.payload,
      rawBody,
      undefined,
      { providerName: "jira", configId: "cfg-jira" },
    );

    expect(result.status).toBe("processed");
    // An update without the description field leaves the description alone.
    expect(mocks.issues.issue).toHaveBeenCalledWith(
      trackerContextFor("jira"),
      expect.objectContaining({
        key: "OPS-99",
        title: "Assignment change",
        description: undefined,
        author: null,
      }),
    );
  });

  it("passes a new GitHub issue to the connection's issues, keyed by repository and number", async () => {
    const config = createConfig("github");
    config.allowedEvents = ["issues.opened"];

    const event = createGitHubIssuesEvent("opened");
    const { service, mocks } = createHarness({
      providerName: "github",
      event,
      config,
    });

    const result = await service.processWebhook(
      {
        "x-hub-signature-256": "sha256=github-signature",
      },
      event.payload,
      rawBody,
      "tenant-from-header",
      { providerName: "github", configId: "cfg-github" },
    );

    expect(result.status).toBe("processed");
    expect(mocks.issues.issue).toHaveBeenCalledWith(
      trackerContextFor("github"),
      expect.objectContaining({
        key: "github-project-1#123",
        url: "https://github.com/acme/repo/issues/123",
        title: "Fix login bug",
        description: "Login fails after reset",
        severity: "high",
        labels: ["high"],
        repository: "github-project-1",
      }),
    );
  });

  it.each(["edited", "labeled"])(
    "passes a GitHub issue that was %s to the connection's issues",
    async (action) => {
      const config = createConfig("github");
      config.allowedEvents = [`issues.${action}`];

      const event = createGitHubIssuesEvent(action);
      const { service, mocks } = createHarness({
        providerName: "github",
        event,
        config,
      });
      mocks.issues.issue.mockResolvedValue({ ticketId: "ticket-1", jobId: "job-1" });

      const result = await service.processWebhook(
        {
          "x-hub-signature-256": "sha256=github-signature",
        },
        event.payload,
        rawBody,
        undefined,
        { providerName: "github", configId: "cfg-github" },
      );

      expect(result).toEqual({
        status: "processed",
        ticketId: "ticket-1",
        jobId: "job-1",
      });
      expect(mocks.issues.issue).toHaveBeenCalledWith(
        trackerContextFor("github"),
        expect.objectContaining({ key: "github-project-1#123" }),
      );
    },
  );

  it("passes a GitHub comment that mentions the bot to the linked task as an ask", async () => {
    const config = createConfig("github");
    config.allowedEvents = ["issue_comment.created"];
    config.botUsername = "viberator";

    const event = createGitHubIssueCommentEvent("created");
    const { service, mocks } = createHarness({
      providerName: "github",
      event,
      config,
    });
    mocks.issues.commented.mockResolvedValue({ ticketId: "ticket-1", jobId: "job-1" });

    const result = await service.processWebhook(
      {
        "x-hub-signature-256": "sha256=github-signature",
      },
      event.payload,
      rawBody,
      undefined,
      { providerName: "github", configId: "cfg-github" },
    );

    expect(result).toEqual({
      status: "processed",
      ticketId: "ticket-1",
      jobId: "job-1",
    });
    expect(mocks.issues.commented).toHaveBeenCalledWith(trackerContextFor("github"), {
      issueKey: "github-project-1#123",
      author: { name: "alice", email: null },
      body: "fix this please",
      mentionsBot: true,
    });
  });

  it("ignores disallowed GitHub events with delivery diagnostics", async () => {
    const config = createConfig("github");
    config.allowedEvents = ["issues.opened"];

    const event = createGitHubIssuesEvent("closed");
    const { service, mocks, providerFixture } = createHarness({
      providerName: "github",
      event,
      config,
    });

    const result = await service.processWebhook(
      {
        "x-hub-signature-256": "sha256=github-signature",
      },
      event.payload,
      rawBody,
      undefined,
      { providerName: "github", configId: "cfg-github" },
    );

    expect(result.status).toBe("ignored");
    expect(result.reason).toContain("isn't set to receive");
    expect(providerFixture.verifySignature).not.toHaveBeenCalled();
    expect(mocks.issues.issue).not.toHaveBeenCalled();
    expect(mocks.deduplication.recordDeliveryStart).toHaveBeenCalledTimes(1);
    expect(mocks.deliveryDAO.updateDeliveryStatus).toHaveBeenCalledWith(
      "delivery-row-1",
      "ignored",
      expect.stringContaining("issues.closed"),
    );
    expect(mocks.deduplication.recordDeliveryFailureById).not.toHaveBeenCalled();
  });

  describe("retryDelivery", () => {
    function createDelivery(
      overrides: Partial<WebhookDeliveryAttempt> = {},
    ): WebhookDeliveryAttempt {
      const event = createGitHubIssuesEvent("opened");
      return {
        id: "delivery-row-1",
        provider: "github",
        webhookConfigId: "cfg-github",
        deliveryId: "github-delivery-1",
        eventType: "issues",
        status: "failed",
        errorMessage: "boom",
        payload: event.payload as Record<string, unknown>,
        projectId: null,
        ticketId: null,
        createdAt: new Date("2026-02-09T00:00:00.000Z"),
        processedAt: null,
        ...overrides,
      };
    }

    it("replays a failed delivery through the webhook it was sent to", async () => {
      const event = createGitHubIssuesEvent("opened");
      const { service, mocks } = createHarness({
        providerName: "github",
        event,
      });
      mocks.deliveryDAO.getDeliveryById.mockResolvedValue(createDelivery());
      mocks.issues.issue.mockResolvedValue({ ticketId: "ticket-1", projectId: "project-1" });

      const result = await service.retryDelivery("github-delivery-1", {
        deliveryAttemptId: "delivery-row-1",
      });

      expect(result).toEqual({
        status: "processed",
        ticketId: "ticket-1",
        jobId: undefined,
      });
      expect(mocks.configDAO.getConfigById).toHaveBeenCalledWith("cfg-github");
      expect(mocks.issues.issue).toHaveBeenCalledWith(
        trackerContextFor("github"),
        expect.objectContaining({ key: "github-project-1#123" }),
      );
      expect(mocks.deduplication.recordDeliverySuccessById).toHaveBeenCalledWith(
        "delivery-row-1",
        "ticket-1",
        "project-1",
      );
    });

    it("records a retried delivery that is ignored as ignored, with the reason", async () => {
      const event = createGitHubIssuesEvent("opened");
      const { service, mocks } = createHarness({
        providerName: "github",
        event,
      });
      mocks.deliveryDAO.getDeliveryById.mockResolvedValue(createDelivery());
      mocks.issues.issue.mockResolvedValue({ ignoredReason: "No space takes the issue" });

      const result = await service.retryDelivery("github-delivery-1", {
        deliveryAttemptId: "delivery-row-1",
      });

      expect(result).toEqual({
        status: "ignored",
        reason: "No space takes the issue",
      });
      expect(mocks.deliveryDAO.updateDeliveryStatus).toHaveBeenCalledWith(
        "delivery-row-1",
        "ignored",
        "No space takes the issue",
      );
    });

    it("fails a delivery that wasn't sent to a webhook", async () => {
      const event = createGitHubIssuesEvent("opened");
      const { service, mocks } = createHarness({
        providerName: "github",
        event,
      });
      mocks.deliveryDAO.getDeliveryById.mockResolvedValue(
        createDelivery({ webhookConfigId: null }),
      );

      const result = await service.retryDelivery("github-delivery-1", {
        deliveryAttemptId: "delivery-row-1",
      });

      expect(result).toEqual({
        status: "failed",
        reason: "Webhook configuration not found",
      });
      expect(mocks.configDAO.getConfigById).not.toHaveBeenCalled();
      expect(mocks.issues.issue).not.toHaveBeenCalled();
    });

    it("doesn't replay a delivery that already succeeded", async () => {
      const event = createGitHubIssuesEvent("opened");
      const { service, mocks } = createHarness({
        providerName: "github",
        event,
      });
      mocks.deliveryDAO.getDeliveryById.mockResolvedValue(
        createDelivery({ status: "succeeded" }),
      );

      const result = await service.retryDelivery("github-delivery-1", {
        deliveryAttemptId: "delivery-row-1",
      });

      expect(result).toEqual({
        status: "duplicate",
        reason: "Delivery already succeeded",
        existingId: "delivery-row-1",
      });
      expect(mocks.issues.issue).not.toHaveBeenCalled();
    });
  });
});
