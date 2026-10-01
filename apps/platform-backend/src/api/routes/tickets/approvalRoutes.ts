import type { Router } from "express";
import { isApprovalStep, RUNNER_ROLES } from "@viberglass/types";
import type { ApprovalPolicyService } from "../../../services/approvals/ApprovalPolicyService";
import type { StepApprovalRequestService } from "../../../services/approvals/StepApprovalRequestService";
import type { TicketResearchApprovalService } from "../../../services/approvals/TicketResearchApprovalService";
import type { TicketPlanningApprovalService } from "../../../services/TicketPlanningApprovalService";
import { validateUuidParam } from "../../middleware/validation";

interface ApprovalRouteDependencies {
  policy: Pick<ApprovalPolicyService, "describe">;
  requests: Pick<StepApprovalRequestService, "request">;
  research: Pick<TicketResearchApprovalService, "approve">;
  planning: Pick<TicketPlanningApprovalService, "approve" | "revokeApproval">;
}

/**
 * Who may approve each step, asking for approval, and approving (J7). The
 * services check the space's policy; these routes only say who is acting.
 * Registered on the tasks router, so its `:id` guard hides tasks in spaces
 * the caller can't see.
 */
export function registerTaskApprovalRoutes(router: Router, deps: ApprovalRouteDependencies): void {
  router.get("/:id/approvals", validateUuidParam("id"), async (req, res, next) => {
    try {
      res.json({ success: true, data: await deps.policy.describe(req.authContext!.user.id, req.params.id) });
    } catch (error) {
      next(error);
    }
  });

  router.post("/:id/phases/:step/request-approval", validateUuidParam("id"), async (req, res, next) => {
    const { step } = req.params;
    if (!isApprovalStep(step)) return res.status(400).json({ error: "Only research and the plan are approved here" });
    const raw: unknown = req.body?.reviewerIds ?? [];
    if (!Array.isArray(raw) || !raw.every((id): id is string => typeof id === "string")) {
      return res.status(400).json({ error: "reviewerIds must be a list of user ids" });
    }
    const actor = req.authContext!.user;
    if (raw.some((id) => id !== actor.id) && !RUNNER_ROLES.includes(actor.role)) {
      return res.status(403).json({ error: "Only admins and members can ask other people to review." });
    }
    try {
      res.json({ success: true, data: await deps.requests.request(req.params.id, step, actor.id, raw) });
    } catch (error) {
      next(error);
    }
  });

  router.post("/:id/phases/research/approve", validateUuidParam("id"), async (req, res, next) => {
    try {
      await deps.research.approve(req.params.id, req.authContext!.user.id);
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  });

  router.post("/:id/phases/planning/approve", validateUuidParam("id"), async (req, res, next) => {
    try {
      res.json({ success: true, data: await deps.planning.approve(req.params.id, req.authContext!.user.id) });
    } catch (error) {
      next(error);
    }
  });

  router.post("/:id/phases/planning/revoke-approval", validateUuidParam("id"), async (req, res, next) => {
    try {
      res.json({ success: true, data: await deps.planning.revokeApproval(req.params.id, req.authContext!.user.id) });
    } catch (error) {
      next(error);
    }
  });
}
