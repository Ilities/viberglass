export const JOB_SERVICE_ERROR_CODE = {
  JOB_NOT_FOUND: "JOB_NOT_FOUND",
} as const;

export type JobServiceErrorCode =
  (typeof JOB_SERVICE_ERROR_CODE)[keyof typeof JOB_SERVICE_ERROR_CODE];

const DEFAULT_STATUS_BY_CODE: Record<JobServiceErrorCode, number> = {
  [JOB_SERVICE_ERROR_CODE.JOB_NOT_FOUND]: 404,
};

export class JobServiceError extends Error {
  readonly statusCode: number;

  constructor(
    public readonly code: JobServiceErrorCode,
    message: string,
    statusCode?: number,
  ) {
    super(message);
    this.name = "JobServiceError";
    this.statusCode = statusCode ?? DEFAULT_STATUS_BY_CODE[code] ?? 500;
  }
}

export function isJobServiceError(error: unknown): error is JobServiceError {
  return error instanceof JobServiceError;
}

