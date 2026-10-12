import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Kysely, PostgresDialect, sql } from "kysely";
import { Pool } from "pg";
import type { Database } from "../../persistence/types/database";
import { up } from "../../migrations/119_space_files";
import { SpaceFilesDAO, type NewSpaceFileSnapshot } from "../../persistence/spaceFiles/SpaceFilesDAO";

let mockDb: Kysely<Database>;
jest.mock("../../persistence/config/database", () => ({
  __esModule: true,
  get default() {
    return mockDb;
  },
}));

const SPACE = "11111111-1111-4111-8111-111111111111";
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
    id, projectId: SPACE, parentId, jobId, storageUrl: `s3://bucket/spaces/${SPACE}/snapshots/${id}/workspace.tar.gz`,
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
  await sql`CREATE TABLE jobs (id varchar(255) PRIMARY KEY, status text NOT NULL, progress jsonb)`.execute(mockDb);
  await sql`INSERT INTO projects VALUES (${SPACE})`.execute(mockDb);
  await up(mockDb);
}, 60_000);

afterAll(async () => {
  await mockDb?.destroy();
  await container?.stop();
});

beforeEach(async () => {
  await sql`DELETE FROM space_file_runs`.execute(mockDb);
  await sql`DELETE FROM space_file_state`.execute(mockDb);
  await sql`DELETE FROM space_file_snapshots`.execute(mockDb);
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
    expect(saved).toMatchObject({ id: uuid(1), fileCount: 1, totalBytes: 5 });

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
});
