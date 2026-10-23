import { promises as fs } from "fs";
import * as path from "path";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { FileMigrationProvider, Kysely, Migrator, PostgresDialect, sql } from "kysely";
import { Pool } from "pg";
import type { Database } from "../../persistence/types/database";
import { TaskBranchDAO } from "../../persistence/ticketing/TaskBranchDAO";
import { TaskComparisonArmStatsDAO } from "../../persistence/ticketing/TaskComparisonArmStatsDAO";
import { TaskComparisonDAO } from "../../persistence/ticketing/TaskComparisonDAO";
import { TaskForkDAO } from "../../persistence/ticketing/TaskForkDAO";
import { TicketListDAO } from "../../persistence/ticketing/TicketListDAO";

let mockDb: Kysely<Database>;
jest.mock("../../persistence/config/database", () => ({
  __esModule: true,
  get default() {
    return mockDb;
  },
}));

let container: StartedPostgreSqlContainer;
const at = (iso: string) => new Date(iso);
const FORKED_AT = at("2026-10-20T12:00:00Z");

async function one<T>(query: Promise<{ rows: T[] }>): Promise<T> {
  return (await query).rows[0];
}

async function seed() {
  const user = await one(sql<{ id: string }>`INSERT INTO users (email, name, password_hash) VALUES ('ana@example.com', 'Ana', 'x') RETURNING id`.execute(mockDb));
  const space = await one(sql<{ id: string }>`INSERT INTO projects (name, slug, key_prefix, ticket_system) VALUES ('Web', 'web', 'WEB', 'native') RETURNING id`.execute(mockDb));
  const ticket = async (key: string) =>
    one(
      sql<{ id: string }>`INSERT INTO tickets (project_id, task_number, task_key, timestamp, title, description, severity, category, metadata, ticket_system)
        VALUES (${space.id}, ${Number(key.split("-")[1])}, ${key}, now(), ${key}, '', 'medium', 'General', '{}', 'native') RETURNING id`.execute(mockDb),
    );
  const parent = await ticket("WEB-1");
  const fork = await ticket("WEB-2");
  const other = await ticket("WEB-3");
  const runner = await one(sql<{ id: string }>`INSERT INTO clankers (name, slug) VALUES ('Claude Code', 'claude-code') RETURNING id`.execute(mockDb));
  const session = await one(
    sql<{ id: string }>`INSERT INTO agent_sessions (tenant_id, project_id, ticket_id, clanker_id, mode, status)
      VALUES ('api-server', ${space.id}, ${parent.id}, ${runner.id}, 'planning', 'active') RETURNING id`.execute(mockDb),
  );
  const turn = await one(
    sql<{ id: string }>`INSERT INTO agent_turns (session_id, role, status, sequence, action, completed_at)
      VALUES (${session.id}, 'assistant', 'completed', 2, 'code', ${FORKED_AT}) RETURNING id`.execute(mockDb),
  );
  return { user: user.id, space: space.id, parent: parent.id, fork: fork.id, other: other.id, runner: runner.id, session: session.id, turn: turn.id };
}

