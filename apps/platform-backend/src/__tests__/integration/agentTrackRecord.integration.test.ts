import { promises as fs } from "fs";
import * as path from "path";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { FileMigrationProvider, Kysely, Migrator, PostgresDialect, sql } from "kysely";
import { Pool } from "pg";
import type { Database } from "../../persistence/types/database";
import { AgentTrackRecordDAO } from "../../persistence/ticketing/AgentTrackRecordDAO";

let mockDb: Kysely<Database>;
jest.mock("../../persistence/config/database", () => ({
  __esModule: true,
  get default() {
    return mockDb;
  },
}));

let container: StartedPostgreSqlContainer;

async function one<T>(query: Promise<{ rows: T[] }>): Promise<T> {
  return (await query).rows[0];
}

async function seed() {
  const space = await one(sql<{ id: string }>`INSERT INTO projects (name, slug, key_prefix, ticket_system) VALUES ('Web', 'web', 'WEB', 'native') RETURNING id`.execute(mockDb));
  const other = await one(sql<{ id: string }>`INSERT INTO projects (name, slug, key_prefix, ticket_system) VALUES ('Docs', 'docs', 'DOC', 'native') RETURNING id`.execute(mockDb));
  const ticket = async (projectId: string, key: string, createdAt: string) =>
    (
      await one(
        sql<{ id: string }>`INSERT INTO tickets (project_id, task_number, task_key, timestamp, title, description, severity, category, metadata, ticket_system, created_at)
          VALUES (${projectId}, ${Number(key.split("-")[1])}, ${key}, now(), ${key}, '', 'medium', 'General', '{}', 'native', ${createdAt}) RETURNING id`.execute(mockDb),
      )
    ).id;
  return {
    built: await ticket(space.id, "WEB-1", "2026-10-01T00:00:00Z"),
    planned: await ticket(space.id, "WEB-2", "2026-10-02T00:00:00Z"),
    idle: await ticket(space.id, "WEB-3", "2026-10-03T00:00:00Z"),
    elsewhere: await ticket(other.id, "DOC-1", "2026-10-04T00:00:00Z"),
    space: space.id,
  };
}

async function run(id: string, ticketId: string, kind: string, status: string, createdAt: string, manifest: Record<string, string | number | null>) {
  await sql`INSERT INTO jobs (id, tenant_id, repository, task, ticket_id, status, job_kind, created_at)
    VALUES (${id}, 'api-server', 'r', 't', ${ticketId}, ${status}, ${kind}, ${createdAt})`.execute(mockDb);
  await sql`INSERT INTO job_run_manifests (job_id, manifest_version, tenant_id, job_kind, ticket_id, repository, dispatched_at,
      requested_agent, agent, requested_model, model_snapshot, cost_usd, cost_provenance)
    VALUES (${id}, 1, 'api-server', ${kind}, ${ticketId}, 'r', ${createdAt}, ${manifest.requestedAgent}, ${manifest.agent ?? null},
      ${manifest.requestedModel ?? null}, ${manifest.modelSnapshot ?? null}, ${manifest.cost ?? null}, ${manifest.provenance ?? null})`.execute(mockDb);
}

describe("agent track record against Postgres", () => {
  let ids: Awaited<ReturnType<typeof seed>>;

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine").start();
    mockDb = new Kysely<Database>({ dialect: new PostgresDialect({ pool: new Pool({ connectionString: container.getConnectionUri() }) }) });
    const migrator = new Migrator({
      db: mockDb,
      provider: new FileMigrationProvider({ fs, path, migrationFolder: path.resolve(__dirname, "../../migrations") }),
    });
    const { error } = await migrator.migrateToLatest();
    if (error) throw error;
    ids = await seed();
  }, 180_000);

  afterAll(async () => {
    await mockDb?.destroy();
    await container?.stop();
  });

  it("credits each task to its latest build, else its latest plan, and reads how it went", async () => {
    await run("plan_1", ids.built, "planning", "completed", "2026-10-01T01:00:00Z", { requestedAgent: "harness-a", requestedModel: "model-old", cost: 0.25, provenance: "actual" });
    await run("plan_2", ids.built, "planning", "completed", "2026-10-01T02:00:00Z", { requestedAgent: "harness-a", requestedModel: "model-old", cost: 0.25, provenance: "actual" });
    await run("build_1", ids.built, "execution", "failed", "2026-10-01T03:00:00Z", { requestedAgent: "harness-b", requestedModel: "model-x" });
    await run("build_2", ids.built, "execution", "completed", "2026-10-01T04:00:00Z", {
      requestedAgent: "harness-b",
      agent: "harness-b",
      requestedModel: "model-x",
      modelSnapshot: "model-x-2026",
      cost: 1.5,
      provenance: "estimated",
    });
    await run("plan_after", ids.built, "planning", "completed", "2026-10-01T05:00:00Z", { requestedAgent: "harness-a" });
    await run("plan_3", ids.planned, "planning", "completed", "2026-10-02T01:00:00Z", { requestedAgent: "harness-a" });
    await run("plan_4", ids.elsewhere, "planning", "completed", "2026-10-04T01:00:00Z", { requestedAgent: "harness-a" });

    const runner = await one(sql<{ id: string }>`INSERT INTO clankers (name, slug) VALUES ('Runner', 'runner') RETURNING id`.execute(mockDb));
    const session = await one(
      sql<{ id: string }>`INSERT INTO agent_sessions (tenant_id, project_id, ticket_id, clanker_id, mode, status)
        VALUES ('api-server', ${ids.space}, ${ids.built}, ${runner.id}, 'planning', 'active') RETURNING id`.execute(mockDb),
    );
    await sql`INSERT INTO agent_pending_requests (session_id, request_type, prompt_markdown) VALUES
      (${session.id}, 'input', 'Which page?'), (${session.id}, 'input', 'Which colour?'), (${session.id}, 'approval', 'Run this?')`.execute(mockDb);
    await sql`INSERT INTO task_activity (ticket_id, actor_type, kind, payload_json) VALUES (${ids.built}, 'human', 'taken_over', '{}')`.execute(mockDb);
    await sql`INSERT INTO task_pull_requests (ticket_id, branch, url) VALUES
      (${ids.built}, 'viberglass/a', 'https://example.test/pr/1'), (${ids.built}, 'viberglass/b', 'https://example.test/pr/2')`.execute(mockDb);
    await sql`INSERT INTO pull_request_outcomes (pull_request_url, state, review_comment_count, checked_at) VALUES
      ('https://example.test/pr/1', 'closed', 2, now()), ('https://example.test/pr/2', 'merged', 1, now())`.execute(mockDb);

    const tasks = await new AgentTrackRecordDAO().tasksOf(ids.space);

    expect(tasks).toEqual([
      expect.objectContaining({
        key: "WEB-2",
        agent: "harness-a",
        model: null,
        built: false,
        planRounds: 1,
        pullRequest: null,
        reviewComments: null,
        costUsd: null,
        takenOver: false,
      }),
      {
        ticketId: ids.built,
        key: "WEB-1",
        title: "WEB-1",
        agent: "harness-b",
        model: "model-x-2026",
        pullRequest: "merged",
        built: true,
        planRounds: 2,
        questions: 2,
        takenOver: true,
        runs: 5,
        failedRuns: 1,
        reviewComments: 3,
        costUsd: 2,
        costEstimated: true,
      },
    ]);
  });
});
