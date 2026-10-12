import { createHash } from "crypto";
import { Readable } from "stream";
import type { SpaceFileSnapshot } from "../../../../persistence/spaceFiles/SpaceFilesDAO";
import { editablePath, SpaceFilesEditService } from "../../../../services/spaceFiles/SpaceFilesEditService";
import { readArchiveFile, repackArchive } from "../../../../services/spaceFiles/spaceArchiveFiles";
import { inspectSpaceArchive } from "../../../../services/spaceFiles/inspectSpaceArchive";
import { promises as fs } from "fs";

jest.mock("../../../../persistence/config/database", () => ({ __esModule: true, default: {} }));

const sha = (text: string) => createHash("sha256").update(text).digest("hex");

/** A real archive of the given files, as a run would have saved it. */
async function archiveOf(files: Record<string, string>): Promise<Buffer> {
  let archive: Buffer | null = null;
  for (const [path, content] of Object.entries(files)) {
    const { archivePath, cleanup } = await repackArchive(archive ? Readable.from([archive]) : null, { kind: "write", path, content: Buffer.from(content) });
    archive = await fs.readFile(archivePath);
    await cleanup();
  }
  return archive!;
}

async function setup(files: Record<string, string>, leaseFree = true) {
  const archive = await archiveOf(files);
  const inspected = await inspectSpaceArchive(Readable.from([archive]));
  const current: SpaceFileSnapshot = {
    id: "snap-1", parentId: null, projectId: "space-1", jobId: "job-1", storageUrl: "s3://bucket/spaces/space-1/snapshots/snap-1/workspace.tar.gz",
    archiveSha256: inspected.sha256, archiveBytes: inspected.archiveBytes, fileCount: inspected.manifest.length, totalBytes: inspected.totalBytes,
    manifest: inspected.manifest, changes: { added: 0, changed: 0, removed: 0 }, partial: false, createdAt: "",
  };
  const stored = new Map<string, Buffer>([[current.storageUrl, archive]]);
  const store = {
    bucket: () => "bucket",
    sign: jest.fn(),
    delete: jest.fn(),
    open: jest.fn(async (url: string) => Readable.from([stored.get(url)!])),
    put: jest.fn(async (url: string, body: Buffer | Readable) => {
      stored.set(url, Buffer.isBuffer(body) ? body : Buffer.alloc(0));
    }),
  };
  const dao = {
    getCurrent: jest.fn().mockResolvedValue({ snapshot: current, busy: false }),
    getSnapshot: jest.fn().mockResolvedValue(current),
    acquireForOperation: jest.fn().mockResolvedValue(leaseFree ? { token: "7", currentSnapshotId: "snap-1" } : null),
    commitOperation: jest.fn(async (_operation: string, _token: string, snapshot: { id: string; manifest: unknown[]; changes: unknown }) => ({
      snapshot: { ...current, id: snapshot.id, manifest: snapshot.manifest, fileCount: snapshot.manifest.length, changes: snapshot.changes },
      artifacts: [],
    })),
    releaseOperation: jest.fn(),
  };
  const registrar = { fromEdit: jest.fn().mockResolvedValue([]), storeFiles: jest.fn() };
  const runs = { startWaiting: jest.fn() };
  const service = new SpaceFilesEditService(dao as never, store, registrar, runs);
  return { service, dao, store, stored, registrar, runs };
}

describe("SpaceFilesEditService", () => {
  it("opens a text file with the hash a save must match", async () => {
    const { service } = await setup({ "notes/brief.md": "# Brief" });
    await expect(service.readText("space-1", "notes/brief.md")).resolves.toEqual({ path: "notes/brief.md", content: "# Brief", sha256: sha("# Brief") });
  });

  it("saves an edit as the space's next files, frees the space and starts waiting runs", async () => {
    const { service, dao, stored, registrar, runs } = await setup({ "notes/brief.md": "# Brief", "deck.html": "<h1>" });

    const saved = await service.saveText("space-1", "user-1", { path: "notes/brief.md", content: "# Brief v2", baseSha256: sha("# Brief") });

    expect(saved.file).toEqual({ path: "notes/brief.md", content: "# Brief v2", sha256: sha("# Brief v2") });
    const [operationId, token, snapshot] = dao.commitOperation.mock.calls[0];
    expect(token).toBe("7");
    expect(snapshot).toMatchObject({ parentId: "snap-1", jobId: null, createdBy: "user-1", changes: { added: 0, changed: 1, removed: 0 } });
    const newArchive = stored.get((snapshot as unknown as { storageUrl: string }).storageUrl)!;
    expect((await readArchiveFile(Readable.from([newArchive]), "notes/brief.md"))?.toString()).toBe("# Brief v2");
    expect((await readArchiveFile(Readable.from([newArchive]), "deck.html"))?.toString()).toBe("<h1>");
    expect(registrar.fromEdit).toHaveBeenCalledWith("notes/brief.md", expect.any(Array), expect.objectContaining({ createdBy: "user-1" }));
    expect(dao.releaseOperation).toHaveBeenCalledWith("space-1", operationId);
    expect(runs.startWaiting).toHaveBeenCalledWith("space-1");
  });

  it("refuses an edit to a file someone changed since it was opened", async () => {
    const { service, dao } = await setup({ "notes/brief.md": "# Newer" });
    await expect(service.saveText("space-1", "user-1", { path: "notes/brief.md", content: "mine", baseSha256: sha("# Older") })).rejects.toMatchObject({
      code: "FILE_CHANGED",
    });
    expect(dao.commitOperation).not.toHaveBeenCalled();
    expect(dao.releaseOperation).toHaveBeenCalled();
  });

  it("refuses a new file over one that exists", async () => {
    const { service } = await setup({ "notes/brief.md": "# Brief" });
    await expect(service.saveText("space-1", "user-1", { path: "notes/brief.md", content: "x", baseSha256: null })).rejects.toMatchObject({ code: "FILE_CHANGED" });
  });

  it("refuses changes while a run holds the space", async () => {
    const { service, dao } = await setup({ "a.md": "a" }, false);
    await expect(service.upload("space-1", "user-1", "b.md", Buffer.from("b"))).rejects.toMatchObject({ code: "SPACE_BUSY" });
    expect(dao.commitOperation).not.toHaveBeenCalled();
  });

  it("removes a file, and the folder it leaves empty", async () => {
    const { service, dao } = await setup({ "notes/old.md": "old", "keep.md": "keep" });
    await service.remove("space-1", "user-1", "notes/old.md");
    const snapshot = dao.commitOperation.mock.calls[0][2] as { manifest: Array<{ path: string }>; changes: unknown };
    expect(snapshot.manifest.map((file) => file.path)).toEqual(["keep.md"]);
    expect(snapshot.changes).toEqual({ added: 0, changed: 0, removed: 1 });
  });
});

describe("editablePath", () => {
  it.each(["../escape.md", "/abs.md", ".viberglass/artifacts.json", ".git/config", "PLAN.md", "a//b.md", ""])("refuses %j", (path) => {
    expect(() => editablePath(path)).toThrow();
  });

  it("allows a path inside the files", () => {
    expect(editablePath("./notes/brief.md")).toBe("notes/brief.md");
  });
});
