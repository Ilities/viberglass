import type { NextFunction, Request, Response } from "express";

// requireRole stand-in: the caller's role comes from a test header.
jest.mock("../../../../api/middleware/authentication", () => ({
  requireRole: (required: string | string[]) => {
    const roles = Array.isArray(required) ? required : [required];
    return (req: Request, res: Response, next: NextFunction) =>
      roles.includes(String(req.headers["x-role"])) ? next() : res.status(403).json({ error: "Forbidden" });
  },
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
  it("lets admins, members and viewers read, not guests", async () => {
    const app = appWith(adminOnlyChanges());
    await request(app).get("/api/things/1").set("x-role", "admin").expect(200);
    await request(app).get("/api/things/1").set("x-role", "member").expect(200);
    await request(app).get("/api/things/1").set("x-role", "guest").expect(403);
    await request(app).get("/api/things/1").set("x-role", "viewer").expect(200);
  });

  it("requires an admin for changes", async () => {
    const app = appWith(adminOnlyChanges());
    await request(app).delete("/api/things/1").set("x-role", "member").expect(403);
    await request(app).post("/api/things").set("x-role", "member").expect(403);
    await request(app).post("/api/things").set("x-role", "admin").expect(200);
  });

  it("lets members change exempt paths, but not guests", async () => {
    const app = appWith(adminOnlyChanges({ exemptPathPrefixes: ["/space/"] }));

    await request(app).post("/api/things/space/p-1/link").set("x-role", "member").expect(200);
    await request(app).post("/api/things/space/p-1/link").set("x-role", "guest").expect(403);
    await request(app).post("/api/things/int-1/credentials").set("x-role", "member").expect(403);
  });
});
