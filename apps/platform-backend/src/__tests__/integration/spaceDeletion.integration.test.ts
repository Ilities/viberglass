import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Kysely, PostgresDialect, sql } from "kysely";
import { Pool } from "pg";
import type { Database } from "../../persistence/types/database";
import { ProjectDeletionSummaryDAO } from "../../persistence/project/ProjectDeletionSummaryDAO";
import { SpaceDeletionDAO } from "../../persistence/project/SpaceDeletionDAO";
import { up } from "../../migrations/153_task_runs_cascade";

let mockDb: Kysely<Database>;
jest.mock("../../persistence/config/database", () => ({
  __esModule: true,
  get default() {
    return mockDb;
  },
}));

const DELETED = "11111111-1111-4111-8111-111111111111";
const KEPT = "22222222-2222-4222-8222-222222222222";
const DELETED_TASK = "33333333-3333-4333-8333-333333333333";
const KEPT_TASK = "44444444-4444-4444-8444-444444444444";
const SCHEDULE = "55555555-5555-4555-8555-555555555555";
const SESSION = "66666666-6666-4666-8666-666666666666";
const OWN_MEDIA = "77777777-7777-4777-8777-777777777777";
const SHARED_MEDIA = "88888888-8888-4888-8888-888888888888";
const MESSAGE = "99999999-9999-4999-8999-999999999999";
const MESSAGE_MEDIA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
let container: StartedPostgreSqlContainer;

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:16-alpine").start();
  mockDb = new Kysely<Database>({ dialect: new PostgresDialect({ pool: new Pool({ connectionString: container.getConnectionUri() }) }) });
  for (const statement of [
    sql`CREATE TABLE projects (id uuid PRIMARY KEY, backing_kind text NOT NULL)`,
    sql`CREATE TABLE media_assets (id uuid PRIMARY KEY, url text NOT NULL)`,
    sql`CREATE TABLE tickets (
      id uuid PRIMARY KEY, project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      screenshot_id uuid REFERENCES media_assets(id), recording_id uuid REFERENCES media_assets(id))`,
    sql`CREATE TABLE task_messages (id uuid PRIMARY KEY, ticket_id uuid NOT NULL REFERENCES tickets(id) ON DELETE CASCADE)`,
    sql`CREATE TABLE task_message_images (
      message_id uuid NOT NULL REFERENCES task_messages(id) ON DELETE CASCADE,
      media_id uuid NOT NULL REFERENCES media_assets(id) ON DELETE CASCADE)`,
    sql`CREATE TABLE agent_sessions (id uuid PRIMARY KEY, project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE)`,
    sql`CREATE TABLE jobs (
      id varchar(255) PRIMARY KEY, tenant_id varchar(255) NOT NULL, status text NOT NULL, context jsonb DEFAULT '{}'::jsonb,
      ticket_id uuid CONSTRAINT jobs_ticket_id_fkey REFERENCES tickets(id) ON DELETE SET NULL)`,
    sql`CREATE TABLE job_log_lines (id serial PRIMARY KEY, job_id varchar(255) NOT NULL REFERENCES jobs(id) ON DELETE CASCADE)`,
    sql`CREATE TABLE job_run_manifests (job_id text PRIMARY KEY REFERENCES jobs(id) ON DELETE CASCADE, project_id text)`,
    sql`CREATE TABLE app_releases (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      preview boolean NOT NULL DEFAULT false, job_id varchar(255) REFERENCES jobs(id) ON DELETE SET NULL)`,
    sql`CREATE TABLE space_file_runs (
      job_id varchar(255) PRIMARY KEY REFERENCES jobs(id) ON DELETE CASCADE,
      project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE)`,
    sql`CREATE TABLE claw_schedules (id uuid PRIMARY KEY, project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE)`,
    sql`CREATE TABLE claw_executions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), schedule_id uuid NOT NULL REFERENCES claw_schedules(id) ON DELETE CASCADE,
      job_id varchar(255) REFERENCES jobs(id) ON DELETE SET NULL)`,
  ]) {
    await statement.execute(mockDb);
  }
  await up(mockDb);

  await sql`INSERT INTO projects VALUES (${DELETED}, 'files'), (${KEPT}, 'git')`.execute(mockDb);
  await sql`INSERT INTO media_assets VALUES
    (${OWN_MEDIA}, 's3://uploads/own.png'), (${SHARED_MEDIA}, 's3://uploads/shared.png'), (${MESSAGE_MEDIA}, 's3://uploads/message.png')`.execute(mockDb);
  await sql`INSERT INTO tickets VALUES (${DELETED_TASK}, ${DELETED}, ${OWN_MEDIA}, ${SHARED_MEDIA}), (${KEPT_TASK}, ${KEPT}, ${SHARED_MEDIA}, NULL)`.execute(mockDb);
  await sql`INSERT INTO task_messages VALUES (${MESSAGE}, ${DELETED_TASK})`.execute(mockDb);
  await sql`INSERT INTO task_message_images VALUES (${MESSAGE}, ${MESSAGE_MEDIA})`.execute(mockDb);
  await sql`INSERT INTO agent_sessions VALUES (${SESSION}, ${DELETED})`.execute(mockDb);
  await sql`INSERT INTO claw_schedules VALUES (${SCHEDULE}, ${DELETED})`.execute(mockDb);
  await sql`INSERT INTO jobs (id, tenant_id, status, ticket_id, context) VALUES
    ('job_task', 'api-server', 'completed', ${DELETED_TASK}, '{}'),
    ('job_turn', 'api-server', 'active', ${DELETED_TASK}, '{}'),
    ('job_schedule', ${DELETED}, 'completed', NULL, '{}'),
    ('job_build', 'api-server', 'failed', NULL, ${JSON.stringify({ projectId: DELETED })}::jsonb),
    ('job_files', 'api-server', 'queued', NULL, '{}'),
    ('job_orphaned', 'api-server', 'completed', NULL, '{}'),
    ('job_kept', 'api-server', 'completed', ${KEPT_TASK}, '{}'),
    ('job_login', 'api-server', 'completed', NULL, '{}')`.execute(mockDb);
  await sql`INSERT INTO job_log_lines (job_id) VALUES ('job_task'), ('job_task'), ('job_kept')`.execute(mockDb);
  await sql`INSERT INTO job_run_manifests VALUES ('job_task', ${DELETED}), ('job_orphaned', ${DELETED}), ('job_kept', ${KEPT})`.execute(mockDb);
  await sql`INSERT INTO app_releases (project_id, job_id) VALUES (${DELETED}, 'job_build')`.execute(mockDb);
  await sql`INSERT INTO space_file_runs VALUES ('job_files', ${DELETED})`.execute(mockDb);
  await sql`INSERT INTO claw_executions (schedule_id, job_id) VALUES (${SCHEDULE}, 'job_schedule')`.execute(mockDb);
}, 60_000);

