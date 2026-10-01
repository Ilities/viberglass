import { parseMentionedUserIds, type TaskMessage } from "@viberglass/types";
import { TaskMessageDAO } from "../../persistence/ticketing/TaskMessageDAO";
import { TaskParticipantDAO } from "../../persistence/ticketing/TaskParticipantDAO";
import { TASK_PARTICIPANT_ERROR_CODE, TaskParticipantError } from "../errors/TaskParticipantError";
import { TaskActivityRecorder } from "./TaskActivityRecorder";
import { TaskParticipantService } from "./TaskParticipantService";

const MAX_BODY = 20_000;

interface Dependencies {
  messages: Pick<TaskMessageDAO, "list" | "create">;
  participants: Pick<TaskParticipantDAO, "add">;
  visibility: Pick<TaskParticipantService, "assertCanSeeTask">;
  activity: Pick<TaskActivityRecorder, "record">;
}

/** The task's Discussion: messages, and the people they @mention (who start watching the task). */
export class TaskDiscussionService {
  private readonly deps: Dependencies;

  constructor(deps: Partial<Dependencies> = {}) {
    this.deps = {
      messages: new TaskMessageDAO(),
      participants: new TaskParticipantDAO(),
      visibility: new TaskParticipantService(),
      activity: new TaskActivityRecorder(),
      ...deps,
    };
  }

  list(ticketId: string): Promise<TaskMessage[]> {
    return this.deps.messages.list(ticketId);
  }

  async post(ticketId: string, authorId: string, body: string): Promise<TaskMessage[]> {
    await this.create(ticketId, authorId, body);
    return this.list(ticketId);
  }

  /** Posts the message and returns its id. */
  async create(ticketId: string, authorId: string, body: string): Promise<string> {
    const text = body.trim();
    if (!text || text.length > MAX_BODY) {
      throw new TaskParticipantError(TASK_PARTICIPANT_ERROR_CODE.MESSAGE_INVALID, "Write a message of up to 20,000 characters.");
    }
    const mentioned = parseMentionedUserIds(text).filter((userId) => userId !== authorId);
    for (const userId of mentioned) {
      await this.deps.visibility.assertCanSeeTask(ticketId, userId);
    }

    const messageId = await this.deps.messages.create({ ticketId, authorId, body: text, mentionedUserIds: mentioned });
    for (const userId of mentioned) {
      await this.deps.participants.add(ticketId, userId, "watcher", authorId);
    }
    await this.deps.activity.record(ticketId, { type: "human", userId: authorId }, "message_posted", { messageId, mentioned });
    return messageId;
  }
}
