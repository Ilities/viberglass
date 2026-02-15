import express from "express";
import request from "supertest";
import { createShortcutRoutes } from "../../../../../api/routes/webhooks/shortcut.routes";
import type { WebhookService } from "../../../../../webhooks/WebhookService";

describe("shortcut webhook routes", () => {
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

    app.use(
      "/api/webhooks/shortcut",
      createShortcutRoutes(() => webhookService),
    );
    return app;
  }

  it("returns ignored payload with status 200 for unsupported Shortcut events", async () => {
    const processWebhook = jest.fn().mockResolvedValue({
      status: "ignored",
      reason: "Unsupported Shortcut event 'story_updated'",
    });
    const app = createApp(processWebhook);

    const payload = {
      object_type: "story",
      action: "update",
      data: {
        id: 101,
      },
    };

    const response = await request(app)
      .post("/api/webhooks/shortcut")
      .set("x-shortcut-delivery", "shortcut-delivery-ignored-1")
      .set("x-shortcut-signature", "sha256=signature")
      .send(payload)
      .expect(200);

    expect(response.body).toEqual({
      message: "Webhook ignored",
      reason: "Unsupported Shortcut event 'story_updated'",
    });
    expect(processWebhook).toHaveBeenCalledWith(
      expect.objectContaining({
        "x-shortcut-delivery": "shortcut-delivery-ignored-1",
        "x-shortcut-signature": "sha256=signature",
      }),
      payload,
      expect.any(Buffer),
      "tenant-1",
      { providerName: "shortcut" },
    );
  });

  it("returns rejected payload with status 401 when Shortcut signature verification fails", async () => {
    const processWebhook = jest.fn().mockResolvedValue({
      status: "rejected",
      reason: "Invalid signature",
    });
    const app = createApp(processWebhook);

    const response = await request(app)
      .post("/api/webhooks/shortcut")
      .set("x-shortcut-delivery", "shortcut-delivery-rejected-1")
      .set("x-shortcut-signature", "sha256=bad-signature")
      .send({
        object_type: "story",
        action: "create",
        data: {
          id: 101,
          name: "Broken flow",
        },
      })
      .expect(401);

    expect(response.body).toEqual({
      error: "Webhook rejected",
      reason: "Invalid signature",
    });
  });

  it("returns 500 when Shortcut route processing throws unexpectedly", async () => {
    const processWebhook = jest
      .fn()
      .mockRejectedValue(new Error("unexpected processing failure"));
    const app = createApp(processWebhook);

    const response = await request(app)
      .post("/api/webhooks/shortcut")
      .set("x-shortcut-delivery", "shortcut-delivery-error-1")
      .set("x-shortcut-signature", "sha256=any")
      .send({
        object_type: "story",
        action: "create",
        data: {
          id: 101,
          name: "Broken flow",
        },
      })
      .expect(500);

    expect(response.body).toEqual({
      error: "Failed to process webhook",
    });
  });
});
