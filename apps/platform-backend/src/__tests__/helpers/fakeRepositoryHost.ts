import type { RepositoryCreator, RepositoryHost } from "@viberglass/integration-core";

/** A code host whose every call is a jest mock; tests set what each returns. */
export function fakeRepositoryHost() {
  return {
    gitUsername: "x-token",
    webHost: "github.com",
    parseRepository: jest.fn(),
    checkAccess: jest.fn(),
    openPullRequest: jest.fn(),
    ownsPullRequest: jest.fn().mockReturnValue(true),
    fetchPullRequestOutcome: jest.fn(),
    mergePullRequest: jest.fn(),
    fetchPullRequestReview: jest.fn(),
    fetchBranchHead: jest.fn(),
  } satisfies RepositoryHost;
}

/** A code host that can create repositories; tests set what each call returns. */
export function fakeCreatingRepositoryHost() {
  const creator = {
    listOwners: jest.fn(),
    createRepository: jest.fn(),
  } satisfies RepositoryCreator;
  return { ...fakeRepositoryHost(), creator };
}
