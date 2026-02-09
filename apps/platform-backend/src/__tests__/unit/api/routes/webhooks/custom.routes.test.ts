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
      autoExecute: false,
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
    expect(mockTicketDAO.createTicket).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Whitespace Sensitive",
        description: "Raw bytes must match",
        severity: "medium",
      }),
    );
  });

  it("rejects requests with invalid signatures", async () => {
    const rawPayload = '{"title":"Bad Sig","description":"Should fail"}';

    mockConfigDAO.getConfigById.mockResolvedValue({
      id: "cfg-1",
      provider: "custom",
      active: true,
      webhookSecretEncrypted: "custom-secret",
      autoExecute: false,
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
