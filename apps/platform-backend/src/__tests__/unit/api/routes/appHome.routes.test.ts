import express from "express";
import request from "supertest";
import { applicationErrorHandler } from "../../../../api/middleware/notFoundHandling";
import { AppSpaceError } from "../../../../services/apps/AppSpaceError";

jest.mock("../../../../persistence/config/database", () => ({ __esModule: true, default: {} }));
jest.mock("../../../../api/middleware/authentication", () => ({
  requireAuth: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    Object.assign(req, { authContext: { user: { id: "admin-1" } } });
    next();
  },
}));

import { createAppHomeRouter } from "../../../../api/routes/appHome";

const CONNECTION_ID = "22222222-2222-4222-8222-222222222222";
const STATUS = {
  home: { integrationId: CONNECTION_ID, credentialId: null, owner: "acme" },
  availability: { available: true, missing: [] },
};

function app() {
  const appHome = { status: jest.fn(async () => STATUS), set: jest.fn(async () => STATUS), clear: jest.fn(async () => STATUS) };
  const server = express();
  server.use(express.json());
  server.use("/api/app-home", createAppHomeRouter(appHome));
  server.use(applicationErrorHandler);
  return { server, appHome };
}

describe("App home routes", () => {
  it("returns the App home and whether App spaces are offered", async () => {
    const { server } = app();
    const response = await request(server).get("/api/app-home").expect(200);
    expect(response.body.data).toEqual(STATUS);
  });

  it("saves the App home, with the connection's default token when none is chosen", async () => {
    const { server, appHome } = app();
    await request(server).put("/api/app-home").send({ integrationId: CONNECTION_ID, owner: " acme " }).expect(200);
    expect(appHome.set).toHaveBeenCalledWith({ integrationId: CONNECTION_ID, credentialId: null, owner: "acme" }, "admin-1");
  });

  it("rejects an App home without an owner", async () => {
    const { server, appHome } = app();
    await request(server).put("/api/app-home").send({ integrationId: CONNECTION_ID }).expect(400);
    expect(appHome.set).not.toHaveBeenCalled();
  });

  it("says why an owner can't be used", async () => {
    const { server, appHome } = app();
    appHome.set.mockRejectedValue(new AppSpaceError("OWNER_UNAVAILABLE", "This token can't create repositories under globex."));
    const response = await request(server).put("/api/app-home").send({ integrationId: CONNECTION_ID, owner: "globex" }).expect(422);
    expect(response.body).toEqual({ error: "This token can't create repositories under globex.", code: "OWNER_UNAVAILABLE" });
  });

  it("clears the App home", async () => {
    const { server, appHome } = app();
    await request(server).delete("/api/app-home").expect(200);
    expect(appHome.clear).toHaveBeenCalledWith("admin-1");
  });
});
