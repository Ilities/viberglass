import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Kysely, PostgresDialect, sql } from "kysely";
import { Pool } from "pg";
import type { Database } from "../../persistence/types/database";
import { AppDAO } from "../../persistence/apps/AppDAO";
import { AppDataBackupDAO } from "../../persistence/apps/AppDataBackupDAO";
import { AppSpaceDAO } from "../../persistence/apps/AppSpaceDAO";
import { ProjectDeletionSummaryDAO } from "../../persistence/project/ProjectDeletionSummaryDAO";
import { up as releasesUp } from "../../migrations/135_app_releases";
import { up as appsUp } from "../../migrations/136_apps";
import { up as sessionsUp } from "../../migrations/137_app_gateway_sessions";
import { up as stateUp } from "../../migrations/139_app_handoff_state";
import { up as releaseTasksUp } from "../../migrations/140_app_release_tasks";
import { up as previewsUp } from "../../migrations/141_app_previews";
import { up as rollbackUp } from "../../migrations/142_app_rollback";
import { up as expiryUp } from "../../migrations/143_app_credential_expiry";
import { up, down } from "../../migrations/144_app_archive_backup";

let mockDb: Kysely<Database>;
jest.mock("../../persistence/config/database", () => ({
  __esModule: true,
  get default() {
    return mockDb;
  },
}));

const LIVE = "11111111-1111-4111-8111-111111111111";
const ARCHIVED_SETTLED = "22222222-2222-4222-8222-222222222222";
const ARCHIVED_STOPPING = "33333333-3333-4333-8333-333333333333";
const ARCHIVED_OWING = "44444444-4444-4444-8444-444444444444";
const ARCHIVED_NO_APP = "55555555-5555-4555-8555-555555555555";
const GIT_SPACE = "66666666-6666-4666-8666-666666666666";
let container: StartedPostgreSqlContainer;
const apps = new AppDAO();
const backups = new AppDataBackupDAO();

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:16-alpine").start();
  mockDb = new Kysely<Database>({ dialect: new PostgresDialect({ pool: new Pool({ connectionString: container.getConnectionUri() }) }) });
  await sql`CREATE TABLE projects (
    id uuid PRIMARY KEY, backing_kind text NOT NULL, archived_at timestamptz, created_at timestamptz NOT NULL DEFAULT now())`.execute(mockDb);
  await sql`CREATE TABLE jobs (
    id varchar(255) PRIMARY KEY, status text NOT NULL, job_kind text NOT NULL, ticket_id uuid, tenant_id text NOT NULL DEFAULT 'api-server', context jsonb)`.execute(mockDb);
  await sql`CREATE TABLE job_run_manifests (job_id text PRIMARY KEY, project_id text)`.execute(mockDb);
  await sql`CREATE TABLE space_file_runs (job_id varchar(255) PRIMARY KEY, project_id uuid NOT NULL)`.execute(mockDb);
  await sql`CREATE TABLE claw_executions (id uuid PRIMARY KEY, schedule_id uuid NOT NULL, job_id varchar(255))`.execute(mockDb);
  await sql`CREATE TABLE clankers (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), slug text, deleted_at timestamptz)`.execute(mockDb);
  await sql`CREATE TABLE tickets (id uuid PRIMARY KEY, project_id uuid)`.execute(mockDb);
  await sql`CREATE TABLE users (id uuid PRIMARY KEY)`.execute(mockDb);
  await sql`CREATE TABLE user_sessions (id uuid PRIMARY KEY)`.execute(mockDb);
  await sql`CREATE TABLE agent_sessions (id uuid PRIMARY KEY, project_id uuid)`.execute(mockDb);
  await sql`CREATE TABLE claw_schedules (id uuid PRIMARY KEY, project_id uuid)`.execute(mockDb);
  await sql`CREATE TABLE project_scm_configs (project_id uuid PRIMARY KEY, source_repository text NOT NULL)`.execute(mockDb);
  await sql`INSERT INTO projects (id, backing_kind, archived_at, created_at) VALUES
    (${LIVE}, 'app', NULL, now() - interval '5 minutes'),
    (${ARCHIVED_SETTLED}, 'app', now(), now() - interval '4 minutes'),
    (${ARCHIVED_STOPPING}, 'app', now(), now() - interval '3 minutes'),
    (${ARCHIVED_OWING}, 'app', now(), now() - interval '2 minutes'),
    (${ARCHIVED_NO_APP}, 'app', now(), now() - interval '1 minute'),
    (${GIT_SPACE}, 'git', NULL, now())`.execute(mockDb);
  await releasesUp(mockDb);
  await appsUp(mockDb);
  await sessionsUp(mockDb);
  await stateUp(mockDb);
  await releaseTasksUp(mockDb);
  await previewsUp(mockDb);
  await rollbackUp(mockDb);
  await expiryUp(mockDb);
  await up(mockDb);
}, 60_000);

afterAll(async () => {
  await mockDb?.destroy();
  await container?.stop();
});

describe("archiving an App space", () => {
  it("sweeps live App spaces, and archived ones until their app is off with its copy taken", async () => {
    await mockDb.insertInto("apps").values([
      { project_id: LIVE, power: "on", state: "running" },
      { project_id: ARCHIVED_SETTLED, power: "off", state: "off" },
      { project_id: ARCHIVED_STOPPING, power: "off", state: "stopping" },
      { project_id: ARCHIVED_OWING, power: "off", state: "off", archive_backup_due: true },
    ]).execute();

    await expect(new AppSpaceDAO().listSweptIds()).resolves.toEqual([LIVE, ARCHIVED_STOPPING, ARCHIVED_OWING]);
    await expect(new AppSpaceDAO().isArchived(ARCHIVED_SETTLED)).resolves.toBe(true);
    await expect(new AppSpaceDAO().isArchived(LIVE)).resolves.toBe(false);
  });

  it("turns the app off owing a copy, and clears it once taken", async () => {
    await apps.turnOffForArchive(LIVE, true);
    await expect(apps.get(LIVE)).resolves.toMatchObject({ power: "off", archiveBackupDue: true });

    await backups.create({ id: "77777777-7777-4777-8777-777777777777", projectId: LIVE, reason: "archive", releaseId: null, fromReleaseId: null, objects: 2, bytes: 20 });
    await apps.clearArchiveBackup(LIVE);
    await expect(apps.get(LIVE)).resolves.toMatchObject({ archiveBackupDue: false });
  });

  it("counts an App space's releases, backups and repository for its deletion", async () => {
    await mockDb.insertInto("app_releases").values([
      { project_id: LIVE, commit_sha: "a".repeat(40), status: "ready" },
      { project_id: LIVE, commit_sha: "b".repeat(40), status: "ready", preview: true },
    ]).execute();
    await sql`INSERT INTO project_scm_configs (project_id, source_repository) VALUES (${LIVE}, 'acme/laptops')`.execute(mockDb);

    const summary = new ProjectDeletionSummaryDAO();
    await expect(summary.summarize(LIVE)).resolves.toMatchObject({ app: { releases: 1, backups: 1, repository: "acme/laptops" } });
    await expect(summary.summarize(GIT_SPACE)).resolves.toMatchObject({ app: null });
  });

  it("migrates down, dropping the archive copies", async () => {
    await down(mockDb);
    await expect(mockDb.selectFrom("app_data_backups").select("id").execute()).resolves.toEqual([]);
    await up(mockDb);
  });
});
