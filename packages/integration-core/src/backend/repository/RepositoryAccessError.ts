export type RepositoryAccessErrorCode =
  | 'TOKEN_REJECTED'
  | 'REPOSITORY_NOT_FOUND'
  | 'REPOSITORY_FORBIDDEN'
  | 'REPOSITORY_READ_ONLY'
  | 'HOST_RATE_LIMITED'
  | 'HOST_ERROR'
  | 'HOST_UNREACHABLE'

/** Why a token can't be used with a repository; the message tells the person what to do about it. */
export class RepositoryAccessError extends Error {
  constructor(
    readonly code: RepositoryAccessErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'RepositoryAccessError'
  }
}
