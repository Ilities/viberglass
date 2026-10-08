import { DomainError } from "./DomainError";

export const TASK_COPY_ERROR_CODE = {
  TASK_NOT_FOUND: "TASK_COPY_TASK_NOT_FOUND",
  SAME_SPACE: "TASK_COPY_SAME_SPACE",
} as const;

export type TaskCopyErrorCode = (typeof TASK_COPY_ERROR_CODE)[keyof typeof TASK_COPY_ERROR_CODE];

const STATUS_BY_CODE: Record<TaskCopyErrorCode, number> = {
  TASK_COPY_TASK_NOT_FOUND: 404,
  TASK_COPY_SAME_SPACE: 400,
};

export class TaskCopyError extends DomainError {
  readonly statusCode: number;

  constructor(
    readonly code: TaskCopyErrorCode,
    message: string,
  ) {
    super(message);
    this.statusCode = STATUS_BY_CODE[code];
  }
}
