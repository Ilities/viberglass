import type { Router } from "express";
import { isObjectRecord } from "@viberglass/types";
import {
  InvalidSpaceArchive,
  SpaceFilesConflict,
  SpaceFilesDenied,
  type SpaceFilesRunService,
} from "../../../services/spaceFiles/SpaceFilesRunService";
import logger from "../../../config/logger";
import { validateCallbackToken } from "../../middleware/callbackTokenValidation";
import { tenantMiddleware } from "../../middleware/tenantValidation";

function failure(error: unknown): { status: number; message: string } {
  if (error instanceof SpaceFilesDenied) return { status: 403, message: error.message };
  if (error instanceof SpaceFilesConflict) return { status: 409, message: error.message };
  if (error instanceof InvalidSpaceArchive) return { status: 422, message: error.message };
  return { status: 500, message: "Could not handle the run's files" };
}

/** What a Files run asks of the backend: where to read and write its archive, and to save it. */
export function registerFilesWorkerRoutes(router: Router, files: SpaceFilesRunService): void {
  router.post("/:jobId/files/storage-url", tenantMiddleware, validateCallbackToken, async (req, res) => {
    const operation: unknown = req.body?.operation;
    if (operation !== "read" && operation !== "write") {
      return res.status(400).json({ error: "operation must be read or write" });
    }
    try {
      const data = await files.grant(req.params.jobId, req.tenantId!, operation);
      res.setHeader("Cache-Control", "no-store");
      return res.json({ success: true, data });
    } catch (error) {
      const { status, message } = failure(error);
      if (status === 500) logger.error("Files storage grant failed", { jobId: req.params.jobId, error: error instanceof Error ? error.message : String(error) });
      return res.status(status).json({ error: message });
    }
  });

  router.post("/:jobId/files/checkpoint", tenantMiddleware, validateCallbackToken, async (req, res) => {
    const body: unknown = req.body;
    if (
      !isObjectRecord(body) ||
      typeof body.sha256 !== "string" ||
      !/^[0-9a-f]{64}$/i.test(body.sha256) ||
      typeof body.archiveBytes !== "number" ||
      !Number.isSafeInteger(body.archiveBytes) ||
      body.archiveBytes < 0 ||
      typeof body.partial !== "boolean"
    ) {
      return res.status(400).json({ error: "sha256, archiveBytes and partial are required" });
    }
    try {
      const data = await files.checkpoint(req.params.jobId, req.tenantId!, {
        sha256: body.sha256,
        archiveBytes: body.archiveBytes,
        partial: body.partial,
      });
      return res.json({ success: true, data });
    } catch (error) {
      const { status, message } = failure(error);
      if (status === 500) logger.error("Files checkpoint failed", { jobId: req.params.jobId, error: error instanceof Error ? error.message : String(error) });
      return res.status(status).json({ error: message });
    }
  });
}
