import type { AxiosInstance } from "axios";
import type {
  WebhookConfig,
  WebhookConfigDAO,
} from "../../../persistence/webhook/WebhookConfigDAO";
import type { WebhookSecretService } from "../../../webhooks/WebhookSecretService";
import { FeedbackService } from "../../../webhooks/FeedbackService";
import { FeedbackOutboundConfigResolver } from "../../../webhooks/feedback/FeedbackOutboundConfigResolver";
import { FeedbackOutboundContextResolver } from "../../../webhooks/feedback/FeedbackOutboundContextResolver";
import { FeedbackEventDispatcher } from "../../../webhooks/feedback/FeedbackEventDispatcher";
import { FeedbackOutboundTargetResolver } from "../../../webhooks/feedback/FeedbackOutboundTargetResolver";
import { FeedbackRetryExecutor } from "../../../webhooks/feedback/FeedbackRetryExecutor";
import { createDefaultFeedbackProviderBehaviorResolver } from "../../../webhooks/feedback/provider-behaviors";
import type { ProviderRegistry } from "../../../webhooks/ProviderRegistry";
import {
  WebhookProvider,
  type ParsedWebhookEvent,
  type WebhookProviderConfig,
  type WebhookResult,
} from "../../../webhooks/WebhookProvider";
import type { TicketDAO } from "../../../persistence/ticketing/TicketDAO";

class MockGitHubProvider extends WebhookProvider {
  readonly name = "github";

  static readonly postCommentMock = jest.fn<Promise<void>, [string, string]>();
  static readonly updateLabelsMock = jest.fn<Promise<void>, [string, string[], string[]]>();
  static readonly postResultMock = jest.fn<Promise<void>, [string, WebhookResult]>();

  parseEvent(
    _payload: unknown,
    _headers: Record<string, string>,
  ): ParsedWebhookEvent {
    throw new Error("parseEvent is not used in FeedbackService tests");
  }

  verifySignature(_payload: Buffer, _signature: string, _secret: string): boolean {
    return true;
  }

  getSupportedEvents(): string[] {
    return [];
  }

  validateConfig(_config: WebhookProviderConfig): boolean {
    return true;
  }

  async postComment(issueNumber: string, body: string): Promise<void> {
    await MockGitHubProvider.postCommentMock(issueNumber, body);
  }

  async updateLabels(
    issueNumber: string,
    add: string[],
    remove: string[],
  ): Promise<void> {
    await MockGitHubProvider.updateLabelsMock(issueNumber, add, remove);
  }

  async postResult(issueNumber: string, result: WebhookResult): Promise<void> {
    await MockGitHubProvider.postResultMock(issueNumber, result);
  }

  protected createHttpClient(): AxiosInstance {
    throw new Error("HTTP client is not used in FeedbackService tests");
  }
}

class MockJiraProvider extends WebhookProvider {
  readonly name = "jira";

  static readonly postCommentMock = jest.fn<Promise<void>, [string, string]>();
  static readonly updateLabelsMock = jest.fn<Promise<void>, [string, string[], string[]]>();
  static readonly postResultMock = jest.fn<Promise<void>, [string, WebhookResult]>();

  parseEvent(
    _payload: unknown,
    _headers: Record<string, string>,
  ): ParsedWebhookEvent {
    throw new Error("parseEvent is not used in FeedbackService tests");
  }

  verifySignature(_payload: Buffer, _signature: string, _secret: string): boolean {
    return true;
  }

  getSupportedEvents(): string[] {
    return [];
  }

  validateConfig(_config: WebhookProviderConfig): boolean {
    return true;
  }

  async postComment(issueKey: string, body: string): Promise<void> {
    await MockJiraProvider.postCommentMock(issueKey, body);
  }

  async updateLabels(
    issueKey: string,
    add: string[],
    remove: string[],
  ): Promise<void> {
    await MockJiraProvider.updateLabelsMock(issueKey, add, remove);
  }

  async postResult(issueKey: string, result: WebhookResult): Promise<void> {
    await MockJiraProvider.postResultMock(issueKey, result);
  }

  protected createHttpClient(): AxiosInstance {
    throw new Error("HTTP client is not used in FeedbackService tests");
  }
}

