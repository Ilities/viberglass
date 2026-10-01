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
  AGENT_SESSION_STATUS,
  type AgentSessionMode,
  type AgentSessionEventType,
} from "../types/agentSession";
import { SessionCompletionNotice } from "./SessionCompletionNotice";
import { AssistantMessageCoalescer } from "./AssistantMessageCoalescer";
import { isObjectRecord } from "../clanker-config/parsers";
import { getThreadForSession, unlinkSession } from "./sessionThreadMap";

const POLL_INTERVAL_MS = 2000;

const TERMINAL_EVENT_TYPES = new Set<AgentSessionEventType>([
  AGENT_SESSION_EVENT_TYPE.SESSION_COMPLETED,
  AGENT_SESSION_EVENT_TYPE.SESSION_FAILED,
  AGENT_SESSION_EVENT_TYPE.SESSION_CANCELLED,
]);

/**
 * A session stays open between turns (ADR 0008), so a chat thread's run ends
 * where a turn wrote a document or code, as it used to end with the session.
 */
function finishesRun(event: AgentSessionEvent): boolean {
  if (event.eventType !== AGENT_SESSION_EVENT_TYPE.TURN_COMPLETED) return false;
  const produced = isObjectRecord(event.payloadJson) ? event.payloadJson.produced : undefined;
  return Array.isArray(produced) && produced.length > 0;
}

function endsTurn(event: AgentSessionEvent): boolean {
  return event.eventType === AGENT_SESSION_EVENT_TYPE.TURN_COMPLETED || event.eventType === AGENT_SESSION_EVENT_TYPE.TURN_FAILED;
}

interface ChainEntry {
  thenMode: AgentSessionMode;
  /** The Slack user who started the chain; the next session is launched as them. */
  chainedBy?: string;
}

interface BridgeCallbacks {
  /**
   * Auto-approves a pending approval request. Called when the bridge receives
   * a NEEDS_APPROVAL event, since chat adapters cannot reliably surface approval UI.
   */
  approveSession: (sessionId: string) => Promise<void>;
  /**
   * Launches the next session in a chain and links it to the thread.
   * Returns the new session ID.
   */
  launchAndLink: (params: {
    ticketId: string;
    clankerId: string;
    mode: AgentSessionMode;
    thread: Thread;
    slackUserId?: string;
  }) => Promise<string>;
}

