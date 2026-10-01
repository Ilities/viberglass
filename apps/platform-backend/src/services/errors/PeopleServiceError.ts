import { DomainError } from "./DomainError";

export const PEOPLE_SERVICE_ERROR_CODE = {
  EMAIL_TAKEN: "EMAIL_TAKEN",
  GUEST_NEEDS_SPACE: "GUEST_NEEDS_SPACE",
  SPACE_NOT_FOUND: "SPACE_NOT_FOUND",
  LINK_INVALID: "LINK_INVALID",
  INVITE_NOT_FOUND: "INVITE_NOT_FOUND",
  USER_NOT_FOUND: "USER_NOT_FOUND",
  USER_DEACTIVATED: "USER_DEACTIVATED",
  LAST_ADMIN: "LAST_ADMIN",
  CANNOT_DEACTIVATE_SELF: "CANNOT_DEACTIVATE_SELF",
} as const;

export type PeopleServiceErrorCode =
  (typeof PEOPLE_SERVICE_ERROR_CODE)[keyof typeof PEOPLE_SERVICE_ERROR_CODE];

const STATUS_BY_CODE: Record<PeopleServiceErrorCode, number> = {
  EMAIL_TAKEN: 409,
  GUEST_NEEDS_SPACE: 400,
  SPACE_NOT_FOUND: 400,
  LINK_INVALID: 404,
  INVITE_NOT_FOUND: 404,
  USER_NOT_FOUND: 404,
  USER_DEACTIVATED: 409,
  LAST_ADMIN: 400,
  CANNOT_DEACTIVATE_SELF: 400,
};

/** Invites, reset links and account changes; the message is shown to the person as is. */
export class PeopleServiceError extends DomainError {
  readonly statusCode: number;

  constructor(
    public readonly code: PeopleServiceErrorCode,
    message: string,
  ) {
    super(message);
    this.statusCode = STATUS_BY_CODE[code];
  }
}
