import type { Router } from "express";
import logger from "../../../config/logger";
import type { AgentSessionLaunchService } from "../../../services/agentSession/AgentSessionLaunchService";
import type { AgentSessionQueryService } from "../../../services/agentSession/AgentSessionQueryService";
import type { AgentSessionMode } from "../../../types/agentSession";
import {
  isAgentSessionServiceError,
  AGENT_SESSION_SERVICE_ERROR_CODE,
} from "../../../services/errors/AgentSessionServiceError";
import { AGENT_SESSION_MODE } from "../../../types/agentSession";

interface AgentSessionRouteDependencies {
  launchService: AgentSessionLaunchService;
  queryService: AgentSessionQueryService;
}

const VALID_MODES = new Set<string>(Object.values(AGENT_SESSION_MODE));

export function registerTicketAgentSessionRoutes(
  router: Router,
  { launchService, queryService }: AgentSessionRouteDependencies,
): void {
  router.post("/:id/agent-sessions", async (req, res) => {
    try {
      const ticketId = req.params.id;
      const { clankerId, mode, initialMessage } = req.body;

      if (!clankerId || typeof clankerId !== "string") {
        return res
          .status(400)
          .json({ error: "Bad request", message: "clankerId is required" });
      }
      if (!mode || !VALID_MODES.has(mode)) {
        return res.status(400).json({
          error: "Bad request",
          message: `mode must be one of: ${[...VALID_MODES].join(", ")}`,
        });
      }
      if (!initialMessage || typeof initialMessage !== "string") {
        return res
          .status(400)
          .json({ error: "Bad request", message: "initialMessage is required" });
      }

      const userId = req.auth?.user.id;
      const result = await launchService.launch(
        {
          ticketId,
          clankerId,
          mode: mode as AgentSessionMode,
          initialMessage,
        },
        userId,
      );

      return res.status(202).json({ success: true, data: result });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error("Failed to launch agent session", {
        ticketId: req.params.id,
        error: error.message,
      });

      if (isAgentSessionServiceError(err)) {
        const status = err.statusCode;
        const label =
          err.code === AGENT_SESSION_SERVICE_ERROR_CODE.SESSION_ALREADY_ACTIVE
            ? "Conflict"
            : "Not found";
        return res.status(status).json({ error: label, message: err.message });
      }

      return res.status(500).json({
        error: "Internal server error",
        message: error.message,
      });
    }
  });

  router.get("/:id/agent-sessions", async (req, res) => {
    try {
      const sessions = await queryService.listForTicket(req.params.id);
      return res.json({ success: true, data: sessions });
    } catch (err) {
      logger.error("Failed to list agent sessions for ticket", {
        ticketId: req.params.id,
        error: err instanceof Error ? err.message : String(err),
      });
      return res.status(500).json({ error: "Internal server error" });
    }
  });
}
