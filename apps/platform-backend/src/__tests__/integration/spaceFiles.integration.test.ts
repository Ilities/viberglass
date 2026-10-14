import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Kysely, PostgresDialect, sql } from "kysely";
import { Pool } from "pg";
import type { Database } from "../../persistence/types/database";
import { up } from "../../migrations/119_space_files";
import { up as upArtifacts } from "../../migrations/121_artifacts";
import { up as upChanges } from "../../migrations/124_space_file_changes";
import { ArtifactDAO, type NewArtifactVersion } from "../../persistence/artifacts/ArtifactDAO";
import { SpaceFileChangesDAO } from "../../persistence/spaceFiles/SpaceFileChangesDAO";
import { SpaceFileObjectsDAO } from "../../persistence/spaceFiles/SpaceFileObjectsDAO";
import { SpaceFilesDAO, type NewSpaceFileSnapshot } from "../../persistence/spaceFiles/SpaceFilesDAO";

let mockDb: Kysely<Database>;
jest.mock("../../persistence/config/database", () => ({
  __esModule: true,
  get default() {
    return mockDb;
  },
}));

const SPACE = "11111111-1111-4111-8111-111111111111";
const TICKET = "22222222-2222-4222-8222-222222222222";
const OTHER_TICKET = "33333333-3333-4333-8333-333333333333";
const PERSON = "44444444-4444-4444-8444-444444444444";
const LEASE_MS = 60_000;
let container: StartedPostgreSqlContainer;
const dao = new SpaceFilesDAO();
let jobCount = 0;

async function job(): Promise<string> {
  const id = `job_${++jobCount}`;
  await sql`INSERT INTO jobs (id, status) VALUES (${id}, 'queued')`.execute(mockDb);
  return id;
}

function snapshotFor(jobId: string, id: string, parentId: string | null): NewSpaceFileSnapshot {
  return {
    id, projectId: SPACE, parentId, jobId, createdBy: null, storageUrl: `s3://bucket/spaces/${SPACE}/snapshots/${id}/workspace.tar.gz`,
    archiveSha256: "a".repeat(64), archiveBytes: 29, totalBytes: 5, manifest: [{ path: "a.md", bytes: 5, sha256: "b".repeat(64) }],
    changes: { added: 1, changed: 0, removed: 0 }, partial: false,
  };
}

async function enqueue(checkpoint: string): Promise<string> {
  const id = await job();
  await dao.createRun(id, SPACE, checkpoint);
  return id;
}

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:16-alpine").start();
  mockDb = new Kysely<Database>({ dialect: new PostgresDialect({ pool: new Pool({ connectionString: container.getConnectionUri() }) }) });
  await sql`CREATE TABLE projects (id uuid PRIMARY KEY)`.execute(mockDb);
  await sql`CREATE TABLE users (id uuid PRIMARY KEY)`.execute(mockDb);
  await sql`CREATE TABLE jobs (id varchar(255) PRIMARY KEY, status text NOT NULL, progress jsonb, ticket_id uuid)`.execute(mockDb);
  await sql`CREATE TABLE tickets (id uuid PRIMARY KEY, task_key text)`.execute(mockDb);
  await sql`CREATE TABLE agent_turns (id serial PRIMARY KEY, job_id varchar(255), completed_at timestamptz)`.execute(mockDb);
  await sql`INSERT INTO projects VALUES (${SPACE})`.execute(mockDb);
  await sql`INSERT INTO users VALUES (${PERSON})`.execute(mockDb);
  await sql`INSERT INTO tickets VALUES (${TICKET}, 'FQD-1'), (${OTHER_TICKET}, 'FQD-2')`.execute(mockDb);
  await up(mockDb);
  await upArtifacts(mockDb);
  await upChanges(mockDb);
}, 60_000);

afterAll(async () => {
  await mockDb?.destroy();
  await container?.stop();
});

