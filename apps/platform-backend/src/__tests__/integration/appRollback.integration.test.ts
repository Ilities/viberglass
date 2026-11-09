import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Kysely, PostgresDialect, sql } from "kysely";
import { Pool } from "pg";
import type { Database } from "../../persistence/types/database";
import { AppDAO } from "../../persistence/apps/AppDAO";
import { AppDataBackupDAO } from "../../persistence/apps/AppDataBackupDAO";
import { AppReleaseDAO } from "../../persistence/apps/AppReleaseDAO";
import { AppReleaseRollbackDAO } from "../../persistence/apps/AppReleaseRollbackDAO";
import { AppRetentionDAO } from "../../persistence/apps/AppRetentionDAO";
import { up as releasesUp } from "../../migrations/135_app_releases";
import { up as appsUp } from "../../migrations/136_apps";
import { up as sessionsUp } from "../../migrations/137_app_gateway_sessions";
import { up as stateUp } from "../../migrations/139_app_handoff_state";
import { up as releaseTasksUp } from "../../migrations/140_app_release_tasks";
import { up as previewsUp } from "../../migrations/141_app_previews";
import { up, down } from "../../migrations/142_app_rollback";

let mockDb: Kysely<Database>;
jest.mock("../../persistence/config/database", () => ({
  __esModule: true,
  get default() {
    return mockDb;
  },
}));

const SPACE = "11111111-1111-4111-8111-111111111111";
const TASK = "22222222-2222-4222-8222-222222222222";
const USER = "33333333-3333-4333-8333-333333333333";
let container: StartedPostgreSqlContainer;
const apps = new AppDAO();
const backups = new AppDataBackupDAO();
const releases = new AppReleaseDAO();
const rollbacks = new AppReleaseRollbackDAO();
const retention = new AppRetentionDAO();
let commits = 0;

interface ReleaseRow {
  createdAt: string;
  wentLiveAt?: string | null;
  status?: "building" | "ready" | "failed";
  preview?: boolean;
  ticketId?: string | null;
}

async function release(row: ReleaseRow): Promise<string> {
  const commit = String(++commits).padStart(40, "0");
  const inserted = await mockDb
    .insertInto("app_releases")
    .values({
      project_id: SPACE,
      commit_sha: commit,
      status: row.status ?? "ready",
      created_at: sql<Date>`${row.createdAt}::timestamptz`,
      went_live_at: row.wentLiveAt ? new Date(row.wentLiveAt) : null,
      preview: row.preview ?? false,
      ticket_id: row.ticketId ?? null,
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  return inserted.id;
}

async function backup(id: string, fromReleaseId: string | null, createdAt: string): Promise<void> {
  await backups.create({ id, projectId: SPACE, reason: "release", releaseId: null, fromReleaseId, objects: 1, bytes: 10 });
  await sql`UPDATE app_data_backups SET created_at = ${new Date(createdAt)} WHERE id = ${id}`.execute(mockDb);
}

async function rolledBack(): Promise<string[]> {
  const rows = await mockDb.selectFrom("app_releases").select("id").where("rolled_back_at", "is not", null).orderBy("created_at").execute();
  return rows.map((row) => row.id);
}

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:16-alpine").start();
  mockDb = new Kysely<Database>({ dialect: new PostgresDialect({ pool: new Pool({ connectionString: container.getConnectionUri() }) }) });
  await sql`CREATE TABLE projects (
    id uuid PRIMARY KEY, slug text NOT NULL, is_private boolean NOT NULL DEFAULT false, backing_kind text NOT NULL,
    archived_at timestamptz, created_at timestamptz NOT NULL DEFAULT now())`.execute(mockDb);
  await sql`CREATE TABLE jobs (id varchar(255) PRIMARY KEY, status text NOT NULL, job_kind text NOT NULL)`.execute(mockDb);
  await sql`CREATE TABLE clankers (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), slug text, deleted_at timestamptz)`.execute(mockDb);
  await sql`CREATE TABLE tickets (id uuid PRIMARY KEY)`.execute(mockDb);
  await sql`CREATE TABLE users (id uuid PRIMARY KEY)`.execute(mockDb);
  await sql`CREATE TABLE user_sessions (id uuid PRIMARY KEY)`.execute(mockDb);
  await sql`INSERT INTO projects (id, slug, backing_kind) VALUES (${SPACE}, 'laptops', 'app')`.execute(mockDb);
  await sql`INSERT INTO tickets (id) VALUES (${TASK})`.execute(mockDb);
  await sql`INSERT INTO users (id) VALUES (${USER})`.execute(mockDb);
  await releasesUp(mockDb);
  await appsUp(mockDb);
  await sessionsUp(mockDb);
  await stateUp(mockDb);
  await releaseTasksUp(mockDb);
  await previewsUp(mockDb);
  await up(mockDb);
  // Later migrations' columns that the retention query reads.
  await sql`ALTER TABLE apps ADD COLUMN restore_backup_id uuid`.execute(mockDb);
  await sql`CREATE TABLE claw_schedules (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), backup_id uuid)`.execute(mockDb);
}, 60_000);

