import { PullRequestMergeError } from "@viberglass/integration-core";
import type { AppRelease, ProjectScmConfig } from "@viberglass/types";
import { MakeLiveService } from "../../../../services/apps/MakeLiveService";
import { fakeRepositoryHost } from "../../../helpers/fakeRepositoryHost";

jest.mock("../../../../persistence/config/database", () => ({ __esModule: true, default: {} }));

const URL_3 = "https://github.com/acme/laptops/pull/3";
const HEAD = "a".repeat(40);
const MERGED = "b".repeat(40);
const SCM: ProjectScmConfig = {
  projectId: "space-1",
  integrationId: "integration-1",
  integrationSystem: "github",
  sourceRepository: "https://github.com/acme/laptops",
  baseBranch: "main",
  createdAt: "",
  updatedAt: "",
};
const RELEASE: AppRelease = {
  id: "release-1",
  projectId: "space-1",
  commitSha: MERGED,
  status: "building",
  jobId: null,
  bundleSha256: null,
  bundleBytes: null,
  nodeVersion: null,
  buildLog: null,
  failureReason: null,
  wentLiveAt: null,
  liveFailure: null,
  ticketId: "task-1",
  rolledBackAt: null,
  bundleRemoved: false,
  createdAt: "",
  finishedAt: null,
};

function setup(options: { canMakeLive?: boolean; backingKind?: "app" | "git"; existingRelease?: boolean; triedCommitSha?: string | null } = {}) {
  const host = fakeRepositoryHost();
  host.mergePullRequest.mockResolvedValue(MERGED);
  const deps = {
    policy: { describe: jest.fn().mockResolvedValue({ canPost: true, canAsk: true, canAskForCode: true, canSteer: true, canMakeLive: options.canMakeLive ?? true }) },
    owners: { projectIdForTask: jest.fn().mockResolvedValue("space-1") },
    tickets: {
      getSummary: jest.fn().mockResolvedValue({ title: "Laptops", key: "LAP-1", spaceSlug: "laptops", spaceName: "Laptops", backingKind: options.backingKind ?? "app", pullRequestUrl: URL_3 }),
    },
    pullRequests: { listForTask: jest.fn().mockResolvedValue([{ branch: "viberglass/lap-1", url: URL_3, firstPart: 1, lastPart: null }]) },
    previews: { findForChange: jest.fn().mockResolvedValue({ triedCommitSha: options.triedCommitSha === undefined ? HEAD : options.triedCommitSha }) },
    repositories: { resolve: jest.fn().mockResolvedValue({ host, token: "tok" }) },
    users: { findById: jest.fn().mockResolvedValue({ id: "maria", name: "Maria" }) },
    outcomes: { check: jest.fn().mockResolvedValue(null) },
    scmConfigs: { getByProjectId: jest.fn().mockResolvedValue(SCM) },
    builds: { build: jest.fn().mockResolvedValue(options.existingRelease ? null : RELEASE) },
    releases: { linkTicket: jest.fn() },
    audit: { record: jest.fn() },
  };
  return { deps, host, service: new MakeLiveService(deps) };
}

const change = { pullRequestUrl: URL_3, headSha: HEAD };

describe("MakeLiveService", () => {
  it("merges the head the person looked at, closes the task as theirs and builds the merge commit for the task", async () => {
    const { deps, host, service } = setup();

    await expect(service.makeLive("maria", "task-1", change)).resolves.toBe(MERGED);

    expect(host.mergePullRequest).toHaveBeenCalledWith(URL_3, "tok", { expectedHeadSha: HEAD });
    expect(deps.outcomes.check).toHaveBeenCalledWith(URL_3, "space-1", { madeLiveBy: "Maria" });
    expect(deps.builds.build).toHaveBeenCalledWith(SCM, MERGED, { ticketId: "task-1" });
    expect(deps.audit.record).toHaveBeenCalledWith({
      action: "app.change_made_live",
      target: { type: "space", id: "space-1" },
      details: { taskId: "task-1", pullRequestUrl: URL_3, commitSha: MERGED },
    });
  });

  it("links the task to a release the branch poll already started", async () => {
    const { deps, service } = setup({ existingRelease: true });

    await service.makeLive("maria", "task-1", change);

    expect(deps.releases.linkTicket).toHaveBeenCalledWith("space-1", MERGED, "task-1");
  });

  it("still succeeds when the build can't start, since the branch poll builds the commit later", async () => {
    const { deps, service } = setup();
    deps.builds.build.mockRejectedValue(new Error("The app builder is not ready"));

    await expect(service.makeLive("maria", "task-1", change)).resolves.toBe(MERGED);
  });

  it("refuses someone who isn't the owner, a maintainer or an admin", async () => {
    const { host, service } = setup({ canMakeLive: false });

    await expect(service.makeLive("tomi", "task-1", change)).rejects.toMatchObject({ code: "NOT_ALLOWED", statusCode: 403 });
    expect(host.mergePullRequest).not.toHaveBeenCalled();
  });

  it("refuses a task outside an App space", async () => {
    const { host, service } = setup({ backingKind: "git" });

    await expect(service.makeLive("maria", "task-1", change)).rejects.toMatchObject({ code: "NOT_AN_APP_SPACE" });
    expect(host.mergePullRequest).not.toHaveBeenCalled();
  });

  it("refuses a pull request that isn't the task's", async () => {
    const { host, service } = setup();

    await expect(service.makeLive("maria", "task-1", { ...change, pullRequestUrl: "https://github.com/acme/other/pull/9" })).rejects.toMatchObject({
      code: "NO_SUCH_CHANGE",
    });
    expect(host.mergePullRequest).not.toHaveBeenCalled();
  });

  it("refuses until the change's latest commit ran in its preview", async () => {
    const stale = setup({ triedCommitSha: "c".repeat(40) });
    await expect(stale.service.makeLive("maria", "task-1", change)).rejects.toMatchObject({ code: "NOT_TRIED", statusCode: 409 });
    expect(stale.host.mergePullRequest).not.toHaveBeenCalled();

    const untried = setup();
    untried.deps.previews.findForChange.mockResolvedValue(null);
    await expect(untried.service.makeLive("maria", "task-1", change)).rejects.toMatchObject({ code: "NOT_TRIED" });
  });

  it("says so when the change got new commits, and records nothing", async () => {
    const { deps, host, service } = setup();
    host.mergePullRequest.mockRejectedValue(new PullRequestMergeError("HEAD_MOVED", "The change got new commits since you looked at it."));

    await expect(service.makeLive("maria", "task-1", change)).rejects.toMatchObject({ code: "HEAD_MOVED", statusCode: 409 });
    expect(deps.outcomes.check).not.toHaveBeenCalled();
    expect(deps.builds.build).not.toHaveBeenCalled();
    expect(deps.audit.record).not.toHaveBeenCalled();
  });

  it("says why when the space's repository can't be used", async () => {
    const { deps, service } = setup();
    deps.repositories.resolve.mockResolvedValue({ unavailable: "The space has no repository" });

    await expect(service.makeLive("maria", "task-1", change)).rejects.toMatchObject({ code: "REPOSITORY_UNAVAILABLE", message: "The space has no repository" });
  });
});
