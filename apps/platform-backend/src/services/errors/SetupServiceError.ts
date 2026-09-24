import { DomainError } from "./DomainError";

export const SETUP_SERVICE_ERROR_CODE = {
  KEY_FORMAT_INVALID: "KEY_FORMAT_INVALID",
  KEY_REJECTED: "KEY_REJECTED",
  KEY_FORBIDDEN: "KEY_FORBIDDEN",
  KEY_NO_CREDIT: "KEY_NO_CREDIT",
  KEY_RATE_LIMITED: "KEY_RATE_LIMITED",
  PROVIDER_ERROR: "PROVIDER_ERROR",
  PROVIDER_UNREACHABLE: "PROVIDER_UNREACHABLE",
  NO_HARNESS_FOR_PROVIDER: "NO_HARNESS_FOR_PROVIDER",
  SECRET_MANAGED_ELSEWHERE: "SECRET_MANAGED_ELSEWHERE",
} as const;

export type SetupServiceErrorCode =
  (typeof SETUP_SERVICE_ERROR_CODE)[keyof typeof SETUP_SERVICE_ERROR_CODE];

const DEFAULT_STATUS_BY_CODE: Record<SetupServiceErrorCode, number> = {
  [SETUP_SERVICE_ERROR_CODE.KEY_FORMAT_INVALID]: 400,
  [SETUP_SERVICE_ERROR_CODE.KEY_REJECTED]: 422,
  [SETUP_SERVICE_ERROR_CODE.KEY_FORBIDDEN]: 422,
  [SETUP_SERVICE_ERROR_CODE.KEY_NO_CREDIT]: 422,
  [SETUP_SERVICE_ERROR_CODE.KEY_RATE_LIMITED]: 422,
  [SETUP_SERVICE_ERROR_CODE.PROVIDER_ERROR]: 502,
  [SETUP_SERVICE_ERROR_CODE.PROVIDER_UNREACHABLE]: 502,
  [SETUP_SERVICE_ERROR_CODE.NO_HARNESS_FOR_PROVIDER]: 500,
  [SETUP_SERVICE_ERROR_CODE.SECRET_MANAGED_ELSEWHERE]: 409,
};

/** Setup failures; the message is shown to the person setting up, as is. */
export class SetupServiceError extends DomainError {
  readonly statusCode: number;

  constructor(
    public readonly code: SetupServiceErrorCode,
    message: string,
    statusCode?: number,
  ) {
    super(message);
    this.statusCode = statusCode ?? DEFAULT_STATUS_BY_CODE[code] ?? 500;
  }
}
