import { PullRequestOutcomeChecker } from "../../../../services/pull-request-outcomes/PullRequestOutcomeChecker";
import type { PullRequestOutcome, PullRequestOutcomeSource } from "../../../../services/pull-request-outcomes/pullRequestOutcomeTypes";

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
  const tokens = { resolve: jest.fn() };
  const source: jest.Mocked<PullRequestOutcomeSource> = { supports: jest.fn(), fetchOutcome: jest.fn() };
  const listener = { onOutcome: jest.fn() };
  const checker = new PullRequestOutcomeChecker(outcomes, tokens, [source], [listener]);

  beforeEach(() => {
    jest.resetAllMocks();
    tokens.resolve.mockResolvedValue("tok");
    source.supports.mockReturnValue(true);
    source.fetchOutcome.mockResolvedValue(MERGED);
  });

  it("records the outcome read with the space's token, and tells the listeners", async () => {
    await expect(checker.check(URL_1, "project-1")).resolves.toBeNull();

    expect(tokens.resolve).toHaveBeenCalledWith("project-1");
    expect(outcomes.recordOutcome).toHaveBeenCalledWith(URL_1, MERGED);
    expect(listener.onOutcome).toHaveBeenCalledWith(URL_1, MERGED);
  });

  it.each([
    ["no source supports the URL", () => source.supports.mockReturnValue(false), "project-1", "No outcome source supports this URL"],
    ["no space was recorded", () => undefined, null, "No project recorded for this pull request"],
    ["the space has no token", () => tokens.resolve.mockResolvedValue(null), "project-1", "Project has no SCM token credential"],
    ["the SCM fails", () => source.fetchOutcome.mockRejectedValue(new Error("GitHub returned 404")), "project-1", "GitHub returned 404"],
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
