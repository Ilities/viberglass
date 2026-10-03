import { DomainError } from "./DomainError";

export const AGENT_TOOL_ERROR_CODE = {
  NOT_FOUND: "AGENT_TOOL_NOT_FOUND",
  NAME_TAKEN: "AGENT_TOOL_NAME_TAKEN",
  INVALID: "AGENT_TOOL_INVALID",
  IN_USE: "AGENT_TOOL_IN_USE",
  STORAGE_UNAVAILABLE: "AGENT_TOOL_STORAGE_UNAVAILABLE",
} as const;

export type AgentToolErrorCode = (typeof AGENT_TOOL_ERROR_CODE)[keyof typeof AGENT_TOOL_ERROR_CODE];

const STATUS_BY_CODE: Record<AgentToolErrorCode, number> = {
  [AGENT_TOOL_ERROR_CODE.NOT_FOUND]: 404,
  [AGENT_TOOL_ERROR_CODE.NAME_TAKEN]: 409,
  [AGENT_TOOL_ERROR_CODE.INVALID]: 400,
  [AGENT_TOOL_ERROR_CODE.IN_USE]: 409,
  [AGENT_TOOL_ERROR_CODE.STORAGE_UNAVAILABLE]: 503,
};

/** A workspace MCP server or skill that can't be saved, found or removed. */
export class AgentToolServiceError extends DomainError {
  readonly statusCode: number;

  constructor(
    public readonly code: AgentToolErrorCode,
    message: string,
  ) {
    super(message);
    this.statusCode = STATUS_BY_CODE[code];
  }
}
