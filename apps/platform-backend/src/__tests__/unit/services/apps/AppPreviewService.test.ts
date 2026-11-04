import type { ProjectScmConfig } from "@viberglass/types";
import { AppPreviewService, newPreviewAddress } from "../../../../services/apps/AppPreviewService";
import { appPreview, appRelease } from "../../../helpers/fakeAppHost";

jest.mock("../../../../persistence/config/database", () => ({ __esModule: true, default: {} }));

const URL_3 = "https://github.com/acme/laptops/pull/3";
const HEAD = "a".repeat(40);
const SCM = { projectId: "space-1", sourceRepository: "https://github.com/acme/laptops", baseBranch: "main" } as ProjectScmConfig;
const BUILD = appRelease("build-a", { commitSha: HEAD, status: "building" });

function setup(options: { canPost?: boolean; backingKind?: "app" | "git"; existingBuild?: typeof BUILD | null; existingPreview?: boolean } = {}) {
  const deps = {
    policy: { describe: jest.fn().mockResolvedValue({ canPost: options.canPost ?? true }) },
    owners: { projectIdForTask: jest.fn().mockResolvedValue("space-1") },
    tickets: { getSummary: jest.fn().mockResolvedValue({ backingKind: options.backingKind ?? "app" }) },
    pullRequests: { listForTask: jest.fn().mockResolvedValue([{ url: URL_3 }]) },
    scmConfigs: { getByProjectId: jest.fn().mockResolvedValue(SCM) },
    releases: { findPreviewBuild: jest.fn().mockResolvedValue(options.existingBuild ?? null), delete: jest.fn() },
    builds: { build: jest.fn().mockResolvedValue(BUILD) },
    previews: {
      findForChange: jest.fn().mockResolvedValue(options.existingPreview ? appPreview() : null),
      create: jest.fn().mockResolvedValue(appPreview()),
      request: jest.fn(),
      listForTask: jest.fn().mockResolvedValue([appPreview()]),
    },
    reconciler: { reconcile: jest.fn().mockResolvedValue(true) },
    origins: { originFor: (label: string) => `https://${label}.apps.example.com` },
  };
  return { deps, service: new AppPreviewService(deps) };
}

const change = { pullRequestUrl: URL_3, headSha: HEAD };

describe("AppPreviewService", () => {
  it("builds the change's commit for a new preview and turns it on", async () => {
    const { deps, service } = setup();

    const preview = await service.tryChange("maria", "task-1", change);

    expect(deps.builds.build).toHaveBeenCalledWith(SCM, HEAD, { preview: true });
    expect(deps.previews.create).toHaveBeenCalledWith(expect.objectContaining({
      address: expect.stringMatching(/^preview-[a-z2-7]{8}$/),
      projectId: "space-1",
      ticketId: "task-1",
      pullRequestUrl: URL_3,
      releaseId: BUILD.id,
    }));
    expect(deps.previews.request).toHaveBeenCalledWith("pv-1", { commitSha: HEAD, releaseId: BUILD.id });
    expect(deps.reconciler.reconcile).toHaveBeenCalledWith("pv-1");
    expect(preview.url).toBe("https://preview-abcd2345.apps.example.com");
  });

  it("reuses a build of the same commit, and builds one that failed again", async () => {
    const built = setup({ existingBuild: { ...BUILD, status: "ready" }, existingPreview: true });
    await built.service.tryChange("maria", "task-1", change);
    expect(built.deps.builds.build).not.toHaveBeenCalled();
    expect(built.deps.previews.create).not.toHaveBeenCalled();

    const failed = setup({ existingBuild: { ...BUILD, status: "failed" } });
    await failed.service.tryChange("maria", "task-1", change);
    expect(failed.deps.releases.delete).toHaveBeenCalledWith(BUILD.id);
    expect(failed.deps.builds.build).toHaveBeenCalled();
  });

  it("refuses viewers, tasks outside App spaces and pull requests that aren't the task's", async () => {
    await expect(setup({ canPost: false }).service.tryChange("v", "task-1", change)).rejects.toMatchObject({ code: "NOT_ALLOWED" });
    await expect(setup({ backingKind: "git" }).service.tryChange("m", "task-1", change)).rejects.toMatchObject({ code: "NOT_AN_APP_SPACE" });
    await expect(setup().service.tryChange("m", "task-1", { ...change, pullRequestUrl: "https://github.com/acme/x/pull/9" })).rejects.toMatchObject({
      code: "NO_SUCH_CHANGE",
    });
  });

  it("makes addresses that are host labels and can't be an App space's", () => {
    expect(newPreviewAddress()).toMatch(/^preview-[a-z2-7]{8}$/);
  });
});
