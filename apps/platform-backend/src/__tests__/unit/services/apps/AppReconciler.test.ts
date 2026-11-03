import type { AppHost, AppRelease } from "@viberglass/types";
import type { AppChange, AppRecord } from "../../../../persistence/apps/AppDAO";
import { AppReconciler, NO_APP_HOST } from "../../../../services/apps/AppReconciler";
import { appRelease, fakeAppHost } from "../../../helpers/fakeAppHost";

jest.mock("../../../../persistence/config/database", () => ({ __esModule: true, default: {} }));

const NOW = new Date("2026-11-03T12:00:00Z");
const OLD = appRelease("old", { createdAt: "2026-11-03T10:00:00.000Z" });
const NEW = appRelease("new", { createdAt: "2026-11-03T11:00:00.000Z" });

function record(overrides: Partial<AppRecord> = {}): AppRecord {
  return { projectId: "space-1", power: "on", state: "running", statusMessage: null, currentReleaseId: OLD.id, busySince: null, ...overrides };
}

function build(app: AppRecord | null, options: { candidate?: AppRelease | null; host?: AppHost | null } = {}) {
  const host = fakeAppHost();
  const deps = {
    apps: {
      get: jest.fn(async () => app),
      claim: jest.fn(async () => app && { ...app, busySince: NOW }),
      update: jest.fn(async () => undefined),
      finish: jest.fn(async (_projectId: string, _change: AppChange) => undefined),
    },
    releases: {
      getById: jest.fn(async (id: string) => [OLD, NEW].find((release) => release.id === id) ?? null),
      newestLiveCandidate: jest.fn(async () => (options.candidate === undefined ? OLD : options.candidate)),
      markLiveFailure: jest.fn(async () => undefined),
    },
    runner: { run: jest.fn(async (): Promise<string | null> => null) },
    switcher: { switchTo: jest.fn(async (): Promise<AppChange> => ({ state: "running", statusMessage: null, currentReleaseId: NEW.id })) },
  };
  const resolved = options.host === undefined ? host : options.host;
  const reconciler = new AppReconciler(deps.apps, deps.releases, () => resolved, deps.runner, deps.switcher);
  return { reconciler, host, deps };
}

describe("AppReconciler", () => {
  it("leaves a running app on its newest release alone, without claiming it", async () => {
    const { reconciler, deps } = build(record());

    await expect(reconciler.reconcile("space-1", NOW)).resolves.toBe(false);
    expect(deps.apps.claim).not.toHaveBeenCalled();
  });

  it("switches an app that's on to a newer release", async () => {
    const { reconciler, host, deps } = build(record(), { candidate: NEW });

    await expect(reconciler.reconcile("space-1", NOW)).resolves.toBe(true);
    expect(deps.switcher.switchTo).toHaveBeenCalledWith(host, { ...record(), busySince: NOW }, NEW);
    expect(deps.apps.finish).toHaveBeenCalledWith("space-1", { state: "running", statusMessage: null, currentReleaseId: NEW.id });
  });

  it("switches an app without a release to its first one", async () => {
    const { reconciler, deps } = build(record({ currentReleaseId: null, state: "off" }), { candidate: OLD });

    await expect(reconciler.reconcile("space-1", NOW)).resolves.toBe(true);
    expect(deps.switcher.switchTo).toHaveBeenCalledWith(expect.anything(), expect.anything(), OLD);
  });

  it("doesn't go back to an older release than the current one", async () => {
    const { reconciler, deps } = build(record({ currentReleaseId: NEW.id }), { candidate: OLD });

    await expect(reconciler.reconcile("space-1", NOW)).resolves.toBe(false);
    expect(deps.switcher.switchTo).not.toHaveBeenCalled();
  });

  it("starts the current release of an app turned on", async () => {
    const { reconciler, host, deps } = build(record({ state: "off" }));

    await expect(reconciler.reconcile("space-1", NOW)).resolves.toBe(true);
    expect(deps.apps.update).toHaveBeenCalledWith("space-1", { state: "starting" });
    expect(deps.runner.run).toHaveBeenCalledWith(host, OLD);
    expect(deps.apps.finish).toHaveBeenCalledWith("space-1", { state: "running", statusMessage: null });
  });

  it("doesn't keep restarting an app that failed to start", async () => {
    const { reconciler, deps } = build(record({ state: "failed" }));

    await expect(reconciler.reconcile("space-1", NOW)).resolves.toBe(false);
    expect(deps.runner.run).not.toHaveBeenCalled();
  });

  it("stops an app turned off", async () => {
    const { reconciler, host, deps } = build(record({ power: "off" }));

    await expect(reconciler.reconcile("space-1", NOW)).resolves.toBe(true);
    expect(host.stop).toHaveBeenCalledWith("space-1", 30);
    expect(deps.apps.finish).toHaveBeenCalledWith("space-1", { state: "off", statusMessage: null });
  });

  it("leaves an app alone while another start or stop is under way", async () => {
    const { reconciler, deps } = build(record({ state: "off", busySince: new Date(NOW.getTime() - 60_000) }));

    await expect(reconciler.reconcile("space-1", NOW)).resolves.toBe(false);
    expect(deps.apps.claim).not.toHaveBeenCalled();
  });

  it("takes over an app whose start was abandoned long ago", async () => {
    const { reconciler, deps } = build(record({ state: "starting", busySince: new Date(NOW.getTime() - 60 * 60_000) }));

    await expect(reconciler.reconcile("space-1", NOW)).resolves.toBe(true);
    expect(deps.apps.claim).toHaveBeenCalledWith("space-1", new Date(NOW.getTime() - 15 * 60_000));
    expect(deps.runner.run).toHaveBeenCalled();
  });

  it("does nothing when another process claimed the app first", async () => {
    const { reconciler, deps } = build(record({ state: "off" }));
    deps.apps.claim.mockResolvedValueOnce(null);

    await expect(reconciler.reconcile("space-1", NOW)).resolves.toBe(false);
    expect(deps.runner.run).not.toHaveBeenCalled();
    expect(deps.apps.finish).not.toHaveBeenCalled();
  });

  it("fails the app once, and doesn't retry, when nothing can run apps here", async () => {
    const first = build(record({ state: "off" }), { host: null });
    await expect(first.reconciler.reconcile("space-1", NOW)).resolves.toBe(true);
    expect(first.deps.apps.finish).toHaveBeenCalledWith("space-1", { state: "failed", statusMessage: NO_APP_HOST });

    const again = build(record({ state: "failed" }), { host: null, candidate: NEW });
    await expect(again.reconciler.reconcile("space-1", NOW)).resolves.toBe(false);
  });

  it("gives up on a release whose switch throws, so the next sweep doesn't retry it", async () => {
    const { reconciler, deps } = build(record(), { candidate: NEW });
    deps.switcher.switchTo.mockRejectedValueOnce(new Error("object storage unreachable"));

    await expect(reconciler.reconcile("space-1", NOW)).resolves.toBe(true);
    expect(deps.releases.markLiveFailure).toHaveBeenCalledWith(NEW.id, "object storage unreachable");
    expect(deps.apps.finish).toHaveBeenCalledWith("space-1", { state: "failed", statusMessage: "object storage unreachable" });
  });
});
