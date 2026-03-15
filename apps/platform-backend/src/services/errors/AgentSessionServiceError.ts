import { DomainError } from "./DomainError";

export const AGENT_SESSION_SERVICE_ERROR_CODE = {
  SESSION_ALREADY_ACTIVE: "SESSION_ALREADY_ACTIVE",
  SESSION_NOT_FOUND: "SESSION_NOT_FOUND",
  SESSION_NOT_IN_EXPECTED_STATE: "SESSION_NOT_IN_EXPECTED_STATE",
  TICKET_NOT_FOUND: "TICKET_NOT_FOUND",
} as const;

export type AgentSessionServiceErrorCode =
  (typeof AGENT_SESSION_SERVICE_ERROR_CODE)[keyof typeof AGENT_SESSION_SERVICE_ERROR_CODE];

const DEFAULT_STATUS_BY_CODE: Record<AgentSessionServiceErrorCode, number> = {
  [AGENT_SESSION_SERVICE_ERROR_CODE.SESSION_ALREADY_ACTIVE]: 409,
  [AGENT_SESSION_SERVICE_ERROR_CODE.SESSION_NOT_FOUND]: 404,
  [AGENT_SESSION_SERVICE_ERROR_CODE.SESSION_NOT_IN_EXPECTED_STATE]: 409,
  [AGENT_SESSION_SERVICE_ERROR_CODE.TICKET_NOT_FOUND]: 404,
};

export class AgentSessionServiceError extends DomainError {
  readonly statusCode: number;

  constructor(
    public readonly code: AgentSessionServiceErrorCode,
    message: string,
    statusCode?: number,
  ) {
    super(message);
    this.statusCode = statusCode ?? DEFAULT_STATUS_BY_CODE[code] ?? 500;
  }
}

export function isAgentSessionServiceError(
  error: unknown,
): error is AgentSessionServiceError {
  return error instanceof AgentSessionServiceError;
}