describe("task comparisons against Postgres", () => {
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

  it("reads the fork point: when the turn finished and the commit pushed by then", async () => {
    const forks = new TaskForkDAO();
    await sql`INSERT INTO jobs (id, tenant_id, repository, task, ticket_id, status) VALUES
      ('job_1', 'api-server', 'r', 't', ${ids.parent}, 'completed'), ('job_2', 'api-server', 'r', 't', ${ids.parent}, 'completed')`.execute(mockDb);
    await sql`INSERT INTO job_run_manifests (job_id, manifest_version, tenant_id, job_kind, ticket_id, repository, dispatched_at, branch, commit_sha, finished_at, cost_usd, duration_ms)
      VALUES ('job_1', 1, 'api-server', 'execution', ${ids.parent}, 'r', now(), 'viberglass/p', 'aaa', ${at("2026-10-20T11:00:00Z")}, 0.5, 1000),
             ('job_2', 1, 'api-server', 'execution', ${ids.parent}, 'r', now(), 'viberglass/p', 'bbb', ${at("2026-10-20T13:00:00Z")}, 0.25, 500)`.execute(mockDb);

    expect(await forks.turnFinishedAt(ids.parent, ids.turn)).toEqual(FORKED_AT);
    expect(await forks.turnFinishedAt(ids.other, ids.turn)).toBeNull();
    expect(await forks.lastCommitBy(ids.parent, FORKED_AT)).toEqual({ branch: "viberglass/p", commit: "aaa" });
  });

  it("copies the thread, reviewers and part marks up to the fork point, and the plan and summary of then", async () => {
    const forks = new TaskForkDAO();
    await sql`INSERT INTO task_messages (ticket_id, author_id, body_markdown, created_at) VALUES
      (${ids.parent}, ${ids.user}, 'before', ${at("2026-10-20T10:00:00Z")}), (${ids.parent}, ${ids.user}, 'after', ${at("2026-10-20T14:00:00Z")})`.execute(mockDb);
    await sql`INSERT INTO task_participants (ticket_id, user_id, role) VALUES (${ids.parent}, ${ids.user}, 'reviewer')`.execute(mockDb);
    await sql`INSERT INTO task_plan_part_marks (ticket_id, part_number, mark, created_at) VALUES (${ids.parent}, 1, 'done', ${at("2026-10-20T10:00:00Z")})`.execute(mockDb);
    await sql`INSERT INTO task_summaries (ticket_id, version, content, created_at) VALUES
      (${ids.parent}, 1, 'old summary', ${at("2026-10-20T10:00:00Z")}), (${ids.parent}, 2, 'new summary', ${at("2026-10-20T14:00:00Z")})`.execute(mockDb);
    const doc = await one(sql<{ id: string }>`INSERT INTO ticket_phase_documents (ticket_id, phase, content) VALUES (${ids.parent}, 'planning', 'new plan') RETURNING id`.execute(mockDb));
    await sql`INSERT INTO ticket_phase_document_revisions (document_id, ticket_id, phase, content, source, version, created_at) VALUES
      (${doc.id}, ${ids.parent}, 'planning', 'old plan', 'agent', 1, ${at("2026-10-20T10:00:00Z")}),
      (${doc.id}, ${ids.parent}, 'planning', 'new plan', 'agent', 2, ${at("2026-10-20T14:00:00Z")})`.execute(mockDb);

    await forks.copyThread(ids.parent, ids.fork, FORKED_AT);

    const messages = await sql<{ body_markdown: string; created_at: Date }>`SELECT body_markdown, created_at FROM task_messages WHERE ticket_id = ${ids.fork}`.execute(mockDb);
    expect(messages.rows).toEqual([{ body_markdown: "before", created_at: at("2026-10-20T10:00:00Z") }]);
    const roles = await sql<{ role: string }>`SELECT role FROM task_participants WHERE ticket_id = ${ids.fork}`.execute(mockDb);
    expect(roles.rows).toEqual([{ role: "reviewer" }]);
    const marks = await sql<{ part_number: number }>`SELECT part_number FROM task_plan_part_marks WHERE ticket_id = ${ids.fork}`.execute(mockDb);
    expect(marks.rows).toEqual([{ part_number: 1 }]);
    expect(await forks.planAt(ids.parent, FORKED_AT)).toBe("old plan");

    await forks.addMessages(ids.fork, [{ authorId: ids.user, body: "said in a session", at: at("2026-10-20T09:00:00Z") }]);
    const all = await sql<{ body_markdown: string }>`SELECT body_markdown FROM task_messages WHERE ticket_id = ${ids.fork} ORDER BY created_at`.execute(mockDb);
    expect(all.rows.map((row) => row.body_markdown)).toEqual(["said in a session", "before"]);
    expect(await forks.summaryAt(ids.parent, FORKED_AT)).toBe("old summary");
  });

  it("records a comparison and its arms, reads them back, and picks a winner", async () => {
    const comparisons = new TaskComparisonDAO();
    const id = await comparisons.create({
      parentTicketId: ids.parent,
      forkedFromTurnId: ids.turn,
      forkedAt: FORKED_AT,
      baseBranch: "viberglass/p",
      baseCommit: "aaa",
      createdBy: ids.user,
    });
    await comparisons.addArm(id, ids.fork, ids.runner, 0);
    await comparisons.setWinner(id, ids.fork);

    const [listed] = await comparisons.listForParent(ids.parent);
    expect(listed).toMatchObject({ id, baseCommit: "aaa", winnerTicketId: ids.fork, createdBy: { id: ids.user, name: "Ana" } });
    expect(await comparisons.listArms([id])).toEqual([
      expect.objectContaining({ ticketId: ids.fork, key: "WEB-2", runner: { id: ids.runner, name: "Claude Code", slug: "claude-code" } }),
    ]);
    expect(await comparisons.armOf(ids.fork)).toMatchObject({ comparison: { id }, runner: { slug: "claude-code" } });
    expect(await comparisons.armOf(ids.parent)).toBeNull();
  });

  it("sums each arm's runs", async () => {
    await sql`INSERT INTO jobs (id, tenant_id, repository, task, ticket_id, status) VALUES ('job_3', 'api-server', 'r', 't', ${ids.fork}, 'active')`.execute(mockDb);
    await sql`INSERT INTO job_run_manifests (job_id, manifest_version, tenant_id, job_kind, ticket_id, repository, dispatched_at, cost_usd, duration_ms, model_snapshot)
      VALUES ('job_3', 1, 'api-server', 'execution', ${ids.fork}, 'r', now(), 1.5, 2000, 'glm-4.6')`.execute(mockDb);

    const stats = await new TaskComparisonArmStatsDAO().statsFor([ids.fork, ids.other]);

    expect(stats.get(ids.fork)).toMatchObject({ runs: 1, running: true, lastRunStatus: "active", costUsd: 1.5, durationMs: 2000, model: "glm-4.6" });
    expect(stats.get(ids.other)).toMatchObject({ runs: 0, running: false, costUsd: null });
  });

  it("keeps forks out of the space's task list and counts", async () => {
    const lists = new TicketListDAO();

    const { tickets, total } = await lists.getTicketsWithFilters({ projectId: ids.space });

    expect(tickets.map((ticket) => ticket.key).sort()).toEqual(["WEB-1", "WEB-3"]);
    expect(total).toBe(2);
    expect((await lists.getTicketStats(ids.space)).total).toBe(2);
  });

  it("gives a branch another task in the space has the next free suffix", async () => {
    const branches = new TaskBranchDAO();
    await sql`INSERT INTO task_pull_requests (ticket_id, branch) VALUES (${ids.parent}, 'viberglass/shared')`.execute(mockDb);

    expect(await branches.claim(ids.other, "viberglass/shared", null)).toBe("viberglass/shared-2");
  });
});
