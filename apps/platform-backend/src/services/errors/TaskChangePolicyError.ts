import { DomainError } from "./DomainError";

export const TASK_CHANGE_POLICY_ERROR_CODE = {
  NOT_ALLOWED: "TASK_CHANGE_NOT_ALLOWED",
} as const;

export type TaskChangePolicyErrorCode = (typeof TASK_CHANGE_POLICY_ERROR_CODE)[keyof typeof TASK_CHANGE_POLICY_ERROR_CODE];

/** Someone tried to change or delete a task they may not; the message says who can, and is shown as is. */
export class TaskChangePolicyError extends DomainError {
  readonly statusCode = 403;

  constructor(
    public readonly code: TaskChangePolicyErrorCode,
    message: string,
  ) {
    super(message);
  }
}
