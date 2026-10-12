import { Readable } from "stream";
import { gzipSync } from "zlib";
import { createHash } from "crypto";
import type { SpaceFileRun, SpaceFileSnapshot } from "../../../../persistence/spaceFiles/SpaceFilesDAO";
import {
  InvalidSpaceArchive,
  SpaceFilesConflict,
  SpaceFilesDenied,
  SpaceFilesRunService,
  WAITING_MESSAGE,
} from "../../../../services/spaceFiles/SpaceFilesRunService";

jest.mock("../../../../persistence/config/database", () => ({ __esModule: true, default: {} }));

const EMPTY = gzipSync(Buffer.alloc(1024));
const EMPTY_SHA = createHash("sha256").update(EMPTY).digest("hex");

function run(overrides: Partial<SpaceFileRun> = {}): SpaceFileRun {
  return { jobId: "job-1", projectId: "space-1", status: "running", baseSnapshotId: null, checkpointSnapshotId: "snap-new", leaseToken: "3", ...overrides };
}

function snapshot(overrides: Partial<SpaceFileSnapshot> = {}): SpaceFileSnapshot {
  return {
    id: "snap-new", parentId: null, projectId: "space-1", jobId: "job-1", storageUrl: "s3://bucket/spaces/space-1/snapshots/snap-new/workspace.tar.gz",
    archiveSha256: EMPTY_SHA, archiveBytes: EMPTY.length, fileCount: 0, totalBytes: 0, manifest: [], changes: { added: 0, changed: 0, removed: 0 },
    partial: false, createdAt: "2026-10-12T10:00:00.000Z", ...overrides,
  };
}

