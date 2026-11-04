import type { AppRelease, ProjectScmConfig } from "@viberglass/types";
import { AppBuilderUnavailable } from "../../../../services/apps/AppBuilderRunner";
import { AppReleasePoller } from "../../../../services/apps/AppReleasePoller";
import type { ProjectRepository } from "../../../../services/repositories/ProjectRepositoryResolver";
import { fakeRepositoryHost } from "../../../helpers/fakeRepositoryHost";

jest.mock("../../../../persistence/config/database", () => ({ __esModule: true, default: {} }));

const HEAD = "f".repeat(40);
const NOW = new Date("2026-11-03T12:00:00Z");

function scm(projectId: string): ProjectScmConfig {
  return { projectId, integrationId: "integration-1", integrationSystem: "github", sourceRepository: `https://github.com/acme/${projectId}`, baseBranch: "main", createdAt: "", updatedAt: "" };
}

function release(projectId: string, commitSha: string): AppRelease {
  return {
    id: `release-${projectId}`,
    projectId,
    commitSha,
    status: "building",
    jobId: null,
    bundleSha256: null,
    bundleBytes: null,
    nodeVersion: null,
    buildLog: null,
    failureReason: null,
    wentLiveAt: null,
    liveFailure: null,
    ticketId: null,
    createdAt: "",
    finishedAt: null,
  };
}

function build(options: { spaces?: string[]; known?: boolean; head?: string | null } = {}) {
  const host = fakeRepositoryHost();
  host.parseRepository.mockImplementation((url: string) => ({ fullName: url.replace("https://github.com/", ""), url }));
  host.fetchBranchHead.mockResolvedValue(options.head === undefined ? HEAD : options.head);
  const deps = {
    spaces: { listLiveIds: jest.fn(async () => options.spaces ?? ["laptops"]) },
    scmConfigs: { getByProjectId: jest.fn(async (projectId: string): Promise<ProjectScmConfig | null> => scm(projectId)) },
    repositories: { resolve: jest.fn(async (): Promise<ProjectRepository> => ({ host, token: "tok" })) },
    releases: { hasCommit: jest.fn(async () => options.known ?? false), failAbandoned: jest.fn(async () => 0) },
    builds: { build: jest.fn(async (config: ProjectScmConfig, commitSha: string): Promise<AppRelease | null> => release(config.projectId, commitSha)) },
  };
  return { poller: new AppReleasePoller(deps.spaces, deps.scmConfigs, deps.repositories, deps.releases, deps.builds), deps, host };
}

describe("AppReleasePoller", () => {
  it("builds a branch head that has no release yet", async () => {
    const { poller, deps, host } = build();

    await expect(poller.sweep(NOW)).resolves.toBe(1);
    expect(host.fetchBranchHead).toHaveBeenCalledWith({ fullName: "acme/laptops", url: "https://github.com/acme/laptops" }, "main", "tok");
    expect(deps.builds.build).toHaveBeenCalledWith(scm("laptops"), HEAD);
  });

  it("leaves a head that already has a release", async () => {
    const { poller, deps } = build({ known: true });

    await expect(poller.sweep(NOW)).resolves.toBe(0);
    expect(deps.builds.build).not.toHaveBeenCalled();
  });

  it("waits for the first commit of an empty repository", async () => {
    const { poller, deps } = build({ head: null });

    await poller.sweep(NOW);
    expect(deps.builds.build).not.toHaveBeenCalled();
  });

  it("fails builds that stopped without reporting, giving new ones ten minutes to start", async () => {
    const { poller, deps } = build({ spaces: [] });
    deps.releases.failAbandoned.mockResolvedValue(2);

    await expect(poller.sweep(NOW)).resolves.toBe(2);
    expect(deps.releases.failAbandoned).toHaveBeenCalledWith(new Date("2026-11-03T11:50:00Z"));
  });

  it("goes on to the next space when one can't be read", async () => {
    const { poller, deps } = build({ spaces: ["broken", "laptops"] });
    deps.repositories.resolve.mockResolvedValueOnce({ unavailable: "The space's repository connection has no token" });

    await expect(poller.sweep(NOW)).resolves.toBe(1);
    expect(deps.builds.build).toHaveBeenCalledWith(scm("laptops"), HEAD);
  });

  it("stops for this sweep while the app builder isn't ready", async () => {
    const { poller, deps } = build({ spaces: ["laptops", "invoices"] });
    deps.builds.build.mockRejectedValueOnce(new AppBuilderUnavailable("The app builder is starting"));

    await expect(poller.sweep(NOW)).resolves.toBe(0);
    expect(deps.builds.build).toHaveBeenCalledTimes(1);
  });
});
