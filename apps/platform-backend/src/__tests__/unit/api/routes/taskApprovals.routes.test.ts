import express from "express";
import request from "supertest";
import type { WorkspaceRole } from "@viberglass/types";
import { registerTaskApprovalRoutes } from "../../../../api/routes/tickets/approvalRoutes";
import { applicationErrorHandler } from "../../../../api/middleware/notFoundHandling";
import { APPROVAL_POLICY_ERROR_CODE, ApprovalPolicyError } from "../../../../services/errors/ApprovalPolicyError";

const TASK_ID = "11111111-1111-4111-8111-111111111111";

function appWith(role: WorkspaceRole = "member") {
  const deps = {
    policy: { describe: jest.fn() },
    requests: { request: jest.fn().mockResolvedValue({ approvalState: "approval_requested" }) },
    research: { approve: jest.fn().mockResolvedValue(undefined) },
    planning: { approve: jest.fn(), revokeApproval: jest.fn() },
  };
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    const at = new Date();
    req.authContext = {
      user: { id: "u-1", email: "maria@example.com", name: "Maria", avatarUrl: null, role, createdAt: at, updatedAt: at, deactivatedAt: null },
      session: { id: "s", userId: "u-1", tokenHash: "h", createdAt: at, expiresAt: at, revokedAt: null },
      roles: [role],
      permissions: [],
    };
    next();
  });
  const router = express.Router();
  registerTaskApprovalRoutes(router, deps);
  app.use("/api/tasks", router);
  app.use(applicationErrorHandler);
  return { app, deps };
}

describe("task approval routes (J7)", () => {
  it("approves the plan as the signed-in person", async () => {
    const { app, deps } = appWith();
    deps.planning.approve.mockResolvedValue({ document: { approvalState: "approved" }, latestRun: null });

    const response = await request(app).post(`/api/tasks/${TASK_ID}/phases/planning/approve`).expect(200);

    expect(deps.planning.approve).toHaveBeenCalledWith(TASK_ID, "u-1");
    expect(response.body.data.document.approvalState).toBe("approved");
  });

  it("answers 403 with the policy's reason when the person may not approve", async () => {
    const { app, deps } = appWith();
    deps.planning.approve.mockRejectedValue(new ApprovalPolicyError(APPROVAL_POLICY_ERROR_CODE.NOT_ELIGIBLE, "Only Tomi can approve the plan."));

    const response = await request(app).post(`/api/tasks/${TASK_ID}/phases/planning/approve`).expect(403);

    expect(response.body).toEqual({ error: "Only Tomi can approve the plan.", code: "APPROVAL_NOT_ELIGIBLE" });
  });

  it("approves the research as the signed-in person", async () => {
    const { app, deps } = appWith();

    await request(app).post(`/api/tasks/${TASK_ID}/phases/research/approve`).expect(200);

    expect(deps.research.approve).toHaveBeenCalledWith(TASK_ID, "u-1");
  });

  it("asks the named people to review the step", async () => {
    const { app, deps } = appWith();

    await request(app).post(`/api/tasks/${TASK_ID}/phases/planning/request-approval`).send({ reviewerIds: ["tomi"] }).expect(200);

    expect(deps.requests.request).toHaveBeenCalledWith(TASK_ID, "planning", "u-1", ["tomi"]);
  });

  it("lets a guest ask only for themselves", async () => {
    const { app, deps } = appWith("guest");

    await request(app).post(`/api/tasks/${TASK_ID}/phases/planning/request-approval`).send({ reviewerIds: ["tomi"] }).expect(403);
    await request(app).post(`/api/tasks/${TASK_ID}/phases/planning/request-approval`).send({ reviewerIds: ["u-1"] }).expect(200);
    expect(deps.requests.request).toHaveBeenCalledTimes(1);
  });

  it("refuses steps that aren't approved in Viberglass", async () => {
    const { app } = appWith();

    await request(app).post(`/api/tasks/${TASK_ID}/phases/execution/request-approval`).expect(400);
  });

  it("describes the caller's approvals", async () => {
    const { app, deps } = appWith();
    const approvals = { research: { canApprove: true, approvers: [] }, planning: { canApprove: false, approvers: [{ id: "tomi", name: "Tomi" }] } };
    deps.policy.describe.mockResolvedValue(approvals);

    const response = await request(app).get(`/api/tasks/${TASK_ID}/approvals`).expect(200);

    expect(deps.policy.describe).toHaveBeenCalledWith("u-1", TASK_ID);
    expect(response.body.data).toEqual(approvals);
  });
});
