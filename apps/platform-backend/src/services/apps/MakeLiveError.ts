import { DomainError } from "../errors/DomainError";

export type MakeLiveErrorCode = "NOT_ALLOWED" | "NOT_AN_APP_SPACE" | "NO_SUCH_CHANGE" | "HEAD_MOVED" | "NOT_MERGEABLE" | "REPOSITORY_UNAVAILABLE";

const STATUS: Record<MakeLiveErrorCode, number> = {
  NOT_ALLOWED: 403,
  NOT_AN_APP_SPACE: 404,
  NO_SUCH_CHANGE: 404,
  HEAD_MOVED: 409,
  NOT_MERGEABLE: 409,
  REPOSITORY_UNAVAILABLE: 409,
};

/** Why a change wasn't made live; the message is shown as is. */
export class MakeLiveError extends DomainError {
  readonly statusCode: number;

  constructor(
    readonly code: MakeLiveErrorCode,
    message: string,
  ) {
    super(message);
    this.statusCode = STATUS[code];
  }
}
