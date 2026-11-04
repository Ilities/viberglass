import type { PullRequestOutcome, PullRequestReview, RepositoryAccess } from '@viberglass/types'
import type { RepositoryCreator } from './RepositoryCreator'

/** A repository as a person typed it, read by its code host. */
export interface RepositoryRef {
  /** The host's name for it, such as "owner/name". */
  fullName: string
  /** Its web address. */
  url: string
}

export interface PullRequestToOpen {
  /** The repository the branch was pushed to. */
  sourceRepository: string
  /** The repository the pull request is opened against; differs from the source for a fork. */
  destinationRepository: string
  head: string
  base: string
  title: string
  body: string
}

/**
 * An integration's code host: everything about a repository that goes through
 * the host's API. Cloning and pushing are plain git and stay with the worker;
 * it only needs `gitUsername` to send with the token.
 */
export interface RepositoryHost {
  /** The username git sends with the connection's token over HTTPS. */
  readonly gitUsername: string
  /** Where people browse its repositories, such as "github.com". */
  readonly webHost: string
  /** Set when the host can create repositories. */
  readonly creator?: RepositoryCreator
  /** Null when the input isn't a repository on this host. */
  parseRepository(input: string): RepositoryRef | null
  /** Throws RepositoryAccessError when the token can't read the repository or push to it. */
  checkAccess(repository: RepositoryRef, token: string): Promise<RepositoryAccess>
  /** Opens the pull request and returns its address; the open one's address when there already is one for the branch. */
  openPullRequest(pullRequest: PullRequestToOpen, token: string): Promise<string>
  /** Whether a pull request address is one of this host's. */
  ownsPullRequest(url: string): boolean
  fetchPullRequestOutcome(url: string, token: string): Promise<PullRequestOutcome>
  /**
   * Merges the pull request only while its head is still `expectedHeadSha`, so
   * commits pushed after someone looked aren't merged unseen. Returns the commit
   * the merge made; throws PullRequestMergeError when the host refuses.
   */
  mergePullRequest(url: string, token: string, options: { expectedHeadSha: string }): Promise<string>
  /** The commit a branch points at; null when the branch doesn't exist yet, as in an empty repository. */
  fetchBranchHead(repository: RepositoryRef, branch: string, token: string): Promise<string | null>
  /** Unresolved review threads, and review summaries and comments written after `since`. */
  fetchPullRequestReview(url: string, token: string, since: Date | null): Promise<PullRequestReview>
}
