import express from "express";
import request from "supertest";
import { createGitHubRoutes } from "../../../../../api/routes/webhooks/github.routes";
import type { WebhookService } from "../../../../../webhooks/WebhookService";

describe("github webhook routes", () => {
  function createApp(processWebhook: jest.Mock) {
    const app = express();
    app.use(
      express.json({
        verify: (req, _res, buf) => {
          (req as any).rawBody = Buffer.from(buf);
        },
      }),
    );
    app.use((req, _res, next) => {
      (req as any).tenantId = "tenant-1";
      next();
    });

    const webhookService = {
      processWebhook,
    } as unknown as WebhookService;

    app.use("/api/webhooks/github", createGitHubRoutes(() => webhookService));
    return app;
  }

  it("returns ignored payload with status 200 when service ignores event", async () => {
    const processWebhook = jest.fn().mockResolvedValue({
      status: "ignored",
      reason: "Event 'issues.closed' not allowed for webhook config 'cfg-github'",
    });
    const app = createApp(processWebhook);

    const payload = {
      action: "closed",
      issue: {
        number: 321,
      },
    };

    const response = await request(app)
      .post("/api/webhooks/github")
      .set("x-github-event", "issues")
      .set("x-github-delivery", "delivery-ignored-1")
      .set("x-hub-signature-256", "sha256=some-signature")
      .send(payload)
      .expect(200);

    expect(response.body).toEqual({
      message: "Webhook ignored",
      reason: "Event 'issues.closed' not allowed for webhook config 'cfg-github'",
    });
    expect(processWebhook).toHaveBeenCalledWith(
      expect.objectContaining({
        "x-github-event": "issues",
        "x-github-delivery": "delivery-ignored-1",
      }),
      payload,
      expect.any(Buffer),
      "tenant-1",
      { providerName: "github" },
    );
  });

  it("returns rejected payload with status 401 when signature verification fails", async () => {
    const processWebhook = jest.fn().mockResolvedValue({
      status: "rejected",
      reason: "Invalid signature",
    });
    const app = createApp(processWebhook);

    const response = await request(app)
      .post("/api/webhooks/github")
      .set("x-github-event", "issues")
      .set("x-github-delivery", "delivery-rejected-1")
      .set("x-hub-signature-256", "sha256=bad-signature")
      .send({
        action: "opened",
        issue: { number: 123 },
      })
      .expect(401);

    expect(response.body).toEqual({
      error: "Webhook rejected",
      reason: "Invalid signature",
    });
  });

  it("returns 500 when route processing throws unexpectedly", async () => {
    const processWebhook = jest
      .fn()
      .mockRejectedValue(new Error("unexpected processing failure"));
    const app = createApp(processWebhook);
    const errorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    const response = await request(app)
      .post("/api/webhooks/github")
      .set("x-github-event", "issues")
      .set("x-github-delivery", "delivery-error-1")
      .set("x-hub-signature-256", "sha256=any")
      .send({
        action: "opened",
        issue: { number: 123 },
      })
      .expect(500);

    expect(response.body).toEqual({
      error: "Failed to process webhook",
    });
    expect(errorSpy).toHaveBeenCalled();

    errorSpy.mockRestore();
  });
});
