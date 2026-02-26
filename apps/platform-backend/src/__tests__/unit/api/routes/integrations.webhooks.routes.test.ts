import express from "express";
import request from "supertest";

const mockIntegrationDAO = {
  getIntegration: jest.fn(),
};
const mockProjectLinkDAO = {
  getIntegrationProjects: jest.fn(),
  isLinked: jest.fn(),
  linkIntegration: jest.fn(),
};
const mockCredentialDAO = {
  deleteAllForIntegration: jest.fn(),
};
const mockWebhookConfigDAO = {
  listByIntegrationId: jest.fn(),
  getByIntegrationAndConfigId: jest.fn(),
  createConfig: jest.fn(),
  updateConfig: jest.fn(),
  getConfigById: jest.fn(),
  deleteConfig: jest.fn(),
};
const mockWebhookDeliveryDAO = {
  listDeliveriesByConfig: jest.fn(),
  getDeliveryByIdForConfig: jest.fn(),
};
const mockWebhookService = {
  retryDelivery: jest.fn(),
};

jest.mock("../../../../api/middleware/authentication", () => ({
  requireAuth: (
    _req: express.Request,
    _res: express.Response,
    next: express.NextFunction,
  ) => next(),
}));

jest.mock("../../../../persistence/integrations", () => ({
  IntegrationDAO: jest.fn(() => mockIntegrationDAO),
  ProjectIntegrationLinkDAO: jest.fn(() => mockProjectLinkDAO),
  IntegrationCredentialDAO: jest.fn(() => mockCredentialDAO),
}));

jest.mock("../../../../persistence/webhook/WebhookConfigDAO", () => ({
  WebhookConfigDAO: jest.fn(() => mockWebhookConfigDAO),
}));

jest.mock("../../../../persistence/webhook/WebhookDeliveryDAO", () => ({
  WebhookDeliveryDAO: jest.fn(() => mockWebhookDeliveryDAO),
}));

jest.mock("../../../../webhooks/webhookServiceFactory", () => ({
  getWebhookService: jest.fn(() => mockWebhookService),
}));

import integrationsRouter from "../../../../api/routes/integrations";