function createConfig(
  overrides: Partial<WebhookConfig> = {},
): WebhookConfig {
  const timestamp = new Date("2026-02-10T00:00:00.000Z");
  return {
    id: overrides.id || "cfg-1",
    projectId: overrides.projectId ?? "project-1",
    provider: overrides.provider || "github",
    direction: overrides.direction || "outbound",
    providerProjectId:
      overrides.providerProjectId === undefined
        ? "acme/repo"
        : overrides.providerProjectId,
    integrationId:
      overrides.integrationId === undefined
        ? "integration-1"
        : overrides.integrationId,
    secretLocation: overrides.secretLocation || "database",
    secretPath: overrides.secretPath ?? null,
    webhookSecretEncrypted: overrides.webhookSecretEncrypted ?? "encrypted-secret",
    apiTokenEncrypted: overrides.apiTokenEncrypted ?? "encrypted-api-token",
    allowedEvents: overrides.allowedEvents || ["job_started", "job_ended"],
    autoExecute: overrides.autoExecute ?? false,
    botUsername: overrides.botUsername ?? null,
    labelMappings: overrides.labelMappings || {},
    active: overrides.active ?? true,
    createdAt: overrides.createdAt || timestamp,
    updatedAt: overrides.updatedAt || timestamp,
  };
}

