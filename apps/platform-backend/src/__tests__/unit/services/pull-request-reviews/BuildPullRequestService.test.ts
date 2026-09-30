import { BuildPullRequestService } from "../../../../services/pull-request-reviews/BuildPullRequestService";

const TICKET = { id: "ticket-1", projectId: "project-1", pullRequestUrl: "https://github.com/acme/app/pull/7" };

describe("BuildPullRequestService", () => {
  const reviews = { supports: jest.fn(), fetchReview: jest.fn() };
  const tokens = { resolve: jest.fn() };
  const builds = { lastBuildFinishedAt: jest.fn() };
  const service = new BuildPullRequestService(reviews, tokens, builds);

  beforeEach(() => {
    jest.resetAllMocks();
    reviews.supports.mockReturnValue(true);
    tokens.resolve.mockResolvedValue("tok");
    builds.lastBuildFinishedAt.mockResolvedValue(new Date("2026-09-05T00:00:00Z"));
    reviews.fetchReview.mockResolvedValue({ details: { title: "fix", state: "open" }, comments: [{ kind: "thread", body: "fix" }] });
  });

  it("reads the pull request's comments since the last build, with the space's token", async () => {
    await expect(service.forTask(TICKET)).resolves.toEqual({
      pullRequestUrl: TICKET.pullRequestUrl,
      details: { title: "fix", state: "open" },
      comments: [{ kind: "thread", body: "fix" }],
      unavailableReason: null,
    });
    expect(tokens.resolve).toHaveBeenCalledWith("project-1");
    expect(reviews.fetchReview).toHaveBeenCalledWith(TICKET.pullRequestUrl, "tok", new Date("2026-09-05T00:00:00Z"));
  });

  const cases: Array<[string, typeof TICKET | { id: string; projectId: string }, () => void, string]> = [
    ["no pull request", { id: TICKET.id, projectId: TICKET.projectId }, () => {}, "no pull request"],
    ["a non-GitHub pull request", TICKET, () => { reviews.supports.mockReturnValue(false); }, "GitHub"],
    ["no token", TICKET, () => { tokens.resolve.mockResolvedValue(null); }, "no token"],
    ["a GitHub error", TICKET, () => { reviews.fetchReview.mockRejectedValue(new Error("GitHub returned 401")); }, "GitHub returned 401"],
  ];

  it.each(cases)("says why it has no comments for %s", async (_label, ticket, arrange, reason) => {
    arrange();

    const result = await service.forTask(ticket);

    expect(result.comments).toEqual([]);
    expect(result.details).toBeNull();
    expect(result.unavailableReason).toContain(reason);
  });
});