describe("integration webhook routes (instance/config-scoped)", () => {
  let app: express.Express;

  beforeEach(() => {
    jest.clearAllMocks();
    mockIntegrationDAO.getIntegration.mockReset();
    mockProjectLinkDAO.getIntegrationProjects.mockReset();
    mockProjectLinkDAO.isLinked.mockReset();
    mockProjectLinkDAO.linkIntegration.mockReset();
    mockCredentialDAO.deleteAllForIntegration.mockReset();
    mockWebhookConfigDAO.listByIntegrationId.mockReset();
    mockWebhookConfigDAO.getByIntegrationAndConfigId.mockReset();
    mockWebhookConfigDAO.createConfig.mockReset();
    mockWebhookConfigDAO.updateConfig.mockReset();
    mockWebhookConfigDAO.getConfigById.mockReset();
    mockWebhookConfigDAO.deleteConfig.mockReset();
    mockWebhookDeliveryDAO.listDeliveriesByConfig.mockReset();
    mockWebhookDeliveryDAO.getDeliveryByIdForConfig.mockReset();
    mockWebhookService.retryDelivery.mockReset();

    mockProjectLinkDAO.isLinked.mockResolvedValue(true);
    mockProjectLinkDAO.linkIntegration.mockResolvedValue({
      id: "link-1",
      projectId: "project-1",
      integrationId: "int-1",
      isPrimary: false,
      createdAt: new Date("2026-02-11T10:00:00.000Z"),
    });

    app = express();
    app.use(express.json());
    app.use("/api/integrations", integrationsRouter);
  });

  it("lists deliveries scoped to an explicit inbound webhook config id", async () => {
    mockIntegrationDAO.getIntegration.mockResolvedValue({
      id: "int-1",
      system: "github",
    });
    mockWebhookConfigDAO.getByIntegrationAndConfigId.mockResolvedValue({
      id: "cfg-1",
      direction: "inbound",
    });
    mockWebhookDeliveryDAO.listDeliveriesByConfig.mockResolvedValue([
      {
        id: "delivery-row-1",
        provider: "github",
        webhookConfigId: "cfg-1",
        deliveryId: "delivery-1",
        eventType: "issues",
        status: "failed",
        errorMessage: "Signature failed",
        ticketId: null,
        createdAt: new Date("2026-02-09T10:00:00.000Z"),
        processedAt: null,
      },
    ]);

    const response = await request(app)
      .get(
        "/api/integrations/int-1/webhooks/inbound/cfg-1/deliveries?limit=10&offset=2",
      )
      .expect(200);

    expect(mockWebhookDeliveryDAO.listDeliveriesByConfig).toHaveBeenCalledWith(
      "cfg-1",
      {
        statuses: undefined,
        limit: 10,
        offset: 2,
        sortOrder: "desc",
      },
    );
    expect(response.body.pagination).toEqual({
      limit: 10,
      offset: 2,
      count: 1,
    });
    expect(response.body.data).toEqual([
      expect.objectContaining({
        id: "delivery-row-1",
        webhookConfigId: "cfg-1",
        deliveryId: "delivery-1",
        eventType: "issues",
        retryable: true,
      }),
    ]);
  });

  it("applies explicit status filters when listing config-scoped deliveries", async () => {
    mockIntegrationDAO.getIntegration.mockResolvedValue({
      id: "int-1",
      system: "github",
    });
    mockWebhookConfigDAO.getByIntegrationAndConfigId.mockResolvedValue({
      id: "cfg-1",
      direction: "inbound",
    });
    mockWebhookDeliveryDAO.listDeliveriesByConfig.mockResolvedValue([]);

    await request(app)
      .get(
        "/api/integrations/int-1/webhooks/inbound/cfg-1/deliveries?statuses=failed,processing",
      )
      .expect(200);

    expect(mockWebhookDeliveryDAO.listDeliveriesByConfig).toHaveBeenCalledWith(
      "cfg-1",
      {
        statuses: ["failed", "processing"],
        limit: 50,
        offset: 0,
        sortOrder: "desc",
      },
    );
  });

  it("rejects invalid delivery status filters", async () => {
    mockIntegrationDAO.getIntegration.mockResolvedValue({
      id: "int-1",
      system: "github",
    });
    mockWebhookConfigDAO.getByIntegrationAndConfigId.mockResolvedValue({
      id: "cfg-1",
      direction: "inbound",
    });

    const response = await request(app)
      .get(
        "/api/integrations/int-1/webhooks/inbound/cfg-1/deliveries?statuses=failed,unknown",
      )
      .expect(400);

    expect(response.body).toEqual({
      error: "Invalid delivery statuses: unknown",
    });
    expect(
      mockWebhookDeliveryDAO.listDeliveriesByConfig,
    ).not.toHaveBeenCalled();
  });

  it("retries delivery only within the targeted webhook config", async () => {
    mockIntegrationDAO.getIntegration.mockResolvedValue({
      id: "int-1",
      system: "github",
    });
    mockWebhookConfigDAO.getByIntegrationAndConfigId.mockResolvedValue({
      id: "cfg-1",
      direction: "inbound",
    });
    mockWebhookDeliveryDAO.getDeliveryByIdForConfig.mockResolvedValue({
      id: "delivery-row-1",
      provider: "github",
      webhookConfigId: "cfg-1",
      deliveryId: "delivery-1",
      eventType: "issues.opened",
      status: "failed",
      errorMessage: "first failure",
      ticketId: null,
      createdAt: new Date("2026-02-09T10:00:00.000Z"),
      processedAt: new Date("2026-02-09T10:00:01.000Z"),
    });
    mockWebhookService.retryDelivery.mockResolvedValue({
      status: "processed",
      ticketId: "ticket-1",
      jobId: "job-1",
    });

    const response = await request(app)
      .post(
        "/api/integrations/int-1/webhooks/inbound/cfg-1/deliveries/delivery-row-1/retry",
      )
      .expect(200);

    expect(
      mockWebhookDeliveryDAO.getDeliveryByIdForConfig,
    ).toHaveBeenCalledWith("delivery-row-1", "cfg-1");
    expect(mockWebhookService.retryDelivery).toHaveBeenCalledWith(
      "delivery-1",
      {
        deliveryAttemptId: "delivery-row-1",
        webhookConfigId: "cfg-1",
      },
    );
    expect(
      mockWebhookDeliveryDAO.getDeliveryByIdForConfig,
    ).toHaveBeenCalledTimes(2);
    expect(response.body).toEqual(
      expect.objectContaining({
        success: true,
        message: "Delivery retried successfully",
      }),
    );
    expect(response.body.data).toEqual(
      expect.objectContaining({
        delivery: expect.objectContaining({
          id: "delivery-row-1",
          deliveryId: "delivery-1",
        }),
        retry: expect.objectContaining({
          status: "processed",
          ticketId: "ticket-1",
          jobId: "job-1",
        }),
      }),
    );
  });

  it("returns duplicate retry result for successful delivery in targeted config", async () => {
    mockIntegrationDAO.getIntegration.mockResolvedValue({
      id: "int-1",
      system: "github",
    });
    mockWebhookConfigDAO.getByIntegrationAndConfigId.mockResolvedValue({
      id: "cfg-1",
      direction: "inbound",
    });
    mockWebhookDeliveryDAO.getDeliveryByIdForConfig.mockResolvedValue({
      id: "delivery-row-1",
      status: "succeeded",
    });

    const response = await request(app)
      .post(
        "/api/integrations/int-1/webhooks/inbound/cfg-1/deliveries/delivery-row-1/retry",
      )
      .expect(200);

    expect(response.body).toEqual(
      expect.objectContaining({
        success: true,
        message: "Delivery retry completed with no action",
        data: expect.objectContaining({
          retry: expect.objectContaining({
            status: "duplicate",
            reason: "Delivery already succeeded",
          }),
        }),
      }),
    );
    expect(mockWebhookService.retryDelivery).not.toHaveBeenCalled();
  });

  it("returns retry failure details when provider retry fails", async () => {
    mockIntegrationDAO.getIntegration.mockResolvedValue({
      id: "int-1",
      system: "github",
    });
    mockWebhookConfigDAO.getByIntegrationAndConfigId.mockResolvedValue({
      id: "cfg-1",
      direction: "inbound",
    });
    mockWebhookDeliveryDAO.getDeliveryByIdForConfig.mockResolvedValue({
      id: "delivery-row-1",
      provider: "github",
      webhookConfigId: "cfg-1",
      deliveryId: "delivery-1",
      eventType: "issues.opened",
      status: "failed",
      errorMessage: "initial error",
      ticketId: null,
      createdAt: new Date("2026-02-09T10:00:00.000Z"),
      processedAt: new Date("2026-02-09T10:00:01.000Z"),
    });
    mockWebhookService.retryDelivery.mockResolvedValue({
      status: "failed",
      reason: "Invalid payload",
    });

    const response = await request(app)
      .post(
        "/api/integrations/int-1/webhooks/inbound/cfg-1/deliveries/delivery-row-1/retry",
      )
      .expect(422);

    expect(response.body).toEqual(
      expect.objectContaining({
        error: "Retry failed",
        reason: "Invalid payload",
      }),
    );
    expect(response.body.data.delivery).toEqual(
      expect.objectContaining({
        id: "delivery-row-1",
      }),
    );
  });

  it("lists outbound configs independently for multiple same-provider integration instances", async () => {
    mockIntegrationDAO.getIntegration.mockImplementation(
      async (integrationId: string) => {
        if (integrationId === "int-1") {
          return {
            id: "int-1",
            system: "github",
            values: { owner: "acme", repo: "one" },
          };
        }
        if (integrationId === "int-2") {
          return {
            id: "int-2",
            system: "github",
            values: { owner: "acme", repo: "two" },
          };
        }
        return null;
      },
    );
    mockWebhookConfigDAO.listByIntegrationId.mockImplementation(
      async (integrationId: string) => {
        if (integrationId === "int-1") {
          return [
            {
              id: "outbound-1",
              provider: "github",
              allowedEvents: ["job_started"],
              active: true,
              apiTokenEncrypted: "token-1",
              providerProjectId: "acme/one",
              createdAt: new Date("2026-02-09T10:00:00.000Z"),
              updatedAt: new Date("2026-02-09T10:01:00.000Z"),
            },
          ];
        }

        return [
          {
            id: "outbound-2",
            provider: "github",
            allowedEvents: ["job_ended"],
            active: true,
            apiTokenEncrypted: "token-2",
            providerProjectId: "acme/two",
            createdAt: new Date("2026-02-09T10:00:00.000Z"),
            updatedAt: new Date("2026-02-09T10:01:00.000Z"),
          },
        ];
      },
    );

    const first = await request(app)
      .get("/api/integrations/int-1/webhooks/outbound")
      .expect(200);
    const second = await request(app)
      .get("/api/integrations/int-2/webhooks/outbound")
      .expect(200);

    expect(first.body.data).toEqual([
      expect.objectContaining({ id: "outbound-1" }),
    ]);
    expect(second.body.data).toEqual([
      expect.objectContaining({ id: "outbound-2" }),
    ]);
  });

  it("lists outbound delivery history using the same delivery contract", async () => {
    mockIntegrationDAO.getIntegration.mockResolvedValue({
      id: "int-1",
      system: "github",
    });
    mockWebhookConfigDAO.getByIntegrationAndConfigId.mockResolvedValue({
      id: "outbound-1",
      direction: "outbound",
    });
    mockWebhookDeliveryDAO.listDeliveriesByConfig.mockResolvedValue([
      {
        id: "delivery-outbound-1",
        provider: "github",
        webhookConfigId: "outbound-1",
        deliveryId: "delivery-1",
        eventType: "job_started",
        status: "succeeded",
        errorMessage: null,
        ticketId: "ticket-1",
        createdAt: new Date("2026-02-09T10:00:00.000Z"),
        processedAt: new Date("2026-02-09T10:00:01.000Z"),
      },
    ]);

    const response = await request(app)
      .get(
        "/api/integrations/int-1/webhooks/outbound/outbound-1/deliveries?status=succeeded",
      )
      .expect(200);

    expect(mockWebhookDeliveryDAO.listDeliveriesByConfig).toHaveBeenCalledWith(
      "outbound-1",
      {
        statuses: ["succeeded"],
        limit: 50,
        offset: 0,
        sortOrder: "desc",
      },
    );
    expect(response.body.data).toEqual([
      expect.objectContaining({
        id: "delivery-outbound-1",
        status: "succeeded",
        retryable: false,
      }),
    ]);
  });

  it("enforces deterministic single outbound config creation per integration/provider", async () => {
    mockIntegrationDAO.getIntegration.mockResolvedValue({
      id: "int-1",
      system: "github",
      values: { owner: "acme", repo: "one" },
    });
    mockWebhookConfigDAO.listByIntegrationId.mockResolvedValue([
      {
        id: "outbound-1",
        provider: "github",
      },
    ]);

    const response = await request(app)
      .post("/api/integrations/int-1/webhooks/outbound")
      .send({ events: ["job_started"] })
      .expect(409);

    expect(response.body).toEqual({
      error:
        "Outbound webhook configuration already exists for this integration/provider",
    });
    expect(mockWebhookConfigDAO.createConfig).not.toHaveBeenCalled();
  });

  it("forces Shortcut outbound events to include both job lifecycle updates", async () => {
    mockIntegrationDAO.getIntegration.mockResolvedValue({
      id: "int-shortcut",
      system: "shortcut",
      values: {},
    });
    mockWebhookConfigDAO.listByIntegrationId.mockResolvedValue([]);
    mockProjectLinkDAO.getIntegrationProjects.mockResolvedValue([]);
    mockWebhookConfigDAO.createConfig.mockResolvedValue({
      id: "outbound-shortcut-1",
      provider: "shortcut",
      allowedEvents: ["job_started", "job_ended"],
      active: true,
      apiTokenEncrypted: "token-1",
      providerProjectId: "123",
      projectId: null,
      createdAt: new Date("2026-02-11T10:00:00.000Z"),
      updatedAt: new Date("2026-02-11T10:01:00.000Z"),
    });

    await request(app)
      .post("/api/integrations/int-shortcut/webhooks/outbound")
      .send({
        events: ["job_started"],
        providerProjectId: "123",
        apiToken: "shortcut-token",
      })
      .expect(201);

    expect(mockWebhookConfigDAO.createConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "shortcut",
        direction: "outbound",
        allowedEvents: ["job_started", "job_ended"],
        providerProjectId: "123",
      }),
    );
  });

  it("forces Jira outbound events to include both job lifecycle updates", async () => {
    mockIntegrationDAO.getIntegration.mockResolvedValue({
      id: "int-jira",
      system: "jira",
      values: {},
    });
    mockWebhookConfigDAO.listByIntegrationId.mockResolvedValue([]);
    mockProjectLinkDAO.getIntegrationProjects.mockResolvedValue([]);
    mockWebhookConfigDAO.createConfig.mockResolvedValue({
      id: "outbound-jira-1",
      provider: "jira",
      allowedEvents: ["job_started", "job_ended"],
      active: true,
      apiTokenEncrypted: "token-1",
      providerProjectId: "OPS",
      projectId: null,
      createdAt: new Date("2026-02-11T10:00:00.000Z"),
      updatedAt: new Date("2026-02-11T10:01:00.000Z"),
    });

    await request(app)
      .post("/api/integrations/int-jira/webhooks/outbound")
      .send({
        events: ["job_started"],
        providerProjectId: "OPS",
        apiToken: "jira-token",
      })
      .expect(201);

    expect(mockWebhookConfigDAO.createConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "jira",
        direction: "outbound",
        allowedEvents: ["job_started", "job_ended"],
        providerProjectId: "OPS",
      }),
    );
  });

  it("forces GitHub outbound events to include both job lifecycle updates", async () => {
    mockIntegrationDAO.getIntegration.mockResolvedValue({
      id: "int-github",
      system: "github",
      values: {},
    });
    mockWebhookConfigDAO.listByIntegrationId.mockResolvedValue([]);
    mockProjectLinkDAO.getIntegrationProjects.mockResolvedValue([]);
    mockWebhookConfigDAO.createConfig.mockResolvedValue({
      id: "outbound-github-1",
      provider: "github",
      allowedEvents: ["job_started", "job_ended"],
      active: true,
      apiTokenEncrypted: "token-1",
      providerProjectId: "acme/repo",
      projectId: null,
      createdAt: new Date("2026-02-11T10:00:00.000Z"),
      updatedAt: new Date("2026-02-11T10:01:00.000Z"),
    });

    await request(app)
      .post("/api/integrations/int-github/webhooks/outbound")
      .send({
        events: ["job_started"],
        providerProjectId: "acme/repo",
        apiToken: "github-token",
      })
      .expect(201);

    expect(mockWebhookConfigDAO.createConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "github",
        direction: "outbound",
        allowedEvents: ["job_started", "job_ended"],
        providerProjectId: "acme/repo",
      }),
    );
  });

  it("forces GitHub outbound update to keep both lifecycle events enabled", async () => {
    mockIntegrationDAO.getIntegration.mockResolvedValue({
      id: "int-github",
      system: "github",
      values: {},
    });
    mockWebhookConfigDAO.getByIntegrationAndConfigId.mockResolvedValue({
      id: "outbound-github-1",
      provider: "github",
      direction: "outbound",
      active: true,
      allowedEvents: ["job_started", "job_ended"],
      apiTokenEncrypted: "token-1",
      providerProjectId: "acme/repo",
      projectId: null,
      outboundTargetConfig: null,
      createdAt: new Date("2026-02-11T10:00:00.000Z"),
      updatedAt: new Date("2026-02-11T10:01:00.000Z"),
    });
    mockWebhookConfigDAO.updateConfig.mockResolvedValue(undefined);
    mockWebhookConfigDAO.getConfigById.mockResolvedValue({
      id: "outbound-github-1",
      provider: "github",
      active: true,
      allowedEvents: ["job_started", "job_ended"],
      apiTokenEncrypted: "token-1",
      providerProjectId: "acme/repo",
      projectId: null,
      createdAt: new Date("2026-02-11T10:00:00.000Z"),
      updatedAt: new Date("2026-02-11T10:02:00.000Z"),
    });

    await request(app)
      .put("/api/integrations/int-github/webhooks/outbound/outbound-github-1")
      .send({
        events: ["job_started"],
      })
      .expect(200);

    expect(mockWebhookConfigDAO.updateConfig).toHaveBeenCalledWith(
      "outbound-github-1",
      expect.objectContaining({
        allowedEvents: ["job_started", "job_ended"],
      }),
    );
  });

  it("rejects deleting GitHub outbound feedback configuration", async () => {
    mockIntegrationDAO.getIntegration.mockResolvedValue({
      id: "int-github",
      system: "github",
      values: {},
    });
    mockWebhookConfigDAO.getByIntegrationAndConfigId.mockResolvedValue({
      id: "outbound-github-1",
      provider: "github",
      direction: "outbound",
      active: true,
    });

    const response = await request(app)
      .delete("/api/integrations/int-github/webhooks/outbound/outbound-github-1")
      .expect(400);

    expect(response.body).toEqual({
      error: "GitHub outbound webhook is required and cannot be removed",
    });
    expect(mockWebhookConfigDAO.deleteConfig).not.toHaveBeenCalled();
  });

  it("accepts GitHub inbound label-gated auto-execute policy and repository mapping", async () => {
    mockIntegrationDAO.getIntegration.mockResolvedValue({
      id: "int-github",
      system: "github",
      values: {},
    });
    mockProjectLinkDAO.isLinked.mockResolvedValue(false);
    mockWebhookConfigDAO.createConfig.mockResolvedValue({
      id: "cfg-github-1",
      provider: "github",
      direction: "inbound",
      allowedEvents: ["issues.opened"],
      autoExecute: true,
      active: true,
      webhookSecretEncrypted: "secret-1",
      providerProjectId: "acme/repo",
      projectId: "project-1",
      labelMappings: {
        github: {
          autoExecuteMode: "label_gated",
          requiredLabels: ["autofix", "ai-fix"],
        },
      },
      createdAt: new Date("2026-02-11T10:00:00.000Z"),
      updatedAt: new Date("2026-02-11T10:01:00.000Z"),
    });

    const response = await request(app)
      .post("/api/integrations/int-github/webhooks/inbound")
      .send({
        allowedEvents: ["issues.opened"],
        autoExecute: true,
        providerProjectId: "acme/repo",
        projectId: "project-1",
        labelMappings: {
          github: {
            autoExecuteMode: "label_gated",
            requiredLabels: ["Autofix", "AI-FIX"],
          },
        },
      })
      .expect(201);

    expect(mockWebhookConfigDAO.createConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "github",
        direction: "inbound",
        providerProjectId: "acme/repo",
        projectId: "project-1",
        labelMappings: {
          github: {
            autoExecuteMode: "label_gated",
            requiredLabels: ["autofix", "ai-fix"],
          },
        },
      }),
    );
    expect(mockProjectLinkDAO.isLinked).toHaveBeenCalledWith(
      "project-1",
      "int-github",
    );
    expect(mockProjectLinkDAO.linkIntegration).toHaveBeenCalledWith({
      projectId: "project-1",
      integrationId: "int-github",
      isPrimary: false,
    });
    expect(response.body.data).toEqual(
      expect.objectContaining({
        id: "cfg-github-1",
        providerProjectId: "acme/repo",
        labelMappings: {
          github: {
            autoExecuteMode: "label_gated",
            requiredLabels: ["autofix", "ai-fix"],
          },
        },
      }),
    );
  });

  it("rejects deleting Shortcut outbound feedback configuration", async () => {
    mockIntegrationDAO.getIntegration.mockResolvedValue({
      id: "int-shortcut",
      system: "shortcut",
      values: {},
    });
    mockWebhookConfigDAO.getByIntegrationAndConfigId.mockResolvedValue({
      id: "outbound-shortcut-1",
      provider: "shortcut",
      direction: "outbound",
      active: true,
    });

    const response = await request(app)
      .delete("/api/integrations/int-shortcut/webhooks/outbound/outbound-shortcut-1")
      .expect(400);

    expect(response.body).toEqual({
      error: "Shortcut outbound webhook is required and cannot be removed",
    });
    expect(mockWebhookConfigDAO.deleteConfig).not.toHaveBeenCalled();
  });

  it("rejects deleting Jira outbound feedback configuration", async () => {
    mockIntegrationDAO.getIntegration.mockResolvedValue({
      id: "int-jira",
      system: "jira",
      values: {},
    });
    mockWebhookConfigDAO.getByIntegrationAndConfigId.mockResolvedValue({
      id: "outbound-jira-1",
      provider: "jira",
      direction: "outbound",
      active: true,
    });

    const response = await request(app)
      .delete("/api/integrations/int-jira/webhooks/outbound/outbound-jira-1")
      .expect(400);

    expect(response.body).toEqual({
      error: "Jira outbound webhook is required and cannot be removed",
    });
    expect(mockWebhookConfigDAO.deleteConfig).not.toHaveBeenCalled();
  });

  it("lists multiple custom outbound targets for a custom integration", async () => {
    mockIntegrationDAO.getIntegration.mockResolvedValue({
      id: "int-custom",
      system: "custom",
      values: {},
    });
    mockWebhookConfigDAO.listByIntegrationId.mockResolvedValue([
      {
        id: "outbound-custom-2",
        provider: "custom",
        allowedEvents: ["job_started"],
        active: false,
        apiTokenEncrypted: null,
        providerProjectId: null,
        outboundTargetConfig: {
          name: "Slack sink",
          targetUrl: "https://hooks.example.com/slack",
          method: "POST",
          headers: { "x-env": "dev" },
          auth: {
            type: "header",
            headerName: "x-token",
            headerValue: "secret",
          },
          signingSecret: "signing-secret",
          signatureAlgorithm: "sha256",
          retryPolicy: { maxAttempts: 3, backoffMs: 250, maxBackoffMs: 2000 },
        },
        createdAt: new Date("2026-02-09T10:00:00.000Z"),
        updatedAt: new Date("2026-02-09T10:01:00.000Z"),
      },
      {
        id: "outbound-custom-1",
        provider: "custom",
        allowedEvents: ["job_ended"],
        active: true,
        apiTokenEncrypted: null,
        providerProjectId: null,
        outboundTargetConfig: {
          name: "Audit sink",
          targetUrl: "https://hooks.example.com/audit",
          method: "POST",
          headers: {},
          auth: { type: "none" },
          signatureAlgorithm: "sha256",
          retryPolicy: { maxAttempts: 1, backoffMs: 250, maxBackoffMs: 2000 },
        },
        createdAt: new Date("2026-02-09T09:00:00.000Z"),
        updatedAt: new Date("2026-02-09T09:01:00.000Z"),
      },
      {
        id: "outbound-github-noise",
        provider: "github",
        allowedEvents: ["job_ended"],
        active: true,
        apiTokenEncrypted: "token-1",
        providerProjectId: "acme/repo",
        createdAt: new Date("2026-02-09T08:00:00.000Z"),
        updatedAt: new Date("2026-02-09T08:01:00.000Z"),
      },
    ]);

    const response = await request(app)
      .get("/api/integrations/int-custom/webhooks/outbound")
      .expect(200);

    expect(mockWebhookConfigDAO.listByIntegrationId).toHaveBeenCalledWith(
      "int-custom",
      {
        direction: "outbound",
        activeOnly: false,
      },
    );
    expect(response.body.data).toEqual([
      expect.objectContaining({
        id: "outbound-custom-2",
        provider: "custom",
        name: "Slack sink",
        targetUrl: "https://hooks.example.com/slack",
        hasSigningSecret: true,
      }),
      expect.objectContaining({
        id: "outbound-custom-1",
        provider: "custom",
        name: "Audit sink",
        targetUrl: "https://hooks.example.com/audit",
        hasSigningSecret: false,
      }),
    ]);
  });

  it("creates multiple custom outbound targets without single-config restriction", async () => {
    mockIntegrationDAO.getIntegration.mockResolvedValue({
      id: "int-custom",
      system: "custom",
      values: {},
    });
    mockWebhookConfigDAO.listByIntegrationId.mockResolvedValue([
      {
        id: "outbound-existing",
        provider: "custom",
      },
    ]);
    mockProjectLinkDAO.getIntegrationProjects.mockResolvedValue([]);
    mockWebhookConfigDAO.createConfig
      .mockResolvedValueOnce({
        id: "outbound-custom-1",
        provider: "custom",
        allowedEvents: ["job_started"],
        active: true,
        apiTokenEncrypted: null,
        providerProjectId: null,
        outboundTargetConfig: {
          name: "Slack sink",
          targetUrl: "https://hooks.example.com/slack",
          method: "POST",
          headers: {},
          auth: { type: "none" },
          signatureAlgorithm: "sha256",
          retryPolicy: { maxAttempts: 1, backoffMs: 250, maxBackoffMs: 2000 },
        },
        createdAt: new Date("2026-02-09T10:00:00.000Z"),
        updatedAt: new Date("2026-02-09T10:01:00.000Z"),
      })
      .mockResolvedValueOnce({
        id: "outbound-custom-2",
        provider: "custom",
        allowedEvents: ["job_ended"],
        active: true,
        apiTokenEncrypted: null,
        providerProjectId: null,
        outboundTargetConfig: {
          name: "Audit sink",
          targetUrl: "https://hooks.example.com/audit",
          method: "PATCH",
          headers: {},
          auth: { type: "none" },
          signatureAlgorithm: "sha256",
          retryPolicy: { maxAttempts: 2, backoffMs: 300, maxBackoffMs: 2000 },
        },
        createdAt: new Date("2026-02-09T11:00:00.000Z"),
        updatedAt: new Date("2026-02-09T11:01:00.000Z"),
      });

    const first = await request(app)
      .post("/api/integrations/int-custom/webhooks/outbound")
      .send({
        name: "Slack sink",
        targetUrl: "https://hooks.example.com/slack",
        events: ["job_started"],
      })
      .expect(201);

    const second = await request(app)
      .post("/api/integrations/int-custom/webhooks/outbound")
      .send({
        name: "Audit sink",
        targetUrl: "https://hooks.example.com/audit",
        method: "PATCH",
        events: ["job_ended"],
        retryPolicy: { maxAttempts: 2, backoffMs: 300, maxBackoffMs: 2000 },
      })
      .expect(201);

    expect(mockWebhookConfigDAO.createConfig).toHaveBeenCalledTimes(2);
    expect(mockWebhookConfigDAO.createConfig).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        provider: "custom",
        direction: "outbound",
        integrationId: "int-custom",
        outboundTargetConfig: expect.objectContaining({
          name: "Slack sink",
          targetUrl: "https://hooks.example.com/slack",
        }),
      }),
    );
    expect(mockWebhookConfigDAO.createConfig).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        provider: "custom",
        direction: "outbound",
        integrationId: "int-custom",
        outboundTargetConfig: expect.objectContaining({
          name: "Audit sink",
          targetUrl: "https://hooks.example.com/audit",
          method: "PATCH",
        }),
      }),
    );
    expect(first.body.data).toEqual(
      expect.objectContaining({
        id: "outbound-custom-1",
        name: "Slack sink",
      }),
    );
    expect(second.body.data).toEqual(
      expect.objectContaining({
        id: "outbound-custom-2",
        name: "Audit sink",
        method: "PATCH",
      }),
    );
  });

  it("rejects custom outbound target creation when target URL is missing", async () => {
    mockIntegrationDAO.getIntegration.mockResolvedValue({
      id: "int-custom",
      system: "custom",
      values: {},
    });
    mockWebhookConfigDAO.listByIntegrationId.mockResolvedValue([]);

    const response = await request(app)
      .post("/api/integrations/int-custom/webhooks/outbound")
      .send({
        name: "Invalid target",
      })
      .expect(400);

    expect(response.body).toEqual({
      error: "Custom outbound target URL is required",
    });
    expect(mockWebhookConfigDAO.createConfig).not.toHaveBeenCalled();
  });

  it("lists multiple custom inbound webhook configs for the same integration", async () => {
    mockIntegrationDAO.getIntegration.mockResolvedValue({
      id: "int-custom",
      system: "custom",
      values: {},
    });
    mockWebhookConfigDAO.listByIntegrationId.mockResolvedValue([
      {
        id: "cfg-custom-2",
        provider: "custom",
        allowedEvents: ["ticket_created"],
        autoExecute: true,
        active: false,
        webhookSecretEncrypted: "secret-2",
        createdAt: new Date("2026-02-09T10:00:00.000Z"),
        updatedAt: new Date("2026-02-09T10:01:00.000Z"),
      },
      {
        id: "cfg-custom-1",
        provider: "custom",
        allowedEvents: ["ticket_created"],
        autoExecute: false,
        active: true,
        webhookSecretEncrypted: "secret-1",
        createdAt: new Date("2026-02-09T09:00:00.000Z"),
        updatedAt: new Date("2026-02-09T09:01:00.000Z"),
      },
      {
        id: "cfg-github-noise",
        provider: "github",
        allowedEvents: ["issues.opened"],
        autoExecute: false,
        active: true,
        webhookSecretEncrypted: "secret-gh",
        createdAt: new Date("2026-02-09T08:00:00.000Z"),
        updatedAt: new Date("2026-02-09T08:01:00.000Z"),
      },
    ]);

    const response = await request(app)
      .get("/api/integrations/int-custom/webhooks/inbound")
      .expect(200);

    expect(mockWebhookConfigDAO.listByIntegrationId).toHaveBeenCalledWith(
      "int-custom",
      {
        direction: "inbound",
        activeOnly: false,
      },
    );
    expect(response.body.data).toEqual([
      expect.objectContaining({
        id: "cfg-custom-2",
        provider: "custom",
        webhookUrl: "/api/webhooks/custom/cfg-custom-2",
        active: false,
      }),
      expect.objectContaining({
        id: "cfg-custom-1",
        provider: "custom",
        webhookUrl: "/api/webhooks/custom/cfg-custom-1",
        active: true,
      }),
    ]);
  });

  it("creates multiple custom inbound webhook configs without single-config restriction", async () => {
    mockIntegrationDAO.getIntegration.mockResolvedValue({
      id: "int-custom",
      system: "custom",
      values: {},
    });
    mockProjectLinkDAO.getIntegrationProjects.mockResolvedValue([]);
    mockWebhookConfigDAO.createConfig
      .mockResolvedValueOnce({
        id: "cfg-custom-1",
        provider: "custom",
        allowedEvents: ["ticket_created"],
        autoExecute: false,
        active: true,
        webhookSecretEncrypted: "secret-1",
        createdAt: new Date("2026-02-09T10:00:00.000Z"),
        updatedAt: new Date("2026-02-09T10:01:00.000Z"),
      })
      .mockResolvedValueOnce({
        id: "cfg-custom-2",
        provider: "custom",
        allowedEvents: ["ticket_created"],
        autoExecute: true,
        active: true,
        webhookSecretEncrypted: "secret-2",
        createdAt: new Date("2026-02-09T11:00:00.000Z"),
        updatedAt: new Date("2026-02-09T11:01:00.000Z"),
      });

    const first = await request(app)
      .post("/api/integrations/int-custom/webhooks/inbound")
      .send({
        allowedEvents: ["ticket_created"],
        webhookSecret: "secret-1",
      })
      .expect(201);

    const second = await request(app)
      .post("/api/integrations/int-custom/webhooks/inbound")
      .send({
        allowedEvents: ["ticket_created"],
        autoExecute: true,
        webhookSecret: "secret-2",
      })
      .expect(201);

    expect(mockWebhookConfigDAO.createConfig).toHaveBeenCalledTimes(2);
    expect(mockWebhookConfigDAO.createConfig).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        provider: "custom",
        direction: "inbound",
        integrationId: "int-custom",
        allowedEvents: ["ticket_created"],
      }),
    );
    expect(mockWebhookConfigDAO.createConfig).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        provider: "custom",
        direction: "inbound",
        integrationId: "int-custom",
        allowedEvents: ["ticket_created"],
      }),
    );

    expect(first.body.data).toEqual(
      expect.objectContaining({
        id: "cfg-custom-1",
        webhookUrl: "/api/webhooks/custom/cfg-custom-1",
      }),
    );
    expect(second.body.data).toEqual(
      expect.objectContaining({
        id: "cfg-custom-2",
        webhookUrl: "/api/webhooks/custom/cfg-custom-2",
      }),
    );
  });

  it("updates custom inbound webhook active state for targeted config", async () => {
    mockIntegrationDAO.getIntegration.mockResolvedValue({
      id: "int-custom",
      system: "custom",
      values: {},
    });
    mockWebhookConfigDAO.getByIntegrationAndConfigId.mockResolvedValue({
      id: "cfg-custom-1",
      provider: "custom",
      direction: "inbound",
      active: true,
    });
    mockWebhookConfigDAO.updateConfig.mockResolvedValue(undefined);
    mockWebhookConfigDAO.getConfigById.mockResolvedValue({
      id: "cfg-custom-1",
      provider: "custom",
      allowedEvents: ["ticket_created"],
      autoExecute: false,
      active: false,
      webhookSecretEncrypted: "secret-1",
      createdAt: new Date("2026-02-09T10:00:00.000Z"),
      updatedAt: new Date("2026-02-10T09:00:00.000Z"),
    });

    const response = await request(app)
      .put("/api/integrations/int-custom/webhooks/inbound/cfg-custom-1")
      .send({ active: false })
      .expect(200);

    expect(mockWebhookConfigDAO.updateConfig).toHaveBeenCalledWith(
      "cfg-custom-1",
      expect.objectContaining({
        active: false,
      }),
    );
    expect(response.body.data).toEqual(
      expect.objectContaining({
        id: "cfg-custom-1",
        active: false,
        webhookUrl: "/api/webhooks/custom/cfg-custom-1",
      }),
    );
  });

  it("lists custom delivery history scoped to the selected custom inbound config", async () => {
    mockIntegrationDAO.getIntegration.mockResolvedValue({
      id: "int-custom",
      system: "custom",
      values: {},
    });
    mockWebhookConfigDAO.getByIntegrationAndConfigId.mockResolvedValue({
      id: "cfg-custom-1",
      provider: "custom",
      direction: "inbound",
      active: true,
    });
    mockWebhookDeliveryDAO.listDeliveriesByConfig.mockResolvedValue([
      {
        id: "delivery-custom-1",
        provider: "custom",
        webhookConfigId: "cfg-custom-1",
        deliveryId: "delivery-id-1",
        eventType: "ticket_created",
        status: "failed",
        errorMessage: "Invalid payload",
        ticketId: null,
        createdAt: new Date("2026-02-10T09:00:00.000Z"),
        processedAt: new Date("2026-02-10T09:00:01.000Z"),
      },
    ]);

    const response = await request(app)
      .get(
        "/api/integrations/int-custom/webhooks/inbound/cfg-custom-1/deliveries",
      )
      .expect(200);

    expect(mockWebhookDeliveryDAO.listDeliveriesByConfig).toHaveBeenCalledWith(
      "cfg-custom-1",
      {
        limit: 50,
        offset: 0,
        sortOrder: "desc",
      },
    );
    expect(response.body.data).toEqual([
      expect.objectContaining({
        id: "delivery-custom-1",
        webhookConfigId: "cfg-custom-1",
        eventType: "ticket_created",
      }),
    ]);
  });

  it("deletes the selected custom inbound webhook config", async () => {
    mockIntegrationDAO.getIntegration.mockResolvedValue({
      id: "int-custom",
      system: "custom",
      values: {},
    });
    mockWebhookConfigDAO.getByIntegrationAndConfigId.mockResolvedValue({
      id: "cfg-custom-1",
      provider: "custom",
      direction: "inbound",
      active: true,
    });
    mockWebhookConfigDAO.deleteConfig.mockResolvedValue(true);

    await request(app)
      .delete("/api/integrations/int-custom/webhooks/inbound/cfg-custom-1")
      .expect(204);

    expect(mockWebhookConfigDAO.deleteConfig).toHaveBeenCalledWith(
      "cfg-custom-1",
    );
  });

  it("does not expose removed legacy compatibility delivery and outbound routes", async () => {
    await request(app).get("/api/integrations/int-1/deliveries").expect(404);
    await request(app)
      .post("/api/integrations/int-1/deliveries/delivery-row-1/retry")
      .expect(404);
    await request(app)
      .put("/api/integrations/int-1/webhooks/outbound")
      .expect(404);
    await request(app)
      .delete("/api/integrations/int-1/webhooks/outbound")
      .expect(404);
  });
});
