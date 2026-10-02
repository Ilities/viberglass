import { DomainError } from "./DomainError";

export const AGENT_QUESTION_ERROR_CODE = {
  RUN_NOT_FOUND: "RUN_NOT_FOUND",
  QUESTION_NOT_FOUND: "QUESTION_NOT_FOUND",
  ALREADY_ANSWERED: "ALREADY_ANSWERED",
  NO_ANSWER: "NO_ANSWER",
} as const;

export type AgentQuestionErrorCode = (typeof AGENT_QUESTION_ERROR_CODE)[keyof typeof AGENT_QUESTION_ERROR_CODE];

const STATUS_BY_CODE: Record<AgentQuestionErrorCode, number> = {
  RUN_NOT_FOUND: 404,
  QUESTION_NOT_FOUND: 404,
  ALREADY_ANSWERED: 409,
  NO_ANSWER: 400,
};

/** Asking people a question for an agent, or answering one; the message is shown as is. */
export class AgentQuestionError extends DomainError {
  readonly statusCode: number;

  constructor(
    public readonly code: AgentQuestionErrorCode,
    message: string,
  ) {
    super(message);
    this.statusCode = STATUS_BY_CODE[code];
  }
}
