import type { Router } from "express";
import type { AppDataGrantService } from "../../../services/apps/AppDataGrantService";
import { validateUuidParam } from "../../middleware/validation";

/**
 * A copy of an App space's data for a task's next agent turn. Registered on the
 * tasks router, so its `:id` guard applies; who may give it is the service's to check.
 */
export function registerTaskAppDataGrantRoutes(
  router: Router,
  deps: { grants: Pick<AppDataGrantService, "waiting" | "grant" | "withdraw"> },
): void {
  router.get("/:id/app-data-grant", validateUuidParam("id"), async (req, res, next) => {
    try {
      res.json({ success: true, data: await deps.grants.waiting(req.params.id) });
    } catch (error) {
      next(error);
    }
  });

  router.post("/:id/app-data-grant", validateUuidParam("id"), async (req, res, next) => {
    try {
      res.status(201).json({ success: true, data: await deps.grants.grant(req.authContext!.user.id, req.params.id) });
    } catch (error) {
      next(error);
    }
  });

  router.delete("/:id/app-data-grant", validateUuidParam("id"), async (req, res, next) => {
    try {
      await deps.grants.withdraw(req.authContext!.user.id, req.params.id);
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });
}
