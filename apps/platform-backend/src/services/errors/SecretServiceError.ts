import { DomainError } from "./DomainError";

export const SECRET_SERVICE_ERROR_CODE = {
  SECRET_NOT_FOUND: "SECRET_NOT_FOUND",
  SECRET_NAME_REQUIRED: "SECRET_NAME_REQUIRED",
  SECRET_VALUE_REQUIRED: "SECRET_VALUE_REQUIRED",
  ENV_VARIABLE_NOT_SET: "ENV_VARIABLE_NOT_SET",
  SOURCE_ENV_VAR_INVALID: "SOURCE_ENV_VAR_INVALID",
} as const;

export type SecretServiceErrorCode =
  (typeof SECRET_SERVICE_ERROR_CODE)[keyof typeof SECRET_SERVICE_ERROR_CODE];

const DEFAULT_STATUS_BY_CODE: Record<SecretServiceErrorCode, number> = {
  [SECRET_SERVICE_ERROR_CODE.SECRET_NOT_FOUND]: 404,
  [SECRET_SERVICE_ERROR_CODE.SECRET_NAME_REQUIRED]: 400,
  [SECRET_SERVICE_ERROR_CODE.SECRET_VALUE_REQUIRED]: 400,
  [SECRET_SERVICE_ERROR_CODE.ENV_VARIABLE_NOT_SET]: 400,
  [SECRET_SERVICE_ERROR_CODE.SOURCE_ENV_VAR_INVALID]: 400,
};

export class SecretServiceError extends DomainError {
  readonly statusCode: number;

  constructor(
    public readonly code: SecretServiceErrorCode,
    message: string,
    statusCode?: number,
  ) {
    super(message);
    this.statusCode = statusCode ?? DEFAULT_STATUS_BY_CODE[code] ?? 500;
  }
}

export function isSecretServiceError(
  error: unknown,
): error is SecretServiceError {
  return error instanceof SecretServiceError;
}

