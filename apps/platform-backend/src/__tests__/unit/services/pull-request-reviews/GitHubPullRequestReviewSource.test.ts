import { GitHubPullRequestReviewSource } from "../../../../services/pull-request-reviews/GitHubPullRequestReviewSource";

const URL_1 = "https://github.com/acme/app/pull/7";
const comment = (body: string, createdAt: string, login = "reviewer") => ({ author: { login }, body, url: `${URL_1}#${body}`, createdAt });

function github(pullRequest: unknown, status = 200): jest.Mock {
  return jest.fn().mockResolvedValue({ ok: status < 400, status, json: async () => ({ data: { repository: { pullRequest } } }) });
}

const pullRequest = {
  title: "fix: price refresh",
  state: "OPEN",
  isDraft: false,
  headRefName: "viberator/task-1",
  baseRefName: "main",
  additions: 40,
  deletions: 3,
  changedFiles: 2,
  commits: { totalCount: 2 },
  reviewThreads: {
    nodes: [
      { isResolved: false, isOutdated: false, path: "a.ts", line: 3, comments: { nodes: [comment("open thread", "2026-09-01T00:00:00Z"), comment("reply", "2026-09-02T00:00:00Z")] } },
      { isResolved: true, isOutdated: false, path: "b.ts", line: 1, comments: { nodes: [comment("resolved", "2026-09-01T00:00:00Z")] } },
      { isResolved: false, isOutdated: true, path: "c.ts", line: 1, comments: { nodes: [comment("outdated", "2026-09-01T00:00:00Z")] } },
    ],
  },
  reviews: {
    nodes: [
      { author: { login: "reviewer" }, body: "old summary", url: null, submittedAt: "2026-09-01T00:00:00Z" },
      { author: { login: "reviewer" }, body: "new summary", url: null, submittedAt: "2026-09-10T00:00:00Z" },
      { author: { login: "approver" }, body: "", url: null, submittedAt: "2026-09-10T00:00:00Z" },
    ],
  },
  comments: { nodes: [comment("old chat", "2026-09-01T00:00:00Z"), comment("new chat", "2026-09-11T00:00:00Z")] },
};

describe("GitHubPullRequestReviewSource", () => {
  it("queries GitHub GraphQL for the pull request with the token", async () => {
    const fetchFn = github(pullRequest);

    await new GitHubPullRequestReviewSource(fetchFn).fetchReview(URL_1, "tok", null);

    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("https://api.github.com/graphql");
    expect(init.headers.Authorization).toBe("Bearer tok");
    expect(JSON.parse(init.body).variables).toEqual({ owner: "acme", repo: "app", number: 7 });
  });

  it("keeps open, current threads and what was written since the last build", async () => {
    const { comments } = await new GitHubPullRequestReviewSource(github(pullRequest)).fetchReview(
      URL_1,
      "tok",
      new Date("2026-09-05T00:00:00Z"),
    );

    expect(comments.map((c) => [c.kind, c.body])).toEqual([
      ["thread", "open thread"],
      ["thread", "reply"],
      ["review", "new summary"],
      ["conversation", "new chat"],
    ]);
    expect(comments[0]).toMatchObject({ author: "reviewer", path: "a.ts", line: 3 });
  });

  it("keeps every review summary and comment when no build has finished", async () => {
    const { comments } = await new GitHubPullRequestReviewSource(github(pullRequest)).fetchReview(URL_1, "tok", null);

    expect(comments.filter((c) => c.kind !== "thread").map((c) => c.body)).toEqual(["old summary", "new summary", "old chat", "new chat"]);
  });

  it("reads the pull request's state, branches and size", async () => {
    const { details } = await new GitHubPullRequestReviewSource(github(pullRequest)).fetchReview(URL_1, "tok", null);

    expect(details).toEqual({
      title: "fix: price refresh",
      state: "open",
      isDraft: false,
      headBranch: "viberator/task-1",
      baseBranch: "main",
      additions: 40,
      deletions: 3,
      changedFiles: 2,
      commitCount: 2,
      previewUrl: null,
    });
  });

  it("links the preview a successful deployment of the latest commit reports", async () => {
    const latestCommit = {
      nodes: [
        {
          commit: {
            deployments: { nodes: [{ latestStatus: { state: "SUCCESS", environmentUrl: "https://shop-pr-7.vercel.app" } }, { latestStatus: { state: "FAILURE", environmentUrl: "https://broken.example" } }] },
            checkSuites: { nodes: [] },
          },
        },
      ],
    };
    const { details } = await new GitHubPullRequestReviewSource(github({ ...pullRequest, latestCommit })).fetchReview(URL_1, "tok", null);

    expect(details.previewUrl).toBe("https://shop-pr-7.vercel.app");
  });

  it("falls back to a preview app's check run, and ignores other checks", async () => {
    const latestCommit = {
      nodes: [
        {
          commit: {
            deployments: { nodes: [] },
            checkSuites: {
              nodes: [
                { app: { slug: "github-actions" }, checkRuns: { nodes: [{ detailsUrl: "https://ci.example/run/1", conclusion: "SUCCESS" }] } },
                { app: { slug: "netlify" }, checkRuns: { nodes: [{ detailsUrl: "https://deploy-preview-7--shop.netlify.app", conclusion: "SUCCESS" }] } },
              ],
            },
          },
        },
      ],
    };
    const { details } = await new GitHubPullRequestReviewSource(github({ ...pullRequest, latestCommit })).fetchReview(URL_1, "tok", null);

    expect(details.previewUrl).toBe("https://deploy-preview-7--shop.netlify.app");
  });

  it.each([
    ["MERGED", "merged"],
    ["CLOSED", "closed"],
  ])("maps GitHub's %s state", async (state, expected) => {
    const { details } = await new GitHubPullRequestReviewSource(github({ ...pullRequest, state })).fetchReview(URL_1, "tok", null);

    expect(details.state).toBe(expected);
  });

  it("throws when GitHub refuses or has no such pull request", async () => {
    await expect(new GitHubPullRequestReviewSource(github(null, 401)).fetchReview(URL_1, "tok", null)).rejects.toThrow("GitHub returned 401");
    await expect(new GitHubPullRequestReviewSource(github(null)).fetchReview(URL_1, "tok", null)).rejects.toThrow("no pull request");
  });

  it("supports github.com pull request URLs only", () => {
    const source = new GitHubPullRequestReviewSource(jest.fn());
    expect(source.supports(URL_1)).toBe(true);
    expect(source.supports("https://gitlab.com/a/b/-/merge_requests/1")).toBe(false);
  });
});
