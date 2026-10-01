import { DomainError } from "./DomainError";

export const SPACE_ACCESS_ERROR_CODE = {
  NOT_FOUND: "SPACE_NOT_FOUND",
  NOT_MAINTAINER: "SPACE_NOT_MAINTAINER",
  MEMBER_NOT_FOUND: "SPACE_MEMBER_NOT_FOUND",
  USER_NOT_FOUND: "SPACE_USER_NOT_FOUND",
} as const;

export type SpaceAccessErrorCode = (typeof SPACE_ACCESS_ERROR_CODE)[keyof typeof SPACE_ACCESS_ERROR_CODE];

const STATUS_BY_CODE: Record<SpaceAccessErrorCode, number> = {
  SPACE_NOT_FOUND: 404,
  SPACE_NOT_MAINTAINER: 403,
  SPACE_MEMBER_NOT_FOUND: 404,
  SPACE_USER_NOT_FOUND: 404,
};

/**
 * A space someone can't see answers 404, like one that doesn't exist, so a
 * private space's name and id don't leak.
 */
export class SpaceAccessError extends DomainError {
  readonly statusCode: number;

  constructor(
    public readonly code: SpaceAccessErrorCode,
    message: string,
  ) {
    super(message);
    this.statusCode = STATUS_BY_CODE[code];
  }
}