beforeEach(async () => {
  await sql`UPDATE artifacts SET current_version_id = NULL`.execute(mockDb);
  await sql`DELETE FROM artifact_versions`.execute(mockDb);
  await sql`DELETE FROM artifacts`.execute(mockDb);
  await sql`DELETE FROM space_file_changes`.execute(mockDb);
  await sql`DELETE FROM space_file_runs`.execute(mockDb);
  await sql`DELETE FROM space_file_state`.execute(mockDb);
  await sql`DELETE FROM space_file_snapshots`.execute(mockDb);
  await sql`DELETE FROM agent_turns`.execute(mockDb);
});

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

describe("SpaceFilesDAO", () => {
  it("gives the space to one run at a time, oldest first, and carries the saved files to the next", async () => {
    const first = await enqueue(uuid(1));
    const second = await enqueue(uuid(2));

    const started = await dao.startNextWaiting(SPACE, LEASE_MS);
    expect(started).toMatchObject({ jobId: first, status: "running", baseSnapshotId: null, leaseToken: "1" });
    // The space is held, so the second run keeps waiting.
    await expect(dao.startNextWaiting(SPACE, LEASE_MS)).resolves.toBeNull();

    const saved = await dao.commitCheckpoint(snapshotFor(first, uuid(1), null));
    expect(saved).toMatchObject({ snapshot: { id: uuid(1), fileCount: 1, totalBytes: 5 }, artifacts: [] });

    const next = await dao.startNextWaiting(SPACE, LEASE_MS);
    expect(next).toMatchObject({ jobId: second, baseSnapshotId: uuid(1), leaseToken: "2" });
  });

  it("answers a repeated save with the first one", async () => {
    const id = await enqueue(uuid(3));
    await dao.startNextWaiting(SPACE, LEASE_MS);
    const first = await dao.commitCheckpoint(snapshotFor(id, uuid(3), null));
    const again = await dao.commitCheckpoint(snapshotFor(id, uuid(3), null));
    expect(again).toEqual(first);
  });

  it("refuses a run whose lease ran out and was taken by another", async () => {
    const stale = await enqueue(uuid(4));
    const fresh = await enqueue(uuid(5));
    await dao.startNextWaiting(SPACE, 1);
    await new Promise((resolve) => setTimeout(resolve, 20));
    // The lease expired, so the waiting run takes the space with a newer token.
    await expect(dao.startNextWaiting(SPACE, LEASE_MS)).resolves.toMatchObject({ jobId: fresh, leaseToken: "2" });

    await expect(dao.commitCheckpoint(snapshotFor(stale, uuid(4), null))).resolves.toBe("lease_lost");
    const current = await sql<{ current_snapshot_id: string | null }>`SELECT current_snapshot_id FROM space_file_state`.execute(mockDb);
    expect(current.rows[0].current_snapshot_id).toBeNull();
  });

  it("refuses files saved on top of an older version than the space's current one", async () => {
    const id = await enqueue(uuid(6));
    await dao.startNextWaiting(SPACE, LEASE_MS);
    // Something else moved the space on while the run held it.
    await sql`INSERT INTO space_file_snapshots (id, project_id, storage_url, archive_sha256, archive_bytes, file_count, total_bytes, manifest, changes)
      VALUES (${uuid(7)}, ${SPACE}, 's3://x', ${"c".repeat(64)}, 1, 0, 0, '[]', '{}')`.execute(mockDb);
    await sql`UPDATE space_file_state SET current_snapshot_id = ${uuid(7)}`.execute(mockDb);

    await expect(dao.commitCheckpoint(snapshotFor(id, uuid(6), null))).resolves.toBe("space_moved_on");
  });

  it("frees the space when a running job ends without saving, and keeps a held lease away from others' releases", async () => {
    const holder = await enqueue(uuid(8));
    const waiting = await enqueue(uuid(9));
    await dao.startNextWaiting(SPACE, LEASE_MS);

    // A waiting run ending doesn't touch the holder's lease.
    await expect(dao.release(waiting)).resolves.toBe(SPACE);
    await expect(dao.holdsLease((await dao.getRun(holder))!)).resolves.toBe(true);

    await expect(dao.release(holder)).resolves.toBe(SPACE);
    await expect(dao.release(holder)).resolves.toBeNull();
    const state = await sql<{ lease_job_id: string | null }>`SELECT lease_job_id FROM space_file_state`.execute(mockDb);
    expect(state.rows[0].lease_job_id).toBeNull();
  });

  it("lists spaces a waiting run could start in and runs left behind by finished jobs", async () => {
    const holder = await enqueue(uuid(10));
    await enqueue(uuid(11));
    await dao.startNextWaiting(SPACE, LEASE_MS);
    await expect(dao.listStartableSpaces()).resolves.toEqual([]);

    await sql`UPDATE jobs SET status = 'failed' WHERE id = ${holder}`.execute(mockDb);
    await expect(dao.listRunsOfFinishedJobs()).resolves.toEqual([holder]);
    await dao.release(holder);
    await expect(dao.listStartableSpaces()).resolves.toEqual([SPACE]);
  });

  it("keeps a cancelled run's space only for its shortened lease, so its worker can save", async () => {
    const holder = await enqueue(uuid(12));
    const waiting = await enqueue(uuid(13));
    await dao.startNextWaiting(SPACE, LEASE_MS);

    await expect(dao.shortenLease(waiting, 1_000)).resolves.toBe(false);
    await expect(dao.shortenLease(holder, 1_000)).resolves.toBe(true);
    await sql`UPDATE jobs SET status = 'cancelled' WHERE id = ${holder}`.execute(mockDb);
    await expect(dao.listRunsOfFinishedJobs()).resolves.toEqual([]);
    await expect(dao.startNextWaiting(SPACE, LEASE_MS)).resolves.toBeNull();

    // Its worker saved what it had within the window.
    await expect(dao.commitCheckpoint({ ...snapshotFor(holder, uuid(12), null), partial: true })).resolves.toMatchObject({ snapshot: { partial: true } });
    await expect(dao.startNextWaiting(SPACE, LEASE_MS)).resolves.toMatchObject({ jobId: waiting, baseSnapshotId: uuid(12) });
  });

  it("lets the sweeper release a cancelled run once its shortened lease ran out", async () => {
    const holder = await enqueue(uuid(14));
    await dao.startNextWaiting(SPACE, LEASE_MS);
    await sql`UPDATE jobs SET status = 'cancelled' WHERE id = ${holder}`.execute(mockDb);
    await sql`UPDATE space_file_state SET lease_expires_at = now() - interval '1 second'`.execute(mockDb);
    await expect(dao.listRunsOfFinishedJobs()).resolves.toEqual([holder]);
  });
});

