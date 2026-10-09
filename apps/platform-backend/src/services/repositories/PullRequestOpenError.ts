import { DomainError } from "../errors/DomainError";

/** A run's pull request couldn't be opened because of how its space's repository is set up. */
export class PullRequestOpenError extends DomainError {
  readonly statusCode = 422;
  readonly code = "PULL_REQUEST_NOT_OPENABLE";
}
