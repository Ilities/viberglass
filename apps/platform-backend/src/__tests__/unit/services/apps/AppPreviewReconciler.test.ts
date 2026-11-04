import type { AppHost } from "@viberglass/types";
import type { AppPreviewChange, AppPreviewRecord } from "../../../../persistence/apps/AppPreviewDAO";
import { AppPreviewReconciler } from "../../../../services/apps/AppPreviewReconciler";
import { NO_APP_HOST } from "../../../../services/apps/AppReconciler";
import { appPreview, appRelease, fakeAppHost } from "../../../helpers/fakeAppHost";

jest.mock("../../../../persistence/config/database", () => ({ __esModule: true, default: {} }));

const NOW = new Date("2026-11-04T12:00:00Z");
const BUILD = appRelease("build-a", { commitSha: "a".repeat(40) });

function build(preview: AppPreviewRecord, options: { release?: typeof BUILD | null; host?: AppHost | null; failure?: string | null } = {}) {
  const host = fakeAppHost();
  const deps = {
    previews: {
      get: jest.fn(async () => preview),
      claim: jest.fn(async () => ({ ...preview, busySince: NOW })),
      update: jest.fn(async () => undefined),
      finish: jest.fn(async (_id: string, _change: AppPreviewChange) => undefined),
    },
    releases: { getById: jest.fn(async () => (options.release === undefined ? BUILD : options.release)) },
    runner: { run: jest.fn(async (): Promise<string | null> => options.failure ?? null) },
  };
  const resolved = options.host === undefined ? host : options.host;
  return { reconciler: new AppPreviewReconciler(deps.previews, deps.releases, () => resolved, deps.runner), host, deps };
}

describe("AppPreviewReconciler", () => {
  it("starts a built change from nothing, so it restores the live data, and notes the commit as tried", async () => {
    const { reconciler, host, deps } = build(appPreview());

    await expect(reconciler.reconcile("pv-1", NOW)).resolves.toBe(true);

    expect(host.delete.mock.invocationCallOrder[0]).toBeLessThan(deps.runner.run.mock.invocationCallOrder[0]!);
    expect(host.delete).toHaveBeenCalledWith("preview-pv-1");
    expect(deps.runner.run).toHaveBeenCalledWith(host, BUILD, { kind: "preview", instance: "preview-pv-1" });
    expect(deps.previews.finish).toHaveBeenCalledWith("pv-1", {
      state: "running",
      statusMessage: null,
      runningReleaseId: BUILD.id,
      startedAt: expect.any(Date),
      triedCommitSha: BUILD.commitSha,
    });
  });

  it("leaves a preview running its build alone, without claiming it", async () => {
    const { reconciler, deps } = build(appPreview({ state: "running", runningReleaseId: BUILD.id }));

    await expect(reconciler.reconcile("pv-1", NOW)).resolves.toBe(false);
    expect(deps.previews.claim).not.toHaveBeenCalled();
  });

  it("waits for a build in progress, then starts the newer commit in place of the one running", async () => {
    const building = build(appPreview({ state: "running", runningReleaseId: "build-old" }), { release: { ...BUILD, status: "building" } });
    await building.reconciler.reconcile("pv-1", NOW);
    expect(building.deps.previews.finish).toHaveBeenCalledWith("pv-1", { state: "building", statusMessage: null });
    expect(building.deps.runner.run).not.toHaveBeenCalled();

    const built = build(appPreview({ state: "building", runningReleaseId: "build-old" }));
    await built.reconciler.reconcile("pv-1", NOW);
    expect(built.deps.runner.run).toHaveBeenCalled();
  });

  it("fails with the build's reason when the build failed", async () => {
    const { reconciler, deps } = build(appPreview(), { release: { ...BUILD, status: "failed", failureReason: "npm ci exited with 1" } });

    await reconciler.reconcile("pv-1", NOW);

    expect(deps.previews.finish).toHaveBeenCalledWith("pv-1", expect.objectContaining({
      state: "failed",
      statusMessage: "The preview's build failed: npm ci exited with 1",
    }));
    expect(deps.runner.run).not.toHaveBeenCalled();
  });

  it("says why when the preview doesn't come up, and stops it", async () => {
    const { reconciler, host, deps } = build(appPreview(), { failure: "The app answered 500 on /healthz" });

    await reconciler.reconcile("pv-1", NOW);

    expect(host.stop).toHaveBeenCalledWith("preview-pv-1", 30);
    expect(deps.previews.finish).toHaveBeenCalledWith("pv-1", { state: "failed", statusMessage: "The app answered 500 on /healthz", runningReleaseId: null });
  });

  it("removes everything a preview had when it's turned off", async () => {
    const { reconciler, host, deps } = build(appPreview({ power: "off", state: "running", runningReleaseId: BUILD.id }));

    await reconciler.reconcile("pv-1", NOW);

    expect(host.delete).toHaveBeenCalledWith("preview-pv-1");
    expect(deps.previews.finish).toHaveBeenCalledWith("pv-1", { state: "off", runningReleaseId: null });
  });

  it("fails without a host to run on", async () => {
    const { reconciler, deps } = build(appPreview(), { host: null });

    await reconciler.reconcile("pv-1", NOW);

    expect(deps.previews.finish).toHaveBeenCalledWith("pv-1", { state: "failed", statusMessage: NO_APP_HOST });
  });
});
