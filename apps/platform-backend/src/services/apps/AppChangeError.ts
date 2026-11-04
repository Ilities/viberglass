import { DomainError } from "../errors/DomainError";

export type AppChangeErrorCode =
  | "NOT_ALLOWED"
  | "NOT_AN_APP_SPACE"
  | "NO_SUCH_CHANGE"
  | "NOT_TRIED"
  | "HEAD_MOVED"
  | "NOT_MERGEABLE"
  | "REPOSITORY_UNAVAILABLE";

const STATUS: Record<AppChangeErrorCode, number> = {
  NOT_ALLOWED: 403,
  NOT_AN_APP_SPACE: 404,
  NO_SUCH_CHANGE: 404,
  NOT_TRIED: 409,
  HEAD_MOVED: 409,
  NOT_MERGEABLE: 409,
  REPOSITORY_UNAVAILABLE: 409,
};

/** Why an App space's change wasn't tried or made live; the message is shown as is. */
export class AppChangeError extends DomainError {
  readonly statusCode: number;

  constructor(
    readonly code: AppChangeErrorCode,
    message: string,
  ) {
    super(message);
    this.statusCode = STATUS[code];
  }
}
