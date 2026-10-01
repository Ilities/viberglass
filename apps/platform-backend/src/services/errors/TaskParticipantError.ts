import { DomainError } from "./DomainError";

export const TASK_PARTICIPANT_ERROR_CODE = {
  PERSON_CANT_SEE_TASK: "PERSON_CANT_SEE_TASK",
  ROLE_NOT_CHANGEABLE: "ROLE_NOT_CHANGEABLE",
  NOT_A_PARTICIPANT: "NOT_A_PARTICIPANT",
  MESSAGE_INVALID: "MESSAGE_INVALID",
} as const;

export type TaskParticipantErrorCode = (typeof TASK_PARTICIPANT_ERROR_CODE)[keyof typeof TASK_PARTICIPANT_ERROR_CODE];

const STATUS_BY_CODE: Record<TaskParticipantErrorCode, number> = {
  PERSON_CANT_SEE_TASK: 400,
  ROLE_NOT_CHANGEABLE: 400,
  NOT_A_PARTICIPANT: 404,
  MESSAGE_INVALID: 400,
};

/** About the people on a task and what they write in its Discussion; the message is shown as is. */
export class TaskParticipantError extends DomainError {
  readonly statusCode: number;

  constructor(
    public readonly code: TaskParticipantErrorCode,
    message: string,
  ) {
    super(message);
    this.statusCode = STATUS_BY_CODE[code];
  }
}
