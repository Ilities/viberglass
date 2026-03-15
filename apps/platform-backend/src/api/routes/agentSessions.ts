import { Router, Request, Response } from "express";
import { requireAuth } from "../middleware/authentication";
import { AgentSessionDAO } from "../../persistence/agentSession/AgentSessionDAO";
import { AgentTurnDAO } from "../../persistence/agentSession/AgentTurnDAO";
import { AgentSessionEventDAO } from "../../persistence/agentSession/AgentSessionEventDAO";
import { AgentPendingRequestDAO } from "../../persistence/agentSession/AgentPendingRequestDAO";
import { AgentSessionQueryService } from "../../services/agentSession/AgentSessionQueryService";
import { AgentSessionInteractionService } from "../../services/agentSession/AgentSessionInteractionService";
import { JobService } from "../../services/JobService";
import { CredentialRequirementsService } from "../../services/CredentialRequirementsService";
import { WorkerExecutionService } from "../../workers/WorkerExecutionService";
import {
  isAgentSessionServiceError,
} from "../../services/errors/AgentSessionServiceError";
import {
  AGENT_SESSION_EVENT_TYPE,
  type AgentSessionEventType,
} from "../../types/agentSession";
import logger from "../../config/logger";

const router = Router();
const sessionDAO = new AgentSessionDAO();
const agentTurnDAO = new AgentTurnDAO();
const agentSessionEventDAO = new AgentSessionEventDAO();
const agentPendingRequestDAO = new AgentPendingRequestDAO();

const queryService = new AgentSessionQueryService(
  sessionDAO,
  agentTurnDAO,
  agentSessionEventDAO,
  agentPendingRequestDAO,
);

const interactionService = new AgentSessionInteractionService(
  sessionDAO,
  agentTurnDAO,
  agentSessionEventDAO,
  agentPendingRequestDAO,
  new JobService(),
  new CredentialRequirementsService(),
  new WorkerExecutionService(),
);

const TERMINAL_EVENT_TYPES = new Set<AgentSessionEventType>([
  AGENT_SESSION_EVENT_TYPE.SESSION_COMPLETED,
  AGENT_SESSION_EVENT_TYPE.SESSION_FAILED,
  AGENT_SESSION_EVENT_TYPE.SESSION_CANCELLED,
]);

const TERMINAL_STATUSES = new Set<string>(["completed", "failed", "cancelled"]);

const POLL_MS = 2000;
const HEARTBEAT_MS = 30000;

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

router.get(
  "/:sessionId/events/stream",
  requireAuth,
  async (req: Request, res: Response) => {
    const session = await sessionDAO.getById(req.params.sessionId);
    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    let lastSeq = 0;
    let closed = false;

    const existingEvents = await queryService.listEvents(req.params.sessionId, {});
    for (const event of existingEvents) {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
      const seq = Number(event.sequence);
      if (seq > lastSeq) lastSeq = seq;
    }

    if (
      TERMINAL_STATUSES.has(session.status) ||
      existingEvents.some((e) => TERMINAL_EVENT_TYPES.has(e.eventType))
    ) {
      res.end();
      return;
    }

    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

    const cleanup = () => {
      if (pollTimer) clearInterval(pollTimer);
      if (heartbeatTimer) clearInterval(heartbeatTimer);
    };

    req.on("close", () => {
      closed = true;
      cleanup();
    });

    pollTimer = setInterval(async () => {
      if (closed) return;
      try {
        const newEvents = await queryService.listEvents(req.params.sessionId, {
          afterSequence: lastSeq,
        });
        for (const event of newEvents) {
          res.write(`data: ${JSON.stringify(event)}\n\n`);
          const seq = Number(event.sequence);
          if (seq > lastSeq) lastSeq = seq;
        }
        if (newEvents.some((e) => TERMINAL_EVENT_TYPES.has(e.eventType))) {
          cleanup();
          res.end();
        }
      } catch (err) {
        logger.error("SSE poll error", {
          sessionId: req.params.sessionId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }, POLL_MS);

    heartbeatTimer = setInterval(() => {
      if (!closed) res.write(": heartbeat\n\n");
    }, HEARTBEAT_MS);
  },
);

router.post(
  "/:sessionId/reply",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const { replyText } = req.body;
      if (!replyText || typeof replyText !== "string") {
        return res.status(400).json({ error: "replyText is required" });
      }
      const userId = req.auth?.user.email;
      const result = await interactionService.reply(
        req.params.sessionId,
        replyText,
        userId,
      );
      return res.json({ success: true, data: result });
    } catch (err) {
      logger.error("Failed to reply to agent session", {
        sessionId: req.params.sessionId,
        error: err instanceof Error ? err.message : String(err),
      });
      if (isAgentSessionServiceError(err)) {
        return res.status(err.statusCode).json({ error: err.message });
      }
      return res.status(500).json({ error: "Internal server error" });
    }
  },
);

router.post(
  "/:sessionId/approve",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const { approved } = req.body;
      if (typeof approved !== "boolean") {
        return res.status(400).json({ error: "approved (boolean) is required" });
      }
      const userId = req.auth?.user.email;
      const result = await interactionService.approve(
        req.params.sessionId,
        approved,
        userId,
      );
      return res.json({ success: true, data: result });
    } catch (err) {
      logger.error("Failed to approve/reject agent session", {
        sessionId: req.params.sessionId,
        error: err instanceof Error ? err.message : String(err),
      });
      if (isAgentSessionServiceError(err)) {
        return res.status(err.statusCode).json({ error: err.message });
      }
      return res.status(500).json({ error: "Internal server error" });
    }
  },
);

router.post(
  "/:sessionId/cancel",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const userId = req.auth?.user.email;
      await interactionService.cancel(req.params.sessionId, userId);
      return res.status(204).send();
    } catch (err) {
      logger.error("Failed to cancel agent session", {
        sessionId: req.params.sessionId,
        error: err instanceof Error ? err.message : String(err),
      });
      if (isAgentSessionServiceError(err)) {
        return res.status(err.statusCode).json({ error: err.message });
      }
      return res.status(500).json({ error: "Internal server error" });
    }
  },
);

export default router;