afterAll(async () => {
  await mockDb?.destroy();
  await container?.stop();
});

beforeEach(async () => {
  await sql`DELETE FROM apps`.execute(mockDb);
  await sql`DELETE FROM app_data_backups`.execute(mockDb);
  await sql`DELETE FROM app_previews`.execute(mockDb);
  await sql`DELETE FROM app_releases`.execute(mockDb);
});

describe("rolling back", () => {
  it("sets aside the releases newer than the target and stops them going live by themselves", async () => {
    // Finer than a millisecond, as release times are in the database.
    const first = await release({ createdAt: "2026-11-01T10:00:00.123456Z", wentLiveAt: "2026-11-01T10:05:00Z" });
    const second = await release({ createdAt: "2026-11-02T10:00:00Z", wentLiveAt: "2026-11-02T10:05:00Z", ticketId: TASK });
    const building = await release({ createdAt: "2026-11-03T10:00:00Z", status: "building" });
    await release({ createdAt: "2026-11-03T11:00:00Z", preview: true });

    const setAside = await rollbacks.setAsideAfter({ id: first, projectId: SPACE });

    expect(setAside.map((aside) => aside.id).sort()).toEqual([second, building].sort());
    expect(setAside.find((aside) => aside.id === second)).toMatchObject({ ticketId: TASK, rolledBackAt: expect.any(String) });
    await expect(releases.newestLiveCandidate(SPACE)).resolves.toMatchObject({ id: first });

    const third = await release({ createdAt: "2026-11-04T10:00:00Z" });
    await expect(releases.newestLiveCandidate(SPACE)).resolves.toMatchObject({ id: third });
  });

  it("takes the mark off a release made live again, and off those older than it, without telling about them twice", async () => {
    const first = await release({ createdAt: "2026-11-01T10:00:00Z", wentLiveAt: "2026-11-01T10:05:00Z" });
    const second = await release({ createdAt: "2026-11-02T10:00:00Z", wentLiveAt: "2026-11-02T10:05:00Z" });
    const third = await release({ createdAt: "2026-11-03T10:00:00Z", wentLiveAt: "2026-11-03T10:05:00Z" });
    await rollbacks.setAsideAfter({ id: first, projectId: SPACE });

    const setAside = await rollbacks.setAsideAfter({ id: second, projectId: SPACE });

    expect(setAside).toEqual([]);
    await expect(rolledBack()).resolves.toEqual([third]);
  });

  it("keeps a rollback order on the app until that release's order is cleared", async () => {
    const first = await release({ createdAt: "2026-11-01T10:00:00Z", wentLiveAt: "2026-11-01T10:05:00Z" });
    const second = await release({ createdAt: "2026-11-02T10:00:00Z", wentLiveAt: "2026-11-02T10:05:00Z" });
    await apps.ensure(SPACE);
    await backup("44444444-4444-4444-8444-444444444444", first, "2026-11-02T10:04:00Z");

    await apps.orderRollback(SPACE, { releaseId: first, backupId: "44444444-4444-4444-8444-444444444444", requestedBy: USER });
    await apps.clearRollback(SPACE, second);
    await expect(apps.get(SPACE)).resolves.toMatchObject({
      rollback: { releaseId: first, backupId: "44444444-4444-4444-8444-444444444444", requestedBy: USER },
    });

    await apps.clearRollback(SPACE, first);
    await expect(apps.get(SPACE)).resolves.toMatchObject({ rollback: null });
  });

  it("finds each release's newest copy of its data", async () => {
    const first = await release({ createdAt: "2026-11-01T10:00:00Z", wentLiveAt: "2026-11-01T10:05:00Z" });
    await backup("44444444-4444-4444-8444-444444444441", first, "2026-11-02T10:00:00Z");
    await backup("44444444-4444-4444-8444-444444444442", first, "2026-11-03T10:00:00Z");
    await backup("44444444-4444-4444-8444-444444444443", null, "2026-11-04T10:00:00Z");

    await expect(backups.dataPoints(SPACE)).resolves.toEqual([
      { backupId: "44444444-4444-4444-8444-444444444442", releaseId: first, takenAt: new Date("2026-11-03T10:00:00Z") },
    ]);
    await expect(backups.dataPointFor(first)).resolves.toMatchObject({ backupId: "44444444-4444-4444-8444-444444444442" });
  });
});

