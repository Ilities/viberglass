import { Request, Response, Router } from "express";
import { isObjectRecord } from "@viberglass/types";
import logger from "../../../config/logger";
import { isDomainError } from "../../../services/errors/DomainError";
import { PartialTurnService } from "../../../services/taskTurns/PartialTurnService";
import { validateCallbackToken } from "../../middleware/callbackTokenValidation";
import { tenantMiddleware } from "../../middleware/tenantValidation";

const partialTurns = new PartialTurnService();

const text = (value: unknown) => (typeof value === "string" ? value : undefined);

/**
 * What a stopped run had done, sent by its worker as it stops. Unlike the
 * result, it's taken for a cancelled run: that's the only kind that sends it.
 */
export function registerPartialResultRoute(router: Router): void {
  router.post("/:jobId/partial-result", tenantMiddleware, validateCallbackToken, async (req: Request, res: Response) => {
    const documents = isObjectRecord(req.body?.documents) ? req.body.documents : {};
    try {
      const kept = await partialTurns.keep(req.params.jobId, {
        documents: { plan: text(documents.plan) },
        commitHash: text(req.body?.commitHash),
      });
      return res.json({ success: true, data: { kept } });
    } catch (error) {
      if (isDomainError(error)) return res.status(error.statusCode).json({ error: error.message });
      logger.error("Failed to keep a stopped run's work", { jobId: req.params.jobId, error: error instanceof Error ? error.message : String(error) });
      return res.status(500).json({ error: "Internal server error" });
    }
  });
}
