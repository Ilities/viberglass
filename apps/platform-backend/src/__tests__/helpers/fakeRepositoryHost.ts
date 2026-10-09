import type { RepositoryHost } from "@viberglass/integration-core";

/** A code host whose every call is a jest mock; tests set what each returns. */
export function fakeRepositoryHost() {
  return {
    gitUsername: "x-token",
    parseRepository: jest.fn(),
    checkAccess: jest.fn(),
    openPullRequest: jest.fn(),
    ownsPullRequest: jest.fn().mockReturnValue(true),
    fetchPullRequestOutcome: jest.fn(),
    fetchPullRequestReview: jest.fn(),
  } satisfies RepositoryHost;
}
