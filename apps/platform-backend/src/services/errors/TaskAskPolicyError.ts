import { DomainError } from "./DomainError";

export const TASK_ASK_POLICY_ERROR_CODE = {
  NO_PERSON: "ASK_NO_PERSON",
  NOT_ALLOWED: "ASK_NOT_ALLOWED",
} as const;

export type TaskAskPolicyErrorCode = (typeof TASK_ASK_POLICY_ERROR_CODE)[keyof typeof TASK_ASK_POLICY_ERROR_CODE];

/** Someone asked the agent for something they may not ask for; the message says who can, and is shown as is. */
export class TaskAskPolicyError extends DomainError {
  readonly statusCode = 403;

  constructor(
    public readonly code: TaskAskPolicyErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export function isTaskAskPolicyError(error: unknown): error is TaskAskPolicyError {
  return error instanceof TaskAskPolicyError;
}
