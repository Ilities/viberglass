import { ORPHAN_GRACE_MS, SpaceFilesOrphanCleanup } from "../../../../services/spaceFiles/SpaceFilesOrphanCleanup";

jest.mock("../../../../persistence/config/database", () => ({ __esModule: true, default: {} }));

const NOW = Date.parse("2026-10-13T12:00:00Z");
const old = new Date(NOW - ORPHAN_GRACE_MS - 1000);
const recent = new Date(NOW - 1000);
const snapshotUrl = (id: string) => `s3://bucket/spaces/space-1/snapshots/${id}/workspace.tar.gz`;
const changeUrl = (id: string) => `s3://bucket/spaces/space-1/changes/${id}`;

function setup(objects: Record<string, Array<{ storageUrl: string; lastModified: Date | null }>>) {
  const known = {
    listSpaces: jest.fn().mockResolvedValue(["space-1"]),
    listSnapshotIds: jest.fn().mockResolvedValue(new Set(["kept", "running-checkpoint"])),
    listStagedUrls: jest.fn().mockResolvedValue(new Set([changeUrl("waiting")])),
  };
  const store = {
    bucket: () => "bucket",
    list: jest.fn(async (prefix: string) => objects[prefix] ?? []),
    delete: jest.fn(),
  };
  return { cleanup: new SpaceFilesOrphanCleanup(known, store), store, known };
}

describe("SpaceFilesOrphanCleanup", () => {
  it("deletes old objects no snapshot, live run or open change refers to, and keeps everything else", async () => {
    const { cleanup, store } = setup({
      "s3://bucket/spaces/space-1/snapshots/": [
        { storageUrl: snapshotUrl("kept"), lastModified: old },
        { storageUrl: snapshotUrl("running-checkpoint"), lastModified: old },
        { storageUrl: snapshotUrl("refused"), lastModified: old },
        { storageUrl: snapshotUrl("just-uploaded"), lastModified: recent },
      ],
      "s3://bucket/spaces/space-1/changes/": [
        { storageUrl: changeUrl("waiting"), lastModified: old },
        { storageUrl: changeUrl("never-recorded"), lastModified: old },
      ],
    });

    await expect(cleanup.sweep(NOW)).resolves.toBe(2);
    expect(store.delete.mock.calls.map(([url]) => url)).toEqual([snapshotUrl("refused"), changeUrl("never-recorded")]);
  });

  it("carries on with the next space when one fails", async () => {
    const { cleanup, known, store } = setup({});
    known.listSpaces.mockResolvedValue(["space-1", "space-2"]);
    known.listSnapshotIds.mockRejectedValueOnce(new Error("database is busy"));
    await expect(cleanup.sweep(NOW)).resolves.toBe(0);
    expect(store.list).toHaveBeenCalledWith("s3://bucket/spaces/space-2/snapshots/");
  });
});
