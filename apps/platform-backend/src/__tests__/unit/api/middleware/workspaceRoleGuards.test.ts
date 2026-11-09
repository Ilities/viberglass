import type { NextFunction, Request, Response } from "express";

jest.mock("../../../../api/middleware/authentication", () => ({
  requireRole: (required: string | string[], options?: { forbiddenMessage?: string }) => {
    const roles = Array.isArray(required) ? required : [required];
    return (req: Request, res: Response, next: NextFunction) =>
      roles.includes(String(req.headers["x-role"]))
        ? next()
        : res.status(403).json({ error: options?.forbiddenMessage ?? "Forbidden" });
  },
}));

import express from "express";
import request from "supertest";
import { isWorkspaceRole, type WorkspaceRole } from "@viberglass/types";
import type { AuthContext } from "../../../../api/auth/context";
import {
  confineAppUsers,
  refuseViewerChanges,
  requireRunReader,
  requireRunnerRole,
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

function appWithSignedInRole(guard: express.RequestHandler = refuseViewerChanges) {
  const app = express();
  app.use((req, _res, next) => {
    const role = req.headers["x-role"];
    if (isWorkspaceRole(role)) req.authContext = contextFor(role);
    next();
  });
  app.use(guard);
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

  it("lets viewers sign out, change their own settings and open apps", async () => {
    const app = appWithSignedInRole();
    await request(app).post("/api/auth/logout").set("x-role", "viewer").expect(200);
    await request(app).put("/api/me/notification-channels").set("x-role", "viewer").expect(200);
    await request(app).post("/api/apps/laptops/handoff").set("x-role", "viewer").expect(200);
    await request(app).post("/API/Apps/laptops/handoff").set("x-role", "viewer").expect(200);
  });

  it("refuses viewers every other change under those paths", async () => {
    const app = appWithSignedInRole();
    for (const path of ["/api/apps/laptops/handoff/x", "/api/apps/laptops", "/api/inbox/x", "/api/auth/logout-everywhere"]) {
      await request(app).post(path).set("x-role", "viewer").expect(403);
    }
  });

  it("leaves other roles and requests without a user alone", async () => {
    const app = appWithSignedInRole();
    await request(app).post("/api/tasks").set("x-role", "guest").expect(200);
    await request(app).post("/api/jobs/1/result").expect(200);
  });
});

describe("confineAppUsers", () => {
  it("lets app users reach only their session, account and apps", async () => {
    const app = appWithSignedInRole(confineAppUsers);
    for (const path of ["/api/auth/me", "/api/me/notification-channels", "/api/account-links/invites/t", "/api/apps", "/api/apps/laptops/handoff"]) {
      await request(app).get(path).set("x-role", "app_user").expect(200);
    }
    for (const path of ["/api/spaces", "/api/tasks/1", "/api/users/directory", "/api/apps-admin", "/api/mcp", "/api/inbox/x"]) {
      const res = await request(app).get(path).set("x-role", "app_user").expect(403);
      expect(res.body.error).toBe("App users can only open the apps they're given.");
    }
    await request(app).post("/api/spaces").set("x-role", "app_user").expect(403);
  });

  it("refuses app users whatever the path's case, since routes match it either way", async () => {
    const app = appWithSignedInRole(confineAppUsers);
    for (const path of ["/API/users/directory", "/Api/home", "/aPI/spaces"]) {
      await request(app).get(path).set("x-role", "app_user").expect(403);
    }
    await request(app).get("/API/apps").set("x-role", "app_user").expect(200);
  });

  it("leaves other roles and requests without a user alone", async () => {
    const app = appWithSignedInRole(confineAppUsers);
    for (const role of ["admin", "member", "guest", "viewer"]) {
      await request(app).get("/api/spaces").set("x-role", role).expect(200);
    }
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

describe("requireRunReader", () => {
  it("lets admins, members and viewers through, not guests or app users", async () => {
    const app = express();
    app.use("/api/claw", requireRunReader, (_req, res) => res.json({ ok: true }));
    for (const role of ["admin", "member", "viewer"]) {
      await request(app).get("/api/claw/schedules").set("x-role", role).expect(200);
    }
    for (const role of ["guest", "app_user"]) {
      await request(app).get("/api/claw/schedules").set("x-role", role).expect(403);
    }
  });
});

describe("requireRunnerRole", () => {
  it("lets admins and members through and tells others who can", async () => {
    const app = express();
    app.use("/api/claw", requireRunnerRole, (_req, res) => res.json({ ok: true }));
    await request(app).get("/api/claw/schedules").set("x-role", "member").expect(200);
    await request(app).get("/api/claw/schedules").set("x-role", "admin").expect(200);
    for (const role of ["guest", "viewer", "app_user"]) {
      const res = await request(app).get("/api/claw/schedules").set("x-role", role).expect(403);
      expect(res.body.error).toBe("Only admins and members can do this.");
    }
  });
});
