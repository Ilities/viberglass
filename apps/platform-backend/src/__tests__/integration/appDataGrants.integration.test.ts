import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Kysely, PostgresDialect, sql } from "kysely";
import { Pool } from "pg";
import type { Database } from "../../persistence/types/database";
import { AppDataGrantDAO } from "../../persistence/apps/AppDataGrantDAO";
import { up, down } from "../../migrations/146_schedule_actions_and_data_grants";

let mockDb: Kysely<Database>;
jest.mock("../../persistence/config/database", () => ({
  __esModule: true,
  get default() {
    return mockDb;
  },
}));

const SPACE = "11111111-1111-4111-8111-111111111111";
const TASK = "22222222-2222-4222-8222-222222222222";
const OTHER_TASK = "44444444-4444-4444-8444-444444444444";
const USER = "33333333-3333-4333-8333-333333333333";
let container: StartedPostgreSqlContainer;
const grants = new AppDataGrantDAO();

function grant(id: string, ticketId = TASK) {
  return { id, projectId: SPACE, ticketId, grantedBy: USER, copiedAt: new Date(), objectKey: `spaces/${SPACE}/data-grants/${id}/app.db`, bytes: 4096 };
}

async function turn(id: string, status: string, job: { id: string; status: string } | null): Promise<void> {
  if (job) await sql`INSERT INTO jobs (id, status) VALUES (${job.id}, ${job.status})`.execute(mockDb);
  await sql`INSERT INTO agent_turns (id, status, job_id) VALUES (${id}, ${status}, ${job?.id ?? null})`.execute(mockDb);
}

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:16-alpine").start();
  mockDb = new Kysely<Database>({ dialect: new PostgresDialect({ pool: new Pool({ connectionString: container.getConnectionUri() }) }) });
  await sql`CREATE TABLE projects (id uuid PRIMARY KEY)`.execute(mockDb);
  await sql`CREATE TABLE tickets (id uuid PRIMARY KEY)`.execute(mockDb);
  await sql`CREATE TABLE users (id uuid PRIMARY KEY)`.execute(mockDb);
  await sql`CREATE TABLE jobs (id varchar(255) PRIMARY KEY, status text NOT NULL)`.execute(mockDb);
  await sql`CREATE TABLE agent_turns (id uuid PRIMARY KEY, status text NOT NULL, job_id varchar(255))`.execute(mockDb);
  await sql`CREATE TABLE claw_task_templates (id uuid PRIMARY KEY)`.execute(mockDb);
  await sql`CREATE TABLE claw_schedules (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid NOT NULL,
    task_template_id uuid NOT NULL REFERENCES claw_task_templates(id) ON DELETE CASCADE, name text NOT NULL)`.execute(mockDb);
  await sql`INSERT INTO projects (id) VALUES (${SPACE})`.execute(mockDb);
  await sql`INSERT INTO tickets (id) VALUES (${TASK}), (${OTHER_TASK})`.execute(mockDb);
  await sql`INSERT INTO users (id) VALUES (${USER})`.execute(mockDb);
  await up(mockDb);
}, 120_000);

afterAll(async () => {
  await mockDb?.destroy();
  await container?.stop();
});

beforeEach(async () => {
  await sql`DELETE FROM app_data_grants`.execute(mockDb);
  await sql`DELETE FROM agent_turns`.execute(mockDb);
  await sql`DELETE FROM jobs`.execute(mockDb);
});

describe("app_data_grants", () => {
  it("gives the waiting copy to one turn only", async () => {
    await grants.insert(grant("aaaaaaaa-0000-4000-8000-000000000001"));
    await turn("bbbbbbbb-0000-4000-8000-000000000001", "queued", null);
    await turn("bbbbbbbb-0000-4000-8000-000000000002", "queued", null);

    const [first, second] = await Promise.all([
      grants.take(TASK, "bbbbbbbb-0000-4000-8000-000000000001"),
      grants.take(TASK, "bbbbbbbb-0000-4000-8000-000000000002"),
    ]);

    expect([first, second].filter(Boolean)).toHaveLength(1);
    expect(await grants.untaken(TASK)).toBeNull();
  });

  it("keeps one untaken copy per task", async () => {
    await grants.insert(grant("aaaaaaaa-0000-4000-8000-000000000001"));
    await expect(grants.insert(grant("aaaaaaaa-0000-4000-8000-000000000002"))).rejects.toThrow();

    await grants.markRemoved("aaaaaaaa-0000-4000-8000-000000000001");
    await expect(grants.insert(grant("aaaaaaaa-0000-4000-8000-000000000002"))).resolves.toMatchObject({ bytes: 4096 });
  });

  it("lists copies whose turn ended, and day-old ones, but not those still in use or waiting", async () => {
    const now = Date.now();
    await turn("bbbbbbbb-0000-4000-8000-000000000001", "running", { id: "job-running", status: "active" });
    await turn("bbbbbbbb-0000-4000-8000-000000000002", "completed", { id: "job-done", status: "completed" });
    await turn("bbbbbbbb-0000-4000-8000-000000000003", "failed", null);
    await grants.insert(grant("aaaaaaaa-0000-4000-8000-000000000001", TASK));
    await grants.take(TASK, "bbbbbbbb-0000-4000-8000-000000000001");
    await grants.insert(grant("aaaaaaaa-0000-4000-8000-000000000002", TASK));
    await grants.take(TASK, "bbbbbbbb-0000-4000-8000-000000000002");
    await grants.insert(grant("aaaaaaaa-0000-4000-8000-000000000003", TASK));
    await grants.take(TASK, "bbbbbbbb-0000-4000-8000-000000000003");
    await grants.insert(grant("aaaaaaaa-0000-4000-8000-000000000004", TASK));
    await grants.insert(grant("aaaaaaaa-0000-4000-8000-000000000005", OTHER_TASK));
    await sql`UPDATE app_data_grants SET created_at = now() - interval '2 days' WHERE id = 'aaaaaaaa-0000-4000-8000-000000000005'`.execute(mockDb);

    const done = await grants.listDone(new Date(now - 24 * 60 * 60 * 1000));

    expect(done.map((entry) => entry.id).sort()).toEqual([
      "aaaaaaaa-0000-4000-8000-000000000002",
      "aaaaaaaa-0000-4000-8000-000000000003",
      "aaaaaaaa-0000-4000-8000-000000000005",
    ]);
  });

  it("refuses a schedule that both runs a template and turns the app off", async () => {
    await sql`INSERT INTO claw_task_templates (id) VALUES ('cccccccc-0000-4000-8000-000000000001')`.execute(mockDb);
    await expect(
      sql`INSERT INTO claw_schedules (project_id, task_template_id, name, action) VALUES (${SPACE}, 'cccccccc-0000-4000-8000-000000000001', 'x', 'app_stop')`.execute(mockDb),
    ).rejects.toThrow(/claw_schedules_template_for_action/);
    await sql`INSERT INTO claw_schedules (project_id, name, action) VALUES (${SPACE}, 'Off at night', 'app_stop')`.execute(mockDb);
    await sql`INSERT INTO claw_schedules (project_id, task_template_id, name) VALUES (${SPACE}, 'cccccccc-0000-4000-8000-000000000001', 'Nightly run')`.execute(mockDb);
  });

  it("migrates down and up again", async () => {
    await down(mockDb);
    await up(mockDb);
  });
});
