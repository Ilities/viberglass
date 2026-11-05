import type { AppHost, AppRelease } from "@viberglass/types";
import type { AppChange, AppRecord } from "../../../../persistence/apps/AppDAO";
import { AppReconciler, NO_APP_HOST } from "../../../../services/apps/AppReconciler";
import { appRelease, fakeAppHost } from "../../../helpers/fakeAppHost";

jest.mock("../../../../persistence/config/database", () => ({ __esModule: true, default: {} }));

const NOW = new Date("2026-11-03T12:00:00Z");
const OLD = appRelease("old", { createdAt: "2026-11-03T10:00:00.000Z" });
const NEW = appRelease("new", { createdAt: "2026-11-03T11:00:00.000Z" });
const HOUR_MS = 60 * 60 * 1000;
const WEEKLY = { lifetimeMs: 7 * 24 * HOUR_MS, restartHour: 3 };
const expiringIn = (hours: number, from = NOW) => new Date(from.getTime() + hours * HOUR_MS);
const BACK_TO_OLD = { releaseId: OLD.id, backupId: "backup-1", requestedBy: "user-1" };

function record(overrides: Partial<AppRecord> = {}): AppRecord {
  return { projectId: "space-1", power: "on", state: "running", statusMessage: null, currentReleaseId: OLD.id, busySince: null, rollback: null, credentialsExpireAt: null, archiveBackupDue: false, restartDue: false, ...overrides };
}