describe("FeedbackService", () => {
  let service: FeedbackService;
  let provider: WebhookProvider;
  let mockTicketDAO: { getTicket: jest.Mock };
  let mockRegistry: { get: jest.Mock };
  let mockConfigDAO: {
    getConfigById: jest.Mock;
    getByIntegrationId: jest.Mock;
    listByIntegrationId: jest.Mock;
    getActiveConfigByProviderProject: jest.Mock;
    listConfigsByProject: jest.Mock;
    listActiveConfigs: jest.Mock;
  };
  let mockSecretService: { getApiToken: jest.Mock };

  const inboundConfig = createConfig({
    id: "inbound-1",
    direction: "inbound",
    providerProjectId: "acme/repo",
  });

  const outboundConfig = createConfig({
    id: "outbound-1",
    direction: "outbound",
    providerProjectId: "acme/repo",
  });

  beforeEach(() => {
    jest.clearAllMocks();
    MockGitHubProvider.postCommentMock.mockReset();
    MockGitHubProvider.updateLabelsMock.mockReset();
    MockGitHubProvider.postResultMock.mockReset();
    MockJiraProvider.postCommentMock.mockReset();
    MockJiraProvider.updateLabelsMock.mockReset();
    MockJiraProvider.postResultMock.mockReset();

    provider = new MockGitHubProvider({
      type: "github",
      secretLocation: "database",
      algorithm: "sha256",
      allowedEvents: ["*"],
      apiToken: "template-token",
      providerProjectId: "template/repo",
    });

    mockTicketDAO = {
      getTicket: jest.fn(),
    };

    mockConfigDAO = {
      getConfigById: jest.fn().mockResolvedValue(inboundConfig),
      getByIntegrationId: jest.fn().mockResolvedValue(outboundConfig),
      listByIntegrationId: jest.fn().mockResolvedValue([outboundConfig]),
      getActiveConfigByProviderProject: jest.fn().mockResolvedValue(null),
      listConfigsByProject: jest.fn().mockResolvedValue([outboundConfig]),
      listActiveConfigs: jest.fn().mockResolvedValue([outboundConfig]),
    };

    mockSecretService = {
      getApiToken: jest.fn().mockResolvedValue("gh-api-token"),
    };

    mockRegistry = {
      get: jest.fn(() => provider),
    };

    const providerBehaviorResolver = createDefaultFeedbackProviderBehaviorResolver();
    const contextResolver = new FeedbackOutboundContextResolver(
      mockTicketDAO as unknown as TicketDAO,
      providerBehaviorResolver,
    );
    const configResolver = new FeedbackOutboundConfigResolver(
      mockConfigDAO as unknown as WebhookConfigDAO,
      providerBehaviorResolver,
    );
    const targetResolver = new FeedbackOutboundTargetResolver(
      contextResolver,
      configResolver,
      providerBehaviorResolver,
    );
    const retryExecutor = new FeedbackRetryExecutor();
    const eventDispatcher = new FeedbackEventDispatcher(
      mockRegistry as unknown as ProviderRegistry,
      mockSecretService as unknown as WebhookSecretService,
      targetResolver,
      retryExecutor,
      providerBehaviorResolver,
    );

    service = new FeedbackService(
      mockRegistry as unknown as ProviderRegistry,
      mockConfigDAO as unknown as WebhookConfigDAO,
      eventDispatcher,
    );
  });

  it("dispatches job_started using integration-linked outbound config", async () => {
    mockTicketDAO.getTicket.mockResolvedValue({
      id: "ticket-1",
      projectId: "project-1",
      ticketSystem: "github",
      externalTicketId: "42",
      metadata: {
        webhookConfigId: "inbound-1",
        repository: "acme/repo",
      },
    } as any);

    const result = await service.postJobStarted({
      id: "job-1",
      ticketId: "ticket-1",
      status: "active",
      repository: "acme/repo",
    });

    expect(result).toEqual({
      success: true,
      commentPosted: true,
      labelsUpdated: false,
    });
    expect(MockGitHubProvider.postCommentMock).toHaveBeenCalledWith(
      "42",
      expect.stringContaining("Job Started"),
    );
    expect(mockConfigDAO.listByIntegrationId).toHaveBeenCalledWith(
      "integration-1",
      expect.objectContaining({
        direction: "outbound",
        activeOnly: true,
      }),
    );
  });

  it("resolves providerProjectId explicitly when outbound config omits it", async () => {
    const outboundWithoutProject = createConfig({
      id: "outbound-2",
      direction: "outbound",
      providerProjectId: null,
    });
    mockConfigDAO.getByIntegrationId.mockResolvedValue(outboundWithoutProject);
    mockConfigDAO.listByIntegrationId.mockResolvedValue([outboundWithoutProject]);

    mockTicketDAO.getTicket.mockResolvedValue({
      id: "ticket-1",
      projectId: "project-1",
      ticketSystem: "github",
      externalTicketId: "77",
      metadata: {
        webhookConfigId: "inbound-1",
        repository: "acme/repo",
      },
    } as any);

    const result = await service.postJobStarted({
      id: "job-2",
      ticketId: "ticket-1",
      status: "active",
      repository: "acme/repo",
    });

    expect(result.success).toBe(true);
    expect(mockSecretService.getApiToken).toHaveBeenCalledWith(
      expect.objectContaining({
        providerProjectId: "acme/repo",
      }),
    );
  });

  it("honors outbound event toggles", async () => {
    const endedOnlyConfig = createConfig({
      id: "outbound-3",
      direction: "outbound",
      allowedEvents: ["job_ended"],
    });
    mockConfigDAO.getByIntegrationId.mockResolvedValue(endedOnlyConfig);
    mockConfigDAO.listByIntegrationId.mockResolvedValue([endedOnlyConfig]);

    mockTicketDAO.getTicket.mockResolvedValue({
      id: "ticket-1",
      projectId: "project-1",
      ticketSystem: "github",
      externalTicketId: "42",
      metadata: {
        webhookConfigId: "inbound-1",
      },
    } as any);

    const result = await service.postJobStarted({
      id: "job-3",
      ticketId: "ticket-1",
      status: "active",
    });

    expect(result.success).toBe(true);
    expect(result.error).toContain("not enabled");
    expect(MockGitHubProvider.postCommentMock).not.toHaveBeenCalled();
  });

  it("retries transient GitHub failures and succeeds", async () => {
    MockGitHubProvider.postCommentMock
      .mockRejectedValueOnce({
        response: { status: 503 },
        message: "Service unavailable",
      })
      .mockResolvedValueOnce(undefined);

    mockTicketDAO.getTicket.mockResolvedValue({
      id: "ticket-1",
      projectId: "project-1",
      ticketSystem: "github",
      externalTicketId: "42",
      metadata: {
        webhookConfigId: "inbound-1",
      },
    } as any);

    const result = await service.postJobStarted({
      id: "job-4",
      ticketId: "ticket-1",
      status: "active",
    });

    expect(result.success).toBe(true);
    expect(MockGitHubProvider.postCommentMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry non-transient failures", async () => {
    MockGitHubProvider.postResultMock.mockRejectedValueOnce(new Error("Validation failed"));

    mockTicketDAO.getTicket.mockResolvedValue({
      id: "ticket-1",
      projectId: "project-1",
      ticketSystem: "github",
      externalTicketId: "42",
      metadata: {
        webhookConfigId: "inbound-1",
      },
    } as any);

    const result = await service.postJobEnded(
      {
        id: "job-5",
        ticketId: "ticket-1",
        status: "failed",
      },
      {
        success: false,
        changedFiles: [],
        executionTime: 100,
        errorMessage: "Validation failed",
      },
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("Validation failed");
    expect(MockGitHubProvider.postResultMock).toHaveBeenCalledTimes(1);
  });

  it("returns non-blocking success when external ticket ID is missing", async () => {
    mockTicketDAO.getTicket.mockResolvedValue({
      id: "ticket-1",
      projectId: "project-1",
      ticketSystem: "github",
      metadata: {
        webhookConfigId: "inbound-1",
      },
    } as any);

    const result = await service.postJobStarted({
      id: "job-6",
      ticketId: "ticket-1",
      status: "active",
      repository: "acme/repo",
    });

    expect(result.success).toBe(true);
    expect(result.error).toBe("No external ticket ID found");
    expect(MockGitHubProvider.postCommentMock).not.toHaveBeenCalled();
  });

  it("resolves Jira issue key and Jira API base URL from ticket metadata", async () => {
    provider = new MockJiraProvider({
      type: "jira",
      secretLocation: "database",
      algorithm: "sha256",
      allowedEvents: ["*"],
      apiToken: "template-token",
      providerProjectId: "OPS",
      apiBaseUrl: "https://fallback.atlassian.net/rest/api/3",
    });

    const jiraInboundConfig = createConfig({
      id: "inbound-jira-1",
      provider: "jira",
      direction: "inbound",
      providerProjectId: "OPS",
    });
    const jiraOutboundConfig = createConfig({
      id: "outbound-jira-1",
      provider: "jira",
      direction: "outbound",
      providerProjectId: "OPS",
    });

    mockConfigDAO.getConfigById.mockResolvedValue(jiraInboundConfig);
    mockConfigDAO.getByIntegrationId.mockResolvedValue(jiraOutboundConfig);
    mockConfigDAO.listByIntegrationId.mockResolvedValue([jiraOutboundConfig]);
    mockConfigDAO.listConfigsByProject.mockResolvedValue([jiraOutboundConfig]);
    mockConfigDAO.listActiveConfigs.mockResolvedValue([jiraOutboundConfig]);

    mockTicketDAO.getTicket.mockResolvedValue({
      id: "ticket-jira-1",
      projectId: "project-1",
      ticketSystem: "jira",
      metadata: {
        webhookConfigId: "inbound-jira-1",
        provider: "jira",
        jiraIssueApiUrl: "https://acme.atlassian.net/rest/api/3/issue/OPS-42",
        externalTicketUrl: "https://acme.atlassian.net/browse/OPS-42",
      },
    } as any);

    const result = await service.postJobStarted({
      id: "job-jira-1",
      ticketId: "ticket-jira-1",
      status: "active",
    });

    expect(result.success).toBe(true);
    expect(MockJiraProvider.postCommentMock).toHaveBeenCalledWith(
      "OPS-42",
      expect.stringContaining("Job Started"),
    );
    expect(mockSecretService.getApiToken).toHaveBeenCalledWith(
      expect.objectContaining({
        apiBaseUrl: "https://acme.atlassian.net/rest/api/3",
      }),
    );
  });

  it("returns non-blocking success when Jira issue key cannot be resolved", async () => {
    provider = new MockJiraProvider({
      type: "jira",
      secretLocation: "database",
      algorithm: "sha256",
      allowedEvents: ["*"],
      apiToken: "template-token",
      providerProjectId: "OPS",
      apiBaseUrl: "https://fallback.atlassian.net/rest/api/3",
    });

    const jiraInboundConfig = createConfig({
      id: "inbound-jira-2",
      provider: "jira",
      direction: "inbound",
      providerProjectId: "OPS",
    });
    const jiraOutboundConfig = createConfig({
      id: "outbound-jira-2",
      provider: "jira",
      direction: "outbound",
      providerProjectId: "OPS",
    });

    mockConfigDAO.getConfigById.mockResolvedValue(jiraInboundConfig);
    mockConfigDAO.getByIntegrationId.mockResolvedValue(jiraOutboundConfig);
    mockConfigDAO.listByIntegrationId.mockResolvedValue([jiraOutboundConfig]);
    mockConfigDAO.listConfigsByProject.mockResolvedValue([jiraOutboundConfig]);
    mockConfigDAO.listActiveConfigs.mockResolvedValue([jiraOutboundConfig]);

    mockTicketDAO.getTicket.mockResolvedValue({
      id: "ticket-jira-2",
      projectId: "project-1",
      ticketSystem: "jira",
      metadata: {
        webhookConfigId: "inbound-jira-2",
        provider: "jira",
      },
    } as any);

    const result = await service.postJobStarted({
      id: "job-jira-2",
      ticketId: "ticket-jira-2",
      status: "active",
    });

    expect(result).toEqual({
      success: true,
      error: "No external ticket ID found",
    });
    expect(MockJiraProvider.postCommentMock).not.toHaveBeenCalled();
  });
});
