import { AgentQuestionDAO } from "../../persistence/agentSession/AgentQuestionDAO";
import { AgentSessionDAO } from "../../persistence/agentSession/AgentSessionDAO";
import { AgentTurnDAO } from "../../persistence/agentSession/AgentTurnDAO";
import { agentSessionMutex } from "../agentSession/AgentSessionMutex";
import { AGENT_QUESTION_ERROR_CODE, AgentQuestionError } from "../errors/AgentQuestionError";
import { TaskActivityRecorder } from "../tasks/TaskActivityRecorder";
import { TaskDiscussionService } from "../tasks/TaskDiscussionService";
import { TaskAskPolicyService } from "../taskTurns/TaskAskPolicyService";
import type { AskResult, TaskTurnService } from "../taskTurns/TaskTurnService";

interface Dependencies {
  questions: Pick<AgentQuestionDAO, "getById" | "answer">;
  sessions: Pick<AgentSessionDAO, "getById" | "update">;
  turns: Pick<AgentTurnDAO, "getById">;
  asker: Pick<TaskTurnService, "ask">;
  policy: Pick<TaskAskPolicyService, "assertCanAsk">;
  discussion: Pick<TaskDiscussionService, "create">;
  activity: Pick<TaskActivityRecorder, "record">;
}

/**
 * Answers an agent's question: the answer is a message in the thread that
 * goes to the agent. A blocking question stopped a step, so its answer asks
 * for that step again; anything else is a reply the agent reads next turn.
 */
export class AgentQuestionAnswerService {
  private readonly deps: Dependencies;

  constructor(deps: Pick<Dependencies, "asker"> & Partial<Dependencies>) {
    this.deps = {
      questions: new AgentQuestionDAO(),
      sessions: new AgentSessionDAO(),
      turns: new AgentTurnDAO(),
      policy: new TaskAskPolicyService(),
      discussion: new TaskDiscussionService(),
      activity: new TaskActivityRecorder(),
      ...deps,
    };
  }

  async answer(taskId: string, questionId: string, userId: string, text: string): Promise<AskResult> {
    const answer = text.trim();
    if (!answer) throw new AgentQuestionError(AGENT_QUESTION_ERROR_CODE.NO_ANSWER, "Write an answer.");

    // Locked per question so two people answering at once start one turn between them.
    return agentSessionMutex.runExclusive(`question:${questionId}`, async () => {
      const question = await this.deps.questions.getById(questionId);
      if (!question || question.ticketId !== taskId) {
        throw new AgentQuestionError(AGENT_QUESTION_ERROR_CODE.QUESTION_NOT_FOUND, "Question not found");
      }
      if (question.status !== "open") {
        throw new AgentQuestionError(AGENT_QUESTION_ERROR_CODE.ALREADY_ANSWERED, "Someone has answered this question already.");
      }

      const askedIn = question.blocking && question.turnId ? await this.deps.turns.getById(question.turnId) : null;
      const action = askedIn?.action ?? "reply";
      await this.deps.policy.assertCanAsk(userId, taskId, action);
      // Linked to its question before the agent is asked, so the turn's prompt says what it answers.
      const messageId = await this.deps.discussion.create(taskId, userId, answer);
      await this.deps.questions.answer(question.id, { by: userId, text: answer, messageId });
      const asked = await this.deps.asker.ask(taskId, userId, {
        message: answer,
        action,
        agentId: question.agent.id,
        postedMessageId: messageId,
      });
      const session = await this.deps.sessions.getById(question.sessionId);
      if (session?.latestPendingRequestId === question.id) {
        await this.deps.sessions.update(session.id, { latestPendingRequestId: null });
      }
      await this.deps.activity.record(taskId, { type: "human", userId }, "question_answered", { questionId: question.id });
      return asked;
    });
  }
}
