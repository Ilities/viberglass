import express from "express";
import request from "supertest";

const signedInRole: { current: string | null } = { current: null };
const requireRoleMock = jest.fn((role: string) => (req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (!signedInRole.current) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  if (signedInRole.current !== role) {
    res.status(403).json({ error: "Access denied" });
    return;
  }
  next();
});

jest.mock("../../../../../api/middleware/authentication", () => ({ requireRole: requireRoleMock }));
jest.mock("../../../../../integrations/registerIntegrationPlugins", () => ({ integrationRegistry: {} }));
jest.mock("../../../../../webhooks/webhookReceivers", () => ({
  webhookReceiversFrom: () => ({ providers: () => ["tracker"] }),
}));
jest.mock("../../../../../persistence/webhook/WebhookConfigDAO", () => ({
  WebhookConfigDAO: jest.fn().mockImplementation(() => ({ listActiveConfigs: jest.fn().mockResolvedValue([]) })),
}));
jest.mock("../../../../../persistence/webhook/WebhookDeliveryDAO", () => ({
  WebhookDeliveryDAO: jest.fn().mockImplementation(() => ({ getDeliveryStatsByProvider: jest.fn().mockResolvedValue({}) })),
}));

import { createManagementRoutes } from "../../../../../api/routes/webhooks/management.routes";

describe("webhook status route", () => {
  const getFailedDeliveries = jest.fn().mockResolvedValue([]);
  const getWebhookService = jest.fn(() => ({ getFailedDeliveries }));

  function createApp() {
    const app = express();
    app.use("/api/webhooks", createManagementRoutes(getWebhookService));
    return app;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    signedInRole.current = null;
  });

  it("is for admins only", () => {
    createApp();
    expect(requireRoleMock).toHaveBeenCalledWith("admin");
  });

  it("refuses someone who isn't signed in, and a member, without reading any delivery", async () => {
    await request(createApp()).get("/api/webhooks/status").expect(401);

    signedInRole.current = "member";
    await request(createApp()).get("/api/webhooks/status").expect(403);

    expect(getWebhookService).not.toHaveBeenCalled();
  });

  it("shows an admin the providers and failed deliveries", async () => {
    signedInRole.current = "admin";
    const response = await request(createApp()).get("/api/webhooks/status").expect(200);

    expect(response.body).toEqual({
      status: "operational",
      providers: { tracker: { configured: false, stats: {} } },
      failedDeliveries: { count: 0, recent: [] },
    });
  });
});
