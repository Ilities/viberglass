import type { AppRelease } from "@viberglass/types";
import type { AppRecord } from "../../../../persistence/apps/AppDAO";
import { AppDataMaintenance } from "../../../../services/apps/AppDataMaintenance";
import { appRelease, fakeAppHost } from "../../../helpers/fakeAppHost";

jest.mock("../../../../persistence/config/database", () => ({ __esModule: true, default: {} }));

const LIVE = appRelease("live");
const ORDER = { backupId: "backup-1", executionId: "execution-1" };

function app(overrides: Partial<AppRecord> = {}): AppRecord {
  return { projectId: "space-1", power: "on", state: "running", statusMessage: null, currentReleaseId: LIVE.id, busySince: new Date(), rollback: null, credentialsExpireAt: null, archiveBackupDue: false, restartDue: false, dataRestore: ORDER, backupDue: false, ...overrides };
}

function build(startFailure: string | null = null) {
  const steps: string[] = [];
  const host = fakeAppHost();
  host.stop.mockImplementation(async () => void steps.push("stop"));
  host.clearData.mockImplementation(async () => void steps.push("clearData"));
  const deps = {
    apps: { update: jest.fn(async () => undefined) },
    orders: { clearBackup: jest.fn(async () => undefined), clearRestore: jest.fn(async () => void steps.push("clearRestore")) },
    releases: { getById: jest.fn(async (id: string) => (id === LIVE.id ? LIVE : null)) },
    backups: { create: jest.fn(async () => undefined) },
    data: {
      backup: jest.fn(async () => {
        steps.push("backup");
        return { objects: 2, bytes: 200 };
      }),
      restore: jest.fn(async () => {
        steps.push("restore");
        return { objects: 2, bytes: 200 };
      }),
    },
    runner: {
      run: jest.fn(async (_host: unknown, release: AppRelease) => {
        steps.push(`run ${release.id}`);
        return startFailure;
      }),
    },
    reporter: { finish: jest.fn(async () => void steps.push("report")) },
  };
  const maintenance = new AppDataMaintenance(deps.apps, deps.orders, deps.releases, deps.backups, deps.data, deps.runner, deps.reporter);
  return { maintenance, host, deps, steps };
}

describe("AppDataMaintenance.restore", () => {
  it("stops a running app, puts the backup in place of its data and its local copy, and starts the same release", async () => {
    const { maintenance, host, deps, steps } = build();

    await expect(maintenance.restore(host, app(), ORDER)).resolves.toEqual({ state: "running", statusMessage: null });

    expect(steps).toEqual(["stop", "restore", "clearData", `run ${LIVE.id}`, "clearRestore", "report"]);
    expect(deps.data.restore).toHaveBeenCalledWith("space-1", "backup-1");
    expect(deps.data.backup).not.toHaveBeenCalled();
    expect(deps.reporter.finish).toHaveBeenCalledWith("execution-1", null);
  });

  it("leaves an app that's off off, with the restored data", async () => {
    const { maintenance, host, deps, steps } = build();

    await expect(maintenance.restore(host, app({ power: "off", state: "off" }), ORDER)).resolves.toEqual({});

    expect(steps).toEqual(["stop", "restore", "clearData", "clearRestore", "report"]);
    expect(deps.apps.update).not.toHaveBeenCalled();
  });

  it("fails the scheduled run when the app doesn't start again", async () => {
    const { maintenance, host, deps } = build("The app answered 500 on /healthz");

    await expect(maintenance.restore(host, app(), ORDER)).resolves.toEqual({ state: "failed", statusMessage: "The app answered 500 on /healthz" });
    expect(deps.reporter.finish).toHaveBeenCalledWith("execution-1", "The app answered 500 on /healthz");
  });

  it("clears the order and fails the run when the copy fails, so it isn't tried every sweep", async () => {
    const { maintenance, host, deps } = build();
    deps.data.restore.mockRejectedValueOnce(new Error("storage down"));

    await expect(maintenance.restore(host, app(), ORDER)).rejects.toThrow("Couldn't restore the app's data: storage down");
    expect(deps.orders.clearRestore).toHaveBeenCalledWith("space-1", "backup-1");
    expect(deps.reporter.finish).toHaveBeenCalledWith("execution-1", "Couldn't restore the app's data: storage down");
    expect(deps.runner.run).not.toHaveBeenCalled();
  });

  it("reports nothing for a restore whose run was deleted", async () => {
    const { maintenance, host, deps } = build();

    await maintenance.restore(host, app(), { backupId: "backup-1", executionId: null });
    expect(deps.reporter.finish).not.toHaveBeenCalled();
  });
});

describe("AppDataMaintenance.backUp", () => {
  it("copies the data of a stopped app as a backup taken by hand and starts it again", async () => {
    const { maintenance, host, deps, steps } = build();

    await expect(maintenance.backUp(host, app({ backupDue: true }))).resolves.toEqual({ state: "running", statusMessage: null });

    expect(steps).toEqual(["stop", "backup", `run ${LIVE.id}`]);
    expect(deps.orders.clearBackup).toHaveBeenCalledWith("space-1");
    expect(deps.backups.create).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: "space-1", reason: "manual", releaseId: null, fromReleaseId: LIVE.id, objects: 2, bytes: 200 }),
    );
  });

  it("starts the app again with its data as it was when the copy fails, and says so", async () => {
    const { maintenance, host, deps } = build();
    deps.data.backup.mockRejectedValueOnce(new Error("storage down"));

    await expect(maintenance.backUp(host, app())).resolves.toEqual({ state: "running", statusMessage: "Couldn't back up the app's data: storage down" });
    expect(deps.runner.run).toHaveBeenCalled();
  });

  it("copies the data without a host, where nothing can be running", async () => {
    const { maintenance, deps } = build();

    await expect(maintenance.backUp(null, app({ state: "off" }))).resolves.toEqual({});
    expect(deps.backups.create).toHaveBeenCalled();
    expect(deps.runner.run).not.toHaveBeenCalled();
  });
});
