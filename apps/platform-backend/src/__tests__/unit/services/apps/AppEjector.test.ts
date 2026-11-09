import type { AppRecord } from "../../../../persistence/apps/AppDAO";
import type { AppDataGrantRecord } from "../../../../persistence/apps/AppDataGrantDAO";
import type { AppSpaceRef } from "../../../../persistence/apps/AppSpaceDAO";
import { AppEjector } from "../../../../services/apps/AppEjector";
import { AppSpaceError } from "../../../../services/apps/AppSpaceError";
import { fakeAppHost } from "../../../helpers/fakeAppHost";

jest.mock("../../../../persistence/config/database", () => ({ __esModule: true, default: {} }));

const NOW = new Date("2026-11-05T12:00:00Z");
const APP: AppRecord = { projectId: "space-1", power: "on", state: "running", statusMessage: null, currentReleaseId: "r1", busySince: null, rollback: null, credentialsExpireAt: null, archiveBackupDue: false, restartDue: false, dataRestore: null, backupDue: false };
const SPACE: AppSpaceRef = { projectId: "space-1", slug: "laptops", name: "Laptops", isPrivate: false };
const GRANT: AppDataGrantRecord = { id: "g-1", projectId: "space-1", ticketId: "t-1", grantedBy: "u-1", copiedAt: NOW, objectKey: "spaces/space-1/data-grants/g-1/app.db", bytes: 10, turnId: null, takenAt: null };

function build(options: { app?: AppRecord | null } = {}) {
  const host = fakeAppHost();
  const release = jest.fn(async () => undefined);
  const deps = {
    spaces: { findById: jest.fn(async (): Promise<AppSpaceRef | null> => SPACE) },
    claims: { claimAll: jest.fn(async () => ({ previewIds: ["pv-1"], release })) },
    apps: { get: jest.fn(async () => (options.app === undefined ? APP : options.app)), update: jest.fn(async () => undefined) },
    host: () => host,
    data: { backup: jest.fn(async (_projectId: string, _backupId: string) => ({ objects: 3, bytes: 300 })) },
    backups: { create: jest.fn(async () => undefined) },
    copier: { copy: jest.fn(async () => ({ bytes: 4096, copiedAt: NOW })), remove: jest.fn(async () => undefined) },
    settings: {
      list: jest.fn(async () => [
        { projectId: "space-1", name: "SLACK_CHANNEL", value: "#laptops", secretId: null, forPreviews: false, updatedAt: NOW },
        { projectId: "space-1", name: "SLACK_TOKEN", value: null, secretId: "sec-1", forPreviews: false, updatedAt: NOW },
      ]),
    },
    secrets: { deleteSecret: jest.fn(async () => true) },
    grants: { listUntakenForProject: jest.fn(async () => [GRANT]) },
    backing: { makeGit: jest.fn(async () => undefined) },
    refreshSchedules: jest.fn(async () => undefined),
  };
  return { ejector: new AppEjector(deps), deps, host, release };
}

describe("AppEjector", () => {
  it("stops the app, keeps a backup and a copy, removes what only an app has, then switches the space", async () => {
    const { ejector, deps, host } = build();

    await expect(ejector.eject("space-1", NOW)).resolves.toEqual({ ejectedAt: NOW, copyBytes: 4096 });

    expect(deps.apps.update).toHaveBeenCalledWith("space-1", { power: "off", state: "stopping" });
    expect(host.stop).toHaveBeenCalledWith("app-space-1", 30);
    const backupId = deps.data.backup.mock.calls[0][1];
    expect(deps.backups.create).toHaveBeenCalledWith({ id: backupId, projectId: "space-1", reason: "eject", releaseId: null, fromReleaseId: "r1", objects: 3, bytes: 300 });
    expect(deps.copier.copy).toHaveBeenCalledWith("space-1", `spaces/space-1/ejected/${backupId}/app.db`);
    expect(host.stop.mock.invocationCallOrder[0]).toBeLessThan(deps.data.backup.mock.invocationCallOrder[0]);
    expect(host.delete.mock.calls).toEqual([["preview-pv-1"], ["app-space-1"]]);
    expect(host.forgetSpace).toHaveBeenCalledWith("space-1");
    expect(deps.secrets.deleteSecret.mock.calls).toEqual([["sec-1"]]);
    expect(deps.copier.remove).toHaveBeenCalledWith(GRANT.objectKey);
    expect(deps.backing.makeGit).toHaveBeenCalledWith("space-1", { backupId, copyBytes: 4096 }, NOW);
    expect(deps.refreshSchedules).toHaveBeenCalled();
  });

  it("keeps no data for an app that never served a release", async () => {
    const { ejector, deps } = build({ app: { ...APP, currentReleaseId: null } });

    await ejector.eject("space-1", NOW);

    expect(deps.data.backup).not.toHaveBeenCalled();
    expect(deps.backing.makeGit).toHaveBeenCalledWith("space-1", { backupId: null, copyBytes: null }, NOW);
  });

  it("keeps the backup without a copy when the app had no data", async () => {
    const { ejector, deps } = build();
    deps.copier.copy.mockRejectedValue(new AppSpaceError("NO_DATA", "The app has no data yet."));

    await expect(ejector.eject("space-1", NOW)).resolves.toEqual({ ejectedAt: NOW, copyBytes: null });
    expect(deps.backing.makeGit).toHaveBeenCalledWith("space-1", expect.objectContaining({ copyBytes: null }), NOW);
  });

  it("leaves the space an App space and lets go of its claims when a step fails", async () => {
    const { ejector, deps, release } = build();
    deps.data.backup.mockRejectedValue(new Error("storage unreachable"));

    await expect(ejector.eject("space-1", NOW)).rejects.toThrow("storage unreachable");
    expect(release).toHaveBeenCalled();
    expect(deps.backing.makeGit).not.toHaveBeenCalled();
  });

  it("refuses a space without an app before claiming anything", async () => {
    const { ejector, deps } = build();
    deps.spaces.findById.mockResolvedValue(null);

    await expect(ejector.eject("space-1", NOW)).rejects.toMatchObject({ code: "NOT_AN_APP_SPACE" });
    expect(deps.claims.claimAll).not.toHaveBeenCalled();
  });
});
