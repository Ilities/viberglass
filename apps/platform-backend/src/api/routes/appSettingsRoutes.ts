import type { Router } from "express";
import { isObjectRecord, type SaveAppSettingRequest } from "@viberglass/types";
import type { AppSettingsService } from "../../services/apps/AppSettingsService";
import type { SpaceAccessService } from "../../services/spaces/SpaceAccessService";
import { spaceViewerOf } from "../middleware/spaceAccessGuards";
import { validateUuidParam } from "../middleware/validation";

function saveRequestOf(body: unknown): SaveAppSettingRequest | null {
  if (!isObjectRecord(body) || typeof body.secret !== "boolean") return null;
  if (body.value !== undefined && typeof body.value !== "string") return null;
  if (body.forPreviews !== undefined && typeof body.forPreviews !== "boolean") return null;
  return {
    secret: body.secret,
    ...(typeof body.value === "string" ? { value: body.value } : {}),
    ...(typeof body.forPreviews === "boolean" ? { forPreviews: body.forPreviews } : {}),
  };
}

/**
 * Registered on the spaces router, whose `:projectId` guard lets only
 * maintainers change a space; reading settings needs a maintainer too.
 */
export function registerAppSettingsRoutes(
  router: Router,
  settings: Pick<AppSettingsService, "view" | "save" | "remove">,
  access: Pick<SpaceAccessService, "assertCanMaintain">,
): void {
  router.get("/:projectId/app/settings", validateUuidParam("projectId"), async (req, res, next) => {
    try {
      const viewer = spaceViewerOf(req);
      if (!viewer) return res.status(401).json({ error: "Sign in to see the app's settings" });
      await access.assertCanMaintain(viewer, req.params.projectId);
      res.json({ success: true, data: await settings.view(req.params.projectId) });
    } catch (error) {
      next(error);
    }
  });

  router.put("/:projectId/app/settings/:settingName", validateUuidParam("projectId"), async (req, res, next) => {
    try {
      const viewer = spaceViewerOf(req);
      if (!viewer) return res.status(401).json({ error: "Sign in to change the app's settings" });
      const request = saveRequestOf(req.body);
      if (!request) return res.status(400).json({ error: "Say whether the setting is secret, and give its value as text" });
      res.json({ success: true, data: await settings.save(req.params.projectId, req.params.settingName, request, viewer.id) });
    } catch (error) {
      next(error);
    }
  });

  router.delete("/:projectId/app/settings/:settingName", validateUuidParam("projectId"), async (req, res, next) => {
    try {
      res.json({ success: true, data: await settings.remove(req.params.projectId, req.params.settingName) });
    } catch (error) {
      next(error);
    }
  });
}
