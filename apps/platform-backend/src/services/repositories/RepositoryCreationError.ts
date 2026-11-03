import type { RepositoryAccessErrorCode } from "@viberglass/integration-core";
import { DomainError } from "../errors/DomainError";

export type RepositoryCreationErrorCode = RepositoryAccessErrorCode | "CONNECTION_NOT_FOUND" | "CREATION_UNSUPPORTED" | "NO_TOKEN";

const STATUS: Record<RepositoryCreationErrorCode, number> = {
  CONNECTION_NOT_FOUND: 404,
  CREATION_UNSUPPORTED: 400,
  NO_TOKEN: 409,
  REPOSITORY_NAME_INVALID: 400,
  REPOSITORY_EXISTS: 409,
  TOKEN_REJECTED: 422,
  REPOSITORY_NOT_FOUND: 422,
  REPOSITORY_FORBIDDEN: 422,
  REPOSITORY_READ_ONLY: 422,
  CREATE_FORBIDDEN: 422,
  HOST_RATE_LIMITED: 422,
  HOST_ERROR: 502,
  HOST_UNREACHABLE: 502,
};

/** Why a repository couldn't be created with a connection; the message is shown as is. */
export class RepositoryCreationError extends DomainError {
  readonly statusCode: number;

  constructor(
    readonly code: RepositoryCreationErrorCode,
    message: string,
  ) {
    super(message);
    this.statusCode = STATUS[code];
  }
}