describe("people's waiting changes", () => {
  const changes = new SpaceFileChangesDAO();
  const objects = new SpaceFileObjectsDAO();
  const change = (id: string, path: string) => ({
    id, projectId: SPACE, createdBy: PERSON, kind: "write" as const, path, checkBase: false, baseSha256: null,
    stagedUrl: `s3://bucket/spaces/${SPACE}/changes/${id}`, bytes: 3,
  });

  it("lists waiting changes oldest first, keeps failed ones open with their content, and drops saved ones", async () => {
    await sql`INSERT INTO space_file_state (project_id) VALUES (${SPACE})`.execute(mockDb);
    await changes.insert(change(uuid(21), "a.md"));
    await changes.insert(change(uuid(22), "b.md"));
    await expect(changes.listSpacesWithWaiting()).resolves.toEqual([SPACE]);
    expect((await changes.listWaiting(SPACE)).map((c) => c.path)).toEqual(["a.md", "b.md"]);

    await changes.markFailed(uuid(21), "Someone changed this file");
    await changes.markSaved(uuid(22), null);
    await expect(changes.listWaiting(SPACE)).resolves.toEqual([]);
    await expect(changes.listOpen(SPACE)).resolves.toEqual([
      expect.objectContaining({ id: uuid(21), status: "failed", error: "Someone changed this file", hasContent: true }),
    ]);
    await expect(changes.get(SPACE, uuid(22))).resolves.toBeNull();
    await expect(objects.listStagedUrls(SPACE)).resolves.toEqual(new Set([`s3://bucket/spaces/${SPACE}/changes/${uuid(21)}`]));
  });

  it("knows a space's snapshots and the checkpoints its live runs will save", async () => {
    const saver = await enqueue(uuid(23));
    await enqueue(uuid(24));
    await dao.startNextWaiting(SPACE, LEASE_MS);
    await dao.commitCheckpoint(snapshotFor(saver, uuid(23), null));
    await expect(objects.listSpaces()).resolves.toEqual([SPACE]);
    await expect(objects.listSnapshotIds(SPACE)).resolves.toEqual(new Set([uuid(23), uuid(24)]));
  });
});

