import { createHash } from "crypto";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import type { FilesCheckpointResult } from "@viberglass/types";
import { JobFailureError } from "../core/JobFailureError";
import { FilesRequestRejected } from "../infrastructure/FilesCallbackClient";
import { prepareFilesWorkspace, saveFilesWorkspace, type FilesRun } from "./filesWorkspace";
import { captureWorkspace } from "./spaceArchive";

let root: string;
let fetchSpy: jest.SpyInstance;

const SAVED: FilesCheckpointResult = {
  id: "snapshot-2",
  parentId: "snapshot-1",
  fileCount: 1,
  totalBytes: 5,
  partial: false,
  changes: { added: 1, changed: 0, removed: 0 },
  createdAt: "2026-10-12T00:00:00.000Z",
};

function run(overrides: Partial<FilesRun> = {}, baseSnapshotId: string | null = null): FilesRun {
  return {
    jobId: "job-1",
    tenantId: "tenant-1",
    files: { spaceId: "space-1", baseSnapshotId, checkpointSnapshotId: "snapshot-2" },
    client: {
      storageGrant: jest.fn(async (_job, _tenant, operation) => ({ url: `https://storage.test/${operation}`, expiresAt: "later" })),
      checkpoint: jest.fn(async () => SAVED),
    },
    logger: { info: jest.fn(), warn: jest.fn() },
    sendProgress: jest.fn(async () => undefined),
    ...overrides,
  };
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "files-workspace-"));
  fetchSpy = jest.spyOn(globalThis, "fetch");
});

afterEach(() => {
  fetchSpy.mockRestore();
  fs.rmSync(root, { recursive: true, force: true });
});

describe("prepareFilesWorkspace", () => {
  it("starts a space with nothing saved in an empty directory, without asking for storage", async () => {
    fs.mkdirSync(path.join(root, "repo"));
    fs.writeFileSync(path.join(root, "repo", "stale.md"), "from an earlier turn in this container");
    const files = run();

    const repoDir = await prepareFilesWorkspace(files, root);

    expect(repoDir).toBe(path.join(root, "repo"));
    expect(fs.readdirSync(repoDir)).toEqual([]);
    expect(files.client.storageGrant).not.toHaveBeenCalled();
    expect(files.sendProgress).toHaveBeenCalledWith("files-restore", "Preparing files", { baseSnapshotId: null });
  });

  it("restores the space's saved files from the read grant", async () => {
    const saved = path.join(root, "saved");
    fs.mkdirSync(path.join(saved, "notes"), { recursive: true });
    fs.writeFileSync(path.join(saved, "notes", "a.md"), "hello");
    const archive = path.join(root, "saved.tar.gz");
    await captureWorkspace(saved, archive);
    fetchSpy.mockResolvedValueOnce(new Response(fs.readFileSync(archive)));
    const files = run({}, "snapshot-1");
    const work = path.join(root, "job");

    const repoDir = await prepareFilesWorkspace(files, work);

    expect(fetchSpy).toHaveBeenCalledWith("https://storage.test/read", expect.anything());
    expect(fs.readFileSync(path.join(repoDir, "notes", "a.md"), "utf8")).toBe("hello");
    expect(fs.readdirSync(work)).toEqual(["repo"]);
  });

  it("fails the run before the agent starts when the saved files can't be restored", async () => {
    fetchSpy.mockResolvedValueOnce(new Response("not an archive"));

    const failure = prepareFilesWorkspace(run({}, "snapshot-1"), path.join(root, "job"));

    await expect(failure).rejects.toBeInstanceOf(JobFailureError);
    await expect(failure).rejects.toThrow("before the agent started");
  });
});

describe("saveFilesWorkspace", () => {
  it("uploads the archive to the write grant and reports what the platform saved", async () => {
    const repoDir = path.join(root, "repo");
    fs.mkdirSync(repoDir);
    fs.writeFileSync(path.join(repoDir, "deck.md"), "slide");
    let uploaded: Buffer | null = null;
    fetchSpy.mockImplementationOnce(async (_url, init?: RequestInit) => {
      uploaded = Buffer.from(init?.body as Uint8Array);
      return new Response(null, { status: 200 });
    });
    const files = run();

    const saved = await saveFilesWorkspace(files, repoDir, { partial: false });

    expect(saved).toEqual(SAVED);
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://storage.test/write",
      expect.objectContaining({ method: "PUT", headers: { "Content-Type": "application/gzip" } }),
    );
    expect(uploaded).not.toBeNull();
    const body = uploaded as unknown as Buffer;
    expect(files.client.checkpoint).toHaveBeenCalledWith("job-1", "tenant-1", {
      sha256: createHash("sha256").update(body).digest("hex"),
      archiveBytes: body.length,
      partial: false,
    });
    // The archive is written beside the working directory, not into it, and removed afterwards.
    expect(fs.readdirSync(root)).toEqual(["repo"]);
  });

  it("fails the run when the platform refuses the files", async () => {
    const repoDir = path.join(root, "repo");
    fs.mkdirSync(repoDir);
    fetchSpy.mockResolvedValueOnce(new Response(null, { status: 200 }));
    const files = run({
      client: {
        storageGrant: jest.fn(async () => ({ url: "https://storage.test/write", expiresAt: "later" })),
        checkpoint: jest.fn(async () => {
          throw new FilesRequestRejected("Another run saved this space first");
        }),
      },
    });

    await expect(saveFilesWorkspace(files, repoDir, { partial: false })).rejects.toThrow(
      "Couldn't save the space's files: the platform refused them: Another run saved this space first",
    );
  });

  it("fails the run when the upload fails, without asking the platform to keep anything", async () => {
    const repoDir = path.join(root, "repo");
    fs.mkdirSync(repoDir);
    fetchSpy.mockResolvedValueOnce(new Response(null, { status: 403 }));
    const files = run();

    await expect(saveFilesWorkspace(files, repoDir, { partial: true })).rejects.toBeInstanceOf(JobFailureError);
    expect(files.client.checkpoint).not.toHaveBeenCalled();
  });
});
