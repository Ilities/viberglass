import type { Router } from "express";
import { isObjectRecord, parseAppManifestSettings, type ReleaseCompleteRequest } from "@viberglass/types";
import logger from "../../../config/logger";
import { ReleaseCallbackDenied, type ReleaseCallbackService } from "../../../services/apps/ReleaseCallbackService";
import { validateCallbackToken } from "../../middleware/callbackTokenValidation";
import { tenantMiddleware } from "../../middleware/tenantValidation";

function completeRequestOf(body: unknown): ReleaseCompleteRequest | null {
  if (!isObjectRecord(body) || typeof body.buildLog !== "string") return null;
  if (body.outcome === "failed") {
    return typeof body.reason === "string" ? { outcome: "failed", reason: body.reason, buildLog: body.buildLog } : null;
  }
  if (
    body.outcome !== "ready" ||
    typeof body.sha256 !== "string" ||
    !/^[0-9a-f]{64}$/.test(body.sha256) ||
    typeof body.bundleBytes !== "number" ||
    !Number.isSafeInteger(body.bundleBytes) ||
    body.bundleBytes <= 0 ||
    typeof body.nodeVersion !== "string" ||
    !/^v\d+\.\d+\.\d+$/.test(body.nodeVersion)
  ) {
    return null;
  }
  const settings = body.settings === undefined ? { settings: undefined } : parseAppManifestSettings(body.settings);
  if ("error" in settings) return null;
  return {
    outcome: "ready",
    sha256: body.sha256,
    bundleBytes: body.bundleBytes,
    nodeVersion: body.nodeVersion,
    buildLog: body.buildLog,
    ...(settings.settings ? { settings: settings.settings } : {}),
  };
}

function failureStatus(error: unknown, jobId: string, action: string): { status: number; message: string } {
  if (error instanceof ReleaseCallbackDenied) return { status: 409, message: error.message };
  logger.error(`Release ${action} failed`, { jobId, error: error instanceof Error ? error.message : String(error) });
  return { status: 500, message: `Could not ${action}` };
}

/** What a release build asks of the backend: where to upload its bundle, and to record how the build went. */
export function registerReleaseRoutes(router: Router, releases: Pick<ReleaseCallbackService, "grant" | "complete">): void {
  router.post("/:jobId/release/storage-url", tenantMiddleware, validateCallbackToken, async (req, res) => {
    try {
      const data = await releases.grant(req.params.jobId, req.tenantId!);
      res.setHeader("Cache-Control", "no-store");
      return res.json({ success: true, data });
    } catch (error) {
      const { status, message } = failureStatus(error, req.params.jobId, "grant the bundle upload");
      return res.status(status).json({ error: message });
    }
  });

  router.post("/:jobId/release/complete", tenantMiddleware, validateCallbackToken, async (req, res) => {
    const request = completeRequestOf(req.body);
    if (!request) return res.status(400).json({ error: "A ready outcome needs sha256, bundleBytes and nodeVersion; a failed one a reason; both a buildLog" });
    try {
      const status = await releases.complete(req.params.jobId, req.tenantId!, request);
      return res.json({ success: true, data: { status } });
    } catch (error) {
      const { status, message } = failureStatus(error, req.params.jobId, "record the release");
      return res.status(status).json({ error: message });
    }
  });
}
