import type { Router } from "express";
import type { WorkerStorageService } from "../../../services/job/WorkerStorageService";
import { WorkerStorageDenied } from "../../../services/job/WorkerStorageService";
import { validateCallbackToken } from "../../middleware/callbackTokenValidation";
import { tenantMiddleware } from "../../middleware/tenantValidation";

export function registerWorkerStorageRoute(router: Router, storage: WorkerStorageService): void {
  router.post("/:jobId/storage-url", tenantMiddleware, validateCallbackToken, async (req, res) => {
    const operation: unknown = req.body?.operation;
    const reference: unknown = req.body?.storageUrl;
    if ((operation !== "read" && operation !== "write") ||
        (operation === "read" && typeof reference !== "string")) {
      return res.status(400).json({ error: "An operation and a read storageUrl are required" });
    }
    try {
      const data = await storage.grant(req.params.jobId, req.tenantId!, operation, typeof reference === "string" ? reference : undefined);
      res.setHeader("Cache-Control", "no-store");
      return res.json({ success: true, data });
    } catch (error) {
      return res.status(error instanceof WorkerStorageDenied ? 403 : 500).json({
        error: error instanceof WorkerStorageDenied ? error.message : "Could not authorize worker storage",
      });
    }
  });
}
