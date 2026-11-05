import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Kysely, PostgresDialect, sql } from "kysely";
import { Pool } from "pg";
import type { Database } from "../../persistence/types/database";
import { AppReleaseDAO } from "../../persistence/apps/AppReleaseDAO";
import { AppSpaceDAO } from "../../persistence/apps/AppSpaceDAO";
import { PlatformRunnerDAO } from "../../persistence/clanker/PlatformRunnerDAO";
import { up, down } from "../../migrations/135_app_releases";
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
const ARCHIVED = "22222222-2222-4222-8222-222222222222";
const GIT_SPACE = "33333333-3333-4333-8333-333333333333";
const COMMIT = "a".repeat(40);
let container: StartedPostgreSqlContainer;
const releases = new AppReleaseDAO();
let jobCount = 0;

async function job(status: string): Promise<string> {
  const id = `build_${++jobCount}`;
  await sql`INSERT INTO jobs (id, status, job_kind) VALUES (${id}, ${status}, 'build_release')`.execute(mockDb);
  return id;
}

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:16-alpine").start();
  mockDb = new Kysely<Database>({ dialect: new PostgresDialect({ pool: new Pool({ connectionString: container.getConnectionUri() }) }) });
  await sql`CREATE TABLE projects (id uuid PRIMARY KEY, backing_kind text NOT NULL, archived_at timestamptz, created_at timestamptz NOT NULL DEFAULT now())`.execute(mockDb);
  await sql`CREATE TABLE jobs (id varchar(255) PRIMARY KEY, status text NOT NULL, job_kind text NOT NULL)`.execute(mockDb);
  await sql`CREATE TABLE clankers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, slug text NOT NULL UNIQUE, description text,
    deployment_strategy_id uuid, deployment_config jsonb, agent text, secret_bindings jsonb NOT NULL DEFAULT '[]',
    status text NOT NULL DEFAULT 'inactive', status_message text, deleted_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
  )`.execute(mockDb);
  await sql`INSERT INTO projects (id, backing_kind, archived_at) VALUES (${SPACE}, 'app', NULL), (${ARCHIVED}, 'app', now()), (${GIT_SPACE}, 'git', NULL)`.execute(mockDb);
  await sql`CREATE TABLE tickets (id uuid PRIMARY KEY)`.execute(mockDb);
  await up(mockDb);
  await releaseTasksUp(mockDb);
  await sql`ALTER TABLE app_releases ADD COLUMN settings jsonb`.execute(mockDb);
  await addPreviewBuilds(mockDb);
}, 60_000);

afterAll(async () => {
  await mockDb?.destroy();
  await container?.stop();
});

beforeEach(async () => {
  await sql`DELETE FROM app_releases`.execute(mockDb);
});

describe("app releases", () => {
  it("builds each commit of a space once", async () => {
    const first = await releases.createBuilding(SPACE, COMMIT);
    expect(first).toMatchObject({ projectId: SPACE, commitSha: COMMIT, status: "building", jobId: null });
    await expect(releases.createBuilding(SPACE, COMMIT)).resolves.toBeNull();
    await expect(releases.hasCommit(SPACE, COMMIT)).resolves.toBe(true);
    await expect(releases.hasCommit(SPACE, "b".repeat(40))).resolves.toBe(false);
  });

  it("takes one outcome per release", async () => {
    const release = await releases.createBuilding(SPACE, COMMIT);
    const jobId = await job("active");
    await releases.setJob(release!.id, jobId);

    const ready = { status: "ready" as const, bundleSha256: "c".repeat(64), bundleBytes: 3_000_000_000, nodeVersion: "v24.11.0", buildLog: "ok", settings: null };
    await expect(releases.finish(release!.id, ready)).resolves.toBe(true);
    await expect(releases.finish(release!.id, { status: "failed", failureReason: "late", buildLog: null })).resolves.toBe(false);
    await expect(releases.getByJobId(jobId)).resolves.toMatchObject({ status: "ready", bundleBytes: 3_000_000_000, nodeVersion: "v24.11.0" });
  });

  it("fails builds whose run ended without reporting, and ones never dispatched", async () => {
    const running = await releases.createBuilding(SPACE, "1".repeat(40));
    await releases.setJob(running!.id, await job("active"));
    const lost = await releases.createBuilding(SPACE, "2".repeat(40));
    await releases.setJob(lost!.id, await job("failed"));
    const starting = await releases.createBuilding(SPACE, "3".repeat(40));
    const stranded = await releases.createBuilding(SPACE, "4".repeat(40));
    await sql`UPDATE app_releases SET created_at = now() - interval '1 hour' WHERE id = ${stranded!.id}`.execute(mockDb);

    await expect(releases.failAbandoned(new Date(Date.now() - 10 * 60 * 1000))).resolves.toBe(2);

    const statuses = await Promise.all([running, lost, starting, stranded].map(async (release) => (await releases.getById(release!.id))?.status));
    expect(statuses).toEqual(["building", "failed", "building", "failed"]);
  });

  it("watches App spaces that aren't archived", async () => {
    await expect(new AppSpaceDAO().listLiveIds()).resolves.toEqual([SPACE]);
  });

  it("refuses an unknown job kind", async () => {
    await expect(sql`INSERT INTO jobs (id, status, job_kind) VALUES ('x', 'queued', 'deploy')`.execute(mockDb)).rejects.toMatchObject({ code: "23514" });
  });
});

describe("platform runners", () => {
  it("creates the app builder once, however often it's asked", async () => {
    const runners = new PlatformRunnerDAO();
    const runner = { name: "App builder", slug: "viberglass-app-builder", deploymentStrategyId: "44444444-4444-4444-8444-444444444444", deploymentConfig: { version: 1 } };

    const first = await runners.create("app_builder", runner);
    await expect(runners.create("app_builder", runner)).resolves.toBe(first);
    await expect(runners.findId("app_builder")).resolves.toBe(first);
    await expect(sql`INSERT INTO clankers (name, slug, purpose) VALUES ('Other', 'other', 'app_builder')`.execute(mockDb)).rejects.toMatchObject({ code: "23505" });
  });
});

describe("rolling back", () => {
  it("drops the releases and the runner marker", async () => {
    await sql`DELETE FROM jobs`.execute(mockDb);
    await down(mockDb);
    await expect(sql`SELECT purpose FROM clankers`.execute(mockDb)).rejects.toMatchObject({ code: "42703" });
  });
});
