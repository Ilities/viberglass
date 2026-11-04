export type PullRequestMergeErrorCode = 'HEAD_MOVED' | 'NOT_MERGEABLE'

/** Why the code host didn't merge a pull request; the message tells the person what to do about it. */
export class PullRequestMergeError extends Error {
  constructor(
    readonly code: PullRequestMergeErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'PullRequestMergeError'
  }
}
