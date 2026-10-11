import { Request, Response, Router } from "express";
import type { PullRequestToOpen } from "@viberglass/integration-core";
import { isObjectRecord } from "@viberglass/types";
import logger from "../../../config/logger";
import { integrationRegistry } from "../../../integrations/registerIntegrationPlugins";
import { IntegrationCredentialDAO } from "../../../persistence/integrations/IntegrationCredentialDAO";
import { IntegrationDAO } from "../../../persistence/integrations/IntegrationDAO";
import { isDomainError } from "../../../services/errors/DomainError";
import { JobBootstrapService } from "../../../services/job/JobBootstrapService";
import { JobPullRequestOpener } from "../../../services/repositories/JobPullRequestOpener";
import { SecretResolutionService } from "../../../services/SecretResolutionService";
import { validateCallbackToken } from "../../middleware/callbackTokenValidation";
import { tenantMiddleware } from "../../middleware/tenantValidation";

const FIELDS = ["sourceRepository", "destinationRepository", "head", "base", "title", "body"] as const;

function readPullRequest(body: unknown): PullRequestToOpen | null {
  if (!isObjectRecord(body)) return null;
  const read = (key: (typeof FIELDS)[number]) => (typeof body[key] === "string" ? String(body[key]) : null);
  const [sourceRepository, destinationRepository, head, base, title, prBody] = FIELDS.map(read);
  if (!sourceRepository || !destinationRepository || !head || !base || !title || prBody === null) return null;
  return { sourceRepository, destinationRepository, head, base, title, body: prBody };
}

/** A run that pushed its branch asks for the pull request; the platform opens it through the space's code host. */
export function registerPullRequestRoute(
  router: Router,
  opener: Pick<JobPullRequestOpener, "open"> = new JobPullRequestOpener(
    new JobBootstrapService(),
    new IntegrationDAO(),
    new IntegrationCredentialDAO(),
    new SecretResolutionService(),
    integrationRegistry,
  ),
): void {
  router.post("/:jobId/pull-request", tenantMiddleware, validateCallbackToken, async (req: Request, res: Response) => {
    const pullRequest = readPullRequest(req.body);
    if (!pullRequest) return res.status(400).json({ error: "The pull request needs both repositories, head, base, title and body" });
    try {
      const url = await opener.open(req.params.jobId, pullRequest);
      return res.json({ success: true, data: { url } });
    } catch (error) {
      if (isDomainError(error)) return res.status(error.statusCode).json({ error: error.message });
      const message = error instanceof Error ? error.message : String(error);
      logger.warn("Couldn't open a run's pull request", { jobId: req.params.jobId, error: message });
      // The code host's own reason, which the run records as its failure.
      return res.status(502).json({ error: message });
    }
  });
}
