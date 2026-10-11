import express from "express";
import request from "supertest";
import { createInboundRoutes } from "../../../../../api/routes/webhooks/inbound.routes";

describe("inbound webhook route", () => {
  function createApp(processWebhook: jest.Mock) {
    const app = express();
    app.use(
      express.json({
        verify: (req, _res, buf) => {
          Object.assign(req, { rawBody: Buffer.from(buf) });
        },
      }),
    );
    app.use((req, _res, next) => {
      req.tenantId = "tenant-1";
      next();
    });
    app.use("/api/webhooks", createInboundRoutes(() => ({ processWebhook })));
    return app;
  }

  it("hands the delivery to the service with the provider and webhook from its address", async () => {
    const processWebhook = jest.fn().mockResolvedValue({ status: "processed", ticketId: "ticket-1" });
    const payload = { action: "opened", issue: { number: 1 } };

    const response = await request(createApp(processWebhook))
      .post("/api/webhooks/github/cfg-1")
      .set("x-github-delivery", "delivery-1")
      .send(payload)
      .expect(200);

    expect(response.body).toEqual({ message: "Webhook processed successfully", ticketId: "ticket-1" });
    expect(processWebhook).toHaveBeenCalledWith(
      expect.objectContaining({ "x-github-delivery": "delivery-1" }),
      payload,
      expect.any(Buffer),
      "tenant-1",
      { providerName: "github", configId: "cfg-1" },
    );
  });

  it.each([
    ["ignored", 200, { message: "Webhook ignored", reason: "why" }],
    ["rejected", 401, { error: "Webhook rejected", reason: "why" }],
    ["invalid", 400, { error: "Invalid webhook payload", reason: "why" }],
    ["not_found", 404, { error: "Webhook configuration not found" }],
  ])("answers a delivery the service finds %s with %i", async (status, code, body) => {
    const processWebhook = jest.fn().mockResolvedValue({ status, reason: "why" });

    const response = await request(createApp(processWebhook)).post("/api/webhooks/custom/cfg-1").send({}).expect(code);

    expect(response.body).toEqual(body);
  });

  it("answers 500 when processing throws", async () => {
    const processWebhook = jest.fn().mockRejectedValue(new Error("boom"));

    const response = await request(createApp(processWebhook)).post("/api/webhooks/jira/cfg-1").send({}).expect(500);

    expect(response.body).toEqual({ error: "Failed to process webhook" });
  });
});
