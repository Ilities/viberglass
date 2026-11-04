import type { Router } from "express";
import type { AppPreviewService } from "../../../services/apps/AppPreviewService";
import { validateUuidParam } from "../../middleware/validation";

const COMMIT_SHA = /^[0-9a-f]{40}$/;

/**
 * An App space task's previews, and Try it. Registered on the tasks router, so
 * its `:id` guard applies; who may start one is the service's to check.
 */
export function registerTaskPreviewRoutes(router: Router, deps: { previews: () => Pick<AppPreviewService, "listForTask" | "tryChange"> }): void {
  router.get("/:id/previews", validateUuidParam("id"), async (req, res, next) => {
    try {
      res.json({ success: true, data: await deps.previews().listForTask(req.params.id) });
    } catch (error) {
      next(error);
    }
  });

  router.post("/:id/previews", validateUuidParam("id"), async (req, res, next) => {
    const pullRequestUrl: unknown = req.body?.pullRequestUrl;
    const headSha: unknown = req.body?.headSha;
    if (typeof pullRequestUrl !== "string" || !pullRequestUrl) return res.status(400).json({ error: "pullRequestUrl is required" });
    if (typeof headSha !== "string" || !COMMIT_SHA.test(headSha)) return res.status(400).json({ error: "headSha must be a full commit id" });
    try {
      const preview = await deps.previews().tryChange(req.authContext!.user.id, req.params.id, { pullRequestUrl, headSha });
      res.status(202).json({ success: true, data: preview });
    } catch (error) {
      next(error);
    }
  });
}