describe("retention", () => {
  const WEEK_AGO = new Date("2026-10-28T12:00:00Z");

  it("keeps the current release, the newest that went live, rollback targets, previews' builds and recent builds", async () => {
    const live = [];
    for (const day of [1, 2, 3, 4]) live.push(await release({ createdAt: `2026-10-0${day}T10:00:00Z`, wentLiveAt: `2026-10-0${day}T10:05:00Z` }));
    const [oldest, older] = live;
    const current = await release({ createdAt: "2026-09-01T10:00:00Z", wentLiveAt: "2026-11-01T10:00:00Z" });
    const target = await release({ createdAt: "2026-09-02T10:00:00Z", wentLiveAt: "2026-09-02T10:05:00Z" });
    const unusedOld = await release({ createdAt: "2026-10-20T10:00:00Z" });
    await release({ createdAt: "2026-11-01T10:00:00Z" });
    const previewBuild = await release({ createdAt: "2026-10-01T09:00:00Z", preview: true });
    await release({ createdAt: "2026-10-01T08:00:00Z", status: "failed" });
    await apps.ensure(SPACE);
    await apps.update(SPACE, { currentReleaseId: current });
    await apps.orderRollback(SPACE, { releaseId: target, backupId: null, requestedBy: USER });
    await mockDb
      .insertInto("app_previews")
      .values({ address: "preview-abcd2345", project_id: SPACE, ticket_id: TASK, pull_request_url: "https://github.com/a/b/pull/1", commit_sha: "f".repeat(40), release_id: previewBuild })
      .execute();

    const retired = await retention.listBundlesToRetire(3, WEEK_AGO);

    // The current release counts among the three newest that went live.
    expect(retired.map((row) => row.id).sort()).toEqual([oldest, older, unusedOld].sort());
    expect(retired[0]).toMatchObject({ projectId: SPACE });
  });

  it("purges a retired bundle only after the grace period, once", async () => {
    const old = await release({ createdAt: "2026-10-01T10:00:00Z" });
    await retention.markBundlesRemoved([old]);

    await expect(retention.listBundlesToPurge(new Date(Date.now() - 60_000))).resolves.toEqual([]);
    await expect(retention.listBundlesToPurge(new Date(Date.now() + 60_000))).resolves.toEqual([{ id: old, projectId: SPACE }]);
    await retention.markBundlePurged(old);
    await expect(retention.listBundlesToPurge(new Date(Date.now() + 60_000))).resolves.toEqual([]);
    await expect(releases.getById(old)).resolves.toMatchObject({ bundleRemoved: true });
  });

  it("deletes old backups but keeps each kept release's data point and a rollback's data", async () => {
    const kept = await release({ createdAt: "2026-09-01T10:00:00Z", wentLiveAt: "2026-09-01T10:05:00Z" });
    const removed = await release({ createdAt: "2026-09-02T10:00:00Z", wentLiveAt: "2026-09-02T10:05:00Z" });
    await retention.markBundlesRemoved([removed]);
    await backup("44444444-4444-4444-8444-444444444441", kept, "2026-09-02T10:00:00Z");
    await backup("44444444-4444-4444-8444-444444444442", kept, "2026-09-03T10:00:00Z");
    await backup("44444444-4444-4444-8444-444444444443", removed, "2026-09-04T10:00:00Z");
    await backup("44444444-4444-4444-8444-444444444444", null, "2026-09-05T10:00:00Z");
    await backup("44444444-4444-4444-8444-444444444445", null, "2026-09-06T10:00:00Z");
    await backup("44444444-4444-4444-8444-444444444446", null, "2026-11-03T10:00:00Z");
    await apps.ensure(SPACE);
    await apps.orderRollback(SPACE, { releaseId: kept, backupId: "44444444-4444-4444-8444-444444444445", requestedBy: USER });

    const deleted = await retention.listBackupsToDelete(new Date("2026-10-05T00:00:00Z"));

    expect(deleted.map((row) => row.id).sort()).toEqual([
      "44444444-4444-4444-8444-444444444441",
      "44444444-4444-4444-8444-444444444443",
      "44444444-4444-4444-8444-444444444444",
    ]);
    await retention.deleteBackup("44444444-4444-4444-8444-444444444441");
    await expect(backups.dataPointFor(kept)).resolves.toMatchObject({ backupId: "44444444-4444-4444-8444-444444444442" });
  });
});

describe("migration 142", () => {
  it("goes down and up again", async () => {
    await down(mockDb);
    await up(mockDb);
    await expect(rolledBack()).resolves.toEqual([]);
  });
});
