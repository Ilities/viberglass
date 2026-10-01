import { Request, Response, Router } from "express";
import logger from "../../../config/logger";
import { isSecretServiceError } from "../../../services/errors/SecretServiceError";
import { JobService } from "../../../services/JobService";
import { SecretService } from "../../../services/SecretService";
import { validateCallbackToken } from "../../middleware/callbackTokenValidation";
import { tenantMiddleware } from "../../middleware/tenantValidation";
import { validateCodexAuthCache } from "../../middleware/validation";

const jobService = new JobService();
const secretService = new SecretService();

/** Where a Codex worker keeps the login it refreshed, for the next run. */
export function registerCodexAuthCacheRoute(router: Router): void {
  // POST /:jobId/codex-auth-cache - Worker uploads Codex auth cache
  router.post(
    "/:jobId/codex-auth-cache",
    tenantMiddleware,
    validateCallbackToken,
    validateCodexAuthCache,
    async (req: Request, res: Response) => {
      const { jobId } = req.params;
      const tenantId = req.tenantId!;
      const secretName =
        typeof req.body.secretName === "string" ? req.body.secretName : "";
      const authJson =
        typeof req.body.authJson === "string" ? req.body.authJson : "";
      const updatedAt =
        typeof req.body.updatedAt === "string" ? req.body.updatedAt : null;

      try {
        logger.info("Received Codex auth cache callback", {
          jobId,
          tenantId,
          secretName,
          authJsonLength: authJson.length,
          hasUpdatedAt: Boolean(updatedAt),
          callbackTokenValidated: Boolean(req.callbackTokenValidated),
        });

        const job = await jobService.getJobStatus(jobId);
        if (!job) {
          logger.warn("Codex auth cache callback rejected: job not found", {
            jobId,
            tenantId,
            secretName,
          });
          return res.status(404).json({ error: "Job not found" });
        }
        if (job.data.tenantId !== tenantId) {
          logger.warn("Codex auth cache callback rejected: tenant mismatch", {
            jobId,
            tenantId,
            expectedTenantId: job.data.tenantId,
            secretName,
          });
          return res.status(403).json({ error: "Access denied" });
        }

        logger.info("Persisting Codex auth cache", {
          jobId,
          tenantId,
          secretName,
        });
        const metadata = await secretService.upsertWorkerAuthCache(
          secretName,
          authJson,
        );

        logger.info("Persisted Codex auth cache", {
          jobId,
          tenantId,
          secretName,
          secretId: metadata.id,
          secretLocation: metadata.secretLocation,
        });

        return res.json({
          success: true,
          secretId: metadata.id,
          secretLocation: metadata.secretLocation,
        });
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Internal server error";
        const statusCode = isSecretServiceError(error) ? error.statusCode : 500;

        logger.error("Failed to persist Codex auth cache", {
          error: error instanceof Error ? error.message : String(error),
          statusCode,
          jobId,
          tenantId,
          secretName,
          authJsonLength: authJson.length,
        });
        return res.status(statusCode).json({
          error: errorMessage,
        });
      }
    },
  );
}