function versionOf(artifactId: string, versionId: string, create: boolean, snapshotId: string | null = null, jobId: string | null = null): NewArtifactVersion {
  return {
    versionId, artifactId, create, projectId: SPACE, ticketId: TICKET, title: "Q4 deck", snapshotId, jobId, createdBy: null,
    format: "html", entrypoint: "deck/index.html", files: [{ path: "deck/index.html", bytes: 5, sha256: "f".repeat(64), contentType: "text/html" }],
    storagePrefix: `s3://bucket/spaces/${SPACE}/artifacts/${artifactId}/versions/${versionId}/files/`, totalBytes: 5,
  };
}

describe("artifacts", () => {
  const artifacts = new ArtifactDAO();

  it("numbers each artifact's versions and keeps the latest as current, saved with the run's files", async () => {
    const first = await enqueue(uuid(20));
    await dao.startNextWaiting(SPACE, LEASE_MS);
    const saved = await dao.commitCheckpoint(snapshotFor(first, uuid(20), null), [versionOf(uuid(30), uuid(31), true, uuid(20))]);
    expect(saved).toMatchObject({ artifacts: [{ artifactId: uuid(30), versionId: uuid(31), number: 1, title: "Q4 deck" }] });

    const second = await enqueue(uuid(21));
    await dao.startNextWaiting(SPACE, LEASE_MS);
    await dao.commitCheckpoint(snapshotFor(second, uuid(21), uuid(20)), [versionOf(uuid(30), uuid(32), false, uuid(21), second)]);

    const detail = await artifacts.getDetail(SPACE, uuid(30));
    expect(detail).toMatchObject({ taskKey: "FQD-1", versionCount: 2, currentVersion: { id: uuid(32), number: 2 } });
    expect(detail?.versions.map((version) => version.number)).toEqual([2, 1]);
    await expect(artifacts.listForJob(second)).resolves.toEqual([expect.objectContaining({ versionId: uuid(32), number: 2 })]);
  });

  it("lets a task revise only its own artifacts", async () => {
    const id = await enqueue(uuid(22));
    await dao.startNextWaiting(SPACE, LEASE_MS);
    await dao.commitCheckpoint(snapshotFor(id, uuid(22), null), [versionOf(uuid(33), uuid(34), true, uuid(22))]);
    await expect(artifacts.revisableIds(SPACE, TICKET, [uuid(33)])).resolves.toEqual(new Set([uuid(33)]));
    await expect(artifacts.revisableIds(SPACE, OTHER_TICKET, [uuid(33)])).resolves.toEqual(new Set());
  });

  it("gives each task's newest artifact version, dated from when its run's turn finished", async () => {
    const first = await enqueue(uuid(24));
    await dao.startNextWaiting(SPACE, LEASE_MS);
    await dao.commitCheckpoint(snapshotFor(first, uuid(24), null), [versionOf(uuid(37), uuid(38), true, uuid(24))]);
    const second = await enqueue(uuid(25));
    await dao.startNextWaiting(SPACE, LEASE_MS);
    await dao.commitCheckpoint(snapshotFor(second, uuid(25), uuid(24)), [versionOf(uuid(37), uuid(39), false, uuid(25), second)]);
    const finished = new Date("2030-01-01T00:00:00.000Z");
    await sql`INSERT INTO agent_turns (job_id, completed_at) VALUES (${second}, ${finished})`.execute(mockDb);

    const latest = await artifacts.latestForTickets([TICKET, OTHER_TICKET]);
    expect([...latest.keys()]).toEqual([TICKET]);
    expect(latest.get(TICKET)).toEqual({ title: "Q4 deck", number: 2, at: finished });
    await expect(artifacts.latestForTickets([])).resolves.toEqual(new Map());
  });

  it("finds the artifacts a person's edit to a file revises", async () => {
    const id = await enqueue(uuid(23));
    await dao.startNextWaiting(SPACE, LEASE_MS);
    await dao.commitCheckpoint(snapshotFor(id, uuid(23), null), [versionOf(uuid(35), uuid(36), true, uuid(23))]);
    await expect(artifacts.listCurrentWithPath(SPACE, "deck/index.html")).resolves.toEqual([expect.objectContaining({ artifactId: uuid(35) })]);
    await expect(artifacts.listCurrentWithPath(SPACE, "brief.md")).resolves.toEqual([]);
  });
});

