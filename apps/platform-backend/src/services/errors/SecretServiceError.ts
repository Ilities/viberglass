export const SECRET_SERVICE_ERROR_CODE = {
  SECRET_NOT_FOUND: "SECRET_NOT_FOUND",
  SECRET_NAME_REQUIRED: "SECRET_NAME_REQUIRED",
  SECRET_NAME_ALREADY_EXISTS: "SECRET_NAME_ALREADY_EXISTS",
  SECRET_VALUE_REQUIRED: "SECRET_VALUE_REQUIRED",
  AUTH_CACHE_PAYLOAD_REQUIRED: "AUTH_CACHE_PAYLOAD_REQUIRED",
  AUTH_CACHE_TOO_LARGE: "AUTH_CACHE_TOO_LARGE",
} as const;

export type SecretServiceErrorCode =
  (typeof SECRET_SERVICE_ERROR_CODE)[keyof typeof SECRET_SERVICE_ERROR_CODE];

const DEFAULT_STATUS_BY_CODE: Record<SecretServiceErrorCode, number> = {
  [SECRET_SERVICE_ERROR_CODE.SECRET_NOT_FOUND]: 404,
  [SECRET_SERVICE_ERROR_CODE.SECRET_NAME_REQUIRED]: 400,
  [SECRET_SERVICE_ERROR_CODE.SECRET_NAME_ALREADY_EXISTS]: 400,
  [SECRET_SERVICE_ERROR_CODE.SECRET_VALUE_REQUIRED]: 400,
  [SECRET_SERVICE_ERROR_CODE.AUTH_CACHE_PAYLOAD_REQUIRED]: 400,
  [SECRET_SERVICE_ERROR_CODE.AUTH_CACHE_TOO_LARGE]: 413,
};

export class SecretServiceError extends Error {
  readonly statusCode: number;

  constructor(
    public readonly code: SecretServiceErrorCode,
    message: string,
    statusCode?: number,
  ) {
    super(message);
    this.name = "SecretServiceError";
    this.statusCode = statusCode ?? DEFAULT_STATUS_BY_CODE[code] ?? 500;
  }
}

export function isSecretServiceError(
  error: unknown,
): error is SecretServiceError {
  return error instanceof SecretServiceError;
}

