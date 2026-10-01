import express, { type Request } from "express";
import request from "supertest";
import { applicationErrorHandler } from "../../../../api/middleware/notFoundHandling";
import { taskChangeGuard, tasksInBodyChangeGuard } from "../../../../api/middleware/taskChangeGuards";
import { TASK_CHANGE_POLICY_ERROR_CODE, TaskChangePolicyError } from "../../../../services/errors/TaskChangePolicyError";
import type { TaskChangePolicyService } from "../../../../services/tasks/TaskChangePolicyService";

const policy: Pick<TaskChangePolicyService, "assertCanChange"> = {
  assertCanChange: jest.fn(async (_person, ticketId: string) => {
    if (ticketId === "locked") throw new TaskChangePolicyError(TASK_CHANGE_POLICY_ERROR_CODE.NOT_ALLOWED, "Only the owner can change it.");
  }),
};

function app() {
  const a = express();
  a.use(express.json());
  a.use((req: Request, _res, next) => {
    if (req.headers["x-signed-in"]) {
      const at = new Date();
      req.authContext = {
        user: { id: "u-1", email: "u@example.com", name: "U", avatarUrl: null, role: "member", createdAt: at, updatedAt: at, deactivatedAt: null },
        session: { id: "s", userId: "u-1", tokenHash: "h", createdAt: at, expiresAt: at, revokedAt: null },
        roles: ["member"],
        permissions: [],
      };
    }
    next();
  });
  a.delete("/api/tasks/:id", taskChangeGuard("delete", policy), (_req, res) => res.json({ ok: true }));
  a.post("/api/tasks/archive", tasksInBodyChangeGuard("edit", policy), (_req, res) => res.json({ ok: true }));
  a.use(applicationErrorHandler);
  return a;
}

describe("task change guards", () => {
  it("refuses a change the policy refuses, with its reason", async () => {
    const res = await request(app()).delete("/api/tasks/locked").set("x-signed-in", "1").expect(403);
    expect(JSON.stringify(res.body)).toContain("Only the owner can change it.");
    await request(app()).delete("/api/tasks/free").set("x-signed-in", "1").expect(200);
  });

  it("refuses a bulk change when any task refuses it", async () => {
    await request(app()).post("/api/tasks/archive").set("x-signed-in", "1").send({ ticketIds: ["free", "locked"] }).expect(403);
    await request(app()).post("/api/tasks/archive").set("x-signed-in", "1").send({ ticketIds: ["free"] }).expect(200);
  });

  it("leaves requests without a signed-in person to the route's own authentication", async () => {
    await request(app()).delete("/api/tasks/locked").expect(200);
  });
});
