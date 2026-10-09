import { PullRequestOutcomeChecker } from "../../../../services/pull-request-outcomes/PullRequestOutcomeChecker";
import type { PullRequestOutcome } from "@viberglass/types";
import { fakeRepositoryHost } from "../../../helpers/fakeRepositoryHost";

const URL_1 = "https://github.com/acme/app/pull/1";
const MERGED: PullRequestOutcome = {
  state: "merged",
  mergedAt: new Date("2026-09-20T00:00:00Z"),
  closedAt: new Date("2026-09-20T00:00:00Z"),
  commentCount: 1,
  reviewCommentCount: 3,
};

describe("PullRequestOutcomeChecker", () => {
  const outcomes = { recordOutcome: jest.fn() };
  const host = fakeRepositoryHost();
  const repositories = { resolve: jest.fn() };
  const listener = { onOutcome: jest.fn() };
  const checker = new PullRequestOutcomeChecker(outcomes, repositories, [listener]);

  beforeEach(() => {
    jest.resetAllMocks();
    repositories.resolve.mockResolvedValue({ host, token: "tok" });
    host.ownsPullRequest.mockReturnValue(true);
    host.fetchPullRequestOutcome.mockResolvedValue(MERGED);
  });

  it("records the outcome read with the space's token, and tells the listeners", async () => {
    await expect(checker.check(URL_1, "project-1")).resolves.toBeNull();

    expect(repositories.resolve).toHaveBeenCalledWith("project-1");
    expect(host.fetchPullRequestOutcome).toHaveBeenCalledWith(URL_1, "tok");
    expect(outcomes.recordOutcome).toHaveBeenCalledWith(URL_1, MERGED);
    expect(listener.onOutcome).toHaveBeenCalledWith(URL_1, MERGED);
  });

  it.each([
    ["the space's code host doesn't host it", () => host.ownsPullRequest.mockReturnValue(false), "project-1", "The space's code host doesn't host this pull request"],
    ["no space was recorded", () => undefined, null, "No project recorded for this pull request"],
    ["the space can't be read", () => repositories.resolve.mockResolvedValue({ unavailable: "The space's repository connection has no token" }), "project-1", "The space's repository connection has no token"],
    ["the code host fails", () => host.fetchPullRequestOutcome.mockRejectedValue(new Error("GitHub returned 404")), "project-1", "GitHub returned 404"],
  ])("says why it recorded nothing when %s", async (_label, arrange, projectId, reason) => {
    arrange();

    await expect(checker.check(URL_1, projectId)).resolves.toBe(reason);
    expect(outcomes.recordOutcome).not.toHaveBeenCalled();
  });

  it("still records the outcome when a listener fails", async () => {
    listener.onOutcome.mockRejectedValue(new Error("database gone"));

    await expect(checker.check(URL_1, "project-1")).resolves.toBeNull();
    expect(outcomes.recordOutcome).toHaveBeenCalledWith(URL_1, MERGED);
  });
});
