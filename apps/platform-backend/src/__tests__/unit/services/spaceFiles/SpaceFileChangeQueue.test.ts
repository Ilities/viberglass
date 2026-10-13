import { createHash } from "crypto";
import { Readable } from "stream";
import type { SpaceFileChangeRecord } from "../../../../persistence/spaceFiles/SpaceFileChangesDAO";
import { SpaceFileChangeQueue } from "../../../../services/spaceFiles/SpaceFileChangeQueue";
import { SpaceFileError } from "../../../../services/spaceFiles/SpaceFileError";

jest.mock("../../../../persistence/config/database", () => ({ __esModule: true, default: {} }));

const sha = (text: string) => createHash("sha256").update(text).digest("hex");
const SAVED = { id: "snap-2", parentId: "snap-1", fileCount: 1, totalBytes: 1, partial: false, changes: { added: 1, changed: 0, removed: 0 }, createdAt: "" };

function change(overrides: Partial<SpaceFileChangeRecord> = {}): SpaceFileChangeRecord {
  return {
    id: "change-1",
    projectId: "space-1",
    kind: "write",
    path: "notes/brief.md",
    status: "waiting",
    error: null,
    hasContent: true,
    createdBy: "user-1",
    createdAt: "2026-10-13T10:00:00.000Z",
    checkBase: false,
    baseSha256: null,
    stagedUrl: "s3://bucket/spaces/space-1/changes/change-1",
    ...overrides,
  };
}

function setup(waiting: SpaceFileChangeRecord[] = []) {
  const staged = new Map<string, Buffer>();
  const store = {
    bucket: () => "bucket",
    sign: jest.fn(),
    open: jest.fn(async (url: string) => Readable.from([staged.get(url) ?? Buffer.from("staged")])),
    put: jest.fn(async (url: string, body: Buffer | Readable) => {
      if (Buffer.isBuffer(body)) staged.set(url, body);
    }),
    delete: jest.fn(),
  };
  const changes = {
    insert: jest.fn(async (row: { id: string; stagedUrl: string | null }) => change({ id: row.id, stagedUrl: row.stagedUrl })),
    get: jest.fn(),
    listOpen: jest.fn().mockResolvedValue([]),
    listWaiting: jest.fn().mockResolvedValue(waiting),
    listSpacesWithWaiting: jest.fn(),
    markSaved: jest.fn(),
    markFailed: jest.fn(),
    delete: jest.fn(),
  };
  const applier = { tryApply: jest.fn().mockResolvedValue(SAVED) };
  const waiters = { startWaiting: jest.fn() };
  const queue = new SpaceFileChangeQueue(waiters, changes as never, store, applier);
  return { queue, store, changes, applier, waiters, staged };
}

describe("SpaceFileChangeQueue", () => {
  it("stages a write's content, records the change and looks for a free space", async () => {
    const { queue, store, changes, waiters, staged } = setup();
    const queued = await queue.add("space-1", "user-1", { kind: "write", path: "b.md", content: Buffer.from("b") }, { sha256: sha("a") });

    const [stagedUrl] = store.put.mock.calls[0];
    expect(stagedUrl).toMatch(/^s3:\/\/bucket\/spaces\/space-1\/changes\/[0-9a-f-]{36}$/);
    expect(staged.get(stagedUrl)?.toString()).toBe("b");
    expect(changes.insert).toHaveBeenCalledWith(expect.objectContaining({ kind: "write", path: "b.md", checkBase: true, baseSha256: sha("a"), stagedUrl, bytes: 1 }));
    expect(queued).toMatchObject({ status: "waiting", hasContent: true });
    expect(waiters.startWaiting).toHaveBeenCalledWith("space-1");
  });

  it("saves waiting changes oldest first and deletes their staged content", async () => {
    const first = change();
    const second = change({ id: "change-2", kind: "remove", path: "old.md", stagedUrl: null, hasContent: false });
    const { queue, applier, changes, store } = setup([first, second]);

    await queue.applyWaiting("space-1");

    expect(applier.tryApply).toHaveBeenNthCalledWith(1, "space-1", "user-1", { kind: "write", path: "notes/brief.md", content: Buffer.from("staged") }, undefined);
    expect(applier.tryApply).toHaveBeenNthCalledWith(2, "space-1", "user-1", { kind: "remove", path: "old.md" }, expect.any(Function));
    expect(changes.markSaved).toHaveBeenCalledWith("change-1", "snap-2");
    expect(changes.markSaved).toHaveBeenCalledWith("change-2", "snap-2");
    expect(store.delete).toHaveBeenCalledWith(first.stagedUrl);
  });

  it("stops at a change that finds the space busy, leaving it and later ones waiting", async () => {
    const { queue, applier, changes } = setup([change(), change({ id: "change-2" })]);
    applier.tryApply.mockResolvedValueOnce(null);
    await queue.applyWaiting("space-1");
    expect(applier.tryApply).toHaveBeenCalledTimes(1);
    expect(changes.markSaved).not.toHaveBeenCalled();
    expect(changes.markFailed).not.toHaveBeenCalled();
  });

  it("fails a text save the run made stale, keeping its content, and carries on", async () => {
    const second = change({ id: "change-2", stagedUrl: "s3://bucket/spaces/space-1/changes/change-2" });
    const { queue, applier, changes, store } = setup([change({ checkBase: true, baseSha256: sha("old") }), second]);
    applier.tryApply.mockImplementationOnce(async (_space: string, _user: string, _change: unknown, check: (files: unknown[]) => void) => {
      check([{ path: "notes/brief.md", sha256: sha("the run's"), bytes: 9 }]);
      return SAVED;
    });

    await queue.applyWaiting("space-1");

    expect(changes.markFailed).toHaveBeenCalledWith("change-1", expect.stringContaining("Someone changed this file"));
    expect(store.delete).not.toHaveBeenCalledWith("s3://bucket/spaces/space-1/changes/change-1");
    expect(changes.markSaved).toHaveBeenCalledWith("change-2", "snap-2");
  });

  it("counts a removal of a file someone else removed first as done", async () => {
    const { queue, applier, changes } = setup([change({ kind: "remove", stagedUrl: null })]);
    applier.tryApply.mockRejectedValueOnce(new SpaceFileError("FILE_NOT_FOUND", "gone"));
    await queue.applyWaiting("space-1");
    expect(changes.markSaved).toHaveBeenCalledWith("change-1", null);
  });

  it("leaves a change waiting when saving fails for another reason", async () => {
    const { queue, applier, changes } = setup([change(), change({ id: "change-2" })]);
    applier.tryApply.mockRejectedValueOnce(new Error("storage is down"));
    await queue.applyWaiting("space-1");
    expect(applier.tryApply).toHaveBeenCalledTimes(1);
    expect(changes.markFailed).not.toHaveBeenCalled();
  });

  it("dismisses a change and its staged content, and refuses one that isn't open", async () => {
    const { queue, changes, store } = setup();
    changes.get.mockResolvedValueOnce(change({ status: "failed" }));
    await queue.dismiss("space-1", "change-1");
    expect(changes.delete).toHaveBeenCalledWith("change-1");
    expect(store.delete).toHaveBeenCalledWith("s3://bucket/spaces/space-1/changes/change-1");

    changes.get.mockResolvedValueOnce(null);
    await expect(queue.dismiss("space-1", "change-9")).rejects.toMatchObject({ code: "CHANGE_NOT_FOUND" });
  });
});
