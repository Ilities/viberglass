import type { Router } from "express";
import type { MakeLiveService } from "../../../services/apps/MakeLiveService";
import { validateUuidParam } from "../../middleware/validation";

const COMMIT_SHA = /^[0-9a-f]{40}$/;

/**
 * Making an App space task's change live. Registered on the tasks router, so
 * its `:id` guard applies; who may do it is the service's to check.
 */
export function registerTaskMakeLiveRoutes(router: Router, deps: { makeLive: Pick<MakeLiveService, "makeLive"> }): void {
  router.post("/:id/make-live", validateUuidParam("id"), async (req, res, next) => {
    const pullRequestUrl: unknown = req.body?.pullRequestUrl;
    const headSha: unknown = req.body?.headSha;
    if (typeof pullRequestUrl !== "string" || !pullRequestUrl) return res.status(400).json({ error: "pullRequestUrl is required" });
    if (typeof headSha !== "string" || !COMMIT_SHA.test(headSha)) return res.status(400).json({ error: "headSha must be a full commit id" });
    try {
      const commitSha = await deps.makeLive.makeLive(req.authContext!.user.id, req.params.id, { pullRequestUrl, headSha });
      res.json({ success: true, data: { commitSha } });
    } catch (error) {
      next(error);
    }
  });
}
