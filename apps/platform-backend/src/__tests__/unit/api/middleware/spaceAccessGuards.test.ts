import express, { type Request } from "express";
import request from "supertest";
import { isWorkspaceRole } from "@viberglass/types";
import { applicationErrorHandler } from "../../../../api/middleware/notFoundHandling";
import { spaceParamGuard, taskParamGuard } from "../../../../api/middleware/spaceAccessGuards";
import { clawSpaceGuard } from "../../../../api/middleware/clawSpaceGuard";
import { SPACE_ACCESS_ERROR_CODE, SpaceAccessError } from "../../../../services/errors/SpaceAccessError";
import type { SpaceAccessService } from "../../../../services/spaces/SpaceAccessService";
import type { SpaceOwnershipDAO } from "../../../../persistence/project/SpaceOwnershipDAO";

const hidden = () => new SpaceAccessError(SPACE_ACCESS_ERROR_CODE.NOT_FOUND, "Space not found");

function fakeAccess(visible: string[], maintains: string[]) {
  const access: Pick<SpaceAccessService, "assertCanSee" | "assertCanMaintain"> = {
    assertCanSee: jest.fn(async (_viewer, id: string) => {
      if (!visible.includes(id)) throw hidden();
      return { projectId: id, membership: null };
    }),
    assertCanMaintain: jest.fn(async (_viewer, id: string) => {
      if (!visible.includes(id)) throw hidden();
      if (!maintains.includes(id)) throw new SpaceAccessError(SPACE_ACCESS_ERROR_CODE.NOT_MAINTAINER, "No");
      return id;
    }),
  };
  return access;
}

function appWith(register: (app: express.Express) => void) {
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res, next) => {
    const role = req.headers["x-role"];
    if (isWorkspaceRole(role)) {
      const at = new Date();
      req.authContext = {
        user: { id: "u-1", email: "u@example.com", name: "U", avatarUrl: null, role, createdAt: at, updatedAt: at, deactivatedAt: null },
        session: { id: "s", userId: "u-1", tokenHash: "h", createdAt: at, expiresAt: at, revokedAt: null },
        roles: [role],
        permissions: [],
      };
    }
    next();
  });
  register(app);
  app.use(applicationErrorHandler);
  return app;
}

describe("spaceParamGuard", () => {
  const app = appWith((a) => {
    const router = express.Router();
    router.param("id", spaceParamGuard(fakeAccess(["open", "mine"], ["mine"])));
    router.get("/:id", (_req, res) => res.json({ ok: true }));
    router.put("/:id", (_req, res) => res.json({ ok: true }));
    a.use("/api/spaces", router);
  });

  it("reads a visible space and hides the rest as 404", async () => {
    await request(app).get("/api/spaces/open").set("x-role", "member").expect(200);
    await request(app).get("/api/spaces/private").set("x-role", "member").expect(404);
  });

  it("changes a space only as its maintainer", async () => {
    await request(app).put("/api/spaces/open").set("x-role", "member").expect(403);
    await request(app).put("/api/spaces/mine").set("x-role", "member").expect(200);
  });
});

describe("taskParamGuard", () => {
  const owners: Pick<SpaceOwnershipDAO, "projectIdForTask"> = {
    projectIdForTask: jest.fn(async (id: string) => (id === "task-private" ? "private" : id === "task-open" ? "open" : null)),
  };
  const app = appWith((a) => {
    const router = express.Router();
    router.param("id", taskParamGuard(fakeAccess(["open"], []), owners));
    router.get("/:id", (_req, res) => res.json({ ok: true }));
    a.use("/api/tasks", router);
  });

  it("hides a task in a space the caller can't see", async () => {
    await request(app).get("/api/tasks/task-open").set("x-role", "member").expect(200);
    await request(app).get("/api/tasks/task-private").set("x-role", "member").expect(404);
  });

  it("leaves unknown tasks and admins to the route", async () => {
    await request(app).get("/api/tasks/missing").set("x-role", "member").expect(200);
    await request(app).get("/api/tasks/task-private").set("x-role", "admin").expect(200);
  });
});

describe("clawSpaceGuard", () => {
  const owners: Pick<SpaceOwnershipDAO, "projectIdForSchedule" | "projectIdForTaskTemplate" | "projectIdForScheduleExecution"> = {
    projectIdForSchedule: jest.fn(async () => "private"),
    projectIdForTaskTemplate: jest.fn(async () => "open"),
    projectIdForScheduleExecution: jest.fn(async () => null),
  };
  const app = appWith((a) => {
    a.use("/api/claw", clawSpaceGuard(fakeAccess(["open"], []), owners), (_req, res) => res.json({ ok: true }));
  });

  it("needs a named, visible space for lists", async () => {
    await request(app).get("/api/claw/schedules").set("x-role", "member").expect(400);
    await request(app).get("/api/claw/schedules?projectId=open").set("x-role", "member").expect(200);
    await request(app).get("/api/claw/schedules?projectId=private").set("x-role", "member").expect(404);
    await request(app).get("/api/claw/schedules").set("x-role", "admin").expect(200);
  });

  it("checks the space of one schedule or template", async () => {
    await request(app).post("/api/claw/schedules/s-1/pause").set("x-role", "member").expect(404);
    await request(app).get("/api/claw/task-templates/t-1").set("x-role", "member").expect(200);
  });
});
