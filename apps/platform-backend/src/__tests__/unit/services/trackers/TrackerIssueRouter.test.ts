import type { TrackerIssueRule } from "../../../../persistence/trackers/TrackerIssueRuleDAO";
import type { TrackerContext } from "../../../../services/trackers/TrackerIssueInbound";
import { TrackerIssueRouter } from "../../../../services/trackers/TrackerIssueRouter";

const JIRA: TrackerContext = { provider: "jira", integrationId: "conn-1", webhookConfigId: "hook-1" };
const GITHUB: TrackerContext = { provider: "github", integrationId: "conn-1", webhookConfigId: "hook-1" };

function rule(projectId: string, label: string | null, planNewIssues = false): TrackerIssueRule {
  return { id: `${projectId}-${label}`, projectId, integrationId: "conn-1", label, planNewIssues };
}

function router(rules: TrackerIssueRule[], repositories: Array<{ projectId: string; sourceRepository: string }> = []) {
  const deps = {
    rules: { listForConnection: jest.fn().mockResolvedValue(rules) },
    repositories: { listRepositoriesLike: jest.fn().mockResolvedValue(repositories) },
  };
  return { deps, router: new TrackerIssueRouter(deps) };
}

describe("TrackerIssueRouter", () => {
  it("sends a Jira or Shortcut issue to every space that takes one of its labels, planning when any of its rules does", async () => {
    const { router: routing } = router([rule("web", "Frontend", true), rule("web", "ui"), rule("api", "backend"), rule("docs", "docs")]);

    await expect(routing.route(JIRA, { labels: ["frontend", "ui", "backend"], repository: null })).resolves.toEqual({
      spaces: [
        { projectId: "web", plan: true },
        { projectId: "api", plan: false },
      ],
    });
  });

  it("says why a Jira or Shortcut issue isn't taken", async () => {
    const { router: routing } = router([rule("web", "frontend")]);

    await expect(routing.route(JIRA, { labels: ["bug"], repository: null })).resolves.toEqual({ spaces: [], reason: "No space takes issues labelled 'bug'" });
    await expect(routing.route(JIRA, { labels: [], repository: null })).resolves.toMatchObject({ spaces: [], reason: expect.stringContaining("no labels") });
  });

  it("sends a GitHub issue to the spaces whose repository it's in, matching the address without regard to case", async () => {
    const { deps, router: routing } = router([], [
      { projectId: "shop", sourceRepository: "https://github.com/Acme/Shop.git" },
      { projectId: "shop-admin", sourceRepository: "https://github.com/acme/shop-admin" },
    ]);

    await expect(routing.route(GITHUB, { labels: [], repository: "acme/shop" })).resolves.toEqual({ spaces: [{ projectId: "shop", plan: false }] });
    expect(deps.repositories.listRepositoriesLike).toHaveBeenCalledWith("acme/shop");
  });

  it("lets a space narrow its GitHub issues to labels, and plan them", async () => {
    const repositories = [
      { projectId: "shop", sourceRepository: "https://github.com/acme/shop" },
      { projectId: "shop-ops", sourceRepository: "acme/shop" },
    ];
    const { router: routing } = router([rule("shop", null, true), rule("shop-ops", "ops")], repositories);

    await expect(routing.route(GITHUB, { labels: ["bug"], repository: "acme/shop" })).resolves.toEqual({ spaces: [{ projectId: "shop", plan: true }] });
    await expect(routing.route(GITHUB, { labels: ["ops"], repository: "acme/shop" })).resolves.toEqual({
      spaces: [
        { projectId: "shop", plan: true },
        { projectId: "shop-ops", plan: false },
      ],
    });
  });

  it("says why a GitHub issue isn't taken", async () => {
    const none = router([]);
    await expect(none.router.route(GITHUB, { labels: [], repository: "acme/other" })).resolves.toEqual({
      spaces: [],
      reason: "No space uses the repository 'acme/other'",
    });

    const labelled = router([rule("shop", "ready")], [{ projectId: "shop", sourceRepository: "acme/shop" }]);
    await expect(labelled.router.route(GITHUB, { labels: [], repository: "acme/shop" })).resolves.toMatchObject({
      spaces: [],
      reason: expect.stringContaining("certain labels"),
    });
  });
});
