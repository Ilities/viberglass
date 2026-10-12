import { Request, Response, Router } from "express";
import logger from "../../../config/logger";
import { AgentLoginNotApplicableError, AgentLoginService } from "../../../services/agentLogin/AgentLoginService";
import { isSecretServiceError } from "../../../services/errors/SecretServiceError";
import { JobBootstrapService } from "../../../services/job/JobBootstrapService";
import { JobQueryService } from "../../../services/job/JobQueryService";
import { SecretService } from "../../../services/SecretService";
import { validateCallbackToken } from "../../middleware/callbackTokenValidation";
import { tenantMiddleware } from "../../middleware/tenantValidation";
import { validateAgentLogin } from "../../middleware/validation";

const jobQueries = new JobQueryService();
const bootstraps = new JobBootstrapService();
const logins = new AgentLoginService();
// A Kubernetes worker reads its run's credentials from the database, so its login is kept there.
const kubernetesLogins = new AgentLoginService(undefined, new SecretService(), "database");

/** Where a worker keeps the login its harness got or refreshed, as its runner's own for the next run. */
export function registerAgentLoginRoute(router: Router): void {
  router.post(
    "/:jobId/agent-login",
    tenantMiddleware,
    validateCallbackToken,
    validateAgentLogin,
    async (req: Request, res: Response) => {
      const { jobId } = req.params;
      const tenantId = req.tenantId!;
      const credential = typeof req.body.credential === "string" ? req.body.credential : "";

      try {
        const job = await jobQueries.getJobStatus(jobId);
        if (!job) return res.status(404).json({ error: "Job not found" });
        if (job.data.tenantId !== tenantId) return res.status(403).json({ error: "Access denied" });
        if (!job.clankerId) return res.status(403).json({ error: "Only a runner's job keeps a login" });

        const bootstrap = await bootstraps.getBootstrapPayload(jobId);
        const isKubernetes = bootstrap?.payload?.workerType === "kubernetes";
        if (isKubernetes && bootstrap.status !== "active") {
          return res.status(403).json({ error: "The login is not authorized for this run" });
        }

        const stored = await (isKubernetes ? kubernetesLogins : logins).saveLogin(job.clankerId, credential);
        logger.info("Stored the agent login a worker uploaded", {
          jobId,
          clankerId: job.clankerId,
          secretId: stored.id,
          secretLocation: stored.secretLocation,
        });
        return res.json({ success: true, secretId: stored.id, secretLocation: stored.secretLocation });
      } catch (error) {
        if (error instanceof AgentLoginNotApplicableError) return res.status(403).json({ error: error.message });
        const statusCode = isSecretServiceError(error) ? error.statusCode : 500;
        logger.error("Failed to store an agent login", {
          error: error instanceof Error ? error.message : String(error),
          statusCode,
          jobId,
          credentialLength: credential.length,
        });
        return res.status(statusCode).json({ error: error instanceof Error ? error.message : "Internal server error" });
      }
    },
  );
}
