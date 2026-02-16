import { WebhookService } from "../../../webhooks/WebhookService";
import { createDefaultInboundEventProcessorResolver } from "../../../webhooks/InboundEventProcessorResolver";
import { WebhookConfigResolver } from "../../../webhooks/WebhookConfigResolver";
import { createDefaultProviderWebhookPolicyResolver } from "../../../webhooks/ProviderWebhookPolicyResolver";
import { InboundWebhookDeliveryLifecycle } from "../../../webhooks/InboundWebhookDeliveryLifecycle";
import { WebhookRetryService } from "../../../webhooks/WebhookRetryService";
import type { ParsedWebhookEvent, WebhookProvider } from "../../../webhooks/WebhookProvider";
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
      getConfigById: jest.fn().mockResolvedValue(null),
      getByIntegrationId: jest.fn().mockResolvedValue(null),
      listByIntegrationId: jest.fn().mockResolvedValue([]),
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
    const projectScmConfigDAO = {
      getByProjectId: jest.fn().mockResolvedValue(null),
    };

    // Create the processor resolver with the mocked dependencies
    const processorResolver = createDefaultInboundEventProcessorResolver(
      ticketDAO as any,
      jobService as any,
      projectScmConfigDAO as any,
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
      mocks: {
        registry,
        configDAO,
        deliveryDAO,
        deduplication,
        secretService,
        ticketDAO,
        jobService,
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
        "payload-signature": "sha256=valid-signature",
      },
      event.payload,
      rawBody,
      "tenant-1",
      { providerName: "shortcut" },
    );

    expect(result.status).toBe("ignored");
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

  it("resolves Shortcut config candidates from issue key when project metadata is absent", async () => {
    const event: ParsedWebhookEvent = {
      provider: "shortcut",
      eventType: "story_created",
      deduplicationId: "shortcut-delivery-story-1",
      timestamp: "2026-02-09T00:00:00.000Z",
      payload: {
        object_type: "story",
        action: "create",
        data: {
          id: 321,
          name: "Broken flow",
          story_type: "bug",
          app_url: "https://app.shortcut.com/acme/story/321",
        },
      },
      metadata: {
        issueKey: "321",
      },
    };
    const config = createConfig("shortcut");
    config.providerProjectId = "321";
    config.allowedEvents = ["story_created"];

    const { service, mocks } = createHarness({
      providerName: "shortcut",
      event,
      config,
    });

    const result = await service.processWebhook(
      {
        "x-shortcut-delivery": "shortcut-delivery-story-1",
        "payload-signature": "sha256=valid-signature",
      },
      event.payload,
      rawBody,
      undefined,
      { providerName: "shortcut" },
    );

    expect(result.status).toBe("processed");
    expect(mocks.configDAO.getActiveConfigByProviderProject).toHaveBeenCalledWith(
      "shortcut",
      "321",
      "inbound",
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

  it("allows unsigned Jira deliveries when no secret is configured", async () => {
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
      { providerName: "jira" },
    );

    expect(result.status).toBe("processed");
    expect(providerFixture.verifySignature).not.toHaveBeenCalled();
  });

  it("creates Jira ticket for issue_created and prefers config project linkage", async () => {
    const config = createConfig("jira");
    config.allowedEvents = ["issue_created"];
    config.autoExecute = false;
    config.projectId = "project-from-config";
    config.providerProjectId = "OPS";

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
      { providerName: "jira" },
    );

    expect(result.status).toBe("processed");
    expect(mocks.ticketDAO.createTicket).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "project-from-config",
        title: "Login outage",
        autoFixRequested: false,
      }),
    );
    expect(mocks.jobService.submitJob).not.toHaveBeenCalled();
  });

  it("creates Jira ticket and job for bot-triggered comment_created flow", async () => {
    const config = createConfig("jira");
    config.allowedEvents = ["comment_created"];
    config.botUsername = "viberator";

    const event = createJiraCommentCreatedEvent();
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
      { providerName: "jira" },
    );

    expect(result).toEqual({
      status: "processed",
      ticketId: "ticket-1",
      jobId: "job-1",
    });
    expect(mocks.ticketDAO.createTicket).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Login outage",
        autoFixRequested: true,
      }),
    );
    expect(mocks.jobService.submitJob).toHaveBeenCalledTimes(1);
  });

  it("ignores unsupported Jira issue actions with explicit reason", async () => {
    const config = createConfig("jira");
    config.allowedEvents = ["*"];
    config.providerProjectId = "OPS";

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
      { providerName: "jira" },
    );

    expect(result.status).toBe("ignored");
    expect(result.reason).toContain("issue_updated.issue_assigned");
    expect(mocks.deduplication.recordDeliveryStart).toHaveBeenCalledTimes(1);
    expect(mocks.ticketDAO.createTicket).not.toHaveBeenCalled();
  });

  it("resolves Jira config from issue key project prefix when metadata lacks project IDs", async () => {
    const config = createConfig("jira");
    config.providerProjectId = "OPS";
    config.allowedEvents = ["issue_created"];

    const event = {
      ...createJiraIssueCreatedEvent(),
      metadata: {
        issueKey: "OPS-42",
      },
    };
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
      { providerName: "jira" },
    );

    expect(result.status).toBe("processed");
    expect(mocks.configDAO.getActiveConfigByProviderProject).toHaveBeenCalledWith(
      "jira",
      "OPS",
      "inbound",
    );
  });

  it("creates GitHub ticket for issues.opened and links to config project deterministically", async () => {
    const config = createConfig("github");
    config.allowedEvents = ["issues.opened"];
    config.autoExecute = false;
    config.projectId = "project-from-config";

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
      { providerName: "github" },
    );

    expect(result.status).toBe("processed");
    expect(mocks.ticketDAO.createTicket).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "project-from-config",
        title: "Fix login bug",
        autoFixRequested: false,
      }),
    );
    expect(mocks.jobService.submitJob).not.toHaveBeenCalled();
  });

  it("submits GitHub job automatically for issues.opened when autoExecute is enabled", async () => {
    const config = createConfig("github");
    config.allowedEvents = ["issues.opened"];
    config.autoExecute = true;

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
      undefined,
      { providerName: "github" },
    );

    expect(result).toEqual({
      status: "processed",
      ticketId: "ticket-1",
      jobId: "job-1",
    });
    expect(mocks.jobService.submitJob).toHaveBeenCalledWith(
      expect.objectContaining({
        task: "Fix issue: Fix login bug",
      }),
      { ticketId: "ticket-1" },
    );
  });

  it("skips GitHub auto-execute when label-gated policy does not match issue labels", async () => {
    const config = createConfig("github");
    config.allowedEvents = ["issues.opened"];
    config.autoExecute = true;
    config.labelMappings = {
      github: {
        autoExecuteMode: "label_gated",
        requiredLabels: ["autofix"],
      },
    };

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
      undefined,
      { providerName: "github" },
    );

    expect(result.status).toBe("processed");
    expect(mocks.jobService.submitJob).not.toHaveBeenCalled();
    expect(mocks.ticketDAO.createTicket).toHaveBeenCalledWith(
      expect.objectContaining({
        autoFixRequested: false,
      }),
    );
  });

  it("submits GitHub auto-execute job when label-gated policy matches issue labels", async () => {
    const config = createConfig("github");
    config.allowedEvents = ["issues.opened"];
    config.autoExecute = true;
    config.labelMappings = {
      github: {
        autoExecuteMode: "label_gated",
        requiredLabels: ["high"],
      },
    };

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
      undefined,
      { providerName: "github" },
    );

    expect(result).toEqual({
      status: "processed",
      ticketId: "ticket-1",
      jobId: "job-1",
    });
    expect(mocks.ticketDAO.createTicket).toHaveBeenCalledWith(
      expect.objectContaining({
        autoFixRequested: true,
      }),
    );
    expect(mocks.jobService.submitJob).toHaveBeenCalledTimes(1);
  });

  it("creates ticket and job for bot-triggered issue_comment.created flow", async () => {
    const config = createConfig("github");
    config.allowedEvents = ["issue_comment.created"];
    config.botUsername = "viberator";

    const event = createGitHubIssueCommentEvent("created");
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
      undefined,
      { providerName: "github" },
    );

    expect(result).toEqual({
      status: "processed",
      ticketId: "ticket-1",
      jobId: "job-1",
    });
    expect(mocks.ticketDAO.createTicket).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Fix login bug",
        autoFixRequested: true,
      }),
    );
    expect(mocks.jobService.submitJob).toHaveBeenCalledTimes(1);
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
      { providerName: "github" },
    );

    expect(result.status).toBe("ignored");
    expect(result.reason).toContain("not allowed");
    expect(providerFixture.verifySignature).not.toHaveBeenCalled();
    expect(mocks.deduplication.recordDeliveryStart).toHaveBeenCalledTimes(1);
    expect(mocks.deduplication.recordDeliveryFailureById).toHaveBeenCalledWith(
      "delivery-row-1",
      expect.stringContaining("issues.closed"),
    );
  });

  it("uses integration-scoped config resolution deterministically with provider project match", async () => {
    const event = createGitHubIssuesEvent("opened");
    const { service, mocks } = createHarness({
      providerName: "github",
      event,
      config: createConfig("github"),
    });

    const nonMatchingConfig = {
      ...createConfig("github"),
      id: "cfg-github-a",
      providerProjectId: "github-project-2",
      createdAt: new Date("2026-02-09T00:00:00.000Z"),
      updatedAt: new Date("2026-02-09T00:00:00.000Z"),
    };
    const matchingConfig = {
      ...createConfig("github"),
      id: "cfg-github-b",
      providerProjectId: "github-project-1",
      createdAt: new Date("2026-02-08T00:00:00.000Z"),
      updatedAt: new Date("2026-02-08T00:00:00.000Z"),
      allowedEvents: ["issues.opened"],
    };
    mocks.configDAO.listByIntegrationId.mockResolvedValue([
      nonMatchingConfig,
      matchingConfig,
    ]);
    mocks.configDAO.getActiveConfigByProviderProject.mockResolvedValue(null);
    mocks.configDAO.listConfigsByProvider.mockResolvedValue([
      nonMatchingConfig,
      matchingConfig,
    ]);

    const result = await service.processWebhook(
      {
        "x-hub-signature-256": "sha256=github-signature",
      },
      event.payload,
      rawBody,
      undefined,
      {
        providerName: "github",
        integrationId: "integration-1",
      },
    );

    expect(result.status).toBe("processed");
    expect(mocks.configDAO.listByIntegrationId).toHaveBeenCalledWith(
      "integration-1",
      {
        direction: "inbound",
        activeOnly: false,
      },
    );
    expect(mocks.deduplication.shouldProcessDelivery).toHaveBeenCalledWith(
      "github-delivery-1",
      "cfg-github-b",
    );
    expect(mocks.configDAO.getActiveConfigByProviderProject).not.toHaveBeenCalled();
  });
});
