import express from "express";
import request from "supertest";
import { PEOPLE_SERVICE_ERROR_CODE, PeopleServiceError } from "../../../../services/errors/PeopleServiceError";
import { applicationErrorHandler } from "../../../../api/middleware/notFoundHandling";

jest.mock("../../../../api/auth/startSession", () => ({
  startSession: jest.fn().mockResolvedValue("session-token"),
}));

import { startSession } from "../../../../api/auth/startSession";
import { createAccountLinksRouter } from "../../../../api/routes/accountLinks";

const at = new Date("2026-09-30T10:00:00Z");
const maria = {
  id: "user-2",
  email: "maria@example.com",
  name: "Maria",
  avatarUrl: null,
  role: "member" as const,
  createdAt: at,
  updatedAt: at,
  deactivatedAt: null,
};

function appWith(invites: { preview: jest.Mock; accept: jest.Mock }, resets = { preview: jest.fn(), reset: jest.fn() }) {
  const app = express();
  app.use(express.json());
  app.use("/api/account-links", createAccountLinksRouter(invites, resets));
  app.use(applicationErrorHandler);
  return app;
}

describe("account link routes", () => {
  it("shows who sent an invite without signing anyone in", async () => {
    const invites = {
      preview: jest.fn().mockResolvedValue({ email: maria.email, role: "member", invitedByName: "Jussi", expiresAt: at }),
      accept: jest.fn(),
    };

    const response = await request(appWith(invites)).get("/api/account-links/invites/abc").expect(200);

    expect(response.body).toMatchObject({ email: maria.email, role: "member", invitedByName: "Jussi" });
    expect(startSession).not.toHaveBeenCalled();
  });

  it("signs the invitee in after accepting", async () => {
    const invites = { preview: jest.fn(), accept: jest.fn().mockResolvedValue(maria) };

    const response = await request(appWith(invites))
      .post("/api/account-links/invites/abc")
      .send({ name: "Maria", password: "long-enough" })
      .expect(201);

    expect(invites.accept).toHaveBeenCalledWith("abc", { name: "Maria", password: "long-enough" });
    expect(startSession).toHaveBeenCalledWith(expect.anything(), "user-2");
    expect(response.body.user).toMatchObject({ id: "user-2", role: "member" });
  });

  it("answers a used link with 404 and the reason", async () => {
    const invites = {
      preview: jest.fn().mockRejectedValue(new PeopleServiceError(PEOPLE_SERVICE_ERROR_CODE.LINK_INVALID, "This invite link has expired.")),
      accept: jest.fn(),
    };

    const response = await request(appWith(invites)).get("/api/account-links/invites/used").expect(404);

    expect(response.body).toEqual({ error: "This invite link has expired.", code: "LINK_INVALID" });
  });

  it("refuses a short password before touching the link", async () => {
    const resets = { preview: jest.fn(), reset: jest.fn() };

    await request(appWith({ preview: jest.fn(), accept: jest.fn() }, resets))
      .post("/api/account-links/resets/abc")
      .send({ password: "short" })
      .expect(400);

    expect(resets.reset).not.toHaveBeenCalled();
  });
});
