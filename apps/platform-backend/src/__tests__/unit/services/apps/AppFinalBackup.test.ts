import type { AppRecord } from "../../../../persistence/apps/AppDAO";
import { AppFinalBackup } from "../../../../services/apps/AppFinalBackup";

jest.mock("../../../../persistence/config/database", () => ({ __esModule: true, default: {} }));

const APP: AppRecord = { projectId: "space-1", power: "off", state: "off", statusMessage: null, currentReleaseId: "r1", busySince: null, rollback: null, credentialsExpireAt: null, archiveBackupDue: true };

describe("AppFinalBackup", () => {
  it("copies the replica as the current release's data, then clears what was owed", async () => {
    const data = { backup: jest.fn(async (_projectId: string, _backupId: string) => ({ objects: 3, bytes: 900 })) };
    const backups = { create: jest.fn(async () => undefined) };
    const apps = { clearArchiveBackup: jest.fn(async () => undefined) };

    await new AppFinalBackup(data, backups, apps).take(APP);

    const id = data.backup.mock.calls[0][1];
    expect(data.backup).toHaveBeenCalledWith("space-1", id);
    expect(backups.create).toHaveBeenCalledWith({ id, projectId: "space-1", reason: "archive", releaseId: null, fromReleaseId: "r1", objects: 3, bytes: 900 });
    expect(apps.clearArchiveBackup).toHaveBeenCalledWith("space-1");
  });

  it("still owes the copy when storage fails", async () => {
    const apps = { clearArchiveBackup: jest.fn(async () => undefined) };
    const backup = new AppFinalBackup({ backup: jest.fn(async () => Promise.reject(new Error("storage down"))) }, { create: jest.fn() }, apps);

    await expect(backup.take(APP)).rejects.toThrow("storage down");
    expect(apps.clearArchiveBackup).not.toHaveBeenCalled();
  });
});
