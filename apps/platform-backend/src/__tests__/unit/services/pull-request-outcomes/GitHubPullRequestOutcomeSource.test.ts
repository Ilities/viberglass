import { GitHubPullRequestOutcomeSource } from "../../../../services/pull-request-outcomes/GitHubPullRequestOutcomeSource";

const URL_92 = "https://github.com/Ilities/token.observer/pull/92";

function respondWith(status: number, body: unknown): jest.Mock {
  return jest.fn().mockResolvedValue({ ok: status < 400, status, json: async () => body });
}

describe("GitHubPullRequestOutcomeSource", () => {
  it("supports github.com pull request URLs only", () => {
    const source = new GitHubPullRequestOutcomeSource(jest.fn());

    expect(source.supports(URL_92)).toBe(true);
    expect(source.supports(`${URL_92}/`)).toBe(true);
    expect(source.supports("https://github.com/Ilities/token.observer/issues/92")).toBe(false);
    expect(source.supports("https://gitlab.com/a/b/-/merge_requests/1")).toBe(false);
  });

  it("reads the pull request with the token", async () => {
    const fetchFn = respondWith(200, { state: "open", merged_at: null, closed_at: null, comments: 2, review_comments: 5 });

    const outcome = await new GitHubPullRequestOutcomeSource(fetchFn).fetchOutcome(URL_92, "tok");

    expect(fetchFn).toHaveBeenCalledWith(
      "https://api.github.com/repos/Ilities/token.observer/pulls/92",
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer tok" }) }),
    );
    expect(outcome).toEqual({ state: "open", mergedAt: null, closedAt: null, commentCount: 2, reviewCommentCount: 5, mergedBy: null });
  });

  it("reports a closed pull request with a merge time as merged", async () => {
    const fetchFn = respondWith(200, {
      state: "closed",
      merged_at: "2026-04-12T10:19:31Z",
      closed_at: "2026-04-12T10:19:31Z",
      comments: 0,
      review_comments: 0,
      merged_by: { login: "dev-koskinen" },
    });

    const outcome = await new GitHubPullRequestOutcomeSource(fetchFn).fetchOutcome(URL_92, "tok");

    expect(outcome.state).toBe("merged");
    expect(outcome.mergedBy).toBe("dev-koskinen");
    expect(outcome.mergedAt).toEqual(new Date("2026-04-12T10:19:31Z"));
  });

  it("reports a closed pull request without a merge time as closed", async () => {
    const fetchFn = respondWith(200, { state: "closed", merged_at: null, closed_at: "2026-04-12T10:19:31Z" });

    const outcome = await new GitHubPullRequestOutcomeSource(fetchFn).fetchOutcome(URL_92, "tok");

    expect(outcome).toMatchObject({ state: "closed", mergedAt: null, commentCount: 0, reviewCommentCount: 0 });
  });

  it("throws on an error status", async () => {
    const source = new GitHubPullRequestOutcomeSource(respondWith(404, {}));

    await expect(source.fetchOutcome(URL_92, "tok")).rejects.toThrow("GitHub returned 404");
  });

  it("throws on an unrecognised body", async () => {
    const source = new GitHubPullRequestOutcomeSource(respondWith(200, { state: "draft" }));

    await expect(source.fetchOutcome(URL_92, "tok")).rejects.toThrow("Unexpected GitHub pull request response");
  });
});
