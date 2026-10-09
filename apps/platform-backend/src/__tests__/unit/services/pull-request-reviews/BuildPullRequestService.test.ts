import { BuildPullRequestService } from "../../../../services/pull-request-reviews/BuildPullRequestService";
import { fakeRepositoryHost } from "../../../helpers/fakeRepositoryHost";

const TICKET = { id: "ticket-1", projectId: "project-1", pullRequestUrl: "https://github.com/acme/app/pull/7" };

describe("BuildPullRequestService", () => {
  const host = fakeRepositoryHost();
  const repositories = { resolve: jest.fn() };
  const builds = { lastBuildFinishedAt: jest.fn() };
  const pullRequests = { listForTask: jest.fn() };
  const service = new BuildPullRequestService(repositories, builds, pullRequests);

  beforeEach(() => {
    jest.resetAllMocks();
    host.ownsPullRequest.mockReturnValue(true);
    repositories.resolve.mockResolvedValue({ host, token: "tok" });
    builds.lastBuildFinishedAt.mockResolvedValue(new Date("2026-09-05T00:00:00Z"));
    host.fetchPullRequestReview.mockResolvedValue({ details: { title: "fix", state: "open" }, comments: [{ kind: "thread", body: "fix" }] });
  });

  it("reads the pull request's comments since the last build, with the space's token", async () => {
    await expect(service.forTask(TICKET)).resolves.toEqual({
      pullRequestUrl: TICKET.pullRequestUrl,
      details: { title: "fix", state: "open" },
      comments: [{ kind: "thread", body: "fix" }],
      unavailableReason: null,
    });
    expect(repositories.resolve).toHaveBeenCalledWith("project-1");
    expect(host.fetchPullRequestReview).toHaveBeenCalledWith(TICKET.pullRequestUrl, "tok", new Date("2026-09-05T00:00:00Z"));
  });

  it("lists every pull request the task's builds opened, with the parts each builds", async () => {
    pullRequests.listForTask.mockResolvedValue([
      { branch: "viberglass/t-1", url: "https://github.com/acme/app/pull/7", firstPart: 1, lastPart: 1 },
      { branch: "viberglass/t-1-part-2", url: "https://github.com/acme/app/pull/9", firstPart: 2, lastPart: null },
    ]);

    const listed = await service.listForTask(TICKET);

    expect(listed.map(({ pullRequestUrl, branch, firstPart, lastPart }) => ({ pullRequestUrl, branch, firstPart, lastPart }))).toEqual([
      { pullRequestUrl: "https://github.com/acme/app/pull/7", branch: "viberglass/t-1", firstPart: 1, lastPart: 1 },
      { pullRequestUrl: "https://github.com/acme/app/pull/9", branch: "viberglass/t-1-part-2", firstPart: 2, lastPart: null },
    ]);
    expect(listed[1]?.details).toEqual({ title: "fix", state: "open" });
    expect(host.fetchPullRequestReview).toHaveBeenCalledWith("https://github.com/acme/app/pull/9", "tok", new Date("2026-09-05T00:00:00Z"));
  });

  const cases: Array<[string, typeof TICKET | { id: string; projectId: string }, () => void, string]> = [
    ["no pull request", { id: TICKET.id, projectId: TICKET.projectId }, () => {}, "no pull request"],
    ["a pull request on another host", TICKET, () => { host.ownsPullRequest.mockReturnValue(false); }, "isn't on the space's code host"],
    ["no token", TICKET, () => { repositories.resolve.mockResolvedValue({ unavailable: "The space's repository connection has no token" }); }, "no token"],
    ["a GitHub error", TICKET, () => { host.fetchPullRequestReview.mockRejectedValue(new Error("GitHub returned 401")); }, "GitHub returned 401"],
  ];

  it.each(cases)("says why it has no comments for %s", async (_label, ticket, arrange, reason) => {
    arrange();

    const result = await service.forTask(ticket);

    expect(result.comments).toEqual([]);
    expect(result.details).toBeNull();
    expect(result.unavailableReason).toContain(reason);
  });
});