afterAll(async () => {
  await mockDb?.destroy();
  await container?.stop();
});

const SPACE_RUNS = ["job_build", "job_files", "job_orphaned", "job_schedule", "job_task", "job_turn"];

describe("deleting a space", () => {
  it("counts every run of the space, with or without a task", async () => {
    await expect(new ProjectDeletionSummaryDAO().summarize(DELETED)).resolves.toMatchObject({ tickets: 1, runs: 6, sessions: 1, schedules: 1 });
  });

  it("finds the space's runs, tasks, sessions and the media no other space uses", async () => {
    const holdings = await new SpaceDeletionDAO().holdings(DELETED);

    expect([...holdings.runIds].sort()).toEqual(SPACE_RUNS);
    expect([...holdings.activeRunIds].sort()).toEqual(["job_files", "job_turn"]);
    expect(holdings.taskIds).toEqual([DELETED_TASK]);
    expect(holdings.sessionIds).toEqual([SESSION]);
    expect(holdings.media.map((media) => media.id).sort()).toEqual([OWN_MEDIA, MESSAGE_MEDIA].sort());
  });

  it("deletes the space with its runs and their rows, leaving other spaces and spaceless runs", async () => {
    await new SpaceDeletionDAO().delete(DELETED, [OWN_MEDIA, MESSAGE_MEDIA]);

    const jobs = await mockDb.selectFrom("jobs").select("id").orderBy("id").execute();
    expect(jobs.map((job) => job.id)).toEqual(["job_kept", "job_login"]);
    const logs = await mockDb.selectFrom("job_log_lines").select("job_id").execute();
    expect(logs).toEqual([{ job_id: "job_kept" }]);
    const manifests = await mockDb.selectFrom("job_run_manifests").select("job_id").execute();
    expect(manifests).toEqual([{ job_id: "job_kept" }]);
    const media = await mockDb.selectFrom("media_assets").select("id").execute();
    expect(media).toEqual([{ id: SHARED_MEDIA }]);
    const projects = await mockDb.selectFrom("projects").select("id").execute();
    expect(projects).toEqual([{ id: KEPT }]);
  });

  it("takes a task's runs with the task", async () => {
    await mockDb.deleteFrom("tickets").where("id", "=", KEPT_TASK).execute();

    const jobs = await mockDb.selectFrom("jobs").select("id").execute();
    expect(jobs).toEqual([{ id: "job_login" }]);
  });
});
