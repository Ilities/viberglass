import type { NextFunction, Request, Response } from "express";

jest.mock("../../../../api/middleware/authentication", () => ({
  requireRole: (required: string | string[]) => {
    const roles = Array.isArray(required) ? required : [required];
    return (req: Request, res: Response, next: NextFunction) =>
      roles.includes(String(req.headers["x-role"])) ? next() : res.status(403).json({ error: "Forbidden" });
  },
}));

import express from "express";
import request from "supertest";
import { isWorkspaceRole, type WorkspaceRole } from "@viberglass/types";
import type { AuthContext } from "../../../../api/auth/context";
import {
  refuseViewerChanges,
  runnerOnlyChanges,
} from "../../../../api/middleware/workspaceRoleGuards";

function contextFor(role: WorkspaceRole): AuthContext {
  const at = new Date();
  return {
    user: { id: "u-1", email: "a@example.com", name: "A", avatarUrl: null, role, createdAt: at, updatedAt: at, deactivatedAt: null },
    session: { id: "s-1", userId: "u-1", tokenHash: "h", createdAt: at, expiresAt: at, revokedAt: null },
    roles: [role],
    permissions: [],
  };
}

function appWithSignedInRole() {
  const app = express();
  app.use((req, _res, next) => {
    const role = req.headers["x-role"];
    if (isWorkspaceRole(role)) req.authContext = contextFor(role);
    next();
  });
  app.use(refuseViewerChanges);
  app.use("/api", (_req, res) => res.json({ ok: true }));
  return app;
}

describe("refuseViewerChanges", () => {
  it("lets viewers read but refuses every change", async () => {
    const app = appWithSignedInRole();
    await request(app).get("/api/tasks").set("x-role", "viewer").expect(200);
    await request(app).post("/api/tasks").set("x-role", "viewer").expect(403);
    await request(app).put("/api/tasks/1").set("x-role", "viewer").expect(403);
    await request(app).delete("/api/tasks/1").set("x-role", "viewer").expect(403);
  });

  it("lets viewers sign out", async () => {
    await request(appWithSignedInRole()).post("/api/auth/logout").set("x-role", "viewer").expect(200);
  });

  it("leaves other roles and requests without a user alone", async () => {
    const app = appWithSignedInRole();
    await request(app).post("/api/tasks").set("x-role", "guest").expect(200);
    await request(app).post("/api/jobs/1/result").expect(200);
  });
});

describe("runnerOnlyChanges", () => {
  it("lets guests read and refuses their changes", async () => {
    const app = express();
    app.use("/api/spaces", runnerOnlyChanges(), (_req, res) => res.json({ ok: true }));
    await request(app).get("/api/spaces").set("x-role", "guest").expect(200);
    await request(app).post("/api/spaces").set("x-role", "guest").expect(403);
    await request(app).post("/api/spaces").set("x-role", "member").expect(200);
  });
});
