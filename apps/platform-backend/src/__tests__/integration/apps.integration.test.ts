import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Kysely, PostgresDialect, sql } from "kysely";
import { Pool } from "pg";
import type { Database } from "../../persistence/types/database";
import { AppDAO } from "../../persistence/apps/AppDAO";
import { AppDataBackupDAO } from "../../persistence/apps/AppDataBackupDAO";
import { AppReleaseDAO } from "../../persistence/apps/AppReleaseDAO";
import { AppReleaseReportDAO } from "../../persistence/apps/AppReleaseReportDAO";
import { up as releasesUp } from "../../migrations/135_app_releases";
import { up, down } from "../../migrations/136_apps";
import { up as releaseTasksUp } from "../../migrations/140_app_release_tasks";
import { addPreviewBuilds } from "../../migrations/141_app_previews";

let mockDb: Kysely<Database>;
jest.mock("../../persistence/config/database", () => ({
  __esModule: true,
  get default() {
    return mockDb;
  },
}));

const SPACE = "11111111-1111-4111-8111-111111111111";
const TASK = "22222222-2222-4222-8222-222222222222";
const READY = { status: "ready" as const, bundleSha256: "c".repeat(64), bundleBytes: 2048, nodeVersion: "v24.11.0", buildLog: "ok" };
let container: StartedPostgreSqlContainer;
const apps = new AppDAO();
const releases = new AppReleaseDAO();
const reports = new AppReleaseReportDAO();

async function readyRelease(commit: string, createdAt: string): Promise<string> {
  const release = await releases.createBuilding(SPACE, commit.repeat(40));
  await releases.finish(release!.id, READY);
  await sql`UPDATE app_releases SET created_at = ${createdAt}::timestamptz WHERE id = ${release!.id}`.execute(mockDb);
  return release!.id;
}

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:16-alpine").start();
  mockDb = new Kysely<Database>({ dialect: new PostgresDialect({ pool: new Pool({ connectionString: container.getConnectionUri() }) }) });
  await sql`CREATE TABLE projects (id uuid PRIMARY KEY, backing_kind text NOT NULL, archived_at timestamptz, created_at timestamptz NOT NULL DEFAULT now())`.execute(mockDb);
  await sql`CREATE TABLE jobs (id varchar(255) PRIMARY KEY, status text NOT NULL, job_kind text NOT NULL)`.execute(mockDb);
  await sql`CREATE TABLE clankers (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), slug text, deleted_at timestamptz)`.execute(mockDb);
  await sql`CREATE TABLE tickets (id uuid PRIMARY KEY)`.execute(mockDb);
  await sql`INSERT INTO projects (id, backing_kind) VALUES (${SPACE}, 'app')`.execute(mockDb);
  await sql`INSERT INTO tickets (id) VALUES (${TASK})`.execute(mockDb);
  await releasesUp(mockDb);
  await up(mockDb);
  await releaseTasksUp(mockDb);
  await addPreviewBuilds(mockDb);
}, 60_000);

afterAll(async () => {
  await mockDb?.destroy();
  await container?.stop();
});

beforeEach(async () => {
  await sql`DELETE FROM apps`.execute(mockDb);
  await sql`DELETE FROM app_data_backups`.execute(mockDb);
  await sql`DELETE FROM app_releases`.execute(mockDb);
});

