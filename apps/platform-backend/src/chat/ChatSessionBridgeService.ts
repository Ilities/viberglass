import { Card, CardText, Actions, Button } from "chat";
import type { Thread } from "chat";
import logger from "../config/logger";
import { AgentSessionQueryService } from "../services/agentSession/AgentSessionQueryService";
import { AgentSessionDAO } from "../persistence/agentSession/AgentSessionDAO";
import { AgentTurnDAO } from "../persistence/agentSession/AgentTurnDAO";
import { AgentSessionEventDAO } from "../persistence/agentSession/AgentSessionEventDAO";
import { AgentPendingRequestDAO } from "../persistence/agentSession/AgentPendingRequestDAO";
import type { AgentSessionEvent } from "../persistence/agentSession/AgentSessionEventDAO";
import {
  AGENT_SESSION_EVENT_TYPE,
  AGENT_SESSION_ACTIVE_STATUSES,
  AGENT_SESSION_MODE,
  AGENT_SESSION_STATUS,
  type AgentSessionEventType,
} from "../types/agentSession";
import { ticketUrl } from "./platformLinks";
import { SlackSessionThreadDAO } from "../persistence/chat/SlackSessionThreadDAO";
import { getThreadForSession, unlinkSession } from "./sessionThreadMap";

const POLL_INTERVAL_MS = 2000;

const TERMINAL_EVENT_TYPES = new Set<AgentSessionEventType>([
  AGENT_SESSION_EVENT_TYPE.SESSION_COMPLETED,
  AGENT_SESSION_EVENT_TYPE.SESSION_FAILED,
  AGENT_SESSION_EVENT_TYPE.SESSION_CANCELLED,
]);

export class ChatSessionBridgeService {
  private readonly queryService: AgentSessionQueryService;
  private readonly sessionDAO: AgentSessionDAO;
  private readonly slackThreadDAO: SlackSessionThreadDAO;
  private timers = new Map<string, ReturnType<typeof setInterval>>();

  constructor() {
    this.sessionDAO = new AgentSessionDAO();
    const turnDAO = new AgentTurnDAO();
    const eventDAO = new AgentSessionEventDAO();
    const pendingRequestDAO = new AgentPendingRequestDAO();
    this.queryService = new AgentSessionQueryService(
      this.sessionDAO,
      turnDAO,
      eventDAO,
      pendingRequestDAO,
    );
    this.slackThreadDAO = new SlackSessionThreadDAO();
  }

