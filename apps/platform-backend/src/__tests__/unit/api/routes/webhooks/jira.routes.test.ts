import express from "express";
import request from "supertest";
import { createJiraRoutes } from "../../../../../api/routes/webhooks/jira.routes";
import type { WebhookService } from "../../../../../webhooks/WebhookService";

describe("jira webhook routes", () => {
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

    app.use("/api/webhooks/jira", createJiraRoutes(() => webhookService));
    return app;
  }

  it("returns ignored payload with status 200 for unsupported Jira actions", async () => {
    const processWebhook = jest.fn().mockResolvedValue({
      status: "ignored",
      reason: "Unsupported Jira event action 'issue_updated.issue_assigned'",
    });
    const app = createApp(processWebhook);

    const payload = {
      webhookEvent: "jira:issue_updated",
      issue_event_type_name: "issue_assigned",
      issue: {
        key: "OPS-99",
      },
    };

    const response = await request(app)
      .post("/api/webhooks/jira")
      .set("x-atlassian-webhook-identifier", "jira-delivery-ignored-1")
      .set("x-atlassian-webhook-signature", "sha256=some-signature")
      .send(payload)
      .expect(200);

    expect(response.body).toEqual({
      message: "Webhook ignored",
      reason: "Unsupported Jira event action 'issue_updated.issue_assigned'",
    });
    expect(processWebhook).toHaveBeenCalledWith(
      expect.objectContaining({
        "x-atlassian-webhook-identifier": "jira-delivery-ignored-1",
        "x-atlassian-webhook-signature": "sha256=some-signature",
      }),
      payload,
      expect.any(Buffer),
      "tenant-1",
      { providerName: "jira" },
    );
  });

  it("returns rejected payload with status 401 when Jira signature verification fails", async () => {
    const processWebhook = jest.fn().mockResolvedValue({
      status: "rejected",
      reason: "Invalid signature",
    });
    const app = createApp(processWebhook);

    const response = await request(app)
      .post("/api/webhooks/jira")
      .set("x-atlassian-webhook-identifier", "jira-delivery-rejected-1")
      .set("x-atlassian-webhook-signature", "sha256=bad-signature")
      .send({
        webhookEvent: "jira:issue_created",
        issue: { key: "OPS-1" },
      })
      .expect(401);

    expect(response.body).toEqual({
      error: "Webhook rejected",
      reason: "Invalid signature",
    });
  });

  it("returns 500 when Jira route processing throws unexpectedly", async () => {
    const processWebhook = jest
      .fn()
      .mockRejectedValue(new Error("unexpected processing failure"));
    const app = createApp(processWebhook);
    const errorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    const response = await request(app)
      .post("/api/webhooks/jira")
      .set("x-atlassian-webhook-identifier", "jira-delivery-error-1")
      .set("x-atlassian-webhook-signature", "sha256=any")
      .send({
        webhookEvent: "jira:issue_created",
        issue: { key: "OPS-1" },
      })
      .expect(500);

    expect(response.body).toEqual({
      error: "Failed to process webhook",
    });
    expect(errorSpy).toHaveBeenCalled();

    errorSpy.mockRestore();
  });
});