describe("a person's change", () => {
  it("holds the space against runs, and runs hold it against people", async () => {
    const lease = await dao.acquireForOperation(SPACE, "op-1", LEASE_MS);
    expect(lease).toMatchObject({ currentSnapshotId: null });
    await enqueue(uuid(40));
    await expect(dao.startNextWaiting(SPACE, LEASE_MS)).resolves.toBeNull();
    await expect(dao.acquireForOperation(SPACE, "op-2", LEASE_MS)).resolves.toBeNull();

    const saved = await dao.commitOperation("op-1", lease!.token, { ...snapshotFor("", uuid(41), null), jobId: null, createdBy: null });
    expect(saved).toMatchObject({ snapshot: { id: uuid(41) } });
    await expect(dao.startNextWaiting(SPACE, LEASE_MS)).resolves.toMatchObject({ baseSnapshotId: uuid(41) });
    await expect(dao.acquireForOperation(SPACE, "op-3", LEASE_MS)).resolves.toBeNull();
  });

  it("can't save once it lost the space", async () => {
    const lease = await dao.acquireForOperation(SPACE, "op-1", 1);
    await new Promise((resolve) => setTimeout(resolve, 20));
    await dao.acquireForOperation(SPACE, "op-2", LEASE_MS);
    await expect(dao.commitOperation("op-1", lease!.token, { ...snapshotFor("", uuid(42), null), jobId: null, createdBy: null })).resolves.toBe("lease_lost");
  });
});

describe("retention", () => {
  it("retires all but the latest snapshots, never the current one or a live run's start, then lists them to purge", async () => {
    let parent: string | null = null;
    for (let n = 50; n < 54; n++) {
      const id = await enqueue(uuid(n));
      await dao.startNextWaiting(SPACE, LEASE_MS);
      await dao.commitCheckpoint(snapshotFor(id, uuid(n), parent));
      parent = uuid(n);
    }
    // A live run started from the newest snapshot; the oldest is kept by nothing.
    await enqueue(uuid(60));
    await dao.startNextWaiting(SPACE, LEASE_MS);
    await sql`UPDATE space_file_snapshots SET created_at = created_at - (interval '1 second' * (60 - extract(epoch from created_at)::int % 60))`.execute(mockDb);

    const retire = await dao.listSnapshotsToRetire(2);
    expect(retire.sort()).toEqual([uuid(50), uuid(51)]);
    await dao.markSnapshotsUnavailable(retire);
    await expect(dao.listSnapshotsToPurge(60_000)).resolves.toEqual([]);
    await expect(dao.listSnapshotsToPurge(0)).resolves.toHaveLength(2);
  });

  it("retires an artifact's old versions but never its current one", async () => {
    const artifacts = new ArtifactDAO();
    for (let n = 70; n < 73; n++) {
      const id = await enqueue(uuid(n));
      await dao.startNextWaiting(SPACE, LEASE_MS);
      await dao.commitCheckpoint(snapshotFor(id, uuid(n), n === 70 ? null : uuid(n - 1)), [versionOf(uuid(80), uuid(n + 10), n === 70, uuid(n))]);
    }
    await expect(artifacts.listVersionsToRetire(1)).resolves.toEqual(expect.arrayContaining([uuid(80), uuid(81)]));
    await expect(artifacts.listVersionsToRetire(1)).resolves.not.toContain(uuid(82));
    await artifacts.markUnavailable([uuid(80)]);
    await expect(artifacts.getDetail(SPACE, uuid(80))).resolves.toMatchObject({ versions: expect.arrayContaining([expect.objectContaining({ id: uuid(80), status: "expired" })]) });
  });
});
