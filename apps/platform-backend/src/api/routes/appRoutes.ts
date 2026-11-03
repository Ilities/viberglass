import type { Router } from "express";
import type { AppPower } from "@viberglass/types";
import type { AppService } from "../../services/apps/AppService";
import type { SpaceAccessService } from "../../services/spaces/SpaceAccessService";
import { spaceViewerOf } from "../middleware/spaceAccessGuards";
import { validateUuidParam } from "../middleware/validation";

/**
 * Registered on the spaces router, so its `:projectId` guard applies: anyone who
 * sees the space sees its app; turning it on or off needs a maintainer.
 */
export function registerAppRoutes(
  router: Router,
  apps: Pick<AppService, "view" | "setPower" | "logs">,
  access: Pick<SpaceAccessService, "assertCanMaintain">,
): void {
  router.get("/:projectId/app", validateUuidParam("projectId"), async (req, res, next) => {
    try {
      res.json({ success: true, data: await apps.view(req.params.projectId) });
    } catch (error) {
      next(error);
    }
  });

  for (const power of ["on", "off"] satisfies AppPower[]) {
    router.post(`/:projectId/app/${power}`, validateUuidParam("projectId"), async (req, res, next) => {
      try {
        res.status(202).json({ success: true, data: await apps.setPower(req.params.projectId, power) });
      } catch (error) {
        next(error);
      }
    });
  }

  // What an app prints can include its data, so only maintainers read it.
  router.get("/:projectId/app/logs", validateUuidParam("projectId"), async (req, res, next) => {
    try {
      const viewer = spaceViewerOf(req);
      if (!viewer) return res.status(401).json({ error: "Sign in to read the app's logs" });
      await access.assertCanMaintain(viewer, req.params.projectId);
      res.json({ success: true, data: { logs: await apps.logs(req.params.projectId) } });
    } catch (error) {
      next(error);
    }
  });
}
