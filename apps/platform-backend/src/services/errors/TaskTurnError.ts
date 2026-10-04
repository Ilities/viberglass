import { DomainError } from "./DomainError";

export const TASK_TURN_ERROR_CODE = {
  TASK_NOT_FOUND: "TASK_NOT_FOUND",
  AGENT_NOT_FOUND: "AGENT_NOT_FOUND",
  NO_AGENT: "NO_AGENT",
  AGENT_NOT_READY: "AGENT_NOT_READY",
  NOTHING_ASKED: "NOTHING_ASKED",
} as const;

export type TaskTurnErrorCode = (typeof TASK_TURN_ERROR_CODE)[keyof typeof TASK_TURN_ERROR_CODE];

const STATUS_BY_CODE: Record<TaskTurnErrorCode, number> = {
  TASK_NOT_FOUND: 404,
  AGENT_NOT_FOUND: 400,
  NO_AGENT: 409,
  AGENT_NOT_READY: 409,
  NOTHING_ASKED: 400,
};

/** Asking the agent for a turn on a task; the message is shown as is. */
export class TaskTurnError extends DomainError {
  readonly statusCode: number;

  constructor(
    public readonly code: TaskTurnErrorCode,
    message: string,
  ) {
    super(message);
    this.statusCode = STATUS_BY_CODE[code];
  }
}
