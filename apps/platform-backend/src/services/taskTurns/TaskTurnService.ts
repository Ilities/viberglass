import { TICKET_WORKFLOW_PHASE, type TaskTurnAction, type Ticket } from "@viberglass/types";
import { AgentSessionDAO, type AgentSession } from "../../persistence/agentSession/AgentSessionDAO";
import { AgentSessionEventDAO } from "../../persistence/agentSession/AgentSessionEventDAO";
import { AgentTurnDAO, type AgentTurn } from "../../persistence/agentSession/AgentTurnDAO";
import { TicketDAO } from "../../persistence/ticketing/TicketDAO";
import { AGENT_SESSION_EVENT_TYPE, AGENT_TURN_ROLE, AGENT_TURN_STATUS } from "../../types/agentSession";
import { agentSessionMutex } from "../agentSession/AgentSessionMutex";
import { SessionTurnContinuationService } from "../agentSession/SessionTurnContinuationService";
import { assertPlanCleared } from "../approvals/assertPlanCleared";
import { TASK_TURN_ERROR_CODE, TaskTurnError } from "../errors/TaskTurnError";
import { TaskDiscussionService } from "../tasks/TaskDiscussionService";
import { TicketPhaseDocumentService } from "../TicketPhaseDocumentService";
import { TaskTurnAgentResolver } from "./TaskTurnAgentResolver";
import { ACTION_MESSAGE, sessionModeFor } from "./turnActions";

export interface AskInput {
  /** What the person wrote; a suggested action may leave it empty. */
  message: string;
  action?: TaskTurnAction;
  agentId?: string;
}

export interface AskResult {
  session: AgentSession;
  /** The turn answering the message: a new one, or the one already running, which the message waits for. */
  currentTurn: AgentTurn;
  job: { id: string | null; status: string };
  /** The thread message it posted; null when nobody asked (a system start). */
  messageId: string | null;
}

type AskedTicket = Pick<Ticket, "id" | "projectId" | "title" | "workflowPhase" | "workflowOverriddenAt">;

interface Dependencies {
  tickets: { getTicket(id: string): Promise<AskedTicket | null> };
  documents: { getOrCreateDocument(ticketId: string, phase: "planning"): Promise<{ approvalState: string }> };
  discussion: Pick<TaskDiscussionService, "create">;
  agents: Pick<TaskTurnAgentResolver, "resolve">;
  sessions: Pick<AgentSessionDAO, "getOpenByTicketAndClanker" | "create" | "getById">;
  turns: Pick<AgentTurnDAO, "nextSequence" | "create" | "getInFlightAssistantTurn">;
  events: Pick<AgentSessionEventDAO, "getMaxSequence" | "create">;
  continuation: Pick<SessionTurnContinuationService, "launchForPendingMessages">;
}

/**
 * The one way an agent is asked to work on a task (ADR 0008): the person's
 * message goes into the thread, and the task's session with that agent takes
 * it as its next turn, or queues it behind the turn that's running.
 */
export class TaskTurnService {
  private readonly deps: Dependencies;

  constructor(deps: Partial<Dependencies> = {}) {
    const sessions = new AgentSessionDAO();
    const turns = new AgentTurnDAO();
    const events = new AgentSessionEventDAO();
    this.deps = {
      tickets: new TicketDAO(),
      documents: new TicketPhaseDocumentService(),
      discussion: new TaskDiscussionService(),
      agents: new TaskTurnAgentResolver(),
      sessions,
      turns,
      events,
      continuation: deps.continuation ?? new SessionTurnContinuationService(sessions, turns, events),
      ...deps,
    };
  }

  async ask(taskId: string, actorId: string | null, input: AskInput): Promise<AskResult> {
    const ticket = await this.deps.tickets.getTicket(taskId);
    if (!ticket) throw new TaskTurnError(TASK_TURN_ERROR_CODE.TASK_NOT_FOUND, "Task not found");
    const action = input.action ?? "reply";
    const text = input.message.trim() || ACTION_MESSAGE[action];
    if (!text) throw new TaskTurnError(TASK_TURN_ERROR_CODE.NOTHING_ASKED, "Write what you'd like the agent to do.");

    if (action === "code") {
      assertPlanCleared(await this.deps.documents.getOrCreateDocument(ticket.id, TICKET_WORKFLOW_PHASE.PLANNING), ticket);
    }
    const clankerId = await this.deps.agents.resolve(ticket.id, { agentId: input.agentId, message: text });
    const messageId = actorId ? await this.deps.discussion.create(ticket.id, actorId, text) : null;

    // Locked per task and agent so two asks can't each open a session.
    return agentSessionMutex.runExclusive(`task:${ticket.id}:${clankerId}`, async () => {
      const open =
        (await this.deps.sessions.getOpenByTicketAndClanker(ticket.id, clankerId)) ??
        (await this.openSession(ticket, clankerId, action, actorId));
      return agentSessionMutex.runExclusive(open.id, async () => {
        // Read again under the session's lock: the worker may have stored its harness session since.
        const session = (await this.deps.sessions.getById(open.id)) ?? open;
        const turn = await this.queueMessage(session, { text, action, actorId, messageId });
        const running = await this.deps.turns.getInFlightAssistantTurn(session.id);
        if (running) {
          return { session, currentTurn: running, job: { id: running.jobId, status: "queued" }, messageId };
        }
        const launched = await this.deps.continuation.launchForPendingMessages(session);
        if (!launched) throw new Error(`Turn ${turn.id} was queued but not launched`);
        return { session, ...launched, messageId };
      });
    });
  }

  private async openSession(
    ticket: AskedTicket,
    clankerId: string,
    action: TaskTurnAction,
    actorId: string | null,
  ): Promise<AgentSession> {
    const session = await this.deps.sessions.create({
      tenantId: "api-server",
      projectId: ticket.projectId,
      ticketId: ticket.id,
      clankerId,
      mode: sessionModeFor(action, ticket.workflowPhase),
      createdBy: actorId,
      title: ticket.title,
    });
    await this.deps.events.create({
      sessionId: session.id,
      sequence: 1,
      eventType: AGENT_SESSION_EVENT_TYPE.SESSION_STARTED,
      payloadJson: {},
    });
    return session;
  }

  /** The person's message as the session's next user turn, waiting for the agent. */
  private async queueMessage(
    session: AgentSession,
    message: { text: string; action: TaskTurnAction; actorId: string | null; messageId: string | null },
  ): Promise<AgentTurn> {
    const [sequence, maxEvent] = await Promise.all([
      this.deps.turns.nextSequence(session.id),
      this.deps.events.getMaxSequence(session.id),
    ]);
    const turn = await this.deps.turns.create({
      sessionId: session.id,
      role: AGENT_TURN_ROLE.USER,
      sequence,
      status: AGENT_TURN_STATUS.COMPLETED,
      contentMarkdown: message.text,
      userId: message.actorId,
      action: message.action,
      taskMessageId: message.messageId,
    });
    await this.deps.events.create({
      sessionId: session.id,
      turnId: turn.id,
      sequence: maxEvent + 1,
      eventType: AGENT_SESSION_EVENT_TYPE.USER_MESSAGE,
      payloadJson: { content: message.text },
      userId: message.actorId,
    });
    return turn;
  }
}