describe("apps", () => {
  it("starts on, and off until something runs it", async () => {
    await expect(apps.ensure(SPACE)).resolves.toMatchObject({ power: "on", state: "off", currentReleaseId: null, busySince: null });
    await apps.update(SPACE, { power: "off" });
    await expect(apps.ensure(SPACE)).resolves.toMatchObject({ power: "off" });
  });

  it("lets one start, stop or switch run at a time, and takes over one abandoned long ago", async () => {
    await apps.ensure(SPACE);
    const longAgo = new Date(Date.now() - 60 * 60 * 1000);

    await expect(apps.claim(SPACE, longAgo)).resolves.toMatchObject({ projectId: SPACE });
    await expect(apps.claim(SPACE, longAgo)).resolves.toBeNull();
    await expect(apps.claim(SPACE, new Date(Date.now() + 1000))).resolves.toMatchObject({ projectId: SPACE });

    await apps.finish(SPACE, { state: "running" });
    await expect(apps.get(SPACE)).resolves.toMatchObject({ state: "running", busySince: null });
    await expect(apps.claim(SPACE, longAgo)).resolves.not.toBeNull();
  });

  it("offers the newest built release that hasn't failed to go live", async () => {
    const older = await readyRelease("1", "2026-11-03T10:00:00Z");
    const newer = await readyRelease("2", "2026-11-03T11:00:00Z");
    await releases.createBuilding(SPACE, "3".repeat(40));

    await expect(releases.newestLiveCandidate(SPACE)).resolves.toMatchObject({ id: newer });
    await releases.markLiveFailure(newer, "unhealthy");
    await expect(releases.newestLiveCandidate(SPACE)).resolves.toMatchObject({ id: older });

    await releases.markLive(older);
    await expect(releases.getById(older)).resolves.toMatchObject({ liveFailure: null, wentLiveAt: expect.any(String) });
    await expect(releases.getById(newer)).resolves.toMatchObject({ liveFailure: "unhealthy", wentLiveAt: null });
  });

  it("tells a task about its release once, and finds a later release that took it live", async () => {
    const own = await readyRelease("5", "2026-11-03T10:00:00Z");
    await releases.linkTicket(SPACE, "5".repeat(40), TASK);
    const later = await readyRelease("6", "2026-11-03T11:00:00Z");

    await expect(reports.listUnreported()).resolves.toEqual([expect.objectContaining({ id: own, ticketId: TASK })]);
    await expect(reports.laterLive({ projectId: SPACE, createdAt: "2026-11-03T10:00:00Z" })).resolves.toBeNull();
    await releases.markLive(later);
    await expect(reports.laterLive({ projectId: SPACE, createdAt: "2026-11-03T10:00:00Z" })).resolves.toMatchObject({ id: later });

    await expect(reports.markReported(own)).resolves.toBe(true);
    await expect(reports.markReported(own)).resolves.toBe(false);
    await expect(reports.listUnreported()).resolves.toEqual([]);
  });

  it("starts a release for a task, and leaves a task already linked alone", async () => {
    const release = await releases.createBuilding(SPACE, "7".repeat(40), { ticketId: TASK });
    expect(release).toMatchObject({ ticketId: TASK });

    await releases.linkTicket(SPACE, "7".repeat(40), "33333333-3333-4333-8333-333333333333");
    await expect(releases.getById(release!.id)).resolves.toMatchObject({ ticketId: TASK });
  });

  it("keeps an app's backups and forgets its current release when the release goes", async () => {
    const releaseId = await readyRelease("4", "2026-11-03T10:00:00Z");
    await apps.ensure(SPACE);
    await apps.update(SPACE, { currentReleaseId: releaseId });
    await new AppDataBackupDAO().create({ id: "55555555-5555-4555-8555-555555555555", projectId: SPACE, reason: "release", releaseId, objects: 2, bytes: 4096 });

    await sql`DELETE FROM app_releases WHERE id = ${releaseId}`.execute(mockDb);

    await expect(apps.get(SPACE)).resolves.toMatchObject({ currentReleaseId: null });
    const { rows } = await sql<{ release_id: string | null; bytes: string }>`SELECT release_id, bytes FROM app_data_backups`.execute(mockDb);
    expect(rows).toEqual([{ release_id: null, bytes: "4096" }]);
  });
});

describe("rolling back", () => {
  it("drops the apps and their backups", async () => {
    await down(mockDb);
    await expect(sql`SELECT 1 FROM apps`.execute(mockDb)).rejects.toMatchObject({ code: "42P01" });
    await expect(sql`SELECT live_failure FROM app_releases`.execute(mockDb)).rejects.toMatchObject({ code: "42703" });
  });
});
