import { DomainError } from "./DomainError";

export const TASK_COMPARISON_ERROR_CODE = {
  TASK_NOT_FOUND: "TASK_COMPARISON_TASK_NOT_FOUND",
  COMPARISON_NOT_FOUND: "TASK_COMPARISON_NOT_FOUND",
  TURN_NOT_FOUND: "TASK_COMPARISON_TURN_NOT_FOUND",
  RUNNER_COUNT: "TASK_COMPARISON_RUNNER_COUNT",
  FILES_SPACE: "TASK_COMPARISON_FILES_SPACE",
  NOT_AN_ARM: "TASK_COMPARISON_NOT_AN_ARM",
} as const;

export type TaskComparisonErrorCode = (typeof TASK_COMPARISON_ERROR_CODE)[keyof typeof TASK_COMPARISON_ERROR_CODE];

const STATUS_BY_CODE: Record<TaskComparisonErrorCode, number> = {
  TASK_COMPARISON_TASK_NOT_FOUND: 404,
  TASK_COMPARISON_NOT_FOUND: 404,
  TASK_COMPARISON_TURN_NOT_FOUND: 400,
  TASK_COMPARISON_RUNNER_COUNT: 400,
  TASK_COMPARISON_FILES_SPACE: 400,
  TASK_COMPARISON_NOT_AN_ARM: 400,
};

export class TaskComparisonError extends DomainError {
  readonly statusCode: number;

  constructor(
    readonly code: TaskComparisonErrorCode,
    message: string,
  ) {
    super(message);
    this.statusCode = STATUS_BY_CODE[code];
  }
}