function setup() {
  const dao = {
    createRun: jest.fn(),
    startNextWaiting: jest.fn<Promise<SpaceFileRun | null>, [string, number]>().mockResolvedValue(null),
    setWaitingProgress: jest.fn(),
    getRun: jest.fn<Promise<SpaceFileRun | null>, [string]>().mockResolvedValue(run()),
    holdsLease: jest.fn().mockResolvedValue(true),
    getSnapshot: jest.fn<Promise<SpaceFileSnapshot | null>, [string]>().mockResolvedValue(null),
    getSnapshotForJob: jest.fn(),
    commitCheckpoint: jest.fn().mockResolvedValue(snapshot()),
    renewLease: jest.fn(),
    release: jest.fn<Promise<string | null>, [string]>().mockResolvedValue(null),
    listRunsOfFinishedJobs: jest.fn().mockResolvedValue([]),
    listStartableSpaces: jest.fn().mockResolvedValue([]),
  };
  const store = {
    bucket: () => "bucket",
    sign: jest.fn().mockResolvedValue("https://storage/signed"),
    open: jest.fn().mockImplementation(async () => Readable.from([EMPTY])),
  };
  const bootstraps = { getBootstrapPayload: jest.fn().mockResolvedValue({ tenantId: "api-server", status: "active", payload: {} }) };
  const service = new SpaceFilesRunService(dao as never, store, bootstraps);
  const launcher = jest.fn().mockResolvedValue(undefined);
  service.setLauncher(launcher);
  return { dao, store, bootstraps, service, launcher };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

describe("SpaceFilesRunService", () => {
  it("starts a run at once when its space is free", async () => {
    const { dao, service } = setup();
    dao.startNextWaiting.mockResolvedValue(run({ status: "running" }));
    await expect(service.enqueue("job-1", "space-1")).resolves.toMatchObject({ jobId: "job-1" });
    expect(dao.createRun).toHaveBeenCalledWith("job-1", "space-1", expect.any(String));
    expect(dao.setWaitingProgress).not.toHaveBeenCalled();
  });

  it("leaves a run waiting, saying so, while another holds the space", async () => {
    const { dao, service, launcher } = setup();
    await expect(service.enqueue("job-2", "space-1")).resolves.toBeNull();
    expect(dao.setWaitingProgress).toHaveBeenCalledWith("job-2", WAITING_MESSAGE);
    expect(launcher).not.toHaveBeenCalled();
  });

  it("grants a write only for the run's own checkpoint, and a read only of the files it started from", async () => {
    const { dao, store, service } = setup();
    await service.grant("job-1", "api-server", "write");
    expect(store.sign).toHaveBeenCalledWith("write", "s3://bucket/spaces/space-1/snapshots/snap-new/workspace.tar.gz", 300);

    await expect(service.grant("job-1", "api-server", "read")).rejects.toBeInstanceOf(SpaceFilesDenied);
    dao.getRun.mockResolvedValue(run({ baseSnapshotId: "snap-old" }));
    dao.getSnapshot.mockResolvedValue(snapshot({ id: "snap-old", storageUrl: "s3://bucket/spaces/space-1/snapshots/snap-old/workspace.tar.gz" }));
    await service.grant("job-1", "api-server", "read");
    expect(store.sign).toHaveBeenLastCalledWith("read", "s3://bucket/spaces/space-1/snapshots/snap-old/workspace.tar.gz", 300);
  });

  it.each([
    ["the job isn't active", (deps: ReturnType<typeof setup>) => deps.bootstraps.getBootstrapPayload.mockResolvedValue({ tenantId: "api-server", status: "completed", payload: {} })],
    ["another tenant asks", (deps: ReturnType<typeof setup>) => deps.bootstraps.getBootstrapPayload.mockResolvedValue({ tenantId: "other", status: "active", payload: {} })],
    ["the run is still waiting", (deps: ReturnType<typeof setup>) => deps.dao.getRun.mockResolvedValue(run({ status: "waiting" }))],
    ["the run lost its lease", (deps: ReturnType<typeof setup>) => deps.dao.holdsLease.mockResolvedValue(false)],
  ])("refuses storage when %s", async (_name, arrange) => {
    const deps = setup();
    arrange(deps);
    await expect(deps.service.grant("job-1", "api-server", "write")).rejects.toBeInstanceOf(SpaceFilesDenied);
    expect(deps.store.sign).not.toHaveBeenCalled();
  });

  it("saves a checked archive as the space's files, then starts whoever waits", async () => {
    const { dao, service, launcher } = setup();
    dao.startNextWaiting.mockResolvedValue(run({ jobId: "job-2", checkpointSnapshotId: "snap-2" }));

    const saved = await service.checkpoint("job-1", "api-server", { sha256: EMPTY_SHA, archiveBytes: EMPTY.length, partial: false });

    expect(saved).toMatchObject({ id: "snap-new", fileCount: 0, partial: false });
    expect(dao.commitCheckpoint).toHaveBeenCalledWith(expect.objectContaining({ id: "snap-new", jobId: "job-1", parentId: null, archiveSha256: EMPTY_SHA }));
    await flush();
    expect(launcher).toHaveBeenCalledWith(expect.objectContaining({ jobId: "job-2" }));
  });

  it("refuses an archive that differs from what the run reported", async () => {
    const { dao, service } = setup();
    await expect(service.checkpoint("job-1", "api-server", { sha256: "0".repeat(64), archiveBytes: EMPTY.length, partial: false })).rejects.toBeInstanceOf(InvalidSpaceArchive);
    expect(dao.commitCheckpoint).not.toHaveBeenCalled();
  });

  it("refuses to save when another run saved the space first", async () => {
    const { dao, service } = setup();
    dao.commitCheckpoint.mockResolvedValue("space_moved_on");
    await expect(service.checkpoint("job-1", "api-server", { sha256: EMPTY_SHA, archiveBytes: EMPTY.length, partial: false })).rejects.toBeInstanceOf(SpaceFilesConflict);
  });

  it("answers a repeated checkpoint with what was saved the first time", async () => {
    const { dao, store, service } = setup();
    dao.getRun.mockResolvedValue(run({ status: "saved" }));
    dao.getSnapshot.mockResolvedValue(snapshot());
    // Even after the job ended, a retry learns its files were saved.
    await expect(service.checkpoint("job-1", "api-server", { sha256: EMPTY_SHA, archiveBytes: EMPTY.length, partial: false })).resolves.toMatchObject({ id: "snap-new" });
    expect(store.open).not.toHaveBeenCalled();
  });

  it("frees a finished job's space and starts the next run", async () => {
    const { dao, service, launcher } = setup();
    dao.release.mockResolvedValue("space-1");
    dao.startNextWaiting.mockResolvedValue(run({ jobId: "job-2" }));
    await service.release("job-1");
    await flush();
    expect(dao.startNextWaiting).toHaveBeenCalledWith("space-1", expect.any(Number));
    expect(launcher).toHaveBeenCalledWith(expect.objectContaining({ jobId: "job-2" }));
  });

  it("releases a run whose worker couldn't be started", async () => {
    const { dao, service, launcher } = setup();
    dao.listStartableSpaces.mockResolvedValue(["space-1"]);
    dao.startNextWaiting.mockResolvedValueOnce(run({ jobId: "job-2" }));
    launcher.mockRejectedValue(new Error("runner is stopped"));
    await service.sweep();
    expect(dao.release).toHaveBeenCalledWith("job-2");
  });

  it("sweeps runs whose jobs ended without releasing them", async () => {
    const { dao, service } = setup();
    dao.listRunsOfFinishedJobs.mockResolvedValue(["job-9"]);
    await expect(service.sweep()).resolves.toBe(1);
    expect(dao.release).toHaveBeenCalledWith("job-9");
  });
});
