import type { AppRecord } from "../../../../persistence/apps/AppDAO";
import { AppBackupService } from "../../../../services/apps/AppBackupService";

jest.mock("../../../../persistence/config/database", () => ({ __esModule: true, default: {} }));

const APP: AppRecord = { projectId: "space-1", power: "on", state: "running", statusMessage: null, currentReleaseId: "r1", busySince: null, rollback: null, credentialsExpireAt: null, archiveBackupDue: false, restartDue: false, dataRestore: null, backupDue: false };

function build(options: { app?: AppRecord | null; backupSpace?: string } = {}) {
  const deps = {
    spaces: { findById: jest.fn(async (id: string) => (id === "space-1" ? { projectId: id, slug: "laptops", name: "Laptops", isPrivate: false } : null)) },
    apps: { get: jest.fn(async () => (options.app === undefined ? APP : options.app)) },
    backups: {
      list: jest.fn(async () => []),
      getById: jest.fn(async (id: string) => ({ id, projectId: options.backupSpace ?? "space-1" })),
    },
    orders: { requestBackup: jest.fn(async () => undefined), orderRestore: jest.fn(async () => true) },
    reconciler: { reconcile: jest.fn(async () => true) },
  };
  return { service: new AppBackupService(deps.spaces, deps.apps, deps.backups, deps.orders, deps.reconciler), deps };
}

describe("AppBackupService", () => {
  it("records a backup asked for and lets the reconciler take it", async () => {
    const { service, deps } = build();

    await service.requestBackup("space-1");

    expect(deps.orders.requestBackup).toHaveBeenCalledWith("space-1");
    expect(deps.reconciler.reconcile).toHaveBeenCalledWith("space-1");
  });

  it("has nothing to back up before the app's first release", async () => {
    const { service, deps } = build({ app: null });

    await expect(service.requestBackup("space-1")).rejects.toMatchObject({ code: "NO_DATA" });
    expect(deps.orders.requestBackup).not.toHaveBeenCalled();
  });

  it("orders a restore of one of the app's own backups for a scheduled run", async () => {
    const { service, deps } = build();

    await expect(service.orderRestore("space-1", "backup-1", "execution-1")).resolves.toBe(true);

    expect(deps.orders.orderRestore).toHaveBeenCalledWith("space-1", { backupId: "backup-1", executionId: "execution-1" });
    expect(deps.reconciler.reconcile).toHaveBeenCalledWith("space-1");
  });

  it("refuses another app's backup", async () => {
    const { service, deps } = build({ backupSpace: "space-2" });

    await expect(service.orderRestore("space-1", "backup-1", "execution-1")).rejects.toThrow("The backup to restore is gone.");
    expect(deps.orders.orderRestore).not.toHaveBeenCalled();
  });

  it("doesn't wake the reconciler for a restore that waits behind another", async () => {
    const { service, deps } = build();
    deps.orders.orderRestore.mockResolvedValueOnce(false);

    await expect(service.orderRestore("space-1", "backup-1", "execution-1")).resolves.toBe(false);
    expect(deps.reconciler.reconcile).not.toHaveBeenCalled();
  });

  it("refuses spaces without an app", async () => {
    const { service } = build();

    await expect(service.list("space-9")).rejects.toMatchObject({ code: "NOT_AN_APP_SPACE" });
  });
});
