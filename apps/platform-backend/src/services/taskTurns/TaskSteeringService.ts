import { AgentSessionDAO, type AgentSession } from "../../persistence/agentSession/AgentSessionDAO";
import { AgentSessionEventDAO } from "../../persistence/agentSession/AgentSessionEventDAO";
import { AgentTurnDAO } from "../../persistence/agentSession/AgentTurnDAO";
import { TaskTurnFactsDAO } from "../../persistence/agentSession/TaskTurnFactsDAO";
import { AGENT_SESSION_ACTIVE_STATUSES, AGENT_SESSION_STATUS } from "../../types/agentSession";
import { agentSessionMutex } from "../agentSession/AgentSessionMutex";
import { SessionTurnContinuationService } from "../agentSession/SessionTurnContinuationService";
import { TASK_ASK_POLICY_ERROR_CODE, TaskAskPolicyError } from "../errors/TaskAskPolicyError";
import { JobCancellationService } from "../job/JobCancellationService";
import { TaskActivityRecorder } from "../tasks/TaskActivityRecorder";
import { TaskAskPolicyService } from "./TaskAskPolicyService";
import { TaskTurnService, type AskInput, type AskResult } from "./TaskTurnService";

/** What a resumed agent is told when nobody wrote anything while it was paused. */
export const CARRY_ON = "Carry on where you left off.";

interface Dependencies {
  policy: Pick<TaskAskPolicyService, "describe">;
  turns: Pick<TaskTurnService, "ask">;
  sessions: Pick<AgentSessionDAO, "listByTicket" | "getById" | "update">;
  agentTurns: Pick<AgentTurnDAO, "getInFlightAssistantTurn" | "listBySession">;
  facts: Pick<TaskTurnFactsDAO, "running">;
  jobs: Pick<JobCancellationService, "cancel">;
  continuation: Pick<SessionTurnContinuationService, "launchForPendingMessages">;
  activity: Pick<TaskActivityRecorder, "record">;
}

/**
 * Steering the agent on a task, for its owner, the space's maintainers and
 * admins: interrupt a turn with a new message, which stops it and starts the
 * next one at once, or pause the agent and resume it later. Everyone else's
 * asks wait for the running turn.
 */
export class TaskSteeringService {
  private readonly deps: Dependencies;

  constructor(deps: Partial<Dependencies> = {}) {
    const sessions = new AgentSessionDAO();
    const agentTurns = new AgentTurnDAO();
    this.deps = {
      policy: new TaskAskPolicyService(),
      turns: new TaskTurnService(),
      sessions,
      agentTurns,
      facts: new TaskTurnFactsDAO(),
      jobs: new JobCancellationService(),
      continuation: new SessionTurnContinuationService(sessions, agentTurns, new AgentSessionEventDAO()),
      activity: new TaskActivityRecorder(),
      ...deps,
    };
  }

  /**
   * Posts the message, stops the turn that's running and starts one that
   * answers it straight away. The new turn does the stopped turn's step unless
   * the message asks for another: "cover X too" during the research is still research.
   */
  async interrupt(taskId: string, actorId: string, input: AskInput): Promise<AskResult> {
    await this.assertCanSteer(actorId, taskId);
    const running = (await this.deps.facts.running([taskId])).get(taskId);
    const asked = await this.deps.turns.ask(taskId, actorId, { ...input, action: input.action ?? running?.action });
    if (asked.job.status !== "queued" || !asked.job.id) return asked;
    // A turn that finished meanwhile has started the next one for the message already.
    if ((await this.deps.jobs.cancel(asked.job.id, actorId)) !== "cancelled") return asked;
    return agentSessionMutex.runExclusive(asked.session.id, async () => {
      const session = (await this.deps.sessions.getById(asked.session.id)) ?? asked.session;
      const launched = await this.deps.continuation.launchForPendingMessages(session);
      return launched ? { ...asked, ...launched } : asked;
    });
  }

  /** Stops the agent's running turn on the task, if any, and holds every ask until it's resumed. */
  async pause(taskId: string, actorId: string): Promise<void> {
    await this.assertCanSteer(actorId, taskId);
    const open = await this.openSessions(taskId);
    for (const session of open) {
      const running = await this.deps.agentTurns.getInFlightAssistantTurn(session.id);
      if (running?.jobId) await this.deps.jobs.cancel(running.jobId, actorId);
      await this.deps.sessions.update(session.id, { status: AGENT_SESSION_STATUS.PAUSED });
    }
    if (open.length > 0) await this.deps.activity.record(taskId, { type: "human", userId: actorId }, "agent_paused", {});
  }

  /**
   * Lets the agent go on with the step pausing stopped, if it stopped one, and
   * what people wrote meanwhile; `note` is said first, when there's something
   * to tell it. Returns whether the agent was paused.
   */
  async resume(taskId: string, actorId: string, note?: string): Promise<boolean> {
    await this.assertCanSteer(actorId, taskId);
    const paused = (await this.deps.sessions.listByTicket(taskId)).filter((session) => session.status === AGENT_SESSION_STATUS.PAUSED);
    if (paused.length === 0) return false;
    await this.deps.activity.record(taskId, { type: "human", userId: actorId }, "agent_resumed", {});
    for (const session of paused) {
      const stopped = await this.stoppedTurnAction(session);
      await this.deps.sessions.update(session.id, { status: AGENT_SESSION_STATUS.WAITING_ON_USER });
      // Asking for the stopped step takes in what people wrote meanwhile, in the same turn.
      if (stopped || note) {
        await this.deps.turns.ask(taskId, actorId, { message: note ?? CARRY_ON, action: stopped ?? "reply", agentId: session.clankerId });
        continue;
      }
      await agentSessionMutex.runExclusive(session.id, () =>
        this.deps.continuation.launchForPendingMessages({ ...session, status: AGENT_SESSION_STATUS.WAITING_ON_USER }),
      );
    }
    return true;
  }

  private async openSessions(taskId: string): Promise<AgentSession[]> {
    return (await this.deps.sessions.listByTicket(taskId)).filter((session) => AGENT_SESSION_ACTIVE_STATUSES.includes(session.status));
  }

  /** What the agent was doing when it was paused: its last turn, if pausing stopped it or a setup failure did. */
  private async stoppedTurnAction(session: AgentSession) {
    const last = (await this.deps.agentTurns.listBySession(session.id)).filter((turn) => turn.role === "assistant").at(-1);
    return last?.status === "cancelled" || last?.status === "failed" ? last.action : null;
  }

  private async assertCanSteer(actorId: string, taskId: string): Promise<void> {
    if ((await this.deps.policy.describe(actorId, taskId)).canSteer) return;
    throw new TaskAskPolicyError(
      TASK_ASK_POLICY_ERROR_CODE.NOT_ALLOWED,
      "Only the task's owner, this space's maintainers or a workspace admin can interrupt or pause the agent. Ask the agent in the thread; it reads your message after its turn.",
    );
  }
}
