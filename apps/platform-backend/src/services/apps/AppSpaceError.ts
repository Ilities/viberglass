import { DomainError } from "../errors/DomainError";

export type AppSpaceErrorCode = "APP_SPACES_UNAVAILABLE" | "APP_HOME_BROKEN" | "OWNER_UNAVAILABLE" | "SPACE_NAME_INVALID" | "SPACE_EXISTS" | "NOT_AN_APP_SPACE";

const STATUS: Record<AppSpaceErrorCode, number> = {
  APP_SPACES_UNAVAILABLE: 409,
  APP_HOME_BROKEN: 409,
  OWNER_UNAVAILABLE: 422,
  SPACE_NAME_INVALID: 400,
  SPACE_EXISTS: 409,
  NOT_AN_APP_SPACE: 404,
};

/** Why an App space or the App home couldn't be set up; the message is shown as is. */
export class AppSpaceError extends DomainError {
  readonly statusCode: number;

  constructor(
    readonly code: AppSpaceErrorCode,
    message: string,
  ) {
    super(message);
    this.statusCode = STATUS[code];
  }
}
