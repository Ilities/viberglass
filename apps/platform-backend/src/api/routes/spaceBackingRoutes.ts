import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { pipeline } from "node:stream/promises";
import type { Router } from "express";
import multer from "multer";
import { APP_DATA_UPLOAD_MAX_BYTES, isAppStartFrom } from "@viberglass/types";
import type { AppEjector } from "../../services/apps/AppEjector";
import type { SpaceBackingView } from "../../services/apps/SpaceBackingView";
import type { SpaceBringIn } from "../../services/apps/SpaceBringIn";
import type { SpaceAccessService } from "../../services/spaces/SpaceAccessService";
import { spaceViewerOf } from "../middleware/spaceAccessGuards";
import { validateUuidParam } from "../middleware/validation";

async function discard(path: string | undefined): Promise<void> {
  if (path) await rm(path, { force: true });
}

const upload = multer({ dest: tmpdir(), limits: { fileSize: APP_DATA_UPLOAD_MAX_BYTES, files: 1 } }).single("file");

/**
 * Registered on the spaces router, whose `:projectId` guard lets only
 * maintainers change a space; reading what switching offers needs a maintainer too.
 */
export function registerSpaceBackingRoutes(
  router: Router,
  services: {
    bringIn: Pick<SpaceBringIn, "bringIn">;
    ejector: Pick<AppEjector, "eject">;
    view: Pick<SpaceBackingView, "options" | "openLastCopy">;
  },
  access: Pick<SpaceAccessService, "assertCanMaintain">,
): void {
  router.get("/:projectId/backing", validateUuidParam("projectId"), async (req, res, next) => {
    try {
      const viewer = spaceViewerOf(req);
      if (!viewer) return res.status(401).json({ error: "Sign in to change the space" });
      await access.assertCanMaintain(viewer, req.params.projectId);
      const options = await services.view.options(req.params.projectId);
      if (!options) return res.status(404).json({ error: "Project not found" });
      res.json({ success: true, data: options });
    } catch (error) {
      next(error);
    }
  });

  router.post("/:projectId/backing/app", validateUuidParam("projectId"), (req, res, next) => {
    upload(req, res, async (uploadError: unknown) => {
      if (uploadError instanceof multer.MulterError) {
        return res.status(400).json({ error: uploadError.code === "LIMIT_FILE_SIZE" ? "That file is too large." : uploadError.message });
      }
      if (uploadError) return next(uploadError);
      const uploadPath = req.file?.path;
      try {
        const viewer = spaceViewerOf(req);
        if (!viewer) return res.status(401).json({ error: "Sign in to change the space" });
        const { name, startFrom } = req.body ?? {};
        if (!isAppStartFrom(startFrom)) return res.status(400).json({ error: "Say what data the app starts with" });
        const broughtIn = await services.bringIn
          .bringIn(req.params.projectId, viewer.id, {
            ...(typeof name === "string" ? { name } : {}),
            startFrom,
            ...(uploadPath ? { uploadPath } : {}),
          })
          .finally(() => discard(uploadPath));
        if (!broughtIn) return res.status(404).json({ error: "Project not found" });
        res.json({ success: true, data: broughtIn });
      } catch (error) {
        next(error);
      } finally {
        await discard(uploadPath);
      }
    });
  });

  router.post("/:projectId/backing/git", validateUuidParam("projectId"), async (req, res, next) => {
    try {
      const ejected = await services.ejector.eject(req.params.projectId);
      res.json({ success: true, data: { ejectedAt: ejected.ejectedAt.toISOString(), bytes: ejected.copyBytes } });
    } catch (error) {
      next(error);
    }
  });

  router.get("/:projectId/backing/last-app-data", validateUuidParam("projectId"), async (req, res, next) => {
    try {
      const viewer = spaceViewerOf(req);
      if (!viewer) return res.status(401).json({ error: "Sign in to download the app's data" });
      await access.assertCanMaintain(viewer, req.params.projectId);
      const copy = await services.view.openLastCopy(req.params.projectId);
      res.status(200).set({
        "Content-Type": "application/vnd.sqlite3",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(copy.filename)}`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "no-store",
      });
      await pipeline(copy.content, res);
    } catch (error) {
      if (res.headersSent) return res.destroy();
      next(error);
    }
  });
}
