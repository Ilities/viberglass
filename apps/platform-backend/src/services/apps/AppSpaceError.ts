import { DomainError } from "../errors/DomainError";

export type AppSpaceErrorCode = "APP_SPACES_UNAVAILABLE" | "APP_HOME_BROKEN" | "OWNER_UNAVAILABLE" | "SPACE_NAME_INVALID" | "SPACE_EXISTS" | "NOT_AN_APP_SPACE" | "APP_NOT_FOUND" | "PERSON_DEACTIVATED" | "ACCESS_NOT_FOUND" | "ARCHIVED" | "APP_BUSY" | "SETTING_INVALID" | "SETTING_NOT_FOUND" | "NO_DATA" | "GRANT_NOT_FOUND" | "NOT_ALLOWED" | "REPOSITORY_EXISTS" | "NOT_A_GIT_SPACE" | "REPOSITORY_UNAVAILABLE" | "CANT_MERGE" | "NO_LAST_COPY" | "DATA_FILE_INVALID";

const STATUS: Record<AppSpaceErrorCode, number> = {
  APP_SPACES_UNAVAILABLE: 409,
  APP_HOME_BROKEN: 409,
  OWNER_UNAVAILABLE: 422,
  SPACE_NAME_INVALID: 400,
  SPACE_EXISTS: 409,
  NOT_AN_APP_SPACE: 404,
  APP_NOT_FOUND: 404,
  PERSON_DEACTIVATED: 409,
  ACCESS_NOT_FOUND: 404,
  ARCHIVED: 409,
  APP_BUSY: 409,
  SETTING_INVALID: 400,
  SETTING_NOT_FOUND: 404,
  NO_DATA: 409,
  GRANT_NOT_FOUND: 404,
  NOT_ALLOWED: 403,
  REPOSITORY_EXISTS: 409,
  NOT_A_GIT_SPACE: 409,
  REPOSITORY_UNAVAILABLE: 409,
  CANT_MERGE: 409,
  NO_LAST_COPY: 409,
  DATA_FILE_INVALID: 400,
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
