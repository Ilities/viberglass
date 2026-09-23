import type { NextFunction, Request, Response } from "express";

const mockRequireAdmin = jest.fn(
  (_req: Request, res: Response, _next: NextFunction) => res.status(403).json({ error: "Forbidden" }),
);

jest.mock("../../../../api/middleware/authentication", () => ({
  requireRole: jest.fn(() => mockRequireAdmin),
}));

import express from "express";
import request from "supertest";
import { adminOnlyChanges } from "../../../../api/middleware/adminOnlyChanges";

function appWith(middleware: express.RequestHandler): express.Express {
  const app = express();
  app.use("/api/things", middleware, (_req, res) => res.json({ ok: true }));
  return app;
}

describe("adminOnlyChanges", () => {
  beforeEach(() => jest.clearAllMocks());

  it("lets anyone read", async () => {
    await request(appWith(adminOnlyChanges())).get("/api/things/1").expect(200);

    expect(mockRequireAdmin).not.toHaveBeenCalled();
  });

  it("requires an admin for changes", async () => {
    await request(appWith(adminOnlyChanges())).delete("/api/things/1").expect(403);
    await request(appWith(adminOnlyChanges())).post("/api/things").expect(403);

    expect(mockRequireAdmin).toHaveBeenCalledTimes(2);
  });

  it("leaves exempt paths open for changes", async () => {
    const app = appWith(adminOnlyChanges({ exemptPathPrefixes: ["/project/"] }));

    await request(app).post("/api/things/project/p-1/link").expect(200);
    await request(app).post("/api/things/int-1/credentials").expect(403);
  });
});
