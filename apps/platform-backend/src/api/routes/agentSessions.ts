import { Request, Response, Router } from "express";
import { requireAuth } from "../middleware/authentication";
import { AgentSessionDAO } from "../../persistence/agentSession/AgentSessionDAO";
import { AgentTurnDAO } from "../../persistence/agentSession/AgentTurnDAO";
import { AgentSessionEventDAO } from "../../persistence/agentSession/AgentSessionEventDAO";
import { AgentPendingRequestDAO } from "../../persistence/agentSession/AgentPendingRequestDAO";
import { AgentSessionQueryService } from "../../services/agentSession/AgentSessionQueryService";
import { AgentSessionInteractionService } from "../../services/agentSession/AgentSessionInteractionService";
import { JobService } from "../../services/JobService";
import { CredentialRequirementsService } from "../../services/CredentialRequirementsService";
import { WorkerExecutionService } from "../../workers";
import { isAgentSessionServiceError } from "../../services/errors/AgentSessionServiceError";
import {
  AGENT_SESSION_ACTIVE_STATUSES,
  AGENT_SESSION_EVENT_TYPE,
  type AgentSessionEventType,
  type AgentSessionStatus,
} from "../../types/agentSession";
import logger from "../../config/logger";

// ─── In-memory presence tracking ────────────────────────────────────────────

interface PresenceUser {
  userId: string;
  userName: string;
  avatarUrl: string | null;
}

type PresenceSet = Map<string, PresenceUser>;
const presenceBySession = new Map<string, PresenceSet>();
const sseConnections = new Map<string, Set<Response>>();

function broadcastToSession(sessionId: string, data: unknown): void {
  const connections = sseConnections.get(sessionId);
  if (!connections) return;
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  for (const res of connections) {
    try {
      res.write(payload);
    } catch {
      // Connection may have closed
    }
  }
}

function broadcastPresenceUpdate(sessionId: string): void {
  const users = presenceBySession.get(sessionId);
  if (!users) return;
  const userList = [...users.values()];
  broadcastToSession(sessionId, {
    id: `presence_${Date.now()}`,
    sessionId,
    turnId: null,
    jobId: null,
    sequence: -1,
    eventType: "presence_update",
    payloadJson: { users: userList },
    userId: null,
    createdAt: new Date().toISOString(),
  });
}

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

router.get("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const rawStatuses =
      typeof req.query.statuses === "string"
        ? (req.query.statuses.split(",").filter(Boolean) as AgentSessionStatus[])
        : [...AGENT_SESSION_ACTIVE_STATUSES];

    const sessions = await sessionDAO.listByStatuses(rawStatuses);
    return res.json({ success: true, data: sessions });
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
    const userId = req.auth?.user.id;
    const userName = req.auth?.user.name ?? "Unknown";
    const avatarUrl = req.auth?.user.avatarUrl ?? null;

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

    // Register SSE connection
    if (!sseConnections.has(sessionId)) {
      sseConnections.set(sessionId, new Set());
    }
    sseConnections.get(sessionId)!.add(res);

    // Add user to presence
    if (userId) {
      if (!presenceBySession.has(sessionId)) {
        presenceBySession.set(sessionId, new Map());
      }
      presenceBySession.get(sessionId)!.set(userId, {
        userId,
        userName,
        avatarUrl,
      });

      // Broadcast user_joined
      broadcastToSession(sessionId, {
        id: `join_${userId}_${Date.now()}`,
        sessionId,
        turnId: null,
        jobId: null,
        sequence: -1,
        eventType: "user_joined",
        payloadJson: { userId, userName, avatarUrl },
        userId: null,
        createdAt: new Date().toISOString(),
      });

      // Broadcast updated presence
      broadcastPresenceUpdate(sessionId);
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

      // Remove SSE connection
      const connections = sseConnections.get(sessionId);
      if (connections) {
        connections.delete(res);
        if (connections.size === 0) {
          sseConnections.delete(sessionId);
        }
      }

      // Remove user from presence
      if (userId) {
        const presence = presenceBySession.get(sessionId);
        if (presence) {
          presence.delete(userId);
          if (presence.size === 0) {
            presenceBySession.delete(sessionId);
          }
        }

        // Broadcast user_left
        broadcastToSession(sessionId, {
          id: `left_${userId}_${Date.now()}`,
          sessionId,
          turnId: null,
          jobId: null,
          sequence: -1,
          eventType: "user_left",
          payloadJson: { userId, userName },
          userId: null,
          createdAt: new Date().toISOString(),
        });

        // Broadcast updated presence
        broadcastPresenceUpdate(sessionId);
      }
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
  "/:sessionId/reply",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const { replyText } = req.body;
      if (!replyText || typeof replyText !== "string") {
        return res.status(400).json({ error: "replyText is required" });
      }
      const userId = req.auth?.user.id;
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
  "/:sessionId/message",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const { messageText } = req.body;
      if (!messageText || typeof messageText !== "string") {
        return res.status(400).json({ error: "messageText is required" });
      }
      const userId = req.auth?.user.id;
      const result = await interactionService.sendMessage(
        req.params.sessionId,
        messageText,
        userId,
      );
      return res.json({ success: true, data: result });
    } catch (err) {
      logger.error("Failed to send message to agent session", {
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
        return res
          .status(400)
          .json({ error: "approved (boolean) is required" });
      }
      const userId = req.auth?.user.id;
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
      const userId = req.auth?.user.id;
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