export class ChatSessionBridgeService {
  private readonly queryService: AgentSessionQueryService;
  private readonly sessionDAO: AgentSessionDAO;
  private readonly completionNotice: SessionCompletionNotice;
  private timers = new Map<string, ReturnType<typeof setInterval>>();
  private chainMap = new Map<string, ChainEntry>();
  private callbacks?: BridgeCallbacks;

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
    this.completionNotice = new SessionCompletionNotice(this.sessionDAO);
  }

  configure(callbacks: BridgeCallbacks): void {
    this.callbacks = callbacks;
  }

  startBridge(sessionId: string, thread: Thread, chainTo?: AgentSessionMode, chainedBy?: string): void {
    if (this.timers.has(sessionId)) return;

    if (chainTo) {
      this.chainMap.set(sessionId, { thenMode: chainTo, chainedBy });
    }

    // Earlier turns of a continuing session were bridged already, or happened outside the thread.
    let lastSequence: number | null = null;
    const assistantMessage = new AssistantMessageCoalescer();

    const poll = async () => {
      try {
        if (lastSequence === null) {
          const earlier = await this.queryService.listEvents(sessionId);
          lastSequence = Number(earlier.filter(endsTurn).at(-1)?.sequence ?? 0);
        }
        const events = await this.queryService.listEvents(sessionId, {
          afterSequence: lastSequence,
        });
        if (events.length === 0) return;

        for (const event of events) {
          const seq = Number(event.sequence);
          if (seq > lastSequence) lastSequence = seq;

          if (event.eventType === AGENT_SESSION_EVENT_TYPE.ASSISTANT_MESSAGE) {
            const payload = event.payloadJson;
            if (isObjectRecord(payload) && typeof payload.text === "string") {
              assistantMessage.append(payload.text);
            }
            continue;
          }

          const message = assistantMessage.flush();
          if (message) await thread.post({ markdown: message });

          const { keepLinked } = await this.postEvent(event, thread, sessionId);

          if (TERMINAL_EVENT_TYPES.has(event.eventType) || finishesRun(event)) {
            this.stopBridge(sessionId);

            const chain = this.chainMap.get(sessionId);
            if (
              chain &&
              (event.eventType === AGENT_SESSION_EVENT_TYPE.SESSION_COMPLETED || finishesRun(event)) &&
              this.callbacks
            ) {
              this.chainMap.delete(sessionId);
              if (!keepLinked) await unlinkSession(sessionId);
              await this.handleChain(sessionId, chain, thread);
            } else {
              await thread.unsubscribe();
              if (!keepLinked) await unlinkSession(sessionId);
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
   * Resume bridges for all active sessions that have a chat thread mapping.
   * Call this on server startup to survive restarts.
   */
  async resumeActiveBridges(): Promise<void> {
    try {
      // Only sessions with a turn running: the others are waiting on people, with nothing to relay.
      const activeSessions = await this.sessionDAO.listByStatuses([
        AGENT_SESSION_STATUS.ACTIVE,
      ]);

      let resumed = 0;
      for (const session of activeSessions) {
        const thread = await getThreadForSession(session.id);
        if (thread) {
          this.startBridge(session.id, thread);
          resumed++;
        }
      }

      if (resumed > 0) {
        logger.info(`Resumed ${resumed} chat session bridges on startup`);
      }
    } catch (err) {
      logger.error("Failed to resume chat session bridges", {
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

  private async handleChain(
    planningSessionId: string,
    chain: ChainEntry,
    thread: Thread,
  ): Promise<void> {
    try {
      const session = await this.sessionDAO.getById(planningSessionId);
      if (!session) throw new Error("Session not found");

      await thread.post({ markdown: `_Planning complete. Starting execution…_` });

      const newSessionId = await this.callbacks!.launchAndLink({
        ticketId: session.ticketId,
        clankerId: session.clankerId,
        mode: chain.thenMode,
        thread,
        slackUserId: chain.chainedBy,
      });

      this.startBridge(newSessionId, thread);
    } catch (err) {
      logger.error("ChatSessionBridge chain failed", {
        planningSessionId,
        error: err instanceof Error ? err.message : String(err),
      });
      await thread.post({
        markdown: `_Failed to start execution: ${err instanceof Error ? err.message : "Unknown error"}._`,
      });
      await thread.unsubscribe();
    }
  }

  private async postEvent(
    event: AgentSessionEvent,
    thread: Thread,
    sessionId: string,
  ): Promise<{ keepLinked: boolean }> {
    let keepLinked = false;
    const payload = event.payloadJson as Record<string, unknown> | null;

    switch (event.eventType) {
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
        if (this.callbacks) {
          // Auto-approve: chat adapters cannot reliably surface interactive approval UI.
          this.callbacks.approveSession(sessionId).catch((err: unknown) => {
            logger.error("ChatSessionBridge auto-approve failed", {
              sessionId,
              error: err instanceof Error ? err.message : String(err),
            });
          });
        } else {
          // Fallback for contexts where callbacks are not configured.
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
        }
        break;
      }

      case AGENT_SESSION_EVENT_TYPE.TURN_COMPLETED:
        if (!finishesRun(event)) break;
      // falls through: the run ended with what the turn wrote
      case AGENT_SESSION_EVENT_TYPE.SESSION_COMPLETED: {
        const completion = await this.completionNotice.post(
          sessionId,
          thread,
          this.chainMap.has(sessionId),
        );
        keepLinked = completion.keepLinked;
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

    return { keepLinked };
  }
}

// Singleton instance shared across handlers
export const chatSessionBridge = new ChatSessionBridgeService();
