import { DomainError } from "../errors/DomainError";

export type AppRollbackErrorCode = "NO_SUCH_RELEASE" | "CANNOT_ROLL_BACK" | "NO_DATA_POINT";

const STATUS: Record<AppRollbackErrorCode, number> = {
  NO_SUCH_RELEASE: 404,
  CANNOT_ROLL_BACK: 409,
  NO_DATA_POINT: 409,
};

/** Why an app can't be rolled back to a release; the message is shown as is. */
export class AppRollbackError extends DomainError {
  readonly statusCode: number;

  constructor(
    readonly code: AppRollbackErrorCode,
    message: string,
  ) {
    super(message);
    this.statusCode = STATUS[code];
  }
}
