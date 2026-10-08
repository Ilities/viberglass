import crypto from "crypto";
import express from "express";
import request from "supertest";
import { createCustomRoutes } from "../../../../../api/routes/webhooks/custom.routes";
import { WebhookConfigDAO } from "../../../../../persistence/webhook/WebhookConfigDAO";
import { WebhookDeliveryDAO } from "../../../../../persistence/webhook/WebhookDeliveryDAO";
import { TicketDAO } from "../../../../../persistence/ticketing/TicketDAO";

jest.mock("../../../../../persistence/webhook/WebhookConfigDAO");
jest.mock("../../../../../persistence/webhook/WebhookDeliveryDAO");
jest.mock("../../../../../persistence/ticketing/TicketDAO");

describe("custom webhook routes", () => {
  let app: express.Express;
  let mockConfigDAO: jest.Mocked<WebhookConfigDAO>;
  let mockDeliveryDAO: jest.Mocked<WebhookDeliveryDAO>;
  let mockTicketDAO: jest.Mocked<TicketDAO>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockConfigDAO = new WebhookConfigDAO() as jest.Mocked<WebhookConfigDAO>;
    mockDeliveryDAO = new WebhookDeliveryDAO() as jest.Mocked<WebhookDeliveryDAO>;
    mockTicketDAO = new TicketDAO() as jest.Mocked<TicketDAO>;

    (WebhookConfigDAO as jest.Mock).mockImplementation(() => mockConfigDAO);
    (WebhookDeliveryDAO as jest.Mock).mockImplementation(() => mockDeliveryDAO);
    (TicketDAO as jest.Mock).mockImplementation(() => mockTicketDAO);

    app = express();
    app.use(
      express.json({
        verify: (req, _res, buf) => {
          (req as any).rawBody = Buffer.from(buf);
        },
      }),
    );
    app.use("/api/webhooks/custom", createCustomRoutes());
  });

  it("accepts valid signatures computed from exact raw request bytes", async () => {
    const rawPayload = '{  "title":"Whitespace Sensitive",\n  "description":"Raw bytes must match" }';
    const secret = "custom-secret";
    const signature = `sha256=${crypto
      .createHmac("sha256", secret)
      .update(Buffer.from(rawPayload))
      .digest("hex")}`;

    mockConfigDAO.getConfigById.mockResolvedValue({
      id: "cfg-1",
      provider: "custom",
      active: true,
      webhookSecretEncrypted: secret,
      planNewIssues: false,
      projectId: "project-1",
    } as any);
    mockDeliveryDAO.checkDeliveryExists.mockResolvedValue(false);
    mockDeliveryDAO.recordDeliveryAttempt.mockResolvedValue({
      id: "delivery-row-1",
    } as any);
    mockTicketDAO.createTicket.mockResolvedValue({
      id: "ticket-1",
    } as any);
    mockTicketDAO.updateTicket.mockResolvedValue(undefined);
    mockDeliveryDAO.updateDeliveryStatus.mockResolvedValue(undefined);
    mockDeliveryDAO.linkDeliveryToTicketById.mockResolvedValue(undefined);

    const response = await request(app)
      .post("/api/webhooks/custom/cfg-1")
      .set("content-type", "application/json")
      .set("x-webhook-signature-256", signature)
      .set("x-webhook-delivery-id", "delivery-1")
      .send(rawPayload)
      .expect(200);

    expect(response.body).toEqual({
      message: "Webhook processed successfully",
      ticketId: "ticket-1",
      deliveryId: "delivery-1",
    });
    expect(mockDeliveryDAO.checkDeliveryExists).toHaveBeenCalledWith(
      "delivery-1",
      "cfg-1",
    );
    expect(mockDeliveryDAO.recordDeliveryAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "custom",
        webhookConfigId: "cfg-1",
        deliveryId: "delivery-1",
      }),
    );
    expect(mockTicketDAO.createTicket).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Whitespace Sensitive",
        description: "Raw bytes must match",
        severity: "medium",
      }),
    );
  });

  it("creates the task the way a retried delivery does, so a webhook set to write the plan starts it", async () => {
    const rawPayload = JSON.stringify({ title: "Plan it", description: "From the custom webhook" });
    const secret = "custom-secret";
    const signature = `sha256=${crypto.createHmac("sha256", secret).update(Buffer.from(rawPayload)).digest("hex")}`;
    const config = { id: "cfg-1", provider: "custom", active: true, webhookSecretEncrypted: secret, planNewIssues: true, projectId: "project-1" };
    mockConfigDAO.getConfigById.mockResolvedValue(config as any);
    mockDeliveryDAO.checkDeliveryExists.mockResolvedValue(false);
    mockDeliveryDAO.recordDeliveryAttempt.mockResolvedValue({ id: "delivery-row-1" } as any);
    mockDeliveryDAO.updateDeliveryStatus.mockResolvedValue(undefined);
    mockDeliveryDAO.linkDeliveryToTicketById.mockResolvedValue(undefined);
    const process = jest.fn().mockResolvedValue({ ticketId: "ticket-2", jobId: "job-1" });
    const planned = express();
    planned.use(express.json({ verify: (req, _res, buf) => ((req as any).rawBody = Buffer.from(buf)) }));
    planned.use("/api/webhooks/custom", createCustomRoutes(() => ({ process })));

    const response = await request(planned)
      .post("/api/webhooks/custom/cfg-1")
      .set("content-type", "application/json")
      .set("x-webhook-signature-256", signature)
      .set("x-webhook-delivery-id", "delivery-2")
      .send(rawPayload)
      .expect(200);

    expect(response.body.ticketId).toBe("ticket-2");
    expect(process).toHaveBeenCalledWith(
      expect.objectContaining({
        config,
        event: expect.objectContaining({ provider: "custom", eventType: "ticket_created", payload: { title: "Plan it", description: "From the custom webhook" } }),
      }),
    );
    expect(mockDeliveryDAO.linkDeliveryToTicketById).toHaveBeenCalledWith("delivery-row-1", "ticket-2", "project-1");
  });

  it("rejects requests with invalid signatures", async () => {
    const rawPayload = '{"title":"Bad Sig","description":"Should fail"}';

    mockConfigDAO.getConfigById.mockResolvedValue({
      id: "cfg-1",
      provider: "custom",
      active: true,
      webhookSecretEncrypted: "custom-secret",
      planNewIssues: false,
      projectId: "project-1",
    } as any);

    const response = await request(app)
      .post("/api/webhooks/custom/cfg-1")
      .set("content-type", "application/json")
      .set("x-webhook-signature-256", "sha256=deadbeef")
      .send(rawPayload)
      .expect(401);

    expect(response.body).toEqual({
      error: "Invalid webhook signature",
    });
    expect(mockTicketDAO.createTicket).not.toHaveBeenCalled();
  });
});
