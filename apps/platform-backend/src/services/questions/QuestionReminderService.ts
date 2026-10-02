import { AgentQuestionDAO, type AgentQuestionRecord } from "../../persistence/agentSession/AgentQuestionDAO";
import { TaskParticipantDAO } from "../../persistence/ticketing/TaskParticipantDAO";
import { TaskActivityRecorder } from "../tasks/TaskActivityRecorder";

interface Dependencies {
  questions: Pick<AgentQuestionDAO, "listDue" | "markReminded" | "markEscalated">;
  participants: Pick<TaskParticipantDAO, "listDrivers">;
  activity: Pick<TaskActivityRecorder, "record">;
}

const BATCH = 50;

/**
 * Nudges about questions nobody has answered. When one falls due, the person
 * asked is reminded; when it falls due again, the task's owner hears that
 * it's still waiting. The wait is the space's, fixed when the question was asked.
 */
export class QuestionReminderService {
  private readonly deps: Dependencies;

  constructor(deps: Partial<Dependencies> = {}) {
    this.deps = {
      questions: new AgentQuestionDAO(),
      participants: new TaskParticipantDAO(),
      activity: new TaskActivityRecorder(),
      ...deps,
    };
  }

  /** Returns how many questions it nudged someone about. */
  async remindDue(now: Date): Promise<number> {
    const due = await this.deps.questions.listDue(now, BATCH);
    for (const question of due) {
      if (question.remindedAt) await this.escalate(question);
      else await this.remind(question, now);
    }
    return due.length;
  }

  private async remind(question: AgentQuestionRecord, now: Date): Promise<void> {
    const wait = (question.dueAt?.getTime() ?? now.getTime()) - new Date(question.askedAt).getTime();
    await this.deps.questions.markReminded(question.id, new Date(now.getTime() + Math.max(wait, 0)));
    if (!question.askedOf) return;
    await this.deps.activity.record(question.ticketId, { type: "system" }, "question_reminded", {
      questionId: question.id,
      userId: question.askedOf.id,
      question: question.question,
      escalated: false,
    });
  }

  private async escalate(question: AgentQuestionRecord): Promise<void> {
    await this.deps.questions.markEscalated(question.id);
    const owner = (await this.deps.participants.listDrivers([question.ticketId])).get(question.ticketId);
    // When the person asked is the owner, they've been reminded already.
    if (!owner || owner.id === question.askedOf?.id) return;
    await this.deps.activity.record(question.ticketId, { type: "system" }, "question_reminded", {
      questionId: question.id,
      userId: owner.id,
      question: question.question,
      askedOfName: question.askedOf?.name ?? null,
      escalated: true,
    });
  }
}
