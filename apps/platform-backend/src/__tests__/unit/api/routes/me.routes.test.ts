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

import { createMeRouter } from "../../../../api/routes/me";

function appWith(email: { isConfigured: jest.Mock; send: jest.Mock }) {
  const app = express();
  app.use(express.json());
  const users = { getContact: jest.fn(), setSlackUserId: jest.fn() };
  const slack = { isConfigured: jest.fn().mockReturnValue(false), lookupUserIdByEmail: jest.fn() };
  app.use("/api/me", createMeRouter(users, slack, email));
  return app;
}

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
