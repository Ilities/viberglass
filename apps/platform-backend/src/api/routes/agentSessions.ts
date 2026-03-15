import { Router, Request, Response } from "express";
import { requireAuth } from "../middleware/authentication";
import { AgentSessionDAO } from "../../persistence/agentSession/AgentSessionDAO";
import { AgentTurnDAO } from "../../persistence/agentSession/AgentTurnDAO";
import { AgentSessionEventDAO } from "../../persistence/agentSession/AgentSessionEventDAO";
import { AgentPendingRequestDAO } from "../../persistence/agentSession/AgentPendingRequestDAO";
import { AgentSessionQueryService } from "../../services/agentSession/AgentSessionQueryService";
import logger from "../../config/logger";

const router = Router();
const sessionDAO = new AgentSessionDAO();

const queryService = new AgentSessionQueryService(
  sessionDAO,
  new AgentTurnDAO(),
  new AgentSessionEventDAO(),
  new AgentPendingRequestDAO(),
);

router.get(
  "/:sessionId",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const detail = await queryService.getDetail(req.params.sessionId);
      if (!detail) {
        return res.status(404).json({ error: "Session not found" });
      }
      return res.json({ success: true, data: detail });
    } catch (err) {
      logger.error("Failed to get agent session detail", {
        sessionId: req.params.sessionId,
        error: err instanceof Error ? err.message : String(err),
      });
      return res.status(500).json({ error: "Internal server error" });
    }
  },
);

router.get(
  "/:sessionId/events",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const session = await sessionDAO.getById(req.params.sessionId);
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }

      const afterSequence =
        typeof req.query.afterSequence === "string"
          ? parseInt(req.query.afterSequence, 10)
          : undefined;
      const limit =
        typeof req.query.limit === "string"
          ? parseInt(req.query.limit, 10)
          : undefined;

      const events = await queryService.listEvents(req.params.sessionId, {
        afterSequence:
          afterSequence !== undefined && !isNaN(afterSequence)
            ? afterSequence
            : undefined,
        limit: limit !== undefined && !isNaN(limit) ? limit : undefined,
      });

      return res.json({ success: true, data: events });
    } catch (err) {
      logger.error("Failed to list agent session events", {
        sessionId: req.params.sessionId,
        error: err instanceof Error ? err.message : String(err),
      });
      return res.status(500).json({ error: "Internal server error" });
    }
  },
);

export default router;
