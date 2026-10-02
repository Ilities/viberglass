import { Request, Response, Router } from "express";
import { requireAuth } from "../middleware/authentication";
import { AgentSessionDAO } from "../../persistence/agentSession/AgentSessionDAO";
import { AgentTurnDAO } from "../../persistence/agentSession/AgentTurnDAO";
import { AgentSessionEventDAO } from "../../persistence/agentSession/AgentSessionEventDAO";
import { AgentPendingRequestDAO } from "../../persistence/agentSession/AgentPendingRequestDAO";
import { AgentSessionQueryService } from "../../services/agentSession/AgentSessionQueryService";
import { AgentSessionCancellationService } from "../../services/agentSession/AgentSessionCancellationService";
import { isAgentSessionServiceError } from "../../services/errors/AgentSessionServiceError";
import {
  AGENT_SESSION_ACTIVE_STATUSES,
  AGENT_SESSION_EVENT_TYPE,
  type AgentSessionEventType,
  type AgentSessionStatus,
} from "../../types/agentSession";
import logger from "../../config/logger";
import { SessionPresenceService } from "../../services/agentSession/SessionPresenceService";
import { JobCancellationService } from "../../services/job/JobCancellationService";
import { sessionParamGuard, spaceViewerOf } from "../middleware/spaceAccessGuards";
import { SpaceAccessService } from "../../services/spaces/SpaceAccessService";

const router = Router();
const spaceAccess = new SpaceAccessService();
router.param("sessionId", sessionParamGuard(spaceAccess));
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
const presenceService = new SessionPresenceService();

const cancellationService = new AgentSessionCancellationService(
  sessionDAO,
  agentTurnDAO,
  agentSessionEventDAO,
  new JobCancellationService(),
);

const TERMINAL_EVENT_TYPES = new Set<AgentSessionEventType>([
  AGENT_SESSION_EVENT_TYPE.SESSION_COMPLETED,
  AGENT_SESSION_EVENT_TYPE.SESSION_FAILED,
  AGENT_SESSION_EVENT_TYPE.SESSION_CANCELLED,
]);

const TERMINAL_STATUSES = new Set<string>(["completed", "failed", "cancelled"]);

const POLL_MS = 2000;
const HEARTBEAT_MS = 30000;

router.get("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const rawStatuses =
      typeof req.query.statuses === "string"
        ? (req.query.statuses.split(",").filter(Boolean) as AgentSessionStatus[])
        : [...AGENT_SESSION_ACTIVE_STATUSES];

    const [sessions, visible] = await Promise.all([
      sessionDAO.listByStatuses(rawStatuses),
      spaceAccess.visibleProjectIds(spaceViewerOf(req)!),
    ]);
    const shown = visible ? sessions.filter((session) => visible.includes(session.projectId)) : sessions;
    return res.json({ success: true, data: shown });
  } catch (err) {
    logger.error("Failed to list agent sessions", {
      error: err instanceof Error ? err.message : String(err),
    });
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/:sessionId", requireAuth, async (req: Request, res: Response) => {
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
});

router.get(
  "/:sessionId/participants",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const session = await sessionDAO.getById(req.params.sessionId);
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }
      const participants = await queryService.getSessionParticipants(
        req.params.sessionId,
      );
      return res.json({ success: true, data: participants });
    } catch (err) {
      logger.error("Failed to get session participants", {
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

    const sessionId = req.params.sessionId;
    const userId = req.authContext?.user.id;
    const userName = req.authContext?.user.name ?? "Unknown";
    const avatarUrl = req.authContext?.user.avatarUrl ?? null;

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    let lastSeq = 0;
    let closed = false;

    const existingEvents = await queryService.listEvents(sessionId, {});
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

    // Register SSE connection + presence (broadcasts join/update to viewers)
    presenceService.registerConnection(
      sessionId,
      res,
      userId ? { userId, userName, avatarUrl } : undefined,
    );

    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

    const cleanup = () => {
      if (pollTimer) clearInterval(pollTimer);
      if (heartbeatTimer) clearInterval(heartbeatTimer);
    };

    req.on("close", () => {
      closed = true;
      cleanup();
      presenceService.removeConnection(sessionId, res, userId);
    });

    pollTimer = setInterval(async () => {
      if (closed) return;
      try {
        const newEvents = await queryService.listEvents(sessionId, {
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
          sessionId,
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
  "/:sessionId/cancel",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const userId = req.authContext?.user.id;
      await cancellationService.cancel(req.params.sessionId, userId);
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
