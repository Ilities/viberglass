import type { Router } from "express";
import logger from "../../../config/logger";
import type { AgentSessionQueryService } from "../../../services/agentSession/AgentSessionQueryService";
import type { TaskTurnAgentResolver } from "../../../services/taskTurns/TaskTurnAgentResolver";
import type { TaskTurnService } from "../../../services/taskTurns/TaskTurnService";
import { TaskTurnError } from "../../../services/errors/TaskTurnError";
import { ACTION_FOR_PHASE } from "../../../services/taskTurns/turnActions";
import { AGENT_SESSION_MODE, type AgentSessionMode } from "../../../types/agentSession";

interface AgentSessionRouteDependencies {
  turns: Pick<TaskTurnService, "ask">;
  queryService: Pick<AgentSessionQueryService, "listForTicket">;
  agents: Pick<TaskTurnAgentResolver, "preview">;
}

function isSessionMode(value: unknown): value is AgentSessionMode {
  return Object.values(AGENT_SESSION_MODE).some((mode) => mode === value);
}

export function registerTicketAgentSessionRoutes(router: Router, { turns, queryService, agents }: AgentSessionRouteDependencies): void {
  // Which agent the next ask without a named agent goes to, so people see it before asking.
  router.get("/:id/next-agent", async (req, res, next) => {
    try {
      const { clanker, via } = await agents.preview(req.params.id);
      return res.json({ success: true, data: { clankerId: clanker.id, via, problem: clanker.readiness?.problem ?? null } });
    } catch (error) {
      if (error instanceof TaskTurnError) {
        return res.json({ success: true, data: { clankerId: null, via: null, problem: error.message } });
      }
      next(error);
    }
  });

  // Opens (or continues) the task's session with an agent: the message is its next turn, if the caller may ask for it.
  router.post("/:id/agent-sessions", async (req, res, next) => {
    const { clankerId, mode, initialMessage } = req.body ?? {};
    if (!clankerId || typeof clankerId !== "string") {
      return res.status(400).json({ error: "Bad request", message: "clankerId is required" });
    }
    if (!isSessionMode(mode)) {
      return res.status(400).json({
        error: "Bad request",
        message: `mode must be one of: ${Object.values(AGENT_SESSION_MODE).join(", ")}`,
      });
    }
    if (typeof initialMessage !== "string") {
      return res.status(400).json({ error: "Bad request", message: "initialMessage is required" });
    }
    try {
      const asked = await turns.ask(req.params.id, req.authContext?.user.id ?? null, {
        message: initialMessage,
        action: ACTION_FOR_PHASE[mode],
        agentId: clankerId,
      });
      return res.status(202).json({
        success: true,
        data: { session: asked.session, currentTurn: asked.currentTurn, job: asked.job },
      });
    } catch (error) {
      next(error);
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