function build(app: AppRecord | null, options: { candidate?: AppRelease | null; host?: AppHost | null } = {}) {
  const host = fakeAppHost();
  const deps = {
    apps: {
      get: jest.fn(async () => app),
      claim: jest.fn(async () => app && { ...app, busySince: NOW }),
      update: jest.fn(async () => undefined),
      finish: jest.fn(async (_projectId: string, _change: AppChange) => undefined),
      clearRollback: jest.fn(async () => undefined),
      clearRestart: jest.fn(async () => undefined),
    },
    releases: {
      getById: jest.fn(async (id: string) => [OLD, NEW].find((release) => release.id === id) ?? null),
      newestLiveCandidate: jest.fn(async () => (options.candidate === undefined ? OLD : options.candidate)),
      markLiveFailure: jest.fn(async () => undefined),
    },
    runner: { run: jest.fn(async (): Promise<string | null> => null), restart: jest.fn(async (): Promise<string | null> => null) },
    switcher: { switchTo: jest.fn(async (): Promise<AppChange> => ({ state: "running", statusMessage: null, currentReleaseId: NEW.id })) },
    rollbacks: { settle: jest.fn(async () => undefined) },
    finalBackup: { take: jest.fn(async () => undefined) },
  };
  const resolved = options.host === undefined ? host : options.host;
  const reconciler = new AppReconciler(deps.apps, deps.releases, () => resolved, deps.runner, deps.switcher, deps.rollbacks, deps.finalBackup, () => WEEKLY);
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
    expect(host.stop).toHaveBeenCalledWith("app-space-1", 30);
    expect(deps.apps.finish).toHaveBeenCalledWith("space-1", { state: "off", statusMessage: null });
  });

  it("keeps a copy of an archived space's data once its app has stopped", async () => {
    const { reconciler, host, deps } = build(record({ power: "off", archiveBackupDue: true }));

    await expect(reconciler.reconcile("space-1", NOW)).resolves.toBe(true);
    expect(host.stop.mock.invocationCallOrder[0]).toBeLessThan(deps.finalBackup.take.mock.invocationCallOrder[0]);
    expect(deps.apps.finish).toHaveBeenCalledWith("space-1", { state: "off", statusMessage: null });
  });

  it("copies the data of an archived space whose app was already off", async () => {
    const { reconciler, host, deps } = build(record({ power: "off", state: "off", archiveBackupDue: true }));

    await expect(reconciler.reconcile("space-1", NOW)).resolves.toBe(true);
    expect(host.stop).not.toHaveBeenCalled();
    expect(deps.finalBackup.take).toHaveBeenCalledWith(expect.objectContaining({ projectId: "space-1" }));
  });

  it("stops an archived space's app again when its copy failed, so the copy is tried again", async () => {
    const { reconciler, deps } = build(record({ power: "off", archiveBackupDue: true }));
    deps.finalBackup.take.mockRejectedValueOnce(new Error("storage down"));

    await reconciler.reconcile("space-1", NOW);
    expect(deps.apps.finish).toHaveBeenCalledWith("space-1", { state: "failed", statusMessage: "storage down" });
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

  describe("with a rollback asked for", () => {
    const rolledBack = (overrides: Partial<AppRecord> = {}) => record({ currentReleaseId: NEW.id, rollback: BACK_TO_OLD, ...overrides });

    it("switches to the older release with its data, then sets the newer ones aside", async () => {
      const { reconciler, host, deps } = build(rolledBack(), { candidate: NEW });
      deps.switcher.switchTo.mockResolvedValueOnce({ state: "running", statusMessage: null, currentReleaseId: OLD.id });

      await expect(reconciler.reconcile("space-1", NOW)).resolves.toBe(true);
      expect(deps.switcher.switchTo).toHaveBeenCalledWith(host, expect.objectContaining({ currentReleaseId: NEW.id }), OLD, { backupId: "backup-1" });
      expect(deps.rollbacks.settle).toHaveBeenCalledWith(OLD, BACK_TO_OLD);
      expect(deps.apps.finish).toHaveBeenCalledWith("space-1", { state: "running", statusMessage: null, currentReleaseId: OLD.id });
    });

    it("drops the rollback without holding it against the release when it isn't healthy", async () => {
      const { reconciler, deps } = build(rolledBack());
      deps.switcher.switchTo.mockResolvedValueOnce({ state: "running", statusMessage: "Rolling back didn't work" });

      await expect(reconciler.reconcile("space-1", NOW)).resolves.toBe(true);
      expect(deps.apps.clearRollback).toHaveBeenCalledWith("space-1", OLD.id);
      expect(deps.rollbacks.settle).not.toHaveBeenCalled();
      expect(deps.releases.markLiveFailure).not.toHaveBeenCalled();
    });

    it("drops the rollback when its switch throws", async () => {
      const { reconciler, deps } = build(rolledBack());
      deps.switcher.switchTo.mockRejectedValueOnce(new Error("object storage unreachable"));

      await expect(reconciler.reconcile("space-1", NOW)).resolves.toBe(true);
      expect(deps.apps.clearRollback).toHaveBeenCalledWith("space-1", OLD.id);
      expect(deps.releases.markLiveFailure).not.toHaveBeenCalled();
    });

    it("keeps serving the rollback when setting releases aside fails, and tries that again", async () => {
      const { reconciler, deps } = build(rolledBack());
      deps.switcher.switchTo.mockResolvedValueOnce({ state: "running", statusMessage: null, currentReleaseId: OLD.id });
      deps.rollbacks.settle.mockRejectedValueOnce(new Error("database unreachable"));

      await reconciler.reconcile("space-1", NOW);
      expect(deps.apps.finish).toHaveBeenCalledWith("space-1", { state: "running", statusMessage: null, currentReleaseId: OLD.id });

      const again = build(record({ currentReleaseId: OLD.id, rollback: BACK_TO_OLD }), { candidate: NEW });
      await expect(again.reconciler.reconcile("space-1", NOW)).resolves.toBe(true);
      expect(again.deps.rollbacks.settle).toHaveBeenCalledWith(OLD, BACK_TO_OLD);
      expect(again.deps.switcher.switchTo).not.toHaveBeenCalled();
    });

    it("drops a rollback to a release whose bundle was removed", async () => {
      const { reconciler, deps } = build(rolledBack());
      deps.releases.getById.mockImplementation(async (id: string) => (id === OLD.id ? { ...OLD, bundleRemoved: true } : NEW));

      await expect(reconciler.reconcile("space-1", NOW)).resolves.toBe(true);
      expect(deps.apps.clearRollback).toHaveBeenCalledWith("space-1", OLD.id);
      expect(deps.switcher.switchTo).not.toHaveBeenCalled();
    });

    it("waits while the app is off", async () => {
      const { reconciler, deps } = build(rolledBack({ power: "off", state: "off" }));

      await expect(reconciler.reconcile("space-1", NOW)).resolves.toBe(false);
      expect(deps.switcher.switchTo).not.toHaveBeenCalled();
    });
  });

  it("restarts a running app whose credentials are about to run out", async () => {
    const { reconciler, host, deps } = build(record({ credentialsExpireAt: expiringIn(10) }));

    await expect(reconciler.reconcile("space-1", NOW)).resolves.toBe(true);
    expect(deps.runner.restart).toHaveBeenCalledWith(host, OLD);
    expect(deps.apps.finish).toHaveBeenCalledWith("space-1", { state: "running", statusMessage: null });
  });

  it("waits for the restart hour while the credentials have days left", async () => {
    const atNoon = build(record({ credentialsExpireAt: expiringIn(47) }));
    await expect(atNoon.reconciler.reconcile("space-1", NOW)).resolves.toBe(false);

    const threeAm = new Date("2026-11-04T03:10:00Z");
    const atThree = build(record({ credentialsExpireAt: expiringIn(47, threeAm) }));
    await expect(atThree.reconciler.reconcile("space-1", threeAm)).resolves.toBe(true);
    expect(atThree.deps.runner.restart).toHaveBeenCalled();

    const fresh = build(record({ credentialsExpireAt: expiringIn(6 * 24, threeAm) }));
    await expect(fresh.reconciler.reconcile("space-1", threeAm)).resolves.toBe(false);
  });

  it("leaves apps on ECS alone, whose task role keeps their credentials fresh", async () => {
    const threeAm = new Date("2026-11-04T03:10:00Z");
    const { reconciler, deps } = build(record({ credentialsExpireAt: null }), { host: { ...fakeAppHost(), target: "ecs" } });

    await expect(reconciler.reconcile("space-1", threeAm)).resolves.toBe(false);
    expect(deps.runner.restart).not.toHaveBeenCalled();
  });

  it("restarts an app started before credential expiry was recorded once, in the restart hour", async () => {
    const atNoon = build(record({ credentialsExpireAt: null }));
    await expect(atNoon.reconciler.reconcile("space-1", NOW)).resolves.toBe(false);

    const threeAm = new Date("2026-11-04T03:10:00Z");
    const atThree = build(record({ credentialsExpireAt: null }));
    await expect(atThree.reconciler.reconcile("space-1", threeAm)).resolves.toBe(true);
    expect(atThree.deps.runner.restart).toHaveBeenCalled();
  });

  it("keeps an app running on its credentials when new ones can't be issued", async () => {
    const { reconciler, deps } = build(record({ credentialsExpireAt: expiringIn(1) }));
    deps.runner.restart.mockRejectedValue(new Error("STS is down"));

    await expect(reconciler.reconcile("space-1", NOW)).resolves.toBe(true);
    expect(deps.apps.finish).toHaveBeenCalledWith("space-1", {
      statusMessage: "Couldn't restart the app, so it keeps running as it was for now: STS is down",
    });
  });

  it("restarts a running app whose settings changed, clearing the request when it claims the app", async () => {
    const { reconciler, host, deps } = build(record({ restartDue: true, credentialsExpireAt: expiringIn(6 * 24) }));

    await expect(reconciler.reconcile("space-1", NOW)).resolves.toBe(true);
    expect(deps.apps.clearRestart).toHaveBeenCalledWith("space-1");
    expect(deps.apps.clearRestart.mock.invocationCallOrder[0]).toBeLessThan(deps.runner.restart.mock.invocationCallOrder[0]);
    expect(deps.runner.restart).toHaveBeenCalledWith(host, OLD);
  });

  it("starts an app that's off with its new settings, without a separate restart", async () => {
    const { reconciler, deps } = build(record({ state: "off", restartDue: true }));

    await expect(reconciler.reconcile("space-1", NOW)).resolves.toBe(true);
    expect(deps.runner.run).toHaveBeenCalled();
    expect(deps.runner.restart).not.toHaveBeenCalled();
  });

  it("records a restart that didn't come up healthy as failed", async () => {
    const { reconciler, deps } = build(record({ credentialsExpireAt: expiringIn(1) }));
    deps.runner.restart.mockResolvedValue("The app answered 500 on /healthz within 120 seconds");

    await reconciler.reconcile("space-1", NOW);
    expect(deps.apps.finish).toHaveBeenCalledWith("space-1", { state: "failed", statusMessage: "The app answered 500 on /healthz within 120 seconds" });
  });

  it("switches to a newer release rather than restarting the current one", async () => {
    const { reconciler, deps } = build(record({ credentialsExpireAt: expiringIn(1) }), { candidate: NEW });

    await reconciler.reconcile("space-1", NOW);
    expect(deps.switcher.switchTo).toHaveBeenCalled();
    expect(deps.runner.restart).not.toHaveBeenCalled();
  });
});