  startBridge(sessionId: string, thread: Thread): void {
    if (this.timers.has(sessionId)) return;

    let lastSequence = 0;

    const poll = async () => {
      try {
        const events = await this.queryService.listEvents(sessionId, {
          afterSequence: lastSequence,
        });
        if (events.length === 0) return;

        for (const event of events) {
          const seq = Number(event.sequence);
          if (seq > lastSequence) lastSequence = seq;

          const keepSubscribed = await this.postEvent(event, thread, sessionId);

          if (TERMINAL_EVENT_TYPES.has(event.eventType)) {
            this.stopBridge(sessionId);
            if (!keepSubscribed) {
              await unlinkSession(sessionId);
              await thread.unsubscribe();
            }
            return;
          }
        }
      } catch (err) {
        logger.error("ChatSessionBridge poll error", {
          sessionId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    };

    const timer = setInterval(poll, POLL_INTERVAL_MS);
    this.timers.set(sessionId, timer);
    poll();
  }

  /**
   * Resume bridges for all active sessions that have a Slack thread mapping.
   * Call this on server startup to survive restarts.
   */
  async resumeActiveBridges(): Promise<void> {
    try {
      const activeSessions = await this.sessionDAO.listByStatuses(
        AGENT_SESSION_ACTIVE_STATUSES,
      );

      let resumed = 0;
      for (const session of activeSessions) {
        const thread = await getThreadForSession(session.id);
        if (thread) {
          this.startBridge(session.id, thread);
          resumed++;
        }
      }

      if (resumed > 0) {
        logger.info(`Resumed ${resumed} Slack session bridges on startup`);
      }

      // Re-subscribe threads for completed non-execution sessions (continuation support)
      const allThreads = await this.slackThreadDAO.listAll();
      const activeIds = new Set(activeSessions.map((s) => s.id));
      let resubscribed = 0;
      for (const entry of allThreads) {
        if (activeIds.has(entry.sessionId)) continue;
        const session = await this.sessionDAO.getById(entry.sessionId);
        if (
          session?.status === AGENT_SESSION_STATUS.COMPLETED &&
          session.mode !== AGENT_SESSION_MODE.EXECUTION
        ) {
          const thread = await getThreadForSession(entry.sessionId);
          if (thread) {
            await thread.subscribe();
            resubscribed++;
          }
        }
      }
      if (resubscribed > 0) {
        logger.info(
          `Re-subscribed ${resubscribed} completed session threads on startup`,
        );
      }
    } catch (err) {
      logger.error("Failed to resume Slack session bridges", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  stopBridge(sessionId: string): void {
    const timer = this.timers.get(sessionId);
    if (timer) {
      clearInterval(timer);
      this.timers.delete(sessionId);
    }
  }

  private async postEvent(
    event: AgentSessionEvent,
    thread: Thread,
    sessionId: string,
  ): Promise<boolean> {
    let keepSubscribed = false;
    const payload = event.payloadJson as Record<string, unknown> | null;

    switch (event.eventType) {
      case AGENT_SESSION_EVENT_TYPE.ASSISTANT_MESSAGE: {
        const content = (payload?.content as string) ?? "";
        if (content) {
          await thread.post({ markdown: content });
        }
        break;
      }

      case AGENT_SESSION_EVENT_TYPE.TURN_STARTED:
        await thread.post({ markdown: "_Agent is working..._" });
        break;

      case AGENT_SESSION_EVENT_TYPE.NEEDS_INPUT: {
        const prompt = (payload?.prompt as string) ?? "Input needed";
        await thread.post({
          markdown: `**Agent needs input:** ${prompt}\n\n_Reply in this thread to respond._`,
        });
        break;
      }

      case AGENT_SESSION_EVENT_TYPE.NEEDS_APPROVAL: {
        const prompt = (payload?.prompt as string) ?? "Approval needed";
        await thread.post(
          Card({
            title: "Approval Required",
            children: [
              CardText(prompt),
              Actions([
                Button({
                  id: "session_approve",
                  label: "Approve",
                  style: "primary",
                  value: sessionId,
                }),
                Button({
                  id: "session_reject",
                  label: "Reject",
                  style: "danger",
                  value: sessionId,
                }),
              ]),
            ],
          }),
        );
        break;
      }

      case AGENT_SESSION_EVENT_TYPE.SESSION_COMPLETED: {
        const session = await this.sessionDAO.getById(sessionId);
        const parts: string[] = ["*Session completed.*"];
        if (session) {
          if (
            session.mode === AGENT_SESSION_MODE.EXECUTION &&
            session.draftPullRequestUrl
          ) {
            parts.push(`[View pull request](${session.draftPullRequestUrl})`);
          }
          const url = ticketUrl(session.projectId, session.ticketId);
          if (url) {
            parts.push(`[View ticket](${url})`);
          }
          if (session.mode !== AGENT_SESSION_MODE.EXECUTION) {
            parts.push("_Reply in this thread to revise the document._");
            keepSubscribed = true;
          }
        }
        await thread.post({ markdown: parts.join("\n") });
        break;
      }

      case AGENT_SESSION_EVENT_TYPE.SESSION_FAILED: {
        const reason = (payload?.reason as string) ?? "Unknown error";
        await thread.post({
          markdown: `*Session failed:* ${reason}`,
        });
        break;
      }

      case AGENT_SESSION_EVENT_TYPE.SESSION_CANCELLED:
        await thread.post({ markdown: "*Session cancelled.*" });
        break;

      default:
        break;
    }

    return keepSubscribed;
  }
}

// Singleton instance shared across handlers
export const chatSessionBridge = new ChatSessionBridgeService();
