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
  IntegrationUsageDAO: jest.fn(() => ({ listProjectsUsing: jest.fn().mockResolvedValue([]) })),
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
      { activeOnly: false },
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
        integrationId: "int-custom",
        allowedEvents: ["ticket_created"],
      }),
    );
    expect(mockWebhookConfigDAO.createConfig).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        provider: "custom",
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

  it("does not expose removed delivery or outbound webhook routes", async () => {
    await request(app).get("/api/integrations/int-1/deliveries").expect(404);
    await request(app)
      .post("/api/integrations/int-1/deliveries/delivery-row-1/retry")
      .expect(404);
    await request(app)
      .get("/api/integrations/int-1/webhooks/outbound")
      .expect(404);
    await request(app)
      .post("/api/integrations/int-1/webhooks/outbound")
      .expect(404);
  });
});
