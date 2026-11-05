import type { AppRecord } from "../../../../persistence/apps/AppDAO";
import type { DataPoint } from "../../../../persistence/apps/AppDataBackupDAO";
import { AppRollbackService } from "../../../../services/apps/AppRollbackService";
import { appRelease } from "../../../helpers/fakeAppHost";

jest.mock("../../../../persistence/config/database", () => ({ __esModule: true, default: {} }));

const OLD = appRelease("old", { wentLiveAt: "2026-11-02T10:00:00.000Z" });
const CURRENT = appRelease("current", { wentLiveAt: "2026-11-03T10:00:00.000Z" });
const APP: AppRecord = { projectId: "space-1", power: "on", state: "running", statusMessage: null, currentReleaseId: CURRENT.id, busySince: null, rollback: null, credentialsExpireAt: null };

function build(release = OLD) {
  const deps = {
    spaces: { findById: jest.fn(async () => ({ projectId: "space-1", slug: "laptops", name: "Laptops", isPrivate: false })) },
    apps: { get: jest.fn(async () => APP), orderRollback: jest.fn(async () => undefined) },
    releases: { getById: jest.fn(async () => release) },
    backups: { dataPointFor: jest.fn(async (): Promise<DataPoint | null> => ({ backupId: "backup-1", releaseId: release.id, takenAt: new Date() })) },
    reconciler: { reconcile: jest.fn(async () => true) },
  };
  return { service: new AppRollbackService(deps.spaces, deps.apps, deps.releases, deps.backups, deps.reconciler), deps };
}

describe("AppRollbackService", () => {
  it("orders a rollback with the release's data and starts it", async () => {
    const { service, deps } = build();

    await service.restore("space-1", OLD.id, { withData: true }, "user-1");

    expect(deps.apps.orderRollback).toHaveBeenCalledWith("space-1", { releaseId: OLD.id, backupId: "backup-1", requestedBy: "user-1" });
    expect(deps.reconciler.reconcile).toHaveBeenCalledWith("space-1");
  });

  it("keeps today's data when only the code goes back", async () => {
    const { service, deps } = build();

    await service.restore("space-1", OLD.id, { withData: false }, "user-1");

    expect(deps.backups.dataPointFor).not.toHaveBeenCalled();
    expect(deps.apps.orderRollback).toHaveBeenCalledWith("space-1", { releaseId: OLD.id, backupId: null, requestedBy: "user-1" });
  });

  it("refuses data it has no copy of", async () => {
    const { service, deps } = build();
    deps.backups.dataPointFor.mockResolvedValueOnce(null);

    await expect(service.restore("space-1", OLD.id, { withData: true }, "user-1")).rejects.toMatchObject({ code: "NO_DATA_POINT" });
    expect(deps.apps.orderRollback).not.toHaveBeenCalled();
  });

  it.each([
    ["the live one", CURRENT],
    ["never live", appRelease("never")],
    ["removed", appRelease("removed", { wentLiveAt: "2026-11-01T10:00:00.000Z", bundleRemoved: true })],
  ])("refuses a release that's %s", async (_what, release) => {
    const { service, deps } = build(release);

    await expect(service.restore("space-1", release.id, { withData: false }, "user-1")).rejects.toMatchObject({ code: "CANNOT_ROLL_BACK" });
    expect(deps.apps.orderRollback).not.toHaveBeenCalled();
  });

  it("refuses another app's release", async () => {
    const { service } = build({ ...OLD, projectId: "space-2" });

    await expect(service.restore("space-1", OLD.id, { withData: false }, "user-1")).rejects.toMatchObject({ code: "NO_SUCH_RELEASE" });
  });
});
