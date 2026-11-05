import { AppRetention } from "../../../../services/apps/AppRetention";

jest.mock("../../../../persistence/config/database", () => ({ __esModule: true, default: {} }));

const NOW = new Date("2026-11-04T12:00:00Z");
const LIMITS = { liveReleases: 5, unusedBuildDays: 7, backupDays: 30 };

function build() {
  const deps = {
    retention: {
      listBundlesToRetire: jest.fn(async () => [{ id: "r1", projectId: "space-1" }]),
      markBundlesRemoved: jest.fn(async () => undefined),
      listBundlesToPurge: jest.fn(async () => [{ id: "r0", projectId: "space-1" }]),
      markBundlePurged: jest.fn(async () => undefined),
      listBackupsToDelete: jest.fn(async () => [{ id: "b1", projectId: "space-1" }]),
      deleteBackup: jest.fn(async () => undefined),
      listEjectedBefore: jest.fn(async (): Promise<string[]> => []),
      forgetEjected: jest.fn(async () => undefined),
    },
    store: { bucket: () => "uploads", delete: jest.fn(async (_url: string): Promise<void> => undefined) },
  };
  return { retention: new AppRetention(deps.retention, deps.store, LIMITS, 15 * 60_000), deps };
}

describe("AppRetention", () => {
  it("retires old bundles, purges retired ones after the grace period and deletes old backups", async () => {
    const { retention, deps } = build();

    await expect(retention.sweep(NOW)).resolves.toBe(3);

    expect(deps.retention.listBundlesToRetire).toHaveBeenCalledWith(5, new Date("2026-10-28T12:00:00Z"));
    expect(deps.retention.markBundlesRemoved).toHaveBeenCalledWith(["r1"]);
    expect(deps.retention.listBundlesToPurge).toHaveBeenCalledWith(new Date("2026-11-04T11:45:00Z"));
    expect(deps.store.delete).toHaveBeenCalledWith("s3://uploads/spaces/space-1/releases/r0/bundle.tar.gz");
    expect(deps.retention.markBundlePurged).toHaveBeenCalledWith("r0");
    expect(deps.retention.listBackupsToDelete).toHaveBeenCalledWith(new Date("2026-10-05T12:00:00Z"));
    expect(deps.store.delete).toHaveBeenCalledWith("s3://uploads/spaces/space-1/backups/b1/");
    expect(deps.retention.deleteBackup).toHaveBeenCalledWith("b1");
  });

  it("keeps the record of what it couldn't delete, to try again next sweep", async () => {
    const { retention, deps } = build();
    deps.store.delete.mockRejectedValue(new Error("storage unreachable"));

    await expect(retention.sweep(NOW)).resolves.toBe(1);
    expect(deps.retention.markBundlePurged).not.toHaveBeenCalled();
    expect(deps.retention.deleteBackup).not.toHaveBeenCalled();
  });

  it("deletes an ejected app's data once its backups would have gone", async () => {
    const { retention, deps } = build();
    deps.retention.listEjectedBefore.mockResolvedValue(["space-2"]);

    await expect(retention.sweep(NOW)).resolves.toBe(4);

    expect(deps.retention.listEjectedBefore).toHaveBeenCalledWith(new Date("2026-10-05T12:00:00Z"));
    expect(deps.store.delete).toHaveBeenCalledWith("s3://uploads/spaces/space-2/app-data/");
    expect(deps.store.delete).toHaveBeenCalledWith("s3://uploads/spaces/space-2/backups/");
    expect(deps.store.delete).toHaveBeenCalledWith("s3://uploads/spaces/space-2/ejected/");
    expect(deps.retention.forgetEjected).toHaveBeenCalledWith("space-2");
  });

  it("keeps an ejected app's rows while its data can't be deleted", async () => {
    const { retention, deps } = build();
    deps.retention.listEjectedBefore.mockResolvedValue(["space-2"]);
    deps.store.delete.mockImplementation(async (url: string) => {
      if (url.includes("space-2/backups")) throw new Error("storage unreachable");
    });

    await retention.sweep(NOW);
    expect(deps.retention.forgetEjected).not.toHaveBeenCalled();
  });
});
