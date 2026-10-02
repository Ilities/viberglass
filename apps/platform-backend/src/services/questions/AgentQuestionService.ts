import { AgentQuestionDAO } from "../../persistence/agentSession/AgentQuestionDAO";
import { AgentSessionDAO } from "../../persistence/agentSession/AgentSessionDAO";
import { AgentTurnDAO } from "../../persistence/agentSession/AgentTurnDAO";
import { ProjectDAO } from "../../persistence/project/ProjectDAO";
import { TaskParticipantDAO } from "../../persistence/ticketing/TaskParticipantDAO";
import { TicketDAO } from "../../persistence/ticketing/TicketDAO";
import { UserDAO } from "../../persistence/user/UserDAO";
import { AGENT_QUESTION_ERROR_CODE, AgentQuestionError } from "../errors/AgentQuestionError";
import { TaskActivityRecorder } from "../tasks/TaskActivityRecorder";
import { resolveAddressee } from "./resolveAddressee";

export interface AskedQuestion {
  question: string;
  options: string[];
  /** A role or a name, as the agent wrote it. */
  addressee: string | null;
  blocking: boolean;
}

const HOUR_MS = 3_600_000;
const DEFAULT_REMINDER_HOURS = 4;

interface Dependencies {
  turns: Pick<AgentTurnDAO, "getByJobId">;
  sessions: Pick<AgentSessionDAO, "getById" | "update">;
  tickets: Pick<TicketDAO, "getTicket">;
  projects: Pick<ProjectDAO, "getProject">;
  participants: Pick<TaskParticipantDAO, "list">;
  users: Pick<UserDAO, "getContact">;
  questions: Pick<AgentQuestionDAO, "create">;
  activity: Pick<TaskActivityRecorder, "record">;
  now: () => Date;
}

/**
 * Takes a question an agent asked during its run and puts it to someone
 * on the task: whom it named, else the task's owner. It's in the thread,
 * makes it their move and notifies them; the turn carries on, and a blocking
 * question leaves the task waiting on them once it ends.
 */
export class AgentQuestionService {
  private readonly deps: Dependencies;

  constructor(deps: Partial<Dependencies> = {}) {
    this.deps = {
      turns: new AgentTurnDAO(),
      sessions: new AgentSessionDAO(),
      tickets: new TicketDAO(),
      projects: new ProjectDAO(),
      participants: new TaskParticipantDAO(),
      users: new UserDAO(),
      questions: new AgentQuestionDAO(),
      activity: new TaskActivityRecorder(),
      now: () => new Date(),
      ...deps,
    };
  }

  async ask(jobId: string, asked: AskedQuestion): Promise<{ id: string; askedOf: string | null }> {
    const turn = await this.deps.turns.getByJobId(jobId);
    const session = turn ? await this.deps.sessions.getById(turn.sessionId) : null;
    const ticket = session ? await this.deps.tickets.getTicket(session.ticketId) : null;
    if (!turn || !session || !ticket) {
      throw new AgentQuestionError(AGENT_QUESTION_ERROR_CODE.RUN_NOT_FOUND, "Only a task's runs can ask people questions.");
    }

    const [participants, creator, project] = await Promise.all([
      this.deps.participants.list(ticket.id),
      session.createdBy ? this.deps.users.getContact(session.createdBy) : Promise.resolve(null),
      this.deps.projects.getProject(ticket.projectId),
    ]);
    const addressee = resolveAddressee(
      asked.addressee,
      participants,
      session.createdBy && creator && !creator.deactivated ? { id: session.createdBy, name: creator.name } : null,
    );
    const hours = project?.questionReminderHours ?? DEFAULT_REMINDER_HOURS;

    const id = await this.deps.questions.create({
      sessionId: session.id,
      turnId: turn.id,
      jobId,
      question: asked.question,
      options: asked.options,
      blocking: asked.blocking,
      addresseeUserId: addressee?.userId ?? null,
      addresseeRole: addressee?.role ?? null,
      dueAt: addressee ? new Date(this.deps.now().getTime() + hours * HOUR_MS) : null,
    });
    await this.deps.sessions.update(session.id, { latestPendingRequestId: id });
    await this.deps.activity.record(ticket.id, { type: "agent" }, "question_asked", {
      questionId: id,
      userId: addressee?.userId ?? null,
      question: asked.question,
      blocking: asked.blocking,
    });
    return { id, askedOf: addressee?.name ?? null };
  }
}
