import { DomainError } from "./DomainError";

export const CLANKER_SERVICE_ERROR_CODE = {
  CLANKER_NOT_FOUND: "CLANKER_NOT_FOUND",
  CONFIG_FILE_NOT_FOUND: "CONFIG_FILE_NOT_FOUND",
  ALREADY_ACTIVE: "ALREADY_ACTIVE",
  ALREADY_DEPLOYING: "ALREADY_DEPLOYING",
  ALREADY_INACTIVE: "ALREADY_INACTIVE",
  PROVISIONING_CONFIG_ERROR: "PROVISIONING_CONFIG_ERROR",
  INVALID_SECRET_IDS: "INVALID_SECRET_IDS",
} as const;

export type ClankerServiceErrorCode =
  (typeof CLANKER_SERVICE_ERROR_CODE)[keyof typeof CLANKER_SERVICE_ERROR_CODE];

const DEFAULT_STATUS_BY_CODE: Record<ClankerServiceErrorCode, number> = {
  [CLANKER_SERVICE_ERROR_CODE.CLANKER_NOT_FOUND]: 404,
  [CLANKER_SERVICE_ERROR_CODE.CONFIG_FILE_NOT_FOUND]: 404,
  [CLANKER_SERVICE_ERROR_CODE.ALREADY_ACTIVE]: 400,
  [CLANKER_SERVICE_ERROR_CODE.ALREADY_DEPLOYING]: 409,
  [CLANKER_SERVICE_ERROR_CODE.ALREADY_INACTIVE]: 400,
  [CLANKER_SERVICE_ERROR_CODE.PROVISIONING_CONFIG_ERROR]: 400,
  [CLANKER_SERVICE_ERROR_CODE.INVALID_SECRET_IDS]: 400,
};

export class ClankerServiceError extends DomainError {
  readonly statusCode: number;

  constructor(
    public readonly code: ClankerServiceErrorCode,
    message: string,
    statusCode?: number,
  ) {
    super(message);
    this.statusCode = statusCode ?? DEFAULT_STATUS_BY_CODE[code] ?? 500;
  }
}

export function isClankerServiceError(
  error: unknown,
): error is ClankerServiceError {
  return error instanceof ClankerServiceError;
}
