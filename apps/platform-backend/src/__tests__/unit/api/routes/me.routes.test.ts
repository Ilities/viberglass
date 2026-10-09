import express from "express";
import request from "supertest";

jest.mock("../../../../api/middleware/authentication", () => ({
  requireAuth: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    const role = req.headers["x-role"] === "admin" ? "admin" : "member";
    const at = new Date();
    req.authContext = {
      user: { id: "u-1", email: "jussi@example.com", name: "Jussi", avatarUrl: null, role, createdAt: at, updatedAt: at, deactivatedAt: null },
      session: { id: "s", userId: "u-1", tokenHash: "h", createdAt: at, expiresAt: at, revokedAt: null },
      roles: [role],
      permissions: [],
    };
    next();
  },
}));

import { ChatAccountError } from "@viberglass/integration-core";
import { createMeRouter } from "../../../../api/routes/me";
import { fakeChatProvider } from "../../../helpers/fakeChatProvider";

function appWith(
  email: { isConfigured: jest.Mock; send: jest.Mock },
  provider = fakeChatProvider({ configured: false }),
  identities = { getChatUserId: jest.fn().mockResolvedValue(null), setChatUserId: jest.fn().mockResolvedValue(undefined) },
) {
  const app = express();
  app.use(express.json());
  app.use("/api/me", createMeRouter(identities, () => [{ system: "slack", label: "Slack", provider }], email));
  return app;
}

const noEmail = () => ({ isConfigured: jest.fn().mockReturnValue(false), send: jest.fn() });

describe("chat accounts", () => {
  it("lists each chat service with whether it's set up and whether the person linked their account", async () => {
    const identities = { getChatUserId: jest.fn().mockResolvedValue("U1"), setChatUserId: jest.fn() };
    const response = await request(appWith(noEmail(), fakeChatProvider(), identities)).get("/api/me/notification-channels").expect(200);

    expect(response.body.data).toEqual({ chat: [{ system: "slack", label: "Slack", available: true, linked: true }], emailAvailable: false });
    expect(identities.getChatUserId).toHaveBeenCalledWith("u-1", "slack");
  });

  it("links the account the service finds by the person's email, and unlinks it", async () => {
    const provider = fakeChatProvider();
    provider.findUserByEmail.mockResolvedValue("U42");
    const identities = { getChatUserId: jest.fn(), setChatUserId: jest.fn().mockResolvedValue(undefined) };
    const app = appWith(noEmail(), provider, identities);

    await request(app).post("/api/me/chat-links/slack").expect(200, { success: true, data: { linked: true } });
    expect(provider.findUserByEmail).toHaveBeenCalledWith("jussi@example.com");
    expect(identities.setChatUserId).toHaveBeenCalledWith("u-1", "slack", "U42");

    await request(app).delete("/api/me/chat-links/slack").expect(200, { success: true, data: { linked: false } });
    expect(identities.setChatUserId).toHaveBeenLastCalledWith("u-1", "slack", null);
  });

  it("passes on why the service couldn't find the account, and refuses a service that isn't set up", async () => {
    const provider = fakeChatProvider();
    provider.findUserByEmail.mockRejectedValue(new ChatAccountError(404, "No Slack account uses jussi@example.com."));
    const response = await request(appWith(noEmail(), provider)).post("/api/me/chat-links/slack").expect(404);
    expect(response.body.error).toBe("No Slack account uses jussi@example.com.");

    await request(appWith(noEmail())).post("/api/me/chat-links/slack").expect(409);
    await request(appWith(noEmail())).post("/api/me/chat-links/teams").expect(409);
  });
});

describe("POST /api/me/test-email", () => {
  it("sends the admin a test email", async () => {
    const email = { isConfigured: jest.fn().mockReturnValue(true), send: jest.fn().mockResolvedValue(undefined) };

    const response = await request(appWith(email)).post("/api/me/test-email").set("x-role", "admin").expect(200);

    expect(response.body.data).toEqual({ sentTo: "jussi@example.com" });
    expect(email.send).toHaveBeenCalledWith(expect.objectContaining({ to: "jussi@example.com" }));
  });

  it("shows the transport's own error", async () => {
    const email = {
      isConfigured: jest.fn().mockReturnValue(true),
      send: jest.fn().mockRejectedValue(new Error("Email address is not verified.")),
    };

    const response = await request(appWith(email)).post("/api/me/test-email").set("x-role", "admin").expect(502);

    expect(response.body.error).toBe("The email couldn't be sent: Email address is not verified.");
  });

  it("is for admins only, and needs email set up", async () => {
    const email = { isConfigured: jest.fn().mockReturnValue(false), send: jest.fn() };
    await request(appWith(email)).post("/api/me/test-email").expect(403);
    await request(appWith(email)).post("/api/me/test-email").set("x-role", "admin").expect(409);
    expect(email.send).not.toHaveBeenCalled();
  });
});
